import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import HomePage from './HomePage';
import './index.css';

const QuizApp = ({ quizId, onBack }) => {
    const [quizData, setQuizData] = useState(null);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [selectedOptions, setSelectedOptions] = useState({});
    const [showResults, setShowResults] = useState(false);

    useEffect(() => {
        // Fetch specific quiz JSON from the Flask backend endpoint
        // We can fetch from /quizzes/ID.json if served statically, or an API
        // Since we saved files in 'public/quizzes/[ID].json', Vite dev server serves 'public' at root.
        // So the path is /quizzes/[ID].json
        fetch(`/quizzes/${quizId}.json`)
            .then(res => {
                if (!res.ok) throw new Error("Quiz not found");
                return res.json();
            })
            .then(data => setQuizData(data))
            .catch(err => console.error("Failed to load quiz data", err));
    }, [quizId]);

    if (!quizData) return <div className="loading">Loading Quiz...</div>;

    const currentQuestion = quizData.questions[currentQuestionIndex];
    const totalQuestions = quizData.questions.length;

    const handleOptionSelect = (key) => {
        setSelectedOptions({
            ...selectedOptions,
            [currentQuestion.id]: key
        });
    };

    const handleNext = () => {
        if (currentQuestionIndex < totalQuestions - 1) {
            setCurrentQuestionIndex(currentQuestionIndex + 1);
        } else {
            setShowResults(true);
        }
    };

    const handlePrev = () => {
        if (currentQuestionIndex > 0) {
            setCurrentQuestionIndex(currentQuestionIndex - 1);
        }
    };

    if (showResults) {
        // Calculate Score
        let score = 0;
        let attempted = 0;
        quizData.questions.forEach(q => {
            if (selectedOptions[q.id]) {
                attempted++;
                if (selectedOptions[q.id] === q.correct_answer) {
                    score++;
                }
            }
        });

        const percentage = Math.round((score / totalQuestions) * 100);

        return (
            <div className="container">
                <header className="quiz-header">
                    <h1>Quiz Results</h1>
                </header>

                <div className="score-card" style={{ textAlign: 'center', padding: '40px 0' }}>
                    <div style={{ fontSize: '4rem', fontWeight: '800', color: percentage >= 70 ? '#10b981' : '#f59e0b' }}>
                        {percentage}%
                    </div>
                    <p style={{ fontSize: '1.2rem', color: '#64748b' }}>
                        You scored {score} out of {totalQuestions}
                    </p>
                </div>

                <div className="actions" style={{ justifyContent: 'center', marginBottom: '40px' }}>
                    <button onClick={onBack} className="btn secondary">Back to Home</button>
                    <button onClick={() => window.location.reload()} className="btn primary">Restart Quiz</button>
                </div>

                <div className="review-section">
                    <h2>Review Answers</h2>
                    <div className="review-list" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {quizData.questions.map((q, index) => {
                            const userAns = selectedOptions[q.id];
                            const isCorrect = userAns === q.correct_answer;
                            const isSkipped = !userAns;

                            return (
                                <div key={q.id} className="review-item" style={{
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '12px',
                                    padding: '20px',
                                    borderLeft: `4px solid ${isCorrect ? '#10b981' : (isSkipped ? '#94a3b8' : '#ef4444')}`,
                                    background: 'white'
                                }}>
                                    <div style={{ fontWeight: '600', marginBottom: '12px' }}>
                                        {index + 1}. {q.question}
                                    </div>
                                    <div style={{ fontSize: '0.9rem', color: '#64748b' }}>
                                        Your Answer: <span style={{
                                            fontWeight: 'bold',
                                            color: isCorrect ? '#10b981' : '#ef4444'
                                        }}>
                                            {userAns ? `Option ${userAns}` : 'Skipped'}
                                        </span>
                                        {!isCorrect && q.correct_answer && (
                                            <span style={{ marginLeft: '12px', color: '#10b981' }}>
                                                (Correct: Option {q.correct_answer})
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="container">
            <header className="quiz-header">
                <button onClick={onBack} className="btn-text">← Back</button>
                <span className="quiz-title-small">{quizData.quiz_title}</span>
                <span className="progress">Q {currentQuestionIndex + 1} / {totalQuestions}</span>
            </header>

            <main className="question-card">
                <h2 className="question-text">{currentQuestion.question}</h2>

                <div className="options-grid">
                    {currentQuestion.options.map((opt) => (
                        <button
                            key={opt.key}
                            className={`option-btn ${selectedOptions[currentQuestion.id] === opt.key ? 'selected' : ''}`}
                            onClick={() => handleOptionSelect(opt.key)}
                        >
                            <span className="option-key">{opt.key}</span>
                            <span className="option-text">{opt.text}</span>
                        </button>
                    ))}
                </div>
            </main>

            <footer className="quiz-footer">
                <button onClick={handlePrev} disabled={currentQuestionIndex === 0} className="btn secondary">Previous</button>
                <button onClick={handleNext} className="btn primary">
                    {currentQuestionIndex === totalQuestions - 1 ? 'Finish' : 'Next'}
                </button>
            </footer>
        </div>
    );
};

const App = () => {
    const [view, setView] = useState('home'); // 'home' | 'quiz'
    const [activeQuizId, setActiveQuizId] = useState(null);

    const startQuiz = (id) => {
        setActiveQuizId(id);
        setView('quiz');
    };

    const goHome = () => {
        setActiveQuizId(null);
        setView('home');
    };

    return (
        <React.StrictMode>
            {view === 'home' ? (
                <HomePage onQuizSelect={startQuiz} />
            ) : (
                <QuizApp quizId={activeQuizId} onBack={goHome} />
            )}
        </React.StrictMode>
    );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
