const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const sharp = require('sharp');
const axios = require('axios');

// --- CONFIGURATION ---
const SYSTEM_PROMPT = `You are an OCR text reconstruction engine.

This document contains Canada Millwright (Industrial Mechanic) examination questions.

Your task is to Clean, reconstruct, and correct OCR-extracted text from a scanned exam PDF.

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

The output must be clean, readable, and suitable for official Canada Millwright exam preparation material.`;

// Find Tesseract
const possiblePaths = [
    'C:\\Program Files\\Tesseract-OCR\\tesseract.exe',
    'C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Tesseract-OCR', 'tesseract.exe')
];

let tesseractPath = possiblePaths.find(p => fs.existsSync(p));
if (!tesseractPath) {
    // Try checking if it's in PATH by running 'tesseract --version'
    try {
        execSync('tesseract --version', { stdio: 'ignore' });
        tesseractPath = 'tesseract';
    } catch (e) {
        console.warn("WARNING: Could not find 'tesseract.exe'. Ensure it is installed and in PATH.");
    }
}

async function preprocessImage(inputPath, outputPath, cropBox) {
    console.log(`Processing image: ${inputPath}...`);
    let img = sharp(inputPath);

    // 1. Crop (left, top, width, height)
    if (cropBox) {
        console.log(`Applying crop: ${JSON.stringify(cropBox)}`);
        img = img.extract(cropBox);
    }

    // 2. Color Filter (Remove Purple/Blue annotations) & Grayscale
    // We access raw pixels to mimic the Python logic: if (r>80 || g>80 || b>80) -> white
    // This removes colored markings and keeps only dark text.

    // Get raw pixel data
    const { data, info } = await img
        .ensureAlpha() // Ensure 4 channels (RGBA) so we don't mess up offsets
        .raw()
        .toBuffer({ resolveWithObject: true });

    const pixelData = data;
    const len = pixelData.length;

    for (let i = 0; i < len; i += 4) {
        const r = pixelData[i];
        const g = pixelData[i + 1];
        const b = pixelData[i + 2];

        // Python logic: if (r > 80 or g > 80 or b > 80) -> make white
        // This keeps only very dark pixels (like black text)
        if (r > 80 || g > 80 || b > 80) {
            pixelData[i] = 255;     // R
            pixelData[i + 1] = 255; // G
            pixelData[i + 2] = 255; // B
            pixelData[i + 3] = 255; // Alpha (fully opaque)
        }
    }

    // Reconstruct image from raw buffer
    img = sharp(pixelData, {
        raw: {
            width: info.width,
            height: info.height,
            channels: 4
        }
    }).grayscale(); // Convert to grayscale after filtering

    // 3. Resize (2x)
    img = img.resize({ width: info.width * 2 });

    // 5. Padding
    img = img.extend({
        top: 40,
        bottom: 40,
        left: 40,
        right: 40,
        background: 'white'
    });

    // 6. Output formatted for Tesseract
    await img.toFile(outputPath);
    return outputPath;
}

function runTesseract(imagePath) {
    const cmd = `"${tesseractPath}" "${imagePath}" stdout --oem 3 --psm 6`;
    try {
        const stdout = execSync(cmd, { encoding: 'utf-8' });
        return stdout.trim();
    } catch (e) {
        console.error("Error running Tesseract:", e.message);
        return null;
    }
}

async function runOllama(prompt) {
    console.log("\n--- ATTEMPTING LOCAL LLM (OLLAMA) ---");
    try {
        const res = await axios.post('http://localhost:11434/api/generate', {
            model: 'llama3',
            prompt: prompt,
            stream: false
        });

        console.log("Ollama detected! Sending to model 'llama3'...");
        return res.data.response;
    } catch (e) {
        console.log("Could not connect to Ollama. Run: ollama run llama3");
        return null;
    }
}

async function processImageRegion(imagePath, regionName, cropBox) {
    const tempOut = `temp_${regionName}.png`;
    try {
        await preprocessImage(imagePath, tempOut, cropBox);
        const text = runTesseract(tempOut);
        if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut);
        return text || "";
    } catch (e) {
        console.error(`Error processing ${regionName}:`, e);
        return "";
    }
}

async function main() {
    const args = process.argv.slice(2);
    if (args.length < 1) {
        console.log("Usage: node ocr_pipeline.js <image_path> [output_file] [--crop x,y,w,h] [--split]");
        return;
    }

    const imagePath = args[0];
    let outputFile = 'final_prompt.txt';
    let cropBox = null;
    let useSplitMode = false;

    // Parse args
    for (let i = 1; i < args.length; i++) {
        if (args[i] === '--crop' && args[i + 1]) {
            const parts = args[i + 1].split(',').map(Number);
            if (parts.length === 4) {
                cropBox = {
                    left: parts[0],
                    top: parts[1],
                    width: parts[2] - parts[0],
                    height: parts[3] - parts[1]
                };
            }
            i++;
        } else if (args[i] === '--split') {
            useSplitMode = true;
        } else if (!args[i].startsWith('-')) {
            outputFile = args[i];
        }
    }

    let rawText = "";
    let tempImage = 'temp_processed.png'; // Declare tempImage here for broader scope

    // If split mode is on, we determine the region to split
    // If user provided a cropBox, we split THAT region.
    // If not, we use the whole image (which includes headers/noise -> bad accuracy).

    // Base region dimensions
    let baseLeft = 0, baseTop = 0, baseWidth = 0, baseHeight = 0;

    const metadata = await sharp(imagePath).metadata();
    if (cropBox) {
        baseLeft = cropBox.left;
        baseTop = cropBox.top;
        baseWidth = cropBox.width;
        baseHeight = cropBox.height;
    } else {
        baseLeft = 0;
        baseTop = 0; // Defaulting to 0 includes headers. Recommendation: User should crop.
        baseWidth = metadata.width;
        baseHeight = metadata.height;
    }

    if (useSplitMode) {
        console.log("--- SPLIT MODE DETECTED (Left=Question, Right=Options) ---");

        // Define Split relative to the Base Region
        const splitX = Math.floor(baseWidth * 0.48);

        // 1. Process Left (Question)
        const qBox = {
            left: baseLeft,
            top: baseTop,
            width: splitX,
            height: baseHeight
        };
        console.log("Processing Left Column (Question)...");
        const qText = await processImageRegion(imagePath, "question", qBox);

        // 2. Process Right (Options)
        const oBox = {
            left: baseLeft + splitX,
            top: baseTop,
            width: baseWidth - splitX,
            height: baseHeight
        };
        console.log("Processing Right Column (Options)...");
        const oText = await processImageRegion(imagePath, "options", oBox);

        rawText = `QUESTION:\n${qText}\n\nOPTIONS:\n${oText}`;
    } else {
        // Standard Single Pass
        try {
            await preprocessImage(imagePath, tempImage, cropBox);
            rawText = runTesseract(tempImage);
            if (fs.existsSync(tempImage)) fs.unlinkSync(tempImage);
        } catch (e) {
            console.error("Preprocessing failed:", e);
            return;
        }
    }

    if (!rawText) {
        console.log("No text extracted.");
        return;
    }

    console.log("--- RAW OCR OUTPUT ---");
    console.log(rawText.substring(0, 500) + (rawText.length > 500 ? "..." : ""));
    console.log("----------------------");

    // Build Prompt
    const fullPrompt = `${SYSTEM_PROMPT}\n\nClean and reconstruct the following OCR-extracted text from a Canada Millwright exam paper. \nNOTE: The text provided below has explicitly separated 'QUESTION' and 'OPTIONS' sections. Preserve this structure.\n\n${rawText}\n`;

    // Write Prompt
    fs.writeFileSync(outputFile, fullPrompt, 'utf-8');
    console.log(`\nSUCCESS! Prompt saved to: ${outputFile}`);

    // Ollama
    const finalAnswer = await runOllama(fullPrompt);
    if (finalAnswer) {
        console.log("\n⬇⬇⬇ FINAL CLEANED OUTPUT ⬇⬇⬇\n");
        console.log(finalAnswer);
        console.log("\n⬆⬆⬆ -------------------- ⬆⬆⬆");

        const finalFile = outputFile.replace('prompt', 'final');
        fs.writeFileSync(finalFile, finalAnswer, 'utf-8');
        console.log(`Final cleaned text saved to: ${finalFile}`);
    }

    // Cleanup
    if (fs.existsSync(tempImage)) fs.unlinkSync(tempImage);
}

main();
