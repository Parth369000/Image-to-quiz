from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import json
import uuid
import datetime
from google import genai
from google.genai import types

app = Flask(__name__)
# Enable CORS so frontend (localhost:5173) can talk to backend (localhost:5000)
CORS(app)

# Config
UPLOAD_FOLDER = 'uploads'
QUIZ_FOLDER = 'public/quizzes'
API_KEY = os.getenv("GEMINI_API_KEY", "AIzaSyD4AEX1L-rEJqXg9Nw6VM1U32GQyo1UP5A")

# Ensure dirs exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(QUIZ_FOLDER, exist_ok=True)

try:
    client = genai.Client(api_key=API_KEY)
except Exception as e:
    print(f"GenAI Init Error: {e}")
    client = None

def extract_quiz_from_pdf(pdf_path):
    if not client:
        return None

    try:
        with open(pdf_path, "rb") as f:
            pdf_content = f.read()

        curr_prompt = """
        You are a quiz extraction and normalization engine.

        This document is an examination or study material.
        
        Your task is to extract quiz questions and options from the uploaded PDF
        and return a clean, structured JSON that can be stored and reused for
        multiple quiz attempts.
        
        STRICT RULES (NO EXCEPTIONS):
        1. Extract ONLY content that represents quiz questions and answer options.
        2. DO NOT add new questions.
        3. DO NOT remove valid questions.
        4. DO NOT change the meaning of any question or option.
        5. DO NOT solve the questions.
        6. DO NOT mark correct answers.
        7. DO NOT add explanations.
        8. DO NOT invent missing options.
        
        TEXT CORRECTION RULES:
        - You MAY fix OCR errors and grammar.
        - You MAY merge broken lines belonging to the same question.
        - You MUST preserve numeric values exactly (do not convert numbers to words).
        
        STRUCTURE RULES:
        - Each question MUST have exactly 4 options.
        - Options MUST be numbered "1", "2", "3", "4".
        - If an option is unreadable or missing, set its text to "?".
        - Preserve the original question order from the document.
        
        IGNORE:
        - Headers, footers, page numbers
        - Metadata such as "Study Card", "Module", dates, copyright
        - Decorative text or UI elements
        
        OUTPUT RULES:
        - Output VALID JSON ONLY.
        - No markdown.
        - No commentary.
        - No explanation text.
        
        OUTPUT FORMAT (STRICT):
        {
          "quiz_title": "Auto-generated from document if possible, otherwise 'Uploaded Quiz'",
          "source": "user_uploaded_pdf",
          "total_questions": <number>,
          "questions": [
            {
              "id": 1,
              "question": "Question text here",
              "options": [
                { "key": "1", "text": "Option 1 text" },
                { "key": "2", "text": "Option 2 text" },
                { "key": "3", "text": "Option 3 text" },
                { "key": "4", "text": "Option 4 text" }
              ]
            }
          ]
        }
        """
        
        # Retry logic with model fallback to handle 429/503 errors
        max_retries = 3
        models_to_try = ["models/gemini-2.5-flash", "models/gemini-1.5-flash", "models/gemini-pro"]
        
        import time
        
        for attempt in range(max_retries):
            # Rotate models if retrying
            current_model = models_to_try[attempt % len(models_to_try)]
            print(f"Attempting extraction with model: {current_model} (Attempt {attempt+1}/{max_retries})")
            
            try:
                response = client.models.generate_content(
                    model=current_model,
                    contents=[
                        types.Content(
                            parts=[
                                types.Part.from_bytes(
                                    data=pdf_content,
                                    mime_type="application/pdf"
                                ),
                                types.Part.from_text(text=curr_prompt)
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
                # Handle Quota (429) and Overload (503) by waiting
                if "429" in err_str or "503" in err_str or "overloaded" in err_str.lower() or "quota" in err_str.lower():
                    if attempt < max_retries - 1:
                        # Extract wait time from error message if available, else default
                        wait_time = 10 * (attempt + 1)
                        if "retry in" in err_str:
                             import re
                             m = re.search(r"retry in (\d+(\.\d+)?)s", err_str)
                             if m:
                                 wait_time = float(m.group(1)) + 1 # Add mild buffer
                        
                        print(f"Gemini Busy/Quota ({current_model}). Retrying in {wait_time:.1f}s...")
                        time.sleep(wait_time)
                        continue
                
                print(f"Extraction Error (Attempt {attempt+1}): {e}")
                
        return None
        
    except Exception as e:
        print(f"Extraction Error: {e}")
        return None

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    # Save PDF
    file_id = str(uuid.uuid4())[:8]
    filename = f"{file_id}_{file.filename}"
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    file.save(filepath)

    # Extract Quiz
    quiz_data = extract_quiz_from_pdf(filepath)
    
    if not quiz_data:
         return jsonify({'error': 'Failed to extract quiz data'}), 500

    # Add metadata
    quiz_data['id'] = file_id
    quiz_data['filename'] = file.filename
    quiz_data['created_at'] = datetime.datetime.now().isoformat()
    
    # Save Quiz JSON to public folder so frontend can read it
    # Note: In a real app we'd use a database, but json files work for now
    save_path = os.path.join(QUIZ_FOLDER, f"{file_id}.json")
    with open(save_path, 'w', encoding='utf-8') as f:
        json.dump(quiz_data, f, indent=2)

    return jsonify({
        'message': 'File uploaded successfully', 
        'quiz_id': file_id,
        'title': quiz_data.get('quiz_title', 'Uploaded Quiz')
    })

@app.route('/quizzes', methods=['GET'])
def list_quizzes():
    quizzes = []
    if os.path.exists(QUIZ_FOLDER):
        for f in os.listdir(QUIZ_FOLDER):
            if f.endswith('.json'):
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
    app.run(debug=True, port=5000)
