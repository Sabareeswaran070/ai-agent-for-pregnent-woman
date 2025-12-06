import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './Dashboard.css';

const API_URL = 'http://localhost:5000';

function Dashboard() {
    const [patients, setPatients] = useState([]);
    const [showAddPatient, setShowAddPatient] = useState(false);
    const [showCallModal, setShowCallModal] = useState(false);
    const [selectedPatient, setSelectedPatient] = useState(null);
    const [loading, setLoading] = useState(false);
    const [callStatus, setCallStatus] = useState('');

    const [newPatient, setNewPatient] = useState({
        name: '',
        phone: '',
        email: '',
        dueDate: '',
        upcomingTests: []
    });

    const [newTest, setNewTest] = useState({
        testName: '',
        testDate: '',
        testType: 'lab'
    });

    useEffect(() => {
        fetchPatients();
    }, []);

    const fetchPatients = async () => {
        try {
            const response = await axios.get(`${API_URL}/patients`);
            if (response.data.status === 'success') {
                setPatients(response.data.patients);
            }
        } catch (error) {
            console.error('Error fetching patients:', error);
        }
    };

    const handleAddPatient = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const response = await axios.post(`${API_URL}/patients`, newPatient);
            if (response.data.status === 'success') {
                setPatients([response.data.patient, ...patients]);
                setNewPatient({
                    name: '',
                    phone: '',
                    email: '',
                    dueDate: '',
                    upcomingTests: []
                });
                setShowAddPatient(false);
                alert('✅ Patient added successfully!');
            }
        } catch (error) {
            console.error('Error adding patient:', error);
            alert('❌ Error adding patient: ' + error.response?.data?.message);
        }
        setLoading(false);
    };

    const handleAddTest = () => {
        if (newTest.testName && newTest.testDate) {
            setNewPatient({
                ...newPatient,
                upcomingTests: [...newPatient.upcomingTests, { ...newTest }]
            });
            setNewTest({ testName: '', testDate: '', testType: 'lab' });
        }
    };

    const handleRemoveTest = (index) => {
        const updatedTests = newPatient.upcomingTests.filter((_, i) => i !== index);
        setNewPatient({ ...newPatient, upcomingTests: updatedTests });
    };

    const handleMakeCall = async () => {
        if (!selectedPatient) return;

        setLoading(true);
        setCallStatus('Initiating call...');

        try {
            const response = await axios.post(`${API_URL}/call`, {
                phone: selectedPatient.phone,
                patientId: selectedPatient._id
            });

            if (response.data.status === 'success') {
                setCallStatus('✅ Call initiated successfully! The patient will receive the call shortly.');
                setTimeout(() => {
                    setShowCallModal(false);
                    setCallStatus('');
                    setSelectedPatient(null);
                }, 3000);
            }
        } catch (error) {
            console.error('Error making call:', error);
            
            // Provide detailed error messages
            let errorMsg = 'Unknown error occurred';
            if (error.response?.data?.message) {
                errorMsg = error.response.data.message;
            } else if (error.response?.status === 500) {
                errorMsg = 'Server error. Please check backend configuration.';
            } else if (error.message === 'Network Error') {
                errorMsg = 'Cannot connect to server. Please ensure the backend is running.';
            } else {
                errorMsg = error.message;
            }
            
            setCallStatus('❌ Error: ' + errorMsg);
        }
        setLoading(false);
    };

    const handleDeletePatient = async (id) => {
        if (!window.confirm('Are you sure you want to delete this patient?')) return;

        try {
            await axios.delete(`${API_URL}/patients/${id}`);
            setPatients(patients.filter(p => p._id !== id));
            alert('✅ Patient deleted successfully!');
        } catch (error) {
            console.error('Error deleting patient:', error);
            alert('❌ Error deleting patient');
        }
    };

    return (
        <div className="dashboard">
            <div className="dashboard-header">
                <div>
                    <h2 className="page-title">Patient Dashboard</h2>
                    <p className="page-subtitle">Manage patients and trigger automated health reminder calls</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowAddPatient(true)}>
                    ➕ Add New Patient
                </button>
            </div>

            {/* Stats Cards */}
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-icon">👥</div>
                    <div className="stat-content">
                        <h3>{patients.length}</h3>
                        <p>Total Patients</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon">📅</div>
                    <div className="stat-content">
                        <h3>{patients.filter(p => p.upcomingTests?.length > 0).length}</h3>
                        <p>Upcoming Tests</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon">✅</div>
                    <div className="stat-content">
                        <h3>Active</h3>
                        <p>System Status</p>
                    </div>
                </div>
            </div>

            {/* Patients List */}
            <div className="patients-section">
                <h3 className="section-title">Registered Patients</h3>
                {patients.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">📋</div>
                        <h3>No patients registered yet</h3>
                        <p>Add your first patient to get started with automated health reminders</p>
                        <button className="btn btn-primary" onClick={() => setShowAddPatient(true)}>
                            Add Patient
                        </button>
                    </div>
                ) : (
                    <div className="patients-grid">
                        {patients.map((patient) => (
                            <div key={patient._id} className="patient-card card">
                                <div className="patient-header">
                                    <div className="patient-avatar">
                                        {patient.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="patient-info">
                                        <h4>{patient.name}</h4>
                                        <p className="patient-phone">📞 {patient.phone}</p>
                                        {patient.email && <p className="patient-email">✉️ {patient.email}</p>}
                                    </div>
                                </div>

                                {patient.dueDate && (
                                    <div className="patient-due-date">
                                        <span className="label">Due Date:</span>
                                        <span className="value">{new Date(patient.dueDate).toLocaleDateString()}</span>
                                    </div>
                                )}

                                {patient.upcomingTests && patient.upcomingTests.length > 0 && (
                                    <div className="patient-tests">
                                        <h5>Upcoming Tests:</h5>
                                        <ul>
                                            {patient.upcomingTests.map((test, idx) => (
                                                <li key={idx}>
                                                    <span className={`badge badge-${test.testType === 'vaccination' ? 'warning' : 'info'}`}>
                                                        {test.testType}
                                                    </span>
                                                    <span>{test.testName}</span>
                                                    <span className="test-date">
                                                        {new Date(test.testDate).toLocaleDateString()}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {patient.lastCall && (
                                    <div className="patient-last-call">
                                        <div className="last-call-header">
                                            <h5>Last Call:</h5>
                                            <span className={`status-badge status-${patient.lastCall.status}`}>
                                                {patient.lastCall.status}
                                            </span>
                                        </div>
                                        <p className="last-response">
                                            "{patient.lastCall.response.split('|')[0].trim()}"
                                        </p>
                                        {patient.lastCall.response.includes('| AI Analysis:') && (
                                            <p className="ai-summary">
                                                🤖 {patient.lastCall.response.split('| AI Analysis:')[1].trim()}
                                            </p>
                                        )}
                                    </div>
                                )}

                                <div className="patient-actions">
                                    <button
                                        className="btn btn-secondary"
                                        onClick={() => {
                                            setSelectedPatient(patient);
                                            setShowCallModal(true);
                                        }}
                                    >
                                        📞 Make Call
                                    </button>
                                    <button
                                        className="btn btn-outline"
                                        onClick={() => handleDeletePatient(patient._id)}
                                    >
                                        🗑️ Delete
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Add Patient Modal */}
            {showAddPatient && (
                <div className="modal-overlay" onClick={() => setShowAddPatient(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Add New Patient</h3>
                            <button className="close-btn" onClick={() => setShowAddPatient(false)}>✕</button>
                        </div>
                        <form onSubmit={handleAddPatient}>
                            <div className="input-group">
                                <label>Patient Name *</label>
                                <input
                                    type="text"
                                    value={newPatient.name}
                                    onChange={(e) => setNewPatient({ ...newPatient, name: e.target.value })}
                                    required
                                    placeholder="Enter patient name"
                                />
                            </div>

                            <div className="input-group">
                                <label>Phone Number *</label>
                                <input
                                    type="tel"
                                    value={newPatient.phone}
                                    onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })}
                                    required
                                    placeholder="+1234567890"
                                />
                            </div>

                            <div className="input-group">
                                <label>Email (Optional)</label>
                                <input
                                    type="email"
                                    value={newPatient.email}
                                    onChange={(e) => setNewPatient({ ...newPatient, email: e.target.value })}
                                    placeholder="patient@example.com"
                                />
                            </div>

                            <div className="input-group">
                                <label>Due Date (Optional)</label>
                                <input
                                    type="date"
                                    value={newPatient.dueDate}
                                    onChange={(e) => setNewPatient({ ...newPatient, dueDate: e.target.value })}
                                    min={new Date().toISOString().split('T')[0]}
                                />
                            </div>

                            <div className="tests-section">
                                <h4>Upcoming Tests/Vaccinations</h4>
                                <div className="test-input-row">
                                    <div className="test-input-group">
                                        <label>Test Name</label>
                                        <input
                                            type="text"
                                            placeholder="e.g., Blood Test, Ultrasound"
                                            value={newTest.testName}
                                            onChange={(e) => setNewTest({ ...newTest, testName: e.target.value })}
                                        />
                                    </div>
                                    <div className="test-input-group">
                                        <label>Test Type</label>
                                        <select
                                            value={newTest.testType}
                                            onChange={(e) => setNewTest({ ...newTest, testType: e.target.value })}
                                        >
                                            <option value="lab">Lab Test</option>
                                            <option value="vaccination">Vaccination</option>
                                            <option value="checkup">Checkup</option>
                                            <option value="ultrasound">Ultrasound</option>
                                        </select>
                                    </div>
                                    <div className="test-input-group">
                                        <label>Test Date</label>
                                        <input
                                            type="date"
                                            value={newTest.testDate}
                                            onChange={(e) => setNewTest({ ...newTest, testDate: e.target.value })}
                                            min={new Date().toISOString().split('T')[0]}
                                        />
                                    </div>
                                    <div className="test-add-btn-container">
                                        <button type="button" className="btn btn-accent" onClick={handleAddTest}>
                                            ➕ Add Test
                                        </button>
                                    </div>
                                </div>

                                {newPatient.upcomingTests.length > 0 && (
                                    <ul className="added-tests">
                                        {newPatient.upcomingTests.map((test, idx) => (
                                            <li key={idx}>
                                                <span className={`badge badge-${test.testType === 'vaccination' ? 'warning' : 'info'}`}>
                                                    {test.testType}
                                                </span>
                                                <span>{test.testName}</span>
                                                <span>{new Date(test.testDate).toLocaleDateString()}</span>
                                                <button type="button" onClick={() => handleRemoveTest(idx)}>✕</button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn btn-outline" onClick={() => setShowAddPatient(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={loading}>
                                    {loading ? <span className="spinner"></span> : 'Add Patient'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Call Modal */}
            {showCallModal && selectedPatient && (
                <div className="modal-overlay" onClick={() => !loading && setShowCallModal(false)}>
                    <div className="modal call-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Make Reminder Call</h3>
                            <button className="close-btn" onClick={() => !loading && setShowCallModal(false)}>✕</button>
                        </div>
                        <div className="call-modal-content">
                            <div className="patient-preview">
                                <div className="patient-avatar large">
                                    {selectedPatient.name.charAt(0).toUpperCase()}
                                </div>
                                <h4>{selectedPatient.name}</h4>
                                <p>{selectedPatient.phone}</p>
                            </div>

                            {selectedPatient.upcomingTests && selectedPatient.upcomingTests.length > 0 && (
                                <div className="reminder-preview">
                                    <h5>Reminder Message:</h5>
                                    <div className="reminder-box">
                                        <p>
                                            "Hello {selectedPatient.name}, this is a reminder about your{' '}
                                            <strong>{selectedPatient.upcomingTests[0].testName}</strong>{' '}
                                            {selectedPatient.upcomingTests[0].testType} scheduled for{' '}
                                            <strong>{new Date(selectedPatient.upcomingTests[0].testDate).toLocaleDateString('en-US', {
                                                weekday: 'long',
                                                month: 'long',
                                                day: 'numeric'
                                            })}</strong>.
                                            Please confirm if you will be able to attend."
                                        </p>
                                    </div>
                                </div>
                            )}

                            {callStatus && (
                                <div className={`call-status ${callStatus.includes('✅') ? 'success' : 'error'}`}>
                                    {callStatus}
                                </div>
                            )}

                            <div className="modal-actions">
                                <button
                                    className="btn btn-outline"
                                    onClick={() => setShowCallModal(false)}
                                    disabled={loading}
                                >
                                    Cancel
                                </button>
                                <button
                                    className="btn btn-secondary"
                                    onClick={handleMakeCall}
                                    disabled={loading}
                                >
                                    {loading ? <span className="spinner"></span> : '📞 Initiate Call'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Dashboard;
