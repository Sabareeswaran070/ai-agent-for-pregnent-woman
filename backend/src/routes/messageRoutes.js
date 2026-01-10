const express = require('express');
const textMsgController = require('../controllers/textMsgController');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateMessageSend, validatePhoneParam, validatePatientId } = require('../middleware/validator');

const router = express.Router();

/**
 * @route   POST /api/messages/send
 * @desc    Send a text message (SMS)
 * @access  Public
 */
router.post('/send', validateMessageSend, asyncHandler(textMsgController.sendMessage));

/**
 * @route   POST /api/messages/send/patient/:id
 * @desc    Send reminder SMS to a single patient
 */
router.post('/send/patient/:id', validatePatientId, asyncHandler(textMsgController.sendReminderToPatient));

/**
 * @route   POST /api/messages/send/reminders
 * @desc    Send reminder SMS to all registered patients
 */
router.post('/send/reminders', asyncHandler(textMsgController.sendBulkReminders));

/**
 * @route   GET /api/messages/history
 * @desc    Get all message history (paginated)
 * @access  Public
 */
router.get('/history', asyncHandler(textMsgController.getMessageHistory));

/**
 * @route   GET /api/messages/history/:phone
 * @desc    Get message history for specific phone number
 * @access  Public
 */
router.get('/history/:phone', validatePhoneParam, asyncHandler(textMsgController.getPatientMessageHistory));

module.exports = router;
