const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { processPdfWithGemini, PROMPT_QUESTIONS, PROMPT_ANSWERS } = require('../services/geminiService');
const { UPLOAD_FOLDER } = require('../middleware/uploadMiddleware');

const QUIZ_FOLDER = path.join(__dirname, '..', '..', '..', 'frontend', 'public', 'quizzes');

// Ensure matching Frontend/public/quizzes structure
if (!fs.existsSync(QUIZ_FOLDER)) {
    fs.mkdirSync(QUIZ_FOLDER, { recursive: true });
}

// Load API Keys
const keysStr = process.env.GEMINI_API_KEYS || "";
let API_KEYS = [];
if (keysStr) {
    API_KEYS = keysStr.split(',').map(k => k.trim()).filter(k => k);
} else {
    const singleKey = process.env.GEMINI_API_KEY;
    if (singleKey) {
        API_KEYS = [singleKey];
    }
}

const uploadFiles = async (req, res) => {
    // req.files is an object (String -> Array of files)
    if (!req.files || !req.files['questions_file'] || !req.files['answers_file']) {
        return res.status(400).json({ error: 'Both questions and answers PDFs are required' });
    }

    const qFile = req.files['questions_file'][0];
    const aFile = req.files['answers_file'][0];

    const fileId = uuidv4().substring(0, 8);

    const qFilename = `${fileId}_questions_${qFile.originalname}`;
    const aFilename = `${fileId}_answers_${aFile.originalname}`;

    const qPath = path.join(UPLOAD_FOLDER, qFilename);
    const aPath = path.join(UPLOAD_FOLDER, aFilename);

    // Rename/Move
    try {
        fs.renameSync(qFile.path, qPath);
        fs.renameSync(aFile.path, aPath);
    } catch (err) {
        console.error("Error renaming/moving files:", err);
        return res.status(500).json({ error: 'Error processing files' });
    }

    // 1. Extract Questions
    const questionsData = await processPdfWithGemini(qPath, PROMPT_QUESTIONS, API_KEYS, "Questions Extraction");
    if (!questionsData) {
        return res.status(500).json({ error: 'Failed to extract questions' });
    }

    // 2. Extract Answers
    const answersData = await processPdfWithGemini(aPath, PROMPT_ANSWERS, API_KEYS, "Answers Extraction");
    if (!answersData) {
        return res.status(500).json({ error: 'Failed to extract answers' });
    }

    // 3. Save Raw JSONs
    const qJsonPath = path.join(QUIZ_FOLDER, `${fileId}_questions.json`);
    const aJsonPath = path.join(QUIZ_FOLDER, `${fileId}_answers.json`);

    fs.writeFileSync(qJsonPath, JSON.stringify(questionsData, null, 2), 'utf-8');
    fs.writeFileSync(aJsonPath, JSON.stringify(answersData, null, 2), 'utf-8');

    // 4. Merge Data
    const ansMap = {};
    if (answersData.answers) {
        answersData.answers.forEach(item => {
            ansMap[String(item.question_id)] = String(item.correct_key);
        });
    }

    const mergedQuestions = [];
    const questionsList = questionsData.questions || [];

    questionsList.forEach(q => {
        const qid = String(q.id);
        const correct = ansMap[qid];
        const newQ = { ...q, correct_answer: correct };
        mergedQuestions.push(newQ);
    });

    const finalQuiz = {
        id: fileId,
        quiz_title: questionsData.quiz_title || 'Uploaded Quiz',
        total_questions: mergedQuestions.length,
        questions: mergedQuestions,
        created_at: new Date().toISOString(),
        filename: qFile.originalname,
        has_answers: true
    };

    const savePath = path.join(QUIZ_FOLDER, `${fileId}.json`);
    fs.writeFileSync(savePath, JSON.stringify(finalQuiz, null, 2), 'utf-8');

    res.json({
        message: 'Files processed successfully',
        quiz_id: fileId,
        title: finalQuiz.quiz_title
    });
};

const listQuizzes = (req, res) => {
    const quizzes = [];
    if (fs.existsSync(QUIZ_FOLDER)) {
        const files = fs.readdirSync(QUIZ_FOLDER);
        files.forEach(f => {
            if (f.endsWith('.json')) {
                if (f.includes('_questions') || f.includes('_answers')) return;

                try {
                    const content = fs.readFileSync(path.join(QUIZ_FOLDER, f), 'utf-8');
                    const data = JSON.parse(content);

                    if (Array.isArray(data)) {
                        // Legacy
                        quizzes.push({
                            id: f.replace('.json', ''),
                            title: f.replace('.json', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                            total_questions: data.length,
                            created_at: fs.statSync(path.join(QUIZ_FOLDER, f)).mtime.toISOString(),
                            filename: f
                        });
                    } else if (typeof data === 'object') {
                        quizzes.push({
                            id: data.id || f.replace('.json', ''),
                            title: data.quiz_title || 'Untitled Quiz',
                            total_questions: data.total_questions || 0,
                            created_at: data.created_at || '',
                            filename: data.filename || f
                        });
                    }
                } catch (e) {
                    console.error(`Error loading ${f}:`, e);
                }
            }
        });
    }

    // Sort by newest
    quizzes.sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at) : new Date(0);
        const dateB = b.created_at ? new Date(b.created_at) : new Date(0);
        return dateB - dateA;
    });

    res.json(quizzes);
};

module.exports = {
    uploadFiles,
    listQuizzes
};
