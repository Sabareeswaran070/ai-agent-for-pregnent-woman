const { body, param, validationResult } = require('express-validator');
const { AppError } = require('./errorHandler');

/**
 * Validation Result Handler
 */
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const errorMessages = errors.array().map(err => `${err.param}: ${err.msg}`).join(', ');
        throw new AppError(errorMessages, 400);
    }
    next();
};

/**
 * Patient Validation Rules
 */
const validatePatientCreate = [
    body('name')
        .trim()
        .notEmpty().withMessage('Name is required')
        .isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters'),
    
    body('phone')
        .trim()
        .notEmpty().withMessage('Phone number is required')
        .matches(/^(\+?\d{1,3}[- ]?)?\d{10}$/).withMessage('Invalid phone number format'),
    
    body('email')
        .optional()
        .trim()
        .isEmail().withMessage('Invalid email format')
        .normalizeEmail(),
    
    body('dueDate')
        .optional()
        .isISO8601().withMessage('Invalid date format'),
    
    body('pregnancyWeek')
        .optional()
        .isInt({ min: 1, max: 42 }).withMessage('Pregnancy week must be between 1 and 42'),
    
    body('bloodType')
        .optional()
        .isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).withMessage('Invalid blood type'),
    
    body('address.street')
        .optional()
        .trim()
        .isLength({ max: 200 }).withMessage('Street address too long'),
    
    body('address.city')
        .optional()
        .trim()
        .isLength({ max: 100 }).withMessage('City name too long'),
    
    body('address.state')
        .optional()
        .trim()
        .isLength({ max: 100 }).withMessage('State name too long'),
    
    body('address.zipCode')
        .optional()
        .trim()
        .matches(/^\d{5,6}$/).withMessage('Invalid ZIP code format'),
    
    body('emergencyContact.name')
        .optional()
        .trim()
        .isLength({ min: 2, max: 100 }).withMessage('Emergency contact name must be between 2 and 100 characters'),
    
    body('emergencyContact.phone')
        .optional()
        .trim()
        .matches(/^(\+?\d{1,3}[- ]?)?\d{10}$/).withMessage('Invalid emergency contact phone format'),
    
    body('allergies')
        .optional()
        .isArray().withMessage('Allergies must be an array'),
    
    body('upcomingTests')
        .optional()
        .isArray().withMessage('Upcoming tests must be an array'),
    
    body('status')
        .optional()
        .isIn(['active', 'inactive', 'completed']).withMessage('Invalid status'),
    
    handleValidationErrors
];

const validatePatientUpdate = [
    param('id')
        .isMongoId().withMessage('Invalid patient ID'),
    
    body('name')
        .optional()
        .trim()
        .isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters'),
    
    body('phone')
        .optional()
        .trim()
        .matches(/^(\+?\d{1,3}[- ]?)?\d{10}$/).withMessage('Invalid phone number format'),
    
    body('email')
        .optional()
        .trim()
        .isEmail().withMessage('Invalid email format')
        .normalizeEmail(),
    
    body('dueDate')
        .optional()
        .isISO8601().withMessage('Invalid date format'),
    
    body('pregnancyWeek')
        .optional()
        .isInt({ min: 1, max: 42 }).withMessage('Pregnancy week must be between 1 and 42'),
    
    body('bloodType')
        .optional()
        .isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).withMessage('Invalid blood type'),
    
    body('lastVisitDate')
        .optional()
        .isISO8601().withMessage('Invalid date format'),
    
    body('status')
        .optional()
        .isIn(['active', 'inactive', 'completed']).withMessage('Invalid status'),
    
    handleValidationErrors
];

const validatePatientId = [
    param('id')
        .isMongoId().withMessage('Invalid patient ID'),
    handleValidationErrors
];

/**
 * Call Validation Rules
 */
const validateCallTrigger = [
    body('phone')
        .trim()
        .notEmpty().withMessage('Phone number is required')
        .matches(/^(\+?\d{1,3}[- ]?)?\d{10}$/).withMessage('Invalid phone number format'),
    
    body('patientId')
        .optional()
        .isMongoId().withMessage('Invalid patient ID'),
    
    body('customMessage')
        .optional()
        .trim()
        .isLength({ max: 500 }).withMessage('Custom message must not exceed 500 characters'),
    
    handleValidationErrors
];

const validatePhoneParam = [
    param('phone')
        .trim()
        .matches(/^(\+?\d{1,3}[- ]?)?\d{10}$/).withMessage('Invalid phone number format'),
    handleValidationErrors
];

const validateCallId = [
    param('id')
        .isMongoId().withMessage('Invalid call record ID'),
    handleValidationErrors
];

/**
 * Upcoming Test Validation Rules
 */
const isFutureOrTodayDate = (value) => {
    const d = new Date(value);
    if (isNaN(d.getTime())) return false;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const scheduledStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return scheduledStart >= todayStart;
};

const validateTestCreate = [
    body('testName')
        .trim()
        .notEmpty().withMessage('Test name is required')
        .isLength({ min: 2, max: 100 }).withMessage('Test name must be between 2 and 100 characters'),
    body('testType')
        .optional()
        .isIn(['lab', 'vaccination', 'checkup', 'ultrasound']).withMessage('Invalid test type'),
    body('testDate')
        .notEmpty().withMessage('Test date is required')
        .isISO8601().withMessage('Invalid date format')
        .custom(isFutureOrTodayDate).withMessage('Test date must be today or in the future'),
    handleValidationErrors
];

const validateTestUpdate = [
    param('id')
        .isMongoId().withMessage('Invalid patient ID'),
    param('testId')
        .isMongoId().withMessage('Invalid test ID'),
    body('testName')
        .optional()
        .trim()
        .isLength({ min: 2, max: 100 }).withMessage('Test name must be between 2 and 100 characters'),
    body('testType')
        .optional()
        .isIn(['lab', 'vaccination', 'checkup', 'ultrasound']).withMessage('Invalid test type'),
    body('testDate')
        .optional()
        .isISO8601().withMessage('Invalid date format')
        .custom(isFutureOrTodayDate).withMessage('Test date must be today or in the future'),
    handleValidationErrors
];

/**
 * Message Validation Rules
 */
const validateMessageSend = [
    body('phone')
        .trim()
        .notEmpty().withMessage('Phone number is required')
        .matches(/^(\+?\d{1,3}[- ]?)?\d{10}$/).withMessage('Invalid phone number format'),

    body('patientId')
        .optional()
        .isMongoId().withMessage('Invalid patient ID'),

    body('message')
        .optional()
        .trim()
        .isLength({ max: 500 }).withMessage('Message must not exceed 500 characters'),

    handleValidationErrors
];

/**
 * Medical Notes Validation Rules
 */
const validateNoteCreate = [
    body('content')
        .trim()
        .notEmpty().withMessage('Note content is required')
        .isLength({ min: 1, max: 1000 }).withMessage('Note content must be between 1 and 1000 characters'),
    
    body('category')
        .optional()
        .isIn(['general', 'medical', 'appointment', 'reminder']).withMessage('Invalid note category'),
    
    body('createdBy')
        .optional()
        .trim()
        .isLength({ max: 100 }).withMessage('Created by field too long'),
    
    handleValidationErrors
];

/**
 * Medical History Validation Rules
 */
const validateMedicalHistoryCreate = [
    body('condition')
        .trim()
        .notEmpty().withMessage('Condition is required')
        .isLength({ min: 2, max: 200 }).withMessage('Condition must be between 2 and 200 characters'),
    
    body('diagnosedDate')
        .optional()
        .isISO8601().withMessage('Invalid date format'),
    
    body('notes')
        .optional()
        .trim()
        .isLength({ max: 500 }).withMessage('Notes too long'),
    
    handleValidationErrors
];

/**
 * Medication Validation Rules
 */
const validateMedicationCreate = [
    body('name')
        .trim()
        .notEmpty().withMessage('Medication name is required')
        .isLength({ min: 2, max: 200 }).withMessage('Medication name must be between 2 and 200 characters'),
    
    body('dosage')
        .optional()
        .trim()
        .isLength({ max: 100 }).withMessage('Dosage too long'),
    
    body('frequency')
        .optional()
        .trim()
        .isLength({ max: 100 }).withMessage('Frequency too long'),
    
    body('startDate')
        .optional()
        .isISO8601().withMessage('Invalid start date format'),
    
    body('endDate')
        .optional()
        .isISO8601().withMessage('Invalid end date format'),
    
    handleValidationErrors
];

module.exports = {
    handleValidationErrors,
    validatePatientCreate,
    validatePatientUpdate,
    validatePatientId,
    validateCallTrigger,
    validatePhoneParam,
    validateCallId,
    validateTestCreate,
    validateTestUpdate,
    validateMessageSend,
    validateNoteCreate,
    validateMedicalHistoryCreate,
    validateMedicationCreate
};
