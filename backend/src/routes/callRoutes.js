const express = require('express');
const voiceController = require('../controllers/voiceController');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateCallTrigger, validatePhoneParam, validateCallId } = require('../middleware/validator');

const router = express.Router();

/**
 * @route   POST /api/calls/trigger
 * @desc    Trigger a call to a patient
 * @access  Public
 */
router.post('/trigger', validateCallTrigger, asyncHandler(voiceController.triggerCall));

/**
 * @route   POST /api/calls/schedule
 * @desc    Schedule a call for later
 * @access  Public
 */
router.post('/schedule', asyncHandler(voiceController.scheduleCall));

/**
 * @route   GET /api/calls/scheduled
 * @desc    Get all scheduled calls
 * @access  Public
 */
router.get('/scheduled', asyncHandler(voiceController.getScheduledCalls));

/**
 * @route   GET /api/calls/scheduled/status/:status
 * @desc    Get scheduled calls by status
 * @access  Public
 */
router.get('/scheduled/status/:status', (req, res, next) => {
    console.log(`[Route] Hit /scheduled/status/:status with status: ${req.params.status}`);
    next();
}, asyncHandler(voiceController.getScheduledCallsByStatus));

/**
 * @route   GET /api/calls/scheduled/patient/:patientId
 * @desc    Get scheduled calls for a specific patient
 * @access  Public
 */
router.get('/scheduled/patient/:patientId', asyncHandler(voiceController.getPatientScheduledCalls));

/**
 * @route   PUT /api/calls/scheduled/:id/status
 * @desc    Update scheduled call status
 * @access  Public
 */
router.put('/scheduled/:id/status', asyncHandler(voiceController.updateScheduledCallStatus));

/**
 * @route   DELETE /api/calls/scheduled/:id
 * @desc    Cancel a scheduled call
 * @access  Public
 */
router.delete('/scheduled/:id', asyncHandler(voiceController.cancelScheduledCall));

/**
 * @route   POST /api/calls/voice
 * @desc    Twilio voice webhook handler
 * @access  Public (Twilio)
 */
router.post('/voice', asyncHandler(voiceController.handleVoiceWebhook));
router.get('/voice', asyncHandler(voiceController.handleVoiceWebhook));

/**
 * @route   GET /api/calls/reminder-audio/:callKey
 * @desc    Serve reminder audio file
 * @access  Public (Twilio)
 */
router.get('/reminder-audio/:callKey', voiceController.serveReminderAudio);

/**
 * @route   POST /api/calls/process-recording
 * @desc    Process call recording
 * @access  Public (Twilio)
 */
router.post('/process-recording', asyncHandler(voiceController.handleRecordingWebhook));

/**
 * @route   POST /api/calls/process-keypress
 * @desc    Process keypress input
 * @access  Public (Twilio)
 */
router.post('/process-keypress', asyncHandler(voiceController.handleKeypressWebhook));

/**
 * @route   POST /api/calls/status
 * @desc    Call status webhook
 * @access  Public (Twilio)
 */
router.post('/status', asyncHandler(voiceController.handleCallStatusWebhook));

/**
 * @route   GET /api/calls/history
 * @desc    Get all call history
 * @access  Public
 */
router.get('/history', asyncHandler(voiceController.getCallHistory));

/**
 * @route   GET /api/calls/history/:phone
 * @desc    Get call history for specific phone number
 * @access  Public
 */
router.get('/history/:phone', validatePhoneParam, asyncHandler(voiceController.getPatientCallHistory));

/**
 * @route   DELETE /api/calls/history
 * @desc    Delete all call history
 * @access  Public
 */
router.delete('/history', asyncHandler(voiceController.deleteAllCallHistory));

/**
 * @route   DELETE /api/calls/history/record/:id
 * @desc    Delete a single call history record by _id
 * @access  Public
 */
router.delete('/history/record/:id', validateCallId, asyncHandler(voiceController.deleteCallHistoryRecord));

module.exports = router;
