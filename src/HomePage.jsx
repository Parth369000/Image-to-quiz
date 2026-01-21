import React, { useState, useEffect } from 'react';
import { Upload, FileText, ChevronRight, Clock, BookOpen, AlertCircle } from 'lucide-react';
import './index.css';

const API_URL = 'http://localhost:5000';

const HomePage = ({ onQuizSelect }) => {
    const [quizzes, setQuizzes] = useState([]);
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState(null);

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

    const handleFileUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        // Reset the input value so the same file can be selected again if needed
        event.target.value = null;

        if (file.type !== 'application/pdf') {
            setError("Please upload a PDF file.");
            return;
        }

        setIsUploading(true);
        setError(null);

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch(`${API_URL}/upload`, {
                method: 'POST',
                body: formData,
            });

            if (!res.ok) throw new Error('Upload failed');

            const data = await res.json();
            // Refresh list
            fetchQuizzes();
            // Auto start? or just show in list
            // onQuizSelect(data.quiz_id); // Optional: auto open
        } catch (err) {
            setError("Failed to upload and process PDF. Try again.");
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="home-container">
            <header className="hero-section">
                <h1 className="hero-title">PDF to Quiz Engine</h1>
                <p className="hero-subtitle">Upload any exam PDF and instantly get a practice quiz.</p>

                <div className="upload-box">
                    <input
                        type="file"
                        id="pdf-upload"
                        accept=".pdf"
                        onChange={handleFileUpload}
                        disabled={isUploading}
                        style={{ display: 'none' }}
                    />
                    <label htmlFor="pdf-upload" className={`upload-btn ${isUploading ? 'disabled' : ''}`}>
                        {isUploading ? (
                            <span className="spinner"></span>
                        ) : (
                            <Upload size={24} />
                        )}
                        {isUploading ? "Analysing PDF with Gemini..." : "Upload New PDF Exam"}
                    </label>
                    {error && <div className="error-msg"><AlertCircle size={16} /> {error}</div>}
                </div>
            </header>

            <section className="recent-section">
                <h2><Clock size={20} /> Recent Quizzes</h2>

                {quizzes.length === 0 ? (
                    <div className="empty-state">
                        <p>No quizzes found. Upload a PDF to get started!</p>
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
