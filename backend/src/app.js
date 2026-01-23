const express = require('express');
const cors = require('cors');
const quizRoutes = require('./routes/quizRoutes');

const app = express();

// Enable CORS
app.use(cors());
app.use(express.json());

// Routes
app.use('/', quizRoutes);

// Health Check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

module.exports = app;
