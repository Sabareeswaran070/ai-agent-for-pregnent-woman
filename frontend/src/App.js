import React, { useState } from 'react';
import './App.css';
import Dashboard from './pages/Dashboard';
import CallHistory from './pages/CallHistory';
import ScheduledCalls from './pages/ScheduledCalls';

function App() {
    const [currentPage, setCurrentPage] = useState('dashboard');

    return (
        <div className="app">
            <nav className="navbar">
                <div className="container">
                    <div className="nav-content">
                        <div className="nav-brand">
                            <div className="brand-icon">🤰</div>
                            <h1>Allobot</h1>
                            <span className="brand-subtitle">Smart Health Assistant for Mothers</span>
                        </div>
                        <div className="nav-links">
                            <button
                                className={`nav-link ${currentPage === 'dashboard' ? 'active' : ''}`}
                                onClick={() => setCurrentPage('dashboard')}
                            >
                                📊 Dashboard
                            </button>
                            <button
                                className={`nav-link ${currentPage === 'scheduled' ? 'active' : ''}`}
                                onClick={() => setCurrentPage('scheduled')}
                            >
                                📞 Scheduled Calls
                            </button>
                            <button
                                className={`nav-link ${currentPage === 'history' ? 'active' : ''}`}
                                onClick={() => setCurrentPage('history')}
                            >
                                📋 Call History
                            </button>
                        </div>
                    </div>
                </div>
            </nav>

            <main className="main-content">
                <div className="container">
                    {currentPage === 'dashboard' && <Dashboard />}
                    {currentPage === 'scheduled' && <ScheduledCalls />}
                    {currentPage === 'history' && <CallHistory />}
                </div>
            </main>

            <footer className="footer">
                <div className="container">
                    <p>© 2026 Allobot - AI-Powered Health Reminders for Pregnant Women</p>
                </div>
            </footer>
        </div>
    );
}

export default App;