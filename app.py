from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import json
import uuid
import datetime
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()

app = Flask(__name__)
# Enable CORS so frontend (localhost:5173) can talk to backend (localhost:5000)
CORS(app)

# Config
UPLOAD_FOLDER = 'uploads'
QUIZ_FOLDER = 'public/quizzes'

# Load API Keys
keys_str = os.getenv("GEMINI_API_KEYS", "")
if not keys_str:
    # Fallback to single key if list not found
    single_key = os.getenv("GEMINI_API_KEY")
    API_KEYS = [single_key] if single_key else []
else:
    API_KEYS = [k.strip() for k in keys_str.split(',') if k.strip()]

# Ensure dirs exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(QUIZ_FOLDER, exist_ok=True)

def get_client(key_index):
    if not API_KEYS:
        return None
    try:
        # Wrap index
        key = API_KEYS[key_index % len(API_KEYS)]
        return genai.Client(api_key=key)
    except Exception as e:
        print(f"GenAI Init Error (Key Index {key_index}): {e}")
        return None

PROMPT_QUESTIONS = """
You are a quiz extraction engine.
Extract quiz questions and options from the uploaded PDF.

STRICT RULES:
1. Extract ONLY questions and 4 options.
2. Do NOT extract answers or explanations.
3. Preserve original question order.

OUTPUT FORMAT (JSON ONLY):
{
  "quiz_title": "Video Title",
  "questions": [
    {
      "id": 1,
      "question": "Question text",
      "options": [
        { "key": "1", "text": "Option 1" },
        { "key": "2", "text": "Option 2" },
        { "key": "3", "text": "Option 3" },
        { "key": "4", "text": "Option 4" }
      ]
    }
  ]
}
"""

PROMPT_ANSWERS = """
You are an answer key extraction engine.
Extract the correct answer keys for the questions from the uploaded PDF.

STRICT RULES:
1. Extract the question number and the correct option key (1, 2, 3, or 4).
2. If the answer is a letter (A, B, C, D), convert to (1, 2, 3, 4).
3. Return a simple mapping list.

OUTPUT FORMAT (JSON ONLY):
{
  "answers": [
    { "question_id": 1, "correct_key": "1" },
    { "question_id": 2, "correct_key": "3" }
  ]
}
"""

def process_pdf_with_gemini(pdf_path, prompt, task_name="extraction"):
    if not API_KEYS:
        print("No API Keys found.")
        return None

    try:
        with open(pdf_path, "rb") as f:
            pdf_content = f.read()

        # Retry logic
        models_to_try = [
            "models/gemini-2.0-flash",
            "gemma-3-27b",
            "gemma-3-12b"
        ]
        
        import time
        
        # We start with the first key (or a random one if we wanted load balancing, but sequential is fine)
        # We use a mutable list or global to track "current" key index if we wanted persistence,
        # but for this specific request scope, we'll start at 0 (or we could use a closure).
        # To avoid "burning" the first key on every request if it's dead, in a real app we'd track this globally.
        # For now, we'll iterate.
        
        # We maintain the key index outside the loop to persist rotation *during* this function call
        current_key_idx = 0 
        
        for model in models_to_try:
            print(f"[{task_name}] Trying model: {model}...")
            
            # Try up to N times (where N = number of keys) for this specific model
            # ONLY if we are hitting quota errors.
            max_key_attempts = len(API_KEYS)
            
            for key_attempt in range(max_key_attempts):
                client = get_client(current_key_idx)
                if not client:
                    current_key_idx += 1
                    continue

                active_key_masked = API_KEYS[current_key_idx % len(API_KEYS)][:5] + "..."
                
                try:
                    # response = client.models.generate_content(...)
                    response = client.models.generate_content(
                        model=model,
                        contents=[
                            types.Content(
                                parts=[
                                    types.Part.from_bytes(
                                        data=pdf_content,
                                        mime_type="application/pdf"
                                    ),
                                    types.Part.from_text(text=prompt)
                                ]
                            )
                        ],
                        config=types.GenerateContentConfig(
                            response_mime_type="application/json"
                        )
                    )
                    
                    clean_json = response.text.replace("```json", "").replace("```", "").strip()
                    return json.loads(clean_json)

                except Exception as e:
                    err_str = str(e)
                    
                    # Check for Quota (429) or Overload (503)
                    if "429" in err_str or "quota" in err_str.lower() or "503" in err_str or "overloaded" in err_str.lower():
                        print(f"[{task_name}] Quota/Limit hit with key {active_key_masked} on {model}. Switching key...")
                        current_key_idx += 1 # Rotate to next key
                        time.sleep(1) # Small backoff
                        continue # Retry SAME model with NEW key
                    
                    # If it's a different error (e.g. model not found, valid request error), 
                    # we probably shouldn't keep banging this model with other keys.
                    print(f"[{task_name}] Error with {model}: {e}")
                    break # Break inner loop, move to next model
                
        return None
        
    except Exception as e:
        print(f"[{task_name}] Fatal Error: {e}")
        return None

@app.route('/upload', methods=['POST'])
def upload_files():
    # Check for both files
    if 'questions_file' not in request.files or 'answers_file' not in request.files:
        return jsonify({'error': 'Both questions and answers PDFs are required'}), 400
    
    q_file = request.files['questions_file']
    a_file = request.files['answers_file']
    
    if q_file.filename == '' or a_file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    file_id = str(uuid.uuid4())[:8]
    
    # Save Files
    q_filename = f"{file_id}_questions_{q_file.filename}"
    a_filename = f"{file_id}_answers_{a_file.filename}"
    
    q_path = os.path.join(UPLOAD_FOLDER, q_filename)
    a_path = os.path.join(UPLOAD_FOLDER, a_filename)
    
    q_file.save(q_path)
    a_file.save(a_path)

    # 1. Extract Questions
    questions_data = process_pdf_with_gemini(q_path, PROMPT_QUESTIONS, "Questions Extraction")
    if not questions_data:
        return jsonify({'error': 'Failed to extract questions'}), 500

    # 2. Extract Answers
    answers_data = process_pdf_with_gemini(a_path, PROMPT_ANSWERS, "Answers Extraction")
    if not answers_data:
        # Fallback: if answers fail, maybe just save questions? But user asked for both.
        # Let's return error for now to be safe, or separate warning.
        return jsonify({'error': 'Failed to extract answers'}), 500

    # 3. Save Raw JSONs
    q_json_path = os.path.join(QUIZ_FOLDER, f"{file_id}_questions.json")
    a_json_path = os.path.join(QUIZ_FOLDER, f"{file_id}_answers.json")
    
    with open(q_json_path, 'w', encoding='utf-8') as f:
        json.dump(questions_data, f, indent=2)
        
    with open(a_json_path, 'w', encoding='utf-8') as f:
        json.dump(answers_data, f, indent=2)

    # 4. Merge Data for Frontend
    # Create a map of question_id -> correct_key
    ans_map = {str(item['question_id']): str(item['correct_key']) for item in answers_data.get('answers', [])}
    
    merged_questions = []
    for q in questions_data.get('questions', []):
        qid = str(q.get('id'))
        # Try to find answer by ID, or maybe index if IDs match 1-based index
        correct = ans_map.get(qid)
        
        # If not found by explicit ID, try inferring by order if counts match
        if not correct and qid.isdigit():
             # Fallback logic could go here
             pass
             
        q['correct_answer'] = correct
        merged_questions.append(q)

    final_quiz = {
        'id': file_id,
        'quiz_title': questions_data.get('quiz_title', 'Uploaded Quiz'),
        'total_questions': len(merged_questions),
        'questions': merged_questions,
        'created_at': datetime.datetime.now().isoformat(),
        'filename': q_file.filename, # Main reference filename
        'has_answers': True
    }

    # Save Merged JSON
    save_path = os.path.join(QUIZ_FOLDER, f"{file_id}.json")
    with open(save_path, 'w', encoding='utf-8') as f:
        json.dump(final_quiz, f, indent=2)

    return jsonify({
        'message': 'Files processed successfully', 
        'quiz_id': file_id,
        'title': final_quiz['quiz_title']
    })

@app.route('/quizzes', methods=['GET'])
def list_quizzes():
    quizzes = []
    if os.path.exists(QUIZ_FOLDER):
        for f in os.listdir(QUIZ_FOLDER):
            # Only list the main merged files (IDs usually 8 chars) that are not _questions or _answers
            if f.endswith('.json') and '_questions' not in f and '_answers' not in f:
                try:
                    with open(os.path.join(QUIZ_FOLDER, f), 'r', encoding='utf-8') as qf:
                        data = json.load(qf)
                        quizzes.append({
                            'id': data.get('id', f.replace('.json', '')),
                            'title': data.get('quiz_title', 'Untitled Quiz'),
                            'total_questions': data.get('total_questions', 0),
                            'created_at': data.get('created_at', ''),
                            'filename': data.get('filename', f)
                        })
                except:
                    continue
    # Sort by newest first
    quizzes.sort(key=lambda x: x.get('created_at', ''), reverse=True)
    return jsonify(quizzes)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
