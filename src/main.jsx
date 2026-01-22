import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import HomePage from './HomePage';
import './index.css';

const QuizApp = ({ quizId, onBack }) => {
    const [quizData, setQuizData] = useState(null);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [selectedOptions, setSelectedOptions] = useState({});
    const [showResults, setShowResults] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        // Fetch specific quiz JSON from the Flask backend endpoint
        fetch(`/quizzes/${quizId}.json`)
            .then(res => {
                if (!res.ok) throw new Error("Quiz not found");
                return res.json();
            })
            .then(data => {
                // Check if data is legacy array format
                if (Array.isArray(data)) {
                    // Normalize standard format
                    const normalizedQuestions = data.map((q, index) => {
                        // Use provided id or fallback to index
                        const qId = q.id || q.page || index + 1;
                        
                        // Ensure options exist
                        const rawOptions = q.options || [];
                        
                        // Convert string array options to object array with keys
                        const options = rawOptions.map((opt, idx) => ({
                            key: (idx + 1).toString(),
                            text: opt
                        }));
                        
                        // Find correct key by matching answer text string
                        // This assumes strict equality. 
                        const answerText = q.answer || "";
                        const correctOpt = options.find(o => o.text.trim() === answerText.trim());
                        const correctKey = correctOpt ? correctOpt.key : null;

                        return {
                            id: qId,
                            question: q.question,
                            options: options,
                            correct_answer: correctKey
                        };
                    });

                    setQuizData({
                        quiz_title: `Quiz ${quizId}`,
                        questions: normalizedQuestions
                    });
                } else {
                    // Already in new format
                    setQuizData(data);
                }
            })
            .catch(err => {
                console.error("Failed to load quiz data", err);
                setError(err.message);
            });
    }, [quizId]);

    if (error) return (
        <div className="container" style={{ textAlign: 'center', marginTop: '50px' }}>
            <h2>Error Loading Quiz</h2>
            <p style={{ color: 'red' }}>{error}</p>
            <button onClick={onBack} className="btn secondary" style={{ marginTop: '20px' }}>Back to Home</button>
        </div>
    );

    if (!quizData) return <div className="loading">Loading Quiz...</div>;

    if (!quizData.questions || quizData.questions.length === 0) {
        return (
            <div className="container" style={{ textAlign: 'center', marginTop: '50px' }}>
                <h2>No Questions Found</h2>
                <p>The quiz file appears to be empty or invalid.</p>
                <button onClick={onBack} className="btn secondary">Back to Home</button>
            </div>
        );
    }

    const currentQuestion = quizData.questions[currentQuestionIndex];

    // Restore handlers
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

    // Restore Result View
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

    if (!currentQuestion) {
        return (
            <div className="container">
                <h2>Error</h2>
                <p>Question {currentQuestionIndex + 1} not found.</p>
                <button onClick={onBack} className="btn secondary">Back to Home</button>
            </div>
        );
    }

    return (
        <div className="container">
            <header className="quiz-header">
                <button onClick={onBack} className="btn-text">← Back</button>
                <span className="quiz-title-small">{quizData.quiz_title}</span>
                <span className="progress">Q {currentQuestionIndex + 1} / {quizData.questions.length}</span>
            </header>

            <main className="question-card">
                <h2 className="question-text">{currentQuestion.question || "Question text missing"}</h2>

                <div className="options-grid">
                    {(currentQuestion.options || []).map((opt) => (
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

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="container" style={{ padding: '20px', textAlign: 'center' }}>
                    <h1>Something went wrong.</h1>
                    <p style={{ color: 'red' }}>{this.state.error && this.state.error.toString()}</p>
                    <button onClick={() => window.location.reload()} className="btn primary">Reload Page</button>
                </div>
            );
        }

        return this.props.children;
    }
}

ReactDOM.createRoot(document.getElementById('root')).render(
    <ErrorBoundary>
        <App />
    </ErrorBoundary>
);
