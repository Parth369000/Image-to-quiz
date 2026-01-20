# Setup Guide: Self-Hosted OCR on Windows

## 1. Install Tesseract OCR
I have attempted to install this for you automatically. To verify it worked:
1. Open a **new** command prompt / terminal (so it picks up the new PATH).
2. Type: `tesseract --version`
3. If you see a version number (like v5.x.x), you are good!

**If it didn't install automatically:**
- Download the installer here: [UB-Mannheim Tesseract Installer](https://github.com/UB-Mannheim/tesseract/wiki)
- Run the `.exe`.
- **IMPORTANT**: During installation, there is a step asking for "Additional Script Data". You usually don't need extra languages for English exams, but feel free to add them.
- **CRITICAL**: Copy the installation path (usually `C:\Program Files\Tesseract-OCR`).
- Add this path to your System Environment Variable `PATH` if the installer doesn't do it.

## 2. Install Python & Libraries
You need Python installed.

### Step A: Check Python
Open terminal and run:
```bash
python --version
```
If this errors, install Python from [python.org](https://www.python.org/downloads/windows/). **Check the box "Add Python to PATH" during installation.**

### Step B: Install Libraries
Run the following command to install the necessary tools for the script:
```bash
pip install pytesseract Pillow requests
```
*(If `pip` doesn't work, try `python -m pip install pytesseract Pillow requests`)*

## 3. Running the Pipeline
Once everything is installed:
1. Place your image (e.g., `exam_page.png`) in this folder.
2. Run the script:
   ```bash
   python ocr_pipeline.py exam_page.png
   ```
3. It will create `final_prompt.txt`.
4. Copy the content of `final_prompt.txt` into your local LLM (like Ollama with Llama 3) to get the perfectly cleaned output.
