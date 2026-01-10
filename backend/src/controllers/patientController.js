const twilio = require('twilio');
const Patient = require('../models/Patient');
const { successResponse, errorResponse } = require('../utils/responseHelper');
const { generateReminderMessage } = require('./aiController');

// Initialize Twilio Client (with graceful fallback)
let client;
try {
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    } else {
        console.warn('Twilio credentials missing. Using mock client for SMS.');
        client = {
            messages: {
                create: async () => ({ sid: 'MOCK_MSG_SID_' + Date.now(), status: 'sent' })
            }
        };
    }
} catch (err) {
    console.warn('Twilio initialization error. Using mock client for SMS.');
    client = {
        messages: {
            create: async () => ({ sid: 'MOCK_MSG_SID_' + Date.now(), status: 'sent' })
        }
    };
}

/**
 * Send reminder SMS to a single patient by ID
 */
exports.sendReminderSms = async (req, res) => {
    try {
        const { id } = req.params;
        const patient = await Patient.findById(id);
        if (!patient) {
            return errorResponse(res, 'Patient not found', 404);
        }

        let phone = patient.phone;
        if (!phone) {
            return errorResponse(res, 'Patient has no phone number', 400);
        }
        if (!phone.startsWith('+') && phone.length === 10) {
            phone = '+91' + phone;
        }

        const message = generateReminderMessage(patient);

        const sms = await client.messages.create({
            to: phone,
            from: process.env.TWILIO_PHONE,
            body: message
        });

        return successResponse(res, { messageSid: sms.sid, status: sms.status || 'sent' }, 'Reminder SMS sent');
    } catch (err) {
        console.error('Error sending reminder SMS:', err);

        let errorMessage = err.message || 'Failed to send reminder';
        if (err.code === 21211) {
            errorMessage = 'Invalid phone number format. Please check the phone number.';
        } else if (err.code === 21614) {
            errorMessage = 'The phone number does not support SMS.';
        }

        return errorResponse(res, errorMessage, 500);
    }
};
