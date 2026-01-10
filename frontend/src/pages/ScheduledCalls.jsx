import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './ScheduledCalls.css';

const API_URL = 'http://localhost:5000';

function ScheduledCalls() {
    const [scheduledCalls, setScheduledCalls] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('pending');

    useEffect(() => {
        fetchScheduledCalls();
        const interval = setInterval(fetchScheduledCalls, 15000);
        return () => clearInterval(interval);
    }, [filter]);

    const fetchScheduledCalls = async () => {
        try {
            const endpoint = filter === 'all' 
                ? `${API_URL}/api/calls/scheduled`
                : `${API_URL}/api/calls/scheduled/status/${filter}`;
            
            const response = await axios.get(endpoint);
            if (response.data.status === 'success') {
                setScheduledCalls(response.data.data);
            }
        } catch (error) {
            console.error('Error fetching scheduled calls:', error);
        }
        setLoading(false);
    };

    const handleCancelCall = async (id) => {
        if (!window.confirm('Are you sure you want to cancel this scheduled call?')) return;
        try {
            await axios.delete(`${API_URL}/api/calls/scheduled/${id}`, {
                data: { reason: 'Cancelled by user' }
            });
            await fetchScheduledCalls();
        } catch (error) {
            console.error('Error cancelling scheduled call:', error);
            alert('Failed to cancel the scheduled call.');
        }
    };

    const handleUpdateStatus = async (id, newStatus) => {
        try {
            await axios.put(`${API_URL}/api/calls/scheduled/${id}/status`, {
                status: newStatus
            });
            await fetchScheduledCalls();
        } catch (error) {
            console.error('Error updating status:', error);
            alert('Failed to update status.');
        }
    };

    const getStatusBadge = (status) => {
        const statusMap = {
            'pending': { class: 'badge-pending', icon: '⏳', text: 'Pending' },
            'in-progress': { class: 'badge-progress', icon: '📞', text: 'In Progress' },
            'executed': { class: 'badge-executed', icon: '✓', text: 'Executed' },
            'completed': { class: 'badge-completed', icon: '✅', text: 'Completed' },
            'failed': { class: 'badge-failed', icon: '❌', text: 'Failed' },
            'cancelled': { class: 'badge-cancelled', icon: '🚫', text: 'Cancelled' }
        };
        const info = statusMap[status] || statusMap['pending'];
        return (
            <span className={`status-badge ${info.class}`}>
                {info.icon} {info.text}
            </span>
        );
    };

    const formatDateTime = (dateString) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = date - now;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        let timeUntil = '';
        if (diffMs < 0) {
            timeUntil = '⚠️ Overdue';
        } else if (diffDays > 0) {
            timeUntil = `In ${diffDays} day${diffDays > 1 ? 's' : ''}`;
        } else if (diffHours > 0) {
            timeUntil = `In ${diffHours} hour${diffHours > 1 ? 's' : ''}`;
        } else if (diffMins > 0) {
            timeUntil = `In ${diffMins} minute${diffMins > 1 ? 's' : ''}`;
        } else {
            timeUntil = 'Very soon';
        }

        return {
            formatted: date.toLocaleString('en-US', {
                dateStyle: 'medium',
                timeStyle: 'short'
            }),
            timeUntil
        };
    };

    if (loading) {
        return <div className="scheduled-calls-container"><div className="loading">Loading scheduled calls...</div></div>;
    }

    return (
        <div className="scheduled-calls-container">
            <div className="scheduled-header">
                <h1>📅 Scheduled Calls</h1>
                <div className="filter-buttons">
                    <button 
                        className={filter === 'all' ? 'active' : ''} 
                        onClick={() => setFilter('all')}
                    >
                        All
                    </button>
                    <button 
                        className={filter === 'pending' ? 'active' : ''} 
                        onClick={() => setFilter('pending')}
                    >
                        Pending
                    </button>
                    <button 
                        className={filter === 'in-progress' ? 'active' : ''} 
                        onClick={() => setFilter('in-progress')}
                    >
                        In Progress
                    </button>
                    <button 
                        className={filter === 'completed' ? 'active' : ''} 
                        onClick={() => setFilter('completed')}
                    >
                        Completed
                    </button>
                    <button 
                        className={filter === 'failed' ? 'active' : ''} 
                        onClick={() => setFilter('failed')}
                    >
                        Failed
                    </button>
                    <button 
                        className={filter === 'cancelled' ? 'active' : ''} 
                        onClick={() => setFilter('cancelled')}
                    >
                        Cancelled
                    </button>
                </div>
            </div>

            <div className="stats-row">
                <div className="stat-card">
                    <div className="stat-icon">⏳</div>
                    <div className="stat-info">
                        <div className="stat-value">{scheduledCalls.filter(c => c.status === 'pending').length}</div>
                        <div className="stat-label">Pending</div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon">📞</div>
                    <div className="stat-info">
                        <div className="stat-value">{scheduledCalls.filter(c => c.status === 'in-progress').length}</div>
                        <div className="stat-label">In Progress</div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon">✅</div>
                    <div className="stat-info">
                        <div className="stat-value">{scheduledCalls.filter(c => c.status === 'completed').length}</div>
                        <div className="stat-label">Completed</div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon">❌</div>
                    <div className="stat-info">
                        <div className="stat-value">{scheduledCalls.filter(c => c.status === 'failed').length}</div>
                        <div className="stat-label">Failed</div>
                    </div>
                </div>
            </div>

            {scheduledCalls.length === 0 ? (
                <div className="no-calls">
                    <div className="no-calls-icon">📭</div>
                    <h3>No scheduled calls found</h3>
                    <p>All scheduled calls with status "{filter}" will appear here</p>
                </div>
            ) : (
                <div className="calls-grid">
                    {scheduledCalls.map((call) => {
                        const { formatted, timeUntil } = formatDateTime(call.scheduledDateTime);
                        return (
                            <div key={call._id} className={`call-card status-${call.status}`}>
                                <div className="call-header">
                                    <div className="patient-info">
                                        <div className="patient-avatar">
                                            {call.patientId?.name?.charAt(0) || '?'}
                                        </div>
                                        <div>
                                            <h3>{call.patientId?.name || 'Unknown Patient'}</h3>
                                            <p className="phone">📱 {call.phone}</p>
                                        </div>
                                    </div>
                                    {getStatusBadge(call.status)}
                                </div>

                                <div className="call-details">
                                    <div className="detail-row">
                                        <span className="label">Scheduled Time:</span>
                                        <span className="value">{formatted}</span>
                                    </div>
                                    <div className="detail-row time-until">
                                        <span className="countdown">{timeUntil}</span>
                                    </div>
                                    
                                    {call.language && (
                                        <div className="detail-row">
                                            <span className="label">Language:</span>
                                            <span className="value">{call.language}</span>
                                        </div>
                                    )}

                                    {call.testInfo && (
                                        <div className="test-info">
                                            <div className="detail-row">
                                                <span className="label">Test Type:</span>
                                                <span className="value">{call.testInfo.type || call.testInfo.testType}</span>
                                            </div>
                                            <div className="detail-row">
                                                <span className="label">Test Name:</span>
                                                <span className="value">{call.testInfo.name || call.testInfo.testName}</span>
                                            </div>
                                        </div>
                                    )}

                                    {call.customMessage && (
                                        <div className="custom-message">
                                            <strong>Custom Message:</strong>
                                            <p>{call.customMessage}</p>
                                        </div>
                                    )}

                                    {call.errorMessage && (
                                        <div className="error-message">
                                            <strong>Error:</strong>
                                            <p>{call.errorMessage}</p>
                                        </div>
                                    )}

                                    {call.notes && (
                                        <div className="notes">
                                            <strong>Notes:</strong>
                                            <p>{call.notes}</p>
                                        </div>
                                    )}
                                </div>

                                <div className="call-actions">
                                    {call.status === 'pending' && (
                                        <>
                                            <button 
                                                className="btn-cancel"
                                                onClick={() => handleCancelCall(call._id)}
                                            >
                                                🚫 Cancel
                                            </button>
                                        </>
                                    )}
                                    {call.status === 'failed' && (
                                        <button 
                                            className="btn-retry"
                                            onClick={() => handleUpdateStatus(call._id, 'pending')}
                                        >
                                            🔄 Retry
                                        </button>
                                    )}
                                </div>

                                <div className="call-meta">
                                    <small>Created: {new Date(call.createdAt).toLocaleString()}</small>
                                    {call.executedAt && (
                                        <small>Executed: {new Date(call.executedAt).toLocaleString()}</small>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default ScheduledCalls;
