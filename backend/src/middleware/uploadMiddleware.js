const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOAD_FOLDER = 'uploads';

// Ensure directory exists
if (!fs.existsSync(UPLOAD_FOLDER)) {
    fs.mkdirSync(UPLOAD_FOLDER, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_FOLDER);
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname); // Temporarily save with original name
    }
});

const upload = multer({ storage: storage });

const uploadFields = upload.fields([
    { name: 'questions_file', maxCount: 1 },
    { name: 'answers_file', maxCount: 1 }
]);

module.exports = {
    uploadFields,
    UPLOAD_FOLDER
};
