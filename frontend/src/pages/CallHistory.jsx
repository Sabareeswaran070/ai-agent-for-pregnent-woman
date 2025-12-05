import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './CallHistory.css';

const API_URL = 'http://localhost:5000';

function CallHistory() {
    const [callHistory, setCallHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');

    useEffect(() => {
        fetchCallHistory();
        // Auto-refresh every 10 seconds
        const interval = setInterval(fetchCallHistory, 10000);
        return () => clearInterval(interval);
    }, []);

    const fetchCallHistory = async () => {
        try {
            const response = await axios.get(`${API_URL}/call-history`);
            if (response.data.status === 'success') {
                setCallHistory(response.data.history);
            }
        } catch (error) {
            console.error('Error fetching call history:', error);
        }
        setLoading(false);
    };

    const getStatusBadge = (status) => {
        const statusMap = {
            'initiated': { class: 'badge-info', text: 'Initiated' },
            'ringing': { class: 'badge-warning', text: 'Ringing' },
            'answered': { class: 'badge-success', text: 'Answered' },
            'completed': { class: 'badge-success', text: 'Completed' },
            'failed': { class: 'badge-error', text: 'Failed' }
        };
        const statusInfo = statusMap[status] || { class: 'badge-info', text: status };
        return <span className={`badge ${statusInfo.class}`}>{statusInfo.text}</span>;
    };

    const getResponseSummary = (response) => {
        if (!response || response === 'Call initiated') return null;

        // Extract AI analysis if present
        const parts = response.split('| AI Analysis:');
        const userResponse = parts[0].trim();
        const aiAnalysis = parts[1]?.trim();

        return (
            <div className="response-details">
                <div className="user-response">
                    <strong>Patient Response:</strong>
                    <p>{userResponse}</p>
                </div>
                {aiAnalysis && (
                    <div className="ai-analysis">
                        <strong>AI Analysis:</strong>
                        <p>{aiAnalysis}</p>
                    </div>
                )}
            </div>
        );
    };

    const filteredHistory = callHistory.filter(call => {
        if (filter === 'all') return true;
        return call.callStatus === filter;
    });

    const stats = {
        total: callHistory.length,
        completed: callHistory.filter(c => c.callStatus === 'completed').length,
        pending: callHistory.filter(c => ['initiated', 'ringing'].includes(c.callStatus)).length,
        failed: callHistory.filter(c => c.callStatus === 'failed').length
    };

    return (
        <div className="call-history">
            <div className="history-header">
                <div>
                    <h2 className="page-title">Call History</h2>
                    <p className="page-subtitle">Track all automated reminder calls and patient responses</p>
                </div>
                <button className="btn btn-primary" onClick={fetchCallHistory}>
                    🔄 Refresh
                </button>
            </div>

            {/* Stats */}
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-icon">📞</div>
                    <div className="stat-content">
                        <h3>{stats.total}</h3>
                        <p>Total Calls</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon">✅</div>
                    <div className="stat-content">
                        <h3>{stats.completed}</h3>
                        <p>Completed</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon">⏳</div>
                    <div className="stat-content">
                        <h3>{stats.pending}</h3>
                        <p>Pending</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon">❌</div>
                    <div className="stat-content">
                        <h3>{stats.failed}</h3>
                        <p>Failed</p>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="filters">
                <button
                    className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
                    onClick={() => setFilter('all')}
                >
                    All Calls
                </button>
                <button
                    className={`filter-btn ${filter === 'completed' ? 'active' : ''}`}
                    onClick={() => setFilter('completed')}
                >
                    Completed
                </button>
                <button
                    className={`filter-btn ${filter === 'initiated' ? 'active' : ''}`}
                    onClick={() => setFilter('initiated')}
                >
                    Pending
                </button>
                <button
                    className={`filter-btn ${filter === 'failed' ? 'active' : ''}`}
                    onClick={() => setFilter('failed')}
                >
                    Failed
                </button>
            </div>

            {/* Call History List */}
            {loading ? (
                <div className="loading-state">
                    <div className="spinner"></div>
                    <p>Loading call history...</p>
                </div>
            ) : filteredHistory.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-icon">📋</div>
                    <h3>No call history found</h3>
                    <p>Make your first call from the Dashboard to see the history here</p>
                </div>
            ) : (
                <div className="history-list">
                    {filteredHistory.map((call) => (
                        <div key={call._id} className="history-card card">
                            <div className="history-header">
                                <div className="call-info">
                                    <div className="patient-avatar-small">
                                        {call.patientName ? call.patientName.charAt(0).toUpperCase() : '?'}
                                    </div>
                                    <div>
                                        <h4>{call.patientName || 'Unknown Patient'}</h4>
                                        <p className="call-phone">📞 {call.phone}</p>
                                    </div>
                                </div>
                                <div className="call-meta">
                                    {getStatusBadge(call.callStatus)}
                                    <span className="call-time">
                                        {new Date(call.timestamp).toLocaleString('en-US', {
                                            month: 'short',
                                            day: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })}
                                    </span>
                                </div>
                            </div>

                            {getResponseSummary(call.response)}

                            {call.recordingUrl && (
                                <div className="recording-section">
                                    <a
                                        href={call.recordingUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="btn btn-outline btn-sm"
                                    >
                                        🎵 Listen to Recording
                                    </a>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default CallHistory;
