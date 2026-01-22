import sys
import os
import pytesseract
from PIL import Image, ImageOps, ImageFilter
import platform
import json
import re
import time
import random
# from google import genai  <-- REMOVED
# from google.genai import types <-- REMOVED

# ------------------ GEMINI/VERTEX CONFIG ------------------
# Note: Replaced with Vertex AI above.
# Security: Key fetched from Environment Variable
# GENAI_API_KEY = ... (Removed in favor of Vertex AI)

# Global throttle tracker
LAST_CALL = 0

def throttle_api():
    global LAST_CALL
    delta = time.time() - LAST_CALL
    if delta < 5:
        time.sleep(5 - delta)
    LAST_CALL = time.time()

# ------------------ TESSERACT PATH ------------------
if platform.system() == "Windows":
    for p in [
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        os.path.expanduser(r"~\AppData\Local\Tesseract-OCR\tesseract.exe")
    ]:
        if os.path.exists(p):
            pytesseract.pytesseract.tesseract_cmd = p
            break

# ------------------ IMAGE PREPROCESS ------------------
def preprocess(img):
    img = ImageOps.grayscale(img)
    w, h = img.size
    img = img.resize((w*2, h*2), Image.Resampling.LANCZOS)
    img = img.filter(ImageFilter.UnsharpMask(radius=1.5, percent=180, threshold=3))
    return img

def ocr(img, psm):
    img = preprocess(img)
    config = f"--oem 3 --dpi 300 -l eng --psm {psm} -c preserve_interword_spaces=1"
    return pytesseract.image_to_string(img, config=config)

# ------------------ DETERMINISTIC CLEAN ------------------
def clean_text_deterministic(text):
    fixes = {
        "Whet": "What",
        "Vernie": "Vernier",
        "iin": "in",
        "Fig ure": "Figure",
        "Vernierr": "Vernier",
        "readin": "reading"
    }
    lines = []
    for l in text.splitlines():
        l = l.strip()
        if len(l) < 2:
            continue
        if l.startswith("<<") or l.startswith(">>"): continue
        if "Orrell SS" in l: continue 
        
        for k,v in fixes.items():
            l = l.replace(k,v)
        lines.append(l)
    return "\n".join(lines)

def clean_question_text(text):
    lines = clean_text_deterministic(text).split('\n')
    clean_lines = []
    for l in lines:
        l = l.strip()
        if re.match(r'^\d+\s*[\.:\)]', l): continue
        clean_lines.append(l)
    return "\n".join(clean_lines)

# ------------------ STRUCTURAL PARSING ------------------
def parse_options_safely(raw_options_text):
    options = []
    pattern = re.compile(r"^\s*(\d+)[\.\)]\s+(.+)$")
    lines = raw_options_text.split('\n')
    for line in lines:
        line = line.strip()
        if not line: continue
        if line.lower().startswith("i.") or line.lower().startswith("l."): line = "1." + line[2:]
        elif line.lower().startswith("z."): line = "2." + line[2:]
        m = pattern.match(line)
        if m:
            options.append({"key": m.group(1), "text": m.group(2).strip()})
        else:
            if any(c.isdigit() for c in line) and len(line) > 2:
                key = str(len(options) + 1)
                options.append({"key": key, "text": line})
    return options

def enforce_four_options(parsed_options):
    enforced = {}
    for opt in parsed_options:
        key = opt.get("key")
        text = opt.get("text", "").strip()
        if key in {"1", "2", "3", "4"} and text:
            enforced[key] = text
    final_options = []
    for i in range(1, 5):
        k = str(i)
        final_options.append({"key": k, "text": enforced.get(k, "?")})
    return final_options

# ------------------ LLM BATCH CLEANUP ------------------
# ------------------ GEMINI CONFIG ------------------
from google import genai
from google.genai import types

# Security: Key fetched from Environment Variable
GENAI_API_KEY = os.getenv("GEMINI_API_KEY", "AIzaSyD4AEX1L-rEJqXg9Nw6VM1U32GQyo1UP5A")

if not GENAI_API_KEY:
    # Fallback/Error for testing purposes if not set
    print("WARNING: GEMINI_API_KEY not found. Please set 'GEMINI_API_KEY'.")
    # sys.exit(1) # Allow fallback to pure OCR

try:
    client = genai.Client(api_key=GENAI_API_KEY)
except Exception as e:
    print(f"GenAI Init Error: {e}")
    client = None

# ------------------ LLM BATCH CLEANUP ------------------
def llm_fix_batch(question, options):
    if not client:
        return {"question": question, "options": options}
        
    throttle_api()
    
    payload = {
        "question": question,
        "options": options
    }

    prompt = f"""
You are cleaning OCR text.

RULES:
- Do NOT add or remove words
- Do NOT change meaning
- Fix spelling and OCR errors only
- Keep option order EXACT (1–4)
- Return VALID JSON ONLY
- No explanations

INPUT:
{json.dumps(payload, indent=2)}
"""

    max_retries = 3
    for attempt in range(max_retries):
        try:
            # Using the standard model
            response = client.models.generate_content(
                model="models/gemini-2.5-flash", 
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json"
                )
            )

            if response.text:
                 # Clean potential markdown fences
                cleaned_text = response.text.replace("```json", "").replace("```", "").strip()
                return json.loads(cleaned_text)
            
        except Exception as e:
            err_str = str(e)
            if "503" in err_str or "overloaded" in err_str.lower() or "429" in err_str:
                if attempt < max_retries - 1:
                    wait_time = 2 * (attempt + 1)
                    print(f"Gemini Busy/Quota. Retrying in {wait_time}s...")
                    time.sleep(wait_time)
                    continue
            
            print(f"Gemini API Error: {e}")
            break

    # Fallback
    return {
        "question": question,
        "options": options
    }

# ------------------ MAIN ------------------
def main(img_path, out_file):
    print(f"Processing: {img_path}")
    img = Image.open(img_path).convert("RGB")
    
    # 1. CROPS
    # 1. CROPS (Dynamic based on 1920x1080 reference)
    w, h = img.size
    
    # Question: Top-Left roughly 50% width, 40% height
    q_box = (
        int(w * 0.02),  # x1 (2%)
        int(h * 0.05),  # y1 (5%)
        int(w * 0.55),  # x2 (55%)
        int(h * 0.40)   # y2 (40%)
    )
    
    # Options: Right side, overlapping slightly vertically
    o_box = (
        int(w * 0.30),  # x1 (30%) - Adjusted left to catch "1."
        int(h * 0.12),  # y1 (12%) - Raised top to catch First Option
        int(w * 0.98),  # x2 (98%)
        int(h * 0.85)   # y2 (85%)
    )
    
    # 2. OCR
    print("Running OCR...")
    q_raw = ocr(img.crop(q_box), psm=4)
    o_raw = ocr(img.crop(o_box), psm=11) 

    # 3. DETERMINISTIC CLEAN
    q_clean = clean_question_text(q_raw)
    o_clean = clean_text_deterministic(o_raw)
    
    # 4. STRUCTURE
    print("Parsing structure...")
    raw_options = parse_options_safely(o_clean)
    parsed_options = enforce_four_options(raw_options)

    # 5. LLM BATCH CLEANUP
    print("Running Gemini LLM cleanup (BATCHED)...")
    
    batched = llm_fix_batch(
        q_clean,
        [o["text"] for o in parsed_options]
    )

    final_q_text = batched.get("question", q_clean)
    cleaned_opts = batched.get("options", [])
    
    # Assign back to structure
    for i, opt in enumerate(parsed_options):
        # Safety check if LLM returned fewer options
        if i < len(cleaned_opts):
            opt["text"] = cleaned_opts[i]

    # 6. BUILD JSON
    confidence = "high"
    if any(opt["text"] == "?" for opt in parsed_options):
        confidence = "medium"

    json_output = {
        "exam": "Canada Millwright",
        "question_number": 1,
        "question": final_q_text,
        "options": parsed_options,
        "source": "ocr_gemini_batched_v3",
        "confidence": confidence
    }

    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(json_output, f, indent=2)

    print(f"Saved → {out_file}")
    print(json.dumps(json_output, indent=2))

if __name__ == "__main__":
    if len(sys.argv) < 3:
        if os.path.exists("test_image.png"):
            main("test_image.png", "final_output.json")
        else:
            print("Usage: python ocr_pipeline.py image.png output.json")
    else:
        main(sys.argv[1], sys.argv[2])
