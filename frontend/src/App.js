import React, { useState } from 'react';
import './App.css';
import Dashboard from './pages/Dashboard';
import CallHistory from './pages/CallHistory';

function App() {
    const [currentPage, setCurrentPage] = useState('dashboard');

    return (
        <div className="app">
            <nav className="navbar">
                <div className="container">
                    <div className="nav-content">
                        <div className="nav-brand">
                            <div className="brand-icon">🤰</div>
                            <h1>AI Voice Agent</h1>
                            <span className="brand-subtitle">Pregnancy Care</span>
                        </div>
                        <div className="nav-links">
                            <button
                                className={`nav-link ${currentPage === 'dashboard' ? 'active' : ''}`}
                                onClick={() => setCurrentPage('dashboard')}
                            >
                                📊 Dashboard
                            </button>
                            <button
                                className={`nav-link ${currentPage === 'history' ? 'active' : ''}`}
                                onClick={() => setCurrentPage('history')}
                            >
                                📞 Call History
                            </button>
                        </div>
                    </div>
                </div>
            </nav>

            <main className="main-content">
                <div className="container">
                    {currentPage === 'dashboard' ? <Dashboard /> : <CallHistory />}
                </div>
            </main>

            <footer className="footer">
                <div className="container">
                    <p>© 2025 AI Voice Agent - Automated Health Reminders for Pregnant Women</p>
                </div>
            </footer>
        </div>
    );
}

export default App;