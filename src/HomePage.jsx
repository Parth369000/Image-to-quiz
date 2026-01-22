import React, { useState, useEffect } from 'react';
import { Upload, FileText, ChevronRight, Clock, BookOpen, AlertCircle, CheckCircle } from 'lucide-react';
import './index.css';

const API_URL = 'http://localhost:5000';

const HomePage = ({ onQuizSelect }) => {
    const [quizzes, setQuizzes] = useState([]);
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState(null);

    // New state for two files
    const [questionsFile, setQuestionsFile] = useState(null);
    const [answersFile, setAnswersFile] = useState(null);

    useEffect(() => {
        fetchQuizzes();
    }, []);

    const fetchQuizzes = async () => {
        try {
            const res = await fetch(`${API_URL}/quizzes`);
            const data = await res.json();
            setQuizzes(data);
        } catch (e) {
            console.error("Failed to fetch quizzes");
        }
    };

    const handleFileSelect = (type, event) => {
        const file = event.target.files[0];
        if (!file) return;

        if (file.type !== 'application/pdf') {
            setError("Please upload PDF files only.");
            return;
        }

        setError(null);
        if (type === 'questions') setQuestionsFile(file);
        if (type === 'answers') setAnswersFile(file);

        // Reset input value to allow re-selecting same file if needed (though state handles it)
        event.target.value = null;
    };

    const handleStartUpload = async () => {
        if (!questionsFile || !answersFile) {
            setError("Please select both Questions and Answers PDFs.");
            return;
        }

        setIsUploading(true);
        setError(null);

        const formData = new FormData();
        formData.append('questions_file', questionsFile);
        formData.append('answers_file', answersFile);

        try {
            const res = await fetch(`${API_URL}/upload`, {
                method: 'POST',
                body: formData,
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || 'Upload failed');
            }

            const data = await res.json();

            // Clear selections
            setQuestionsFile(null);
            setAnswersFile(null);

            // Refresh list
            fetchQuizzes();
        } catch (err) {
            setError(err.message || "Failed to process PDFs. Try again.");
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="home-container">
            <header className="hero-section">
                <h1 className="hero-title">PDF Quiz Generator</h1>
                <p className="hero-subtitle">Upload Questions and Answers PDFs separately to generate a quiz.</p>

                <div className="upload-section">
                    <div className="file-inputs-row">
                        {/* Questions Upload */}
                        <div className={`upload-card ${questionsFile ? 'selected' : ''}`}>
                            <input
                                type="file"
                                id="questions-upload"
                                accept=".pdf"
                                onChange={(e) => handleFileSelect('questions', e)}
                                disabled={isUploading}
                                style={{ display: 'none' }}
                            />
                            <label htmlFor="questions-upload" className="file-label">
                                {questionsFile ? (
                                    <CheckCircle size={32} color="#10b981" />
                                ) : (
                                    <FileText size={32} color="#64748b" />
                                )}
                                <span className="label-text">
                                    {questionsFile ? questionsFile.name : "Select Questions PDF"}
                                </span>
                            </label>
                        </div>

                        {/* Answers Upload */}
                        <div className={`upload-card ${answersFile ? 'selected' : ''}`}>
                            <input
                                type="file"
                                id="answers-upload"
                                accept=".pdf"
                                onChange={(e) => handleFileSelect('answers', e)}
                                disabled={isUploading}
                                style={{ display: 'none' }}
                            />
                            <label htmlFor="answers-upload" className="file-label">
                                {answersFile ? (
                                    <CheckCircle size={32} color="#10b981" />
                                ) : (
                                    <FileText size={32} color="#64748b" />
                                )}
                                <span className="label-text">
                                    {answersFile ? answersFile.name : "Select Answers PDF"}
                                </span>
                            </label>
                        </div>
                    </div>

                    <button
                        className={`upload-btn ${isUploading || !questionsFile || !answersFile ? 'disabled' : ''}`}
                        onClick={handleStartUpload}
                        disabled={isUploading || !questionsFile || !answersFile}
                    >
                        {isUploading ? (
                            <span className="spinner"></span>
                        ) : (
                            <Upload size={24} />
                        )}
                        {isUploading ? "Generating Quiz..." : "Generate Quiz"}
                    </button>

                    {error && <div className="error-msg"><AlertCircle size={16} /> {error}</div>}
                </div>
            </header>

            <section className="recent-section">
                <h2><Clock size={20} /> Recent Quizzes</h2>

                {quizzes.length === 0 ? (
                    <div className="empty-state">
                        <p>No quizzes found. Upload PDFs above to get started!</p>
                    </div>
                ) : (
                    <div className="quiz-grid">
                        {quizzes.map((quiz) => (
                            <div key={quiz.id} className="quiz-card" onClick={() => onQuizSelect(quiz.id)}>
                                <div className="quiz-icon">
                                    <BookOpen size={24} color="#2563eb" />
                                </div>
                                <div className="quiz-info">
                                    <h3>{quiz.title}</h3>
                                    <div className="quiz-meta">
                                        <span>{quiz.total_questions} Questions</span>
                                        <span className="dot">•</span>
                                        <span>{new Date(quiz.created_at).toLocaleDateString()}</span>
                                    </div>
                                    <div className="source-file">{quiz.filename}</div>
                                </div>
                                <ChevronRight size={20} className="arrow-icon" />
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
};

export default HomePage;
