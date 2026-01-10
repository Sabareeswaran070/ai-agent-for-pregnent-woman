import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './Dashboard.css';

const API_URL = 'http://localhost:5000';
// const API_URL = 'https://elicitable-unpenitentially-presley.ngrok-free.dev';

function Dashboard() {
    const [patients, setPatients] = useState([]);
    const [showAddPatient, setShowAddPatient] = useState(false);
    const [showCallModal, setShowCallModal] = useState(false);
    const [showAddTestModal, setShowAddTestModal] = useState(false);
    const [selectedPatient, setSelectedPatient] = useState(null);
    const [selectedTest, setSelectedTest] = useState(null);
    const [selectedLanguage, setSelectedLanguage] = useState('ta');
    const [customCallMessage, setCustomCallMessage] = useState('');
    const [scheduleCall, setScheduleCall] = useState(false);
    const [scheduleSms, setScheduleSms] = useState(false);
    const [scheduledDateTime, setScheduledDateTime] = useState('');
    const [loading, setLoading] = useState(false);
    const [callStatus, setCallStatus] = useState('');
    const [smsStatus, setSmsStatus] = useState('');

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

    // Inline add/edit state per patient
    const [patientTestForm, setPatientTestForm] = useState({}); // { [patientId]: { testName, testDate, testType } }
    const [editingTestDate, setEditingTestDate] = useState({}); // { [testId]: dateString }
    const [editingReminder, setEditingReminder] = useState({}); // { [testId]: reminderMessage }
    const [newTestForm, setNewTestForm] = useState({ testName: '', testDate: '', testType: 'lab' });

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
        
        // Validate inputs
        if (!newPatient.name || !newPatient.name.trim()) {
            alert('⚠️ Please enter patient name');
            return;
        }
        if (!newPatient.phone || !newPatient.phone.trim()) {
            alert('⚠️ Please enter phone number');
            return;
        }
        
        // Validate phone number format (10 digits)
        const phoneRegex = /^[0-9]{10}$/;
        const cleanPhone = newPatient.phone.replace(/\s+/g, '');
        if (!phoneRegex.test(cleanPhone)) {
            alert('⚠️ Please enter a valid 10-digit phone number');
            return;
        }
        
        // Check for duplicate phone number
        const isDuplicate = patients.some(p => p.phone === cleanPhone);
        if (isDuplicate) {
            alert('⚠️ A patient with this phone number already exists');
            return;
        }
        
        // Validate email if provided
        if (newPatient.email && newPatient.email.trim()) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(newPatient.email.trim())) {
                alert('⚠️ Please enter a valid email address');
                return;
            }
        }
        
        setLoading(true);
        try {
            const patientData = {
                name: newPatient.name.trim(),
                phone: cleanPhone,
                email: newPatient.email?.trim() || '',
                dueDate: newPatient.dueDate || '',
                upcomingTests: newPatient.upcomingTests || []
            };
            
            const response = await axios.post(`${API_URL}/patients`, patientData);
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
            const errorMsg = error.response?.data?.message || error.message || 'Failed to add patient';
            alert('❌ Error adding patient: ' + errorMsg);
        } finally {
            setLoading(false);
        }
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

    const isPastDateForPatient = (patient) => {
        if (!patient) return false;
        let d = null;
        if (Array.isArray(patient.upcomingTests) && patient.upcomingTests.length > 0) {
            d = patient.upcomingTests[0]?.testDate ? new Date(patient.upcomingTests[0].testDate) : null;
        }
        if (!d && patient.dueDate) {
            d = new Date(patient.dueDate);
        }
        if (!d || isNaN(d.getTime())) return false;
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const scheduledStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        return scheduledStart < todayStart;
    };

    const handleMakeCall = async () => {
        if (!selectedPatient) return;
        if (!selectedTest) {
            alert('Please select a test for this call');
            return;
        }
        
        // Validate scheduled call
        if (scheduleCall) {
            if (!scheduledDateTime) {
                alert('⚠️ Please select a date and time for the scheduled call');
                return;
            }
            const scheduledTime = new Date(scheduledDateTime);
            const now = new Date();
            if (scheduledTime <= now) {
                alert('⚠️ Scheduled time must be in the future');
                return;
            }
        }
        
        if (!scheduleCall && isPastDateForPatient(selectedPatient)) {
            alert('Cannot make a call for a past date. Please select today or a future date.');
            return;
        }

        setLoading(true);
        setCallStatus(scheduleCall ? 'Scheduling call...' : 'Initiating call...');

        try {
            const payload = {
                phone: selectedPatient.phone,
                patientId: selectedPatient._id,
                language: selectedLanguage,
                testInfo: selectedTest,
                scheduled: scheduleCall,
                scheduledDateTime: scheduleCall ? scheduledDateTime : null
            };
            
            // Add custom message if provided
            if (customCallMessage && customCallMessage.trim()) {
                payload.customMessage = customCallMessage.trim();
                console.log('[Frontend] Sending CUSTOM MESSAGE:', payload.customMessage);
            } else {
                console.log('[Frontend] No custom message, using default');
            }
            
            console.log('[Frontend] Full payload:', payload);
            
            const endpoint = scheduleCall ? `${API_URL}/api/calls/schedule` : `${API_URL}/call`;
            const response = await axios.post(endpoint, payload);

            if (response.data.status === 'success') {
                const successMsg = scheduleCall 
                    ? `✅ Call scheduled successfully for ${new Date(scheduledDateTime).toLocaleString()}!`
                    : '✅ Call initiated successfully! The patient will receive the call shortly.';
                setCallStatus(successMsg);
                setTimeout(() => {
                    setShowCallModal(false);
                    setCallStatus('');
                    setSelectedPatient(null);
                    setSelectedTest(null);
                    setCustomCallMessage('');
                    setScheduleCall(false);
                    setScheduledDateTime('');
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

    const handleAddPatientTest = async (patient) => {
        // Validate inputs
        if (!newTestForm.testName || !newTestForm.testName.trim()) {
            alert('⚠️ Please enter a test name');
            return;
        }
        if (!newTestForm.testDate) {
            alert('⚠️ Please select a test date');
            return;
        }
        
        // Check if date is in the past
        const selectedDate = new Date(newTestForm.testDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (selectedDate < today) {
            alert('⚠️ Test date cannot be in the past');
            return;
        }
        
        // Check if test already exists
        const isDuplicate = patient.upcomingTests?.some(
            test => test.testName.toLowerCase() === newTestForm.testName.trim().toLowerCase() &&
                    test.testDate === newTestForm.testDate
        );
        if (isDuplicate) {
            if (!window.confirm('A similar test already exists. Do you want to add it anyway?')) {
                return;
            }
        }
        
        setLoading(true);
        try {
            const response = await axios.post(`${API_URL}/api/patients/${patient._id}/tests`, {
                testName: newTestForm.testName.trim(),
                testDate: newTestForm.testDate,
                testType: newTestForm.testType
            });
            if (response.data.status === 'success') {
                // Update local patients list
                setPatients(patients.map(p => p._id === patient._id ? response.data.data : p));
                setNewTestForm({ testName: '', testDate: '', testType: 'lab' });
                setShowAddTestModal(false);
                setSelectedPatient(null);
                alert('✅ Test added successfully');
            }
        } catch (error) {
            console.error('Error adding test:', error);
            const errorMsg = error.response?.data?.message || error.message || 'Failed to add test';
            alert('❌ ' + errorMsg);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateTestDate = async (patientId, test) => {
        const dateStr = editingTestDate[test._id];
        if (!dateStr) {
            alert('⚠️ Please select a new date');
            return;
        }
        
        // Check if date is in the past
        const selectedDate = new Date(dateStr);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (selectedDate < today) {
            alert('⚠️ Test date cannot be in the past');
            return;
        }
        
        // Check if date is same as current
        if (dateStr === test.testDate) {
            alert('⚠️ New date is same as current date');
            return;
        }
        
        if (!window.confirm(`Update test date to ${new Date(dateStr).toLocaleDateString('en-GB')}?`)) {
            return;
        }
        
        setLoading(true);
        try {
            const response = await axios.put(`${API_URL}/api/patients/${patientId}/tests/${test._id}`, { testDate: dateStr });
            if (response.data.status === 'success') {
                setPatients(patients.map(p => p._id === patientId ? response.data.data : p));
                setEditingTestDate({ ...editingTestDate, [test._id]: '' });
                alert('✅ Test date updated successfully');
            }
        } catch (error) {
            console.error('Error updating test:', error);
            const errorMsg = error.response?.data?.message || error.message || 'Failed to update test';
            alert('❌ ' + errorMsg);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateReminderMessage = async (patientId, test) => {
        const reminderMsg = editingReminder[test._id];
        if (!reminderMsg || !reminderMsg.trim()) {
            alert('⚠️ Please enter a reminder message');
            return;
        }
        
        if (reminderMsg.trim() === test.reminderMessage) {
            alert('⚠️ New message is same as current message');
            return;
        }
        
        if (!window.confirm('Update reminder message?')) {
            return;
        }
        
        setLoading(true);
        try {
            const response = await axios.put(`${API_URL}/api/patients/${patientId}/tests/${test._id}`, { reminderMessage: reminderMsg.trim() });
            if (response.data.status === 'success') {
                setPatients(patients.map(p => p._id === patientId ? response.data.data : p));
                setEditingReminder({ ...editingReminder, [test._id]: '' });
                alert('✅ Reminder message updated successfully');
            }
        } catch (error) {
            console.error('Error updating reminder:', error);
            const errorMsg = error.response?.data?.message || error.message || 'Failed to update reminder';
            alert('❌ ' + errorMsg);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteTest = async (patientId, test) => {
        const testInfo = `${test.testType.toUpperCase()} - ${test.testName} (${new Date(test.testDate).toLocaleDateString('en-GB')})`;
        if (!window.confirm(`Are you sure you want to delete this test?\n\n${testInfo}`)) {
            return;
        }
        
        setLoading(true);
        try {
            const response = await axios.delete(`${API_URL}/api/patients/${patientId}/tests/${test._id}`);
            if (response.data.status === 'success') {
                setPatients(patients.map(p => p._id === patientId ? response.data.data : p));
                // Clear editing state for this test
                const newEditingState = { ...editingTestDate };
                delete newEditingState[test._id];
                setEditingTestDate(newEditingState);
                alert('✅ Test deleted successfully');
            }
        } catch (error) {
            console.error('Error deleting test:', error);
            const errorMsg = error.response?.data?.message || error.message || 'Failed to delete test';
            alert('❌ ' + errorMsg);
        } finally {
            setLoading(false);
        }
    };

    const handleDeletePatient = async (patient) => {
        const patientInfo = `${patient.name}\nPhone: ${patient.phone}`;
        const testsCount = patient.upcomingTests?.length || 0;
        const warningMsg = testsCount > 0 
            ? `\n\nThis patient has ${testsCount} upcoming test(s). All tests will also be deleted.`
            : '';
        
        if (!window.confirm(`Are you sure you want to delete this patient?\n\n${patientInfo}${warningMsg}`)) {
            return;
        }
        
        setLoading(true);
        try {
            await axios.delete(`${API_URL}/patients/${patient._id}`);
            setPatients(patients.filter(p => p._id !== patient._id));
            alert('✅ Patient deleted successfully!');
        } catch (error) {
            console.error('Error deleting patient:', error);
            const errorMsg = error.response?.data?.message || error.message || 'Failed to delete patient';
            alert('❌ Error deleting patient: ' + errorMsg);
        } finally {
            setLoading(false);
        }
    };

    const handleSendSms = async (patient, scheduled = false, scheduledTime = '') => {
        // Validate scheduled time if scheduling
        if (scheduled) {
            if (!scheduledTime) {
                alert('⚠️ Please select a date and time for scheduling');
                return;
            }
            const scheduledDateTime = new Date(scheduledTime);
            const now = new Date();
            if (scheduledDateTime <= now) {
                alert('⚠️ Scheduled time must be in the future');
                return;
            }
        }
        
        setLoading(true);
        setSmsStatus(scheduled ? 'Scheduling SMS...' : 'Sending SMS...');
        try {
            const requestData = { patientId: patient._id };
            if (scheduled) {
                requestData.scheduledAt = scheduledTime;
            }
            
            const response = await axios.post(`${API_URL}/api/patients/${patient._id}/reminder-sms`, requestData);
            if (response.data.status === 'success') {
                const successMsg = scheduled
                    ? `✅ SMS scheduled for ${new Date(scheduledTime).toLocaleString('en-US', { 
                        dateStyle: 'medium', 
                        timeStyle: 'short' 
                    })}`
                    : '✅ SMS reminder sent';
                setSmsStatus(successMsg);
                setTimeout(() => setSmsStatus(''), 3500);
            }
        } catch (error) {
            const msg = error.response?.data?.message || error.message;
            setSmsStatus('❌ ' + msg);
            setTimeout(() => setSmsStatus(''), 3500);
        }
        setLoading(false);
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
                                                <li key={test._id || idx}>
                                                    <span className={`badge badge-${test.testType === 'vaccination' ? 'warning' : 'info'}`}>
                                                        {test.testType}
                                                    </span>
                                                    <span className="test-name">{test.testName}</span>
                                                    <span className="test-date">
                                                        {new Date(test.testDate).toLocaleDateString('en-GB')}
                                                    </span>
                                                    <span className="test-actions">
                                                        <input
                                                            type="date"
                                                            className="date-input"
                                                            value={editingTestDate[test._id] || ''}
                                                            min={new Date().toISOString().split('T')[0]}
                                                            onChange={(e) => setEditingTestDate({ ...editingTestDate, [test._id]: e.target.value })}
                                                            placeholder="Select date"
                                                        />
                                                        <button
                                                            type="button"
                                                            className="btn btn-primary btn-sm btn-update"
                                                            onClick={() => handleUpdateTestDate(patient._id, test)}
                                                            disabled={loading}
                                                        >
                                                            ✏️ Update
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="btn btn-danger btn-sm btn-delete"
                                                            onClick={() => handleDeleteTest(patient._id, test)}
                                                            disabled={loading}
                                                        >
                                                            🗑️ Delete
                                                        </button>
                                                    </span>
                                                    {test.reminderMessage && (
                                                        <div className="test-reminder-message">
                                                            <span className="reminder-label">📝 Reminder:</span>
                                                            <span className="reminder-text">{test.reminderMessage}</span>
                                                        </div>
                                                    )}
                                                    <div className="test-reminder-edit">
                                                        <input
                                                            type="text"
                                                            className="reminder-input"
                                                            value={editingReminder[test._id] || ''}
                                                            onChange={(e) => setEditingReminder({ ...editingReminder, [test._id]: e.target.value })}
                                                            placeholder={test.reminderMessage || "Enter custom reminder message..."}
                                                        />
                                                        <button
                                                            type="button"
                                                            className="btn btn-success btn-sm btn-save-reminder"
                                                            onClick={() => handleUpdateReminderMessage(patient._id, test)}
                                                            disabled={loading}
                                                        >
                                                            💾 {test.reminderMessage ? 'Update' : 'Set'} Reminder
                                                        </button>
                                                    </div>
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
                                            setSelectedTest(patient.upcomingTests?.[0] || null);
                                            setShowCallModal(true);
                                        }}
                                    >
                                        📞 Make Call
                                    </button>
                                    <button
                                        className="btn btn-accent"
                                        onClick={() => {
                                            setSelectedPatient(patient);
                                            setScheduleSms(true);
                                            setScheduledDateTime('');
                                        }}
                                        disabled={loading}
                                    >
                                        ✉️ Send SMS
                                    </button>
                                    <button
                                        className="btn btn-primary"
                                        onClick={() => {
                                            setSelectedPatient(patient);
                                            setNewTestForm({ testName: '', testDate: '', testType: 'lab' });
                                            setShowAddTestModal(true);
                                        }}
                                    >
                                        ➕ Add Test
                                    </button>
                                    <button
                                        className="btn btn-outline"
                                        onClick={() => handleDeletePatient(patient)}
                                        disabled={loading}
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
                                <div className="input-group">
                                    <label>Select Test for Call *</label>
                                    <select 
                                        value={selectedTest ? selectedPatient.upcomingTests.findIndex(t => t._id === selectedTest._id) : 0} 
                                        onChange={(e) => setSelectedTest(selectedPatient.upcomingTests[e.target.value])}
                                        className="test-selector"
                                    >
                                        {selectedPatient.upcomingTests.map((test, idx) => (
                                            <option key={test._id || idx} value={idx}>
                                                {test.testType.toUpperCase()} - {test.testName} ({new Date(test.testDate).toLocaleDateString()})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div className="input-group">
                                <label>Custom Message (Optional)</label>
                                <div className="custom-message-wrapper">
                                    <textarea
                                        className="custom-message-input"
                                        placeholder="Enter a custom message to override the default reminder (leave empty to use default)"
                                        value={customCallMessage}
                                        onChange={(e) => setCustomCallMessage(e.target.value)}
                                        rows="3"
                                    />
                                    {customCallMessage && customCallMessage.trim() && (
                                        <button
                                            type="button"
                                            className="btn-reset-message"
                                            onClick={() => setCustomCallMessage('')}
                                            title="Clear custom message"
                                        >
                                            ✕ Clear
                                        </button>
                                    )}
                                </div>
                                {customCallMessage && customCallMessage.trim() && (
                                    <div className="custom-message-preview">
                                        <span className="preview-label">⚡ Will be used:</span>
                                        <span className="preview-text">"{customCallMessage.trim()}"</span>
                                    </div>
                                )}
                            </div>

                            {selectedTest && !customCallMessage && (
                                <div className="reminder-preview">
                                    <h5>Default Reminder Message:</h5>
                                    <div className="reminder-box">
                                        <p>
                                            "Hello {selectedPatient.name}, this is a reminder about your{' '}
                                            <strong>{selectedTest.testName}</strong>{' '}
                                            <span className="test-badge">{selectedTest.testType}</span> scheduled for{' '}
                                            <strong>{new Date(selectedTest.testDate).toLocaleDateString('en-US', {
                                                weekday: 'long',
                                                month: 'long',
                                                day: 'numeric'
                                            })}</strong>.
                                            Please confirm if you will be able to attend."
                                        </p>
                                    </div>
                                </div>
                            )}

                            <div className="input-group">
                                <label>Voice Language</label>
                                <select value={selectedLanguage} onChange={(e) => setSelectedLanguage(e.target.value)}>
                                    <option value="ta">Tamil (தமிழ்)</option>
                                    <option value="en">English</option>
                                </select>
                            </div>

                            <div className="scheduling-section">
                                <div className="checkbox-group">
                                    <input
                                        type="checkbox"
                                        id="scheduleCall"
                                        checked={scheduleCall}
                                        onChange={(e) => {
                                            setScheduleCall(e.target.checked);
                                            if (!e.target.checked) setScheduledDateTime('');
                                        }}
                                    />
                                    <label htmlFor="scheduleCall">Schedule call for later</label>
                                </div>
                                {scheduleCall && (
                                    <div className="input-group">
                                        <label>Schedule Date & Time *</label>
                                        <input
                                            type="datetime-local"
                                            value={scheduledDateTime}
                                            min={new Date().toISOString().slice(0, 16)}
                                            onChange={(e) => setScheduledDateTime(e.target.value)}
                                            className="datetime-input"
                                        />
                                    </div>
                                )}
                            </div>

                            {callStatus && (
                                <div className={`call-status ${callStatus.includes('✅') ? 'success' : 'error'}`}>
                                    {callStatus}
                                </div>
                            )}

                            <div className="modal-actions call-modal-actions">
                                <button
                                    className="btn btn-outline"
                                    onClick={() => {
                                        setShowCallModal(false);
                                        setScheduleCall(false);
                                        setScheduledDateTime('');
                                        setCustomCallMessage('');
                                    }}
                                    disabled={loading}
                                >
                                    Cancel
                                </button>
                                <button
                                    className="btn btn-primary btn-call-action"
                                    onClick={handleMakeCall}
                                    disabled={loading || (!scheduleCall && isPastDateForPatient(selectedPatient))}
                                >
                                    {loading ? (
                                        <>
                                            <span className="spinner"></span>
                                            <span>Processing...</span>
                                        </>
                                    ) : (
                                        <>
                                            <span>{scheduleCall ? '🕐' : '📞'}</span>
                                            <span>{scheduleCall ? 'Schedule Call' : 'Call Now'}</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Test Modal */}
            {showAddTestModal && selectedPatient && (
                <div className="modal-overlay" onClick={() => setShowAddTestModal(false)}>
                    <div className="modal add-test-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Add Test for {selectedPatient.name}</h3>
                            <button className="close-btn" onClick={() => setShowAddTestModal(false)}>✕</button>
                        </div>
                        <div className="modal-body">
                            <div className="input-group">
                                <label>Test Name *</label>
                                <input
                                    type="text"
                                    placeholder="Enter test name (e.g., Blood Test, FEG, ABC)"
                                    value={newTestForm.testName}
                                    onChange={(e) => setNewTestForm({ ...newTestForm, testName: e.target.value })}
                                    autoFocus
                                />
                            </div>
                            <div className="input-group">
                                <label>Test Type *</label>
                                <select
                                    value={newTestForm.testType}
                                    onChange={(e) => setNewTestForm({ ...newTestForm, testType: e.target.value })}
                                >
                                    <option value="lab">Lab Test</option>
                                    <option value="vaccination">Vaccination</option>
                                    <option value="checkup">Checkup</option>
                                    <option value="ultrasound">Ultrasound</option>
                                </select>
                            </div>
                            <div className="input-group">
                                <label>Test Date *</label>
                                <input
                                    type="date"
                                    value={newTestForm.testDate}
                                    min={new Date().toISOString().split('T')[0]}
                                    onChange={(e) => setNewTestForm({ ...newTestForm, testDate: e.target.value })}
                                />
                            </div>
                            <div className="modal-actions">
                                <button
                                    className="btn btn-primary"
                                    onClick={() => handleAddPatientTest(selectedPatient)}
                                    disabled={loading}
                                >
                                    {loading ? '⏳ Adding...' : '➕ Add Test'}
                                </button>
                                <button
                                    className="btn btn-outline"
                                    onClick={() => {
                                        setShowAddTestModal(false);
                                        setNewTestForm({ testName: '', testDate: '', testType: 'lab' });
                                    }}
                                    disabled={loading}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* SMS Scheduling Modal */}
            {scheduleSms && selectedPatient && (
                <div className="modal-overlay" onClick={() => setScheduleSms(false)}>
                    <div className="modal sms-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Send SMS to {selectedPatient.name}</h3>
                            <button className="close-btn" onClick={() => setScheduleSms(false)}>✕</button>
                        </div>
                        <div className="modal-body">
                            <div className="patient-preview-small">
                                <p><strong>Patient:</strong> {selectedPatient.name}</p>
                                <p><strong>Phone:</strong> {selectedPatient.phone}</p>
                            </div>

                            <div className="scheduling-section">
                                <div className="send-options">
                                    <label className="radio-option">
                                        <input
                                            type="radio"
                                            name="smsSchedule"
                                            checked={!scheduledDateTime}
                                            onChange={() => setScheduledDateTime('')}
                                        />
                                        <span>Send immediately</span>
                                    </label>
                                    <label className="radio-option">
                                        <input
                                            type="radio"
                                            name="smsSchedule"
                                            checked={!!scheduledDateTime}
                                            onChange={() => setScheduledDateTime(new Date().toISOString().slice(0, 16))}
                                        />
                                        <span>Schedule for later</span>
                                    </label>
                                </div>

                                {scheduledDateTime && (
                                    <div className="input-group">
                                        <label>Schedule Date & Time *</label>
                                        <input
                                            type="datetime-local"
                                            value={scheduledDateTime}
                                            min={new Date().toISOString().slice(0, 16)}
                                            onChange={(e) => setScheduledDateTime(e.target.value)}
                                            className="datetime-input"
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="modal-actions">
                                <button
                                    className="btn btn-outline"
                                    onClick={() => {
                                        setScheduleSms(false);
                                        setScheduledDateTime('');
                                        setSelectedPatient(null);
                                    }}
                                    disabled={loading}
                                >
                                    Cancel
                                </button>
                                <button
                                    className="btn btn-accent"
                                    onClick={() => {
                                        const isScheduled = !!scheduledDateTime;
                                        handleSendSms(selectedPatient, isScheduled, scheduledDateTime);
                                        setScheduleSms(false);
                                        setScheduledDateTime('');
                                        setSelectedPatient(null);
                                    }}
                                    disabled={loading}
                                >
                                    {loading ? '⏳ Sending...' : (scheduledDateTime ? '🕐 Schedule SMS' : '✉️ Send Now')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {smsStatus && (
                <div className={`global-status ${smsStatus.includes('✅') ? 'success' : 'error'}`}>
                    {smsStatus}
                </div>
            )}
        </div>
    );
}

export default Dashboard;
