import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './TextMessages.css';

const API_URL = 'http://localhost:5000';

function TextMessages() {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(false);
    const [sendStatus, setSendStatus] = useState('');
    const [form, setForm] = useState({ phone: '', message: '' });

    useEffect(() => {
        fetchHistory();
    }, []);

    const fetchHistory = async () => {
        try {
            const res = await axios.get(`${API_URL}/api/messages/history?limit=20`);
            if (res.data.status === 'success') {
                setHistory(res.data.data);
            }
        } catch (err) {
            console.error('Error fetching message history:', err);
        }
    };

    const handleSend = async (e) => {
        e.preventDefault();
        setLoading(true);
        setSendStatus('Sending...');
        try {
            const res = await axios.post(`${API_URL}/api/messages/send`, form);
            if (res.data.status === 'success') {
                setSendStatus('✅ Message sent successfully');
                setForm({ phone: '', message: '' });
                await fetchHistory();
            }
        } catch (err) {
            const msg = err.response?.data?.message || err.message;
            setSendStatus('❌ ' + msg);
        }
        setLoading(false);
    };

    return (
        <div className="messages-page">
            <div className="page-header">
                <div>
                    <h2 className="page-title">Text Messages</h2>
                    <p className="page-subtitle">Send SMS reminders and view history</p>
                </div>
            </div>

            <div className="send-card card">
                <h3>Send SMS</h3>
                <form onSubmit={handleSend} className="send-form">
                    <div className="input-group">
                        <label>Phone Number *</label>
                        <input
                            type="tel"
                            value={form.phone}
                            onChange={(e) => setForm({ ...form, phone: e.target.value })}
                            placeholder="+1234567890"
                            required
                        />
                    </div>
                    <div className="input-group">
                        <label>Message *</label>
                        <textarea
                            value={form.message}
                            onChange={(e) => setForm({ ...form, message: e.target.value })}
                            placeholder="Enter reminder text"
                            required
                            maxLength={500}
                        />
                    </div>
                    {sendStatus && (
                        <div className={`send-status ${sendStatus.includes('✅') ? 'success' : 'error'}`}>
                            {sendStatus}
                        </div>
                    )}
                    <div className="actions">
                        <button type="submit" className="btn btn-primary" disabled={loading}>
                            {loading ? <span className="spinner"></span> : '✉️ Send SMS'}
                        </button>
                    </div>
                </form>
            </div>

            <div className="history-card card">
                <h3>Recent Messages</h3>
                {history.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">📭</div>
                        <p>No messages yet</p>
                    </div>
                ) : (
                    <ul className="message-list">
                        {history.map((m) => (
                            <li key={m._id} className="message-item">
                                <div className="message-header">
                                    <span className={`status-badge status-${m.status}`}>{m.status}</span>
                                    <span className="message-phone">{m.phone}</span>
                                    <span className="message-time">{new Date(m.timestamp).toLocaleString()}</span>
                                </div>
                                <div className="message-body">{m.body}</div>
                                {m.error && <div className="message-error">Error: {m.error}</div>}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

export default TextMessages;
