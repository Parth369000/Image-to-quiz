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
        return (
            <div className="container">
                <h1>Quiz Complete!</h1>
                <p>You answered {Object.keys(selectedOptions).length} out of {totalQuestions} questions.</p>
                <div className="actions">
                    <button onClick={onBack} className="btn secondary red-btn">Back to Home</button>
                    <button onClick={() => window.location.reload()} className="btn primary">Restart</button>
                </div>

                <div className="review-section">
                    <h2>Your Answers:</h2>
                    <pre>{JSON.stringify(selectedOptions, null, 2)}</pre>
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
