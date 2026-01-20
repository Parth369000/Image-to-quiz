# Tesseract OCR Configuration

For best results with Canada Millwright Exam documents, use the following settings:

## Configuration
- **OEM (OCR Engine Mode):** 3 (Default, based on what is available)
- **PSM (Page Segmentation Mode):** 6 (Assume a single uniform block of text)
- **DPI:** 300 (Ensure images are processed at 300 DPI)

## Command Line Example

```bash
tesseract input_image.png output_base --oem 3 --psm 6
```

## Why these settings?
- `psm 6` is critical for questions that might be laid out in a list format, ensuring each line is treated as part of the block rather than independent text columns.
- `300 DPI` is standard for preserving the clarity of mechanical terms, numbers, and symbols found in technical exams.
