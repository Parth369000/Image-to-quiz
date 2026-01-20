import fitz  # PyMuPDF
import pytesseract
from PIL import Image
import io
import os
import sys
import platform

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

def pdf_to_searchable_pdf(input_path, output_path):
    print(f"Opening PDF: {input_path}")
    try:
        doc = fitz.open(input_path)
    except Exception as e:
        print(f"Error opening PDF: {e}")
        return

    output_doc = fitz.open() # Create empty PDF for output (Unused for text, but kept for import safety)
    full_text = ""

    total_pages = len(doc)
    print(f"Total Pages: {total_pages}")

    for i in range(total_pages):
        print(f"Processing Page {i+1}/{total_pages}...")
        
        # 1. Render page to image
        page = doc.load_page(i)
        pix = page.get_pixmap(dpi=300)
        img_bytes = pix.tobytes("png")
        img = Image.open(io.BytesIO(img_bytes))

        # 2. OCR Image -> PDF Page
        # We use Tesseract to generate a textual PDF for this single image
        try:
            # Use image_to_string for plain text
            text = pytesseract.image_to_string(img)
            full_text += f"--- Page {i+1} ---\n{text}\n\n"
        except Exception as e:
            print(f"OCR Error on page {i+1}: {e}")
            continue

    print(f"Saving to: {output_path}")
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(full_text)
    print("Done.")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        in_f = sys.argv[1]
    else:
        in_f = "test_pdf.pdf"
    
    out_f = in_f.replace(".pdf", "_converted.txt")
    
    pdf_to_searchable_pdf(in_f, out_f)
