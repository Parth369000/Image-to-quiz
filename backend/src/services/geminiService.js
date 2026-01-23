const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');

const PROMPT_QUESTIONS = `
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
`;

const PROMPT_ANSWERS = `
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
`;

// Helper to get client
function getClient(keyIndex, apiKeys) {
    if (!apiKeys || !apiKeys.length) return null;
    const key = apiKeys[keyIndex % apiKeys.length];
    return new GoogleGenerativeAI(key);
}

async function processPdfWithGemini(pdfPath, prompt, apiKeys, taskName = "extraction") {
    if (!apiKeys || !apiKeys.length) {
        console.error("No API Keys found.");
        return null;
    }

    try {
        // Models as requested by user
        const modelsToTry = [
            "models/gemini-2.0-flash", // Node SDK usually automatically handles the 'models/' prefix, but we can be specific if needed. Keeping it simple first.
            "models/gemma-3-27b",
            "models/gemma-3-12b",
            "models/gemini-1.5-flash" // Fallback
        ];

        // Read file as base64
        const fileData = fs.readFileSync(pdfPath);
        const base64Data = fileData.toString('base64');

        let currentKeyIdx = 0;

        for (const model of modelsToTry) {
            console.log(`[${taskName}] Trying model: ${model}...`);
            const maxKeyAttempts = apiKeys.length;

            // Try each key for the current model
            for (let i = 0; i < maxKeyAttempts; i++) {
                const genAI = getClient(currentKeyIdx, apiKeys);
                if (!genAI) {
                    currentKeyIdx++;
                    continue;
                }

                // Mask key for logging
                const activeKeyMasked = apiKeys[currentKeyIdx % apiKeys.length].substring(0, 5) + "...";

                try {
                    const generativModel = genAI.getGenerativeModel({ model: model });
                    const result = await generativModel.generateContent([
                        prompt,
                        {
                            inlineData: {
                                data: base64Data,
                                mimeType: "application/pdf",
                            },
                        },
                    ]);

                    const response = await result.response;
                    const text = response.text();

                    // Clean JSON
                    const cleanJson = text.replace(/```json/g, "").replace(/```/g, "").trim();
                    return JSON.parse(cleanJson);

                } catch (e) {
                    const errStr = e.toString();
                    // Log error
                    if (errStr.includes("429") || errStr.toLowerCase().includes("quota") || errStr.includes("503")) {
                        console.log(`[${taskName}] Quota/Limit hit with key ${activeKeyMasked} on ${model}. Switching key...`);
                        currentKeyIdx++;
                        // Small delay before retrying with next key
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        continue;
                    }

                    console.log(`[${taskName}] Error with ${model} using key ${activeKeyMasked}: ${e.message}`);

                    // If it's a 404 (model not found) or other hard error, maybe we shouldn't retry ALL keys for this model, 
                    // but the user requirement is "make sure each api is matching each model", 
                    // so we proceed to next key or model. 
                    // However, if the MODEL ITSELF is invalid, rotating keys won't help. 
                    // "404 Not Found" usually means model name is wrong or not available to the key.
                    if (errStr.includes("404") || errStr.includes("Not Found")) {
                        console.log(`[${taskName}] Model ${model} seems unavailable. Moving to next model.`);
                        break; // Break inner loop to try next model
                    }

                    // For other errors, we might want to try next key just in case
                    currentKeyIdx++;
                    continue;
                }
            }
        }
        return null;
    } catch (e) {
        console.error(`[${taskName}] Fatal Error: ${e}`);
        return null;
    }
}

module.exports = {
    processPdfWithGemini,
    PROMPT_QUESTIONS,
    PROMPT_ANSWERS
};
