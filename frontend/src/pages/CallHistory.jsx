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
            const response = await axios.get(`${API_URL}/api/calls/history`);
            if (response.data.status === 'success') {
                setCallHistory(response.data.history);
            }
        } catch (error) {
            console.error('Error fetching call history:', error);
        }
        setLoading(false);
    };

    const handleClearAll = async () => {
        if (!window.confirm('Are you sure you want to delete ALL call history? This cannot be undone.')) return;
        try {
            await axios.delete(`${API_URL}/api/calls/history`);
            await fetchCallHistory();
        } catch (error) {
            console.error('Error deleting all call history:', error);
            alert('Failed to delete call history.');
        }
    };


    const handleDeleteRecord = async (id) => {
        if (!window.confirm('Delete this call record?')) return;
        try {
            await axios.delete(`${API_URL}/api/calls/history/record/${id}`);
            await fetchCallHistory();
        } catch (error) {
            console.error('Error deleting call record:', error);
            alert('Failed to delete this record.');
        }
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

    const getResponseSummary = (response, confirmationStatus) => {
        if (!response || response === 'Call initiated') return null;

        const getConfirmationBadge = (status) => {
            const statusMap = {
                'confirmed': { class: 'badge-success', icon: '✅', text: 'Confirmed' },
                'rejected': { class: 'badge-error', icon: '❌', text: 'Rejected' },
                'unclear': { class: 'badge-warning', icon: '❓', text: 'Unclear' },
                'pending': { class: 'badge-info', icon: '⏳', text: 'Pending' }
            };
            const info = statusMap[status] || statusMap['pending'];
            return (
                <span className={`badge ${info.class}`}>
                    {info.icon} {info.text}
                </span>
            );
        };

        return (
            <div className="response-details">
                <div className="confirmation-status">
                    {getConfirmationBadge(confirmationStatus || 'pending')}
                </div>
                <div className="user-response">
                    <strong>Patient Response:</strong>
                    <p>{response}</p>
                </div>
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
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-primary" onClick={fetchCallHistory}>
                        🔄 Refresh
                    </button>
                    <button className="btn btn-outline" onClick={handleClearAll}>
                        🗑️ Clear All
                    </button>
                </div>
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
                                    {/* Phone-wide delete removed by request */}
                                    <button
                                        className="btn btn-outline btn-sm"
                                        style={{ marginLeft: '8px' }}
                                        onClick={() => handleDeleteRecord(call._id)}
                                        title="Delete just this record"
                                    >
                                        🗑️ Delete Record
                                    </button>
                                </div>
                            </div>

                            {getResponseSummary(call.response, call.confirmationStatus)}

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
