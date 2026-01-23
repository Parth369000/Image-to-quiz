const express = require('express');
const router = express.Router();
const quizController = require('../controllers/quizController');
const { uploadFields } = require('../middleware/uploadMiddleware');

router.post('/upload', uploadFields, quizController.uploadFiles);
router.get('/quizzes', quizController.listQuizzes);

module.exports = router;
