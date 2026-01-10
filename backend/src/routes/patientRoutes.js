const express = require('express');
const Patient = require('../models/Patient');
const CallResponse = require('../models/CallResponse');
const { asyncHandler } = require('../middleware/errorHandler');
const { successResponse, errorResponse } = require('../utils/responseHelper');
const {
    validatePatientCreate,
    validatePatientUpdate,
    validatePatientId,
    validateTestCreate,
    validateTestUpdate,
    validateNoteCreate,
    validateMedicalHistoryCreate,
    validateMedicationCreate
} = require('../middleware/validator');
const patientController = require('../controllers/patientController');

const router = express.Router();

/**
 * @route   POST /api/patients
 * @desc    Create a new patient
 * @access  Public
 */
router.post('/', validatePatientCreate, asyncHandler(async (req, res) => {
    const newPatient = new Patient(req.body);
    await newPatient.save();
    
    successResponse(res, newPatient, 'Patient created successfully', 201);
}));

/**
 * @route   GET /api/patients
 * @desc    Get all patients with their latest call info, search and filter options
 * @query   search - Search by name or phone
 * @query   status - Filter by status (active, inactive, completed)
 * @query   dueDateFrom - Filter by due date from
 * @query   dueDateTo - Filter by due date to
 * @access  Public
 */
router.get('/', asyncHandler(async (req, res) => {
    const { search, status, dueDateFrom, dueDateTo } = req.query;
    
    // Build filter query
    let filter = {};
    
    if (search) {
        filter.$or = [
            { name: { $regex: search, $options: 'i' } },
            { phone: { $regex: search, $options: 'i' } }
        ];
    }
    
    if (status) {
        filter.status = status;
    }
    
    if (dueDateFrom || dueDateTo) {
        filter.dueDate = {};
        if (dueDateFrom) filter.dueDate.$gte = new Date(dueDateFrom);
        if (dueDateTo) filter.dueDate.$lte = new Date(dueDateTo);
    }
    
    const patients = await Patient.find(filter).sort({ createdAt: -1 });

    // Fetch latest call and stats for each patient
    const patientsWithCallInfo = await Promise.all(patients.map(async (p) => {
        const lastCall = await CallResponse.findOne({ phone: p.phone }).sort({ timestamp: -1 });
        const callCount = await CallResponse.countDocuments({ phone: p.phone });
        const upcomingTestsCount = p.upcomingTests?.filter(t => t.status === 'scheduled').length || 0;
        
        return {
            ...p.toObject(),
            lastCall: lastCall ? {
                status: lastCall.callStatus,
                response: lastCall.response,
                timestamp: lastCall.timestamp
            } : null,
            callCount,
            upcomingTestsCount
        };
    }));

    successResponse(res, patientsWithCallInfo, 'Patients retrieved successfully');
}));

/**
 * @route   GET /api/patients/:id
 * @desc    Get a single patient by ID with detailed statistics
 * @access  Public
 */
router.get('/:id', validatePatientId, asyncHandler(async (req, res) => {
    const patient = await Patient.findById(req.params.id);
    
    if (!patient) {
        return errorResponse(res, 'Patient not found', 404);
    }
    
    // Get call history and stats
    const callHistory = await CallResponse.find({ phone: patient.phone })
        .sort({ timestamp: -1 })
        .limit(10);
    const callCount = await CallResponse.countDocuments({ phone: patient.phone });
    const upcomingTestsCount = patient.upcomingTests?.filter(t => t.status === 'scheduled').length || 0;
    
    const patientData = {
        ...patient.toObject(),
        recentCalls: callHistory,
        callCount,
        upcomingTestsCount
    };
    
    successResponse(res, patientData, 'Patient retrieved successfully');
}));

/**
 * @route   PUT /api/patients/:id
 * @desc    Update a patient
 * @access  Public
 */
router.put('/:id', validatePatientUpdate, asyncHandler(async (req, res) => {
    const patient = await Patient.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
    );
    
    if (!patient) {
        return errorResponse(res, 'Patient not found', 404);
    }
    
    successResponse(res, patient, 'Patient updated successfully');
}));

/**
 * @route   DELETE /api/patients/:id
 * @desc    Delete a patient
 * @access  Public
 */
router.delete('/:id', validatePatientId, asyncHandler(async (req, res) => {
    const patient = await Patient.findByIdAndDelete(req.params.id);
    
    if (!patient) {
        return errorResponse(res, 'Patient not found', 404);
    }
    
    successResponse(res, null, 'Patient deleted successfully');
}));

/**
 * @route   POST /api/patients/:id/reminder-sms
 * @desc    Send reminder SMS to the patient
 * @access  Public
 */
router.post('/:id/reminder-sms', validatePatientId, asyncHandler(patientController.sendReminderSms));

/**
 * @route   POST /api/patients/:id/tests
 * @desc    Add a new upcoming test to a patient
 * @access  Public
 */
router.post('/:id/tests', validatePatientId, validateTestCreate, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { testName, testDate, testType } = req.body;

    const patient = await Patient.findByIdAndUpdate(
        id,
        { $push: { upcomingTests: { testName, testDate, testType } } },
        { new: true, runValidators: true }
    );

    if (!patient) {
        return errorResponse(res, 'Patient not found', 404);
    }

    successResponse(res, patient, 'Upcoming test added');
}));

/**
 * @route   PUT /api/patients/:id/tests/:testId
 * @desc    Update an existing upcoming test for a patient
 * @access  Public
 */
router.put('/:id/tests/:testId', validateTestUpdate, asyncHandler(async (req, res) => {
    const { id, testId } = req.params;
    const update = {};
    if (req.body.testName !== undefined) update['upcomingTests.$.testName'] = req.body.testName;
    if (req.body.testDate !== undefined) update['upcomingTests.$.testDate'] = req.body.testDate;
    if (req.body.testType !== undefined) update['upcomingTests.$.testType'] = req.body.testType;
    if (req.body.reminderMessage !== undefined) update['upcomingTests.$.reminderMessage'] = req.body.reminderMessage;

    const result = await Patient.updateOne({ _id: id, 'upcomingTests._id': testId }, { $set: update });
    if (result.matchedCount === 0) {
        return errorResponse(res, 'Patient or test not found', 404);
    }
    const patient = await Patient.findById(id);
    successResponse(res, patient, 'Upcoming test updated');
}));

/**
 * @route   DELETE /api/patients/:id/tests/:testId
 * @desc    Delete an upcoming test for a patient
 * @access  Public
 */
router.delete('/:id/tests/:testId', validatePatientId, asyncHandler(async (req, res) => {
    const { id, testId } = req.params;
    
    const patient = await Patient.findByIdAndUpdate(
        id,
        { $pull: { upcomingTests: { _id: testId } } },
        { new: true }
    );
    
    if (!patient) {
        return errorResponse(res, 'Patient not found', 404);
    }
    
    successResponse(res, patient, 'Upcoming test deleted');
}));

/**
 * @route   POST /api/patients/:id/notes
 * @desc    Add a note to a patient's record
 * @access  Public
 */
router.post('/:id/notes', validatePatientId, validateNoteCreate, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { content, category, createdBy } = req.body;
    
    const patient = await Patient.findByIdAndUpdate(
        id,
        { 
            $push: { 
                notes: { 
                    content, 
                    category: category || 'general',
                    createdBy,
                    createdAt: new Date()
                } 
            } 
        },
        { new: true }
    );
    
    if (!patient) {
        return errorResponse(res, 'Patient not found', 404);
    }
    
    successResponse(res, patient, 'Note added successfully');
}));

/**
 * @route   GET /api/patients/:id/notes
 * @desc    Get all notes for a patient
 * @access  Public
 */
router.get('/:id/notes', validatePatientId, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const patient = await Patient.findById(id).select('notes');
    
    if (!patient) {
        return errorResponse(res, 'Patient not found', 404);
    }
    
    const sortedNotes = patient.notes.sort((a, b) => b.createdAt - a.createdAt);
    successResponse(res, sortedNotes, 'Notes retrieved successfully');
}));

/**
 * @route   POST /api/patients/:id/medical-history
 * @desc    Add medical history entry to a patient
 * @access  Public
 */
router.post('/:id/medical-history', validatePatientId, validateMedicalHistoryCreate, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { condition, diagnosedDate, notes } = req.body;
    
    const patient = await Patient.findByIdAndUpdate(
        id,
        { $push: { medicalHistory: { condition, diagnosedDate, notes } } },
        { new: true }
    );
    
    if (!patient) {
        return errorResponse(res, 'Patient not found', 404);
    }
    
    successResponse(res, patient, 'Medical history added successfully');
}));

/**
 * @route   POST /api/patients/:id/medications
 * @desc    Add medication to a patient's record
 * @access  Public
 */
router.post('/:id/medications', validatePatientId, validateMedicationCreate, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, dosage, frequency, startDate, endDate } = req.body;
    
    const patient = await Patient.findByIdAndUpdate(
        id,
        { $push: { medications: { name, dosage, frequency, startDate, endDate } } },
        { new: true }
    );
    
    if (!patient) {
        return errorResponse(res, 'Patient not found', 404);
    }
    
    successResponse(res, patient, 'Medication added successfully');
}));

/**
 * @route   DELETE /api/patients/:id/medications/:medicationId
 * @desc    Remove a medication from patient's record
 * @access  Public
 */
router.delete('/:id/medications/:medicationId', validatePatientId, asyncHandler(async (req, res) => {
    const { id, medicationId } = req.params;
    
    const patient = await Patient.findByIdAndUpdate(
        id,
        { $pull: { medications: { _id: medicationId } } },
        { new: true }
    );
    
    if (!patient) {
        return errorResponse(res, 'Patient not found', 404);
    }
    
    successResponse(res, patient, 'Medication removed successfully');
}));

module.exports = router;
