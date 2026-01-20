import os
import sys
import json
from google import genai
from google.genai import types

# 1. Config
API_KEY = os.getenv("GEMINI_API_KEY", "AIzaSyD4AEX1L-rEJqXg9Nw6VM1U32GQyo1UP5A")
PDF_PATH = "26-1-20.pdf"

if not API_KEY:
    print("Error: API Key missing")
    sys.exit(1)

client = genai.Client(api_key=API_KEY)

# 2. Upload/Process PDF
print(f"Reading {PDF_PATH}...")
try:
    with open(PDF_PATH, "rb") as f:
        pdf_content = f.read()

    print("Sending to Gemini 2.5 Flash...")
    
    # Structured extraction prompt
    curr_prompt = """
    You are a quiz extraction and normalization engine.

    This document is an examination or study material (e.g., Canada Millwright exam).
    
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
    
    
    Extract all quiz questions from this PDF and return them in the following JSON format.
    
    The output will be stored and reused for multiple quiz attempts on a website.
    
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
    
    IMPORTANT:
    - Ensure JSON is consistent and reusable.
    - This JSON will be saved and reused if the user attempts the quiz again.
    - Maintain deterministic ordering.
    """
    
    response = client.models.generate_content(
        model="models/gemini-2.5-flash",
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
    
    # 3. Output
    print("\n--- GEMINI OUTPUT ---")
    print(response.text)
    
    # Save to public/quiz_data.json for the frontend
    import pathlib
    
    # Ensure public dir exists
    public_dir = pathlib.Path("public")
    public_dir.mkdir(exist_ok=True)
    
    output_path = public_dir / "quiz_data.json"
    
    try:
        # Clean potential markdown fences from the response
        clean_json = response.text.replace("```json", "").replace("```", "").strip()
        
        # Verify it's valid JSON
        parsed = json.loads(clean_json) # Ensure 'import json' is at top if not present
        
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(parsed, f, indent=2)
            
        print(f"\n[SUCCESS] Saved quiz data to {output_path}")
        
    except Exception as e:
        print(f"\n[ERROR] Failed to save JSON: {e}")
        # Save raw text backup
        with open("raw_output_backup.txt", "w", encoding="utf-8") as f:
             f.write(response.text)

    print("---------------------")

except Exception as e:
    print(f"Error: {e}")
