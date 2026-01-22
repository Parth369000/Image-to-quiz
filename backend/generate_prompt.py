import sys
import os

def load_file(filepath):
    """Loads text from a file."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return f.read()
    except Exception as e:
        print(f"Error reading file {filepath}: {e}")
        sys.exit(1)

def generate_prompt(raw_ocr_text):
    """Combines the system prompt with the raw OCR text."""
    
    system_prompt = """You are an OCR text reconstruction engine.

This document contains Canada Millwright (Industrial Mechanic) examination questions.

Your task is to clean, reconstruct, and correct OCR-extracted text from a scanned exam PDF.

STRICT RULES:
1. DO NOT add new content.
2. DO NOT remove existing content.
3. DO NOT guess missing questions or answers.
4. DO NOT solve, interpret, or explain questions.
5. Preserve original meaning exactly.

You may ONLY fix OCR-related errors such as:
- misrecognized characters (O ↔ 0, l ↔ 1, S ↔ 5)
- broken or merged words
- spacing and alignment issues
- incorrect line breaks
- numbering errors caused by OCR

STRUCTURE RULES:
- Preserve question numbers exactly.
- Preserve multiple-choice options (1, 2, 3, 4 or A, B, C, D).
- Keep each question and its options clearly separated.
- Maintain headings and section titles if present.

OUTPUT RULES:
- Output plain text only.
- No markdown.
- No commentary.
- No explanations.
- No formatting embellishments.

The output must be clean, readable, and suitable for official Canada Millwright exam preparation material."""

    user_prompt_template = """
Clean and reconstruct the following OCR-extracted text from a Canada Millwright exam paper:

{raw_text}
"""

    return f"{system_prompt}\n\n{user_prompt_template.format(raw_text=raw_ocr_text)}"

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python generate_prompt.py <path_to_raw_ocr_text_file>")
        sys.exit(1)

    input_file = sys.argv[1]
    raw_text = load_file(input_file)
    full_prompt = generate_prompt(raw_text)
    
    print("-" * 20 + " GENERATED PROMPT " + "-" * 20)
    print(full_prompt)
    print("-" * 60)
