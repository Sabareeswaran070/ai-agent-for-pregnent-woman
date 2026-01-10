const twilio = require('twilio');
const Patient = require('../models/Patient');
const TextMessage = require('../models/TextMessage');
const { successResponse, errorResponse, getPaginationParams, paginatedResponse } = require('../utils/responseHelper');
const { generateReminderMessage } = require('./aiController');

// Initialize Twilio Client
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
 * Send a text message (SMS)
 */
exports.sendMessage = async (req, res) => {
    try {
        let { phone, patientId, message } = req.body;

        if (!phone) {
            return errorResponse(res, 'Phone number is required', 400);
        }

        // Auto-format Indian numbers if missing country code
        if (!phone.startsWith('+') && phone.length === 10) {
            phone = '+91' + phone;
        }

        let patient = null;
        if (patientId) {
            patient = await Patient.findById(patientId);
        }

        // Default message if not provided
        if (!message && patient) {
            message = generateReminderMessage(patient);
        }
        if (!message) {
            message = 'This is your health reminder. Please take care and confirm your upcoming appointment.';
        }

        // Create initial DB record (queued)
        const record = new TextMessage({
            phone,
            patientName: patient ? patient.name : null,
            body: message,
            status: 'queued'
        });
        await record.save();

        // Send SMS via Twilio
        const sms = await client.messages.create({
            to: phone,
            from: process.env.TWILIO_PHONE,
            body: message
        });

        // Update DB record with send status
        record.status = sms.status === 'queued' ? 'queued' : 'sent';
        record.messageSid = sms.sid;
        await record.save();

        return successResponse(res, {
            messageSid: sms.sid,
            status: record.status
        }, 'Message sent successfully');
    } catch (err) {
        console.error('Error sending SMS:', err);

        // Persist failure
        try {
            const failed = new TextMessage({
                phone: req.body.phone,
                body: req.body.message,
                status: 'failed',
                error: err.message
            });
            await failed.save();
        } catch (_) {}

        // Map Twilio error codes to friendly messages
        let errorMessage = err.message || 'Failed to send message';
        if (err.code === 21211) {
            errorMessage = 'Invalid phone number format. Please check the phone number.';
        } else if (err.code === 21614) {
            errorMessage = 'The phone number does not support SMS.';
        }

        return errorResponse(res, errorMessage, 500);
    }
};

/**
 * Send reminder SMS to a single patient by ID
 */
exports.sendReminderToPatient = async (req, res) => {
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

        const record = new TextMessage({
            phone,
            patientName: patient.name,
            body: message,
            status: 'queued'
        });
        await record.save();

        const sms = await client.messages.create({
            to: phone,
            from: process.env.TWILIO_PHONE,
            body: message
        });

        record.status = sms.status === 'queued' ? 'queued' : 'sent';
        record.messageSid = sms.sid;
        await record.save();

        return successResponse(res, { messageSid: sms.sid, status: record.status }, 'Reminder sent');
    } catch (err) {
        console.error('Error sending patient reminder:', err);
        return errorResponse(res, err.message || 'Failed to send reminder');
    }
};

/**
 * Send reminder SMS to all registered patients
 * Optional body: { onlyWithUpcoming: boolean }
 */
exports.sendBulkReminders = async (req, res) => {
    try {
        const onlyWithUpcoming = (req.body?.onlyWithUpcoming ?? true) ? true : false;
        const patients = await Patient.find().sort({ createdAt: -1 });

        const targets = onlyWithUpcoming
            ? patients.filter(p => Array.isArray(p.upcomingTests) && p.upcomingTests.length > 0)
            : patients;

        let sent = 0, failed = 0;
        const results = [];

        for (const patient of targets) {
            try {
                let phone = patient.phone;
                if (!phone) { throw new Error('Missing phone'); }
                if (!phone.startsWith('+') && phone.length === 10) {
                    phone = '+91' + phone;
                }
                const message = generateReminderMessage(patient);

                const record = new TextMessage({
                    phone,
                    patientName: patient.name,
                    body: message,
                    status: 'queued'
                });
                await record.save();

                const sms = await client.messages.create({ to: phone, from: process.env.TWILIO_PHONE, body: message });
                record.status = sms.status === 'queued' ? 'queued' : 'sent';
                record.messageSid = sms.sid;
                await record.save();

                sent++;
                results.push({ patientId: patient._id.toString(), phone, status: record.status, sid: sms.sid });
            } catch (e) {
                failed++;
                results.push({ patientId: patient._id.toString(), phone: patient.phone, status: 'failed', error: e.message });
                try {
                    const failedRec = new TextMessage({ phone: patient.phone, patientName: patient.name, body: 'Reminder', status: 'failed', error: e.message });
                    await failedRec.save();
                } catch(_) {}
            }
        }

        return successResponse(res, { total: targets.length, sent, failed, results }, 'Bulk reminders processed');
    } catch (err) {
        console.error('Error sending bulk reminders:', err);
        return errorResponse(res, err.message || 'Failed to process bulk reminders');
    }
};

/**
 * Get all text message history (paginated)
 */
exports.getMessageHistory = async (req, res) => {
    try {
        const { page, limit, skip } = getPaginationParams(req);
        const total = await TextMessage.countDocuments();
        const history = await TextMessage.find().sort({ timestamp: -1 }).skip(skip).limit(limit);
        return paginatedResponse(res, history, page, limit, total, 'Messages retrieved successfully');
    } catch (err) {
        console.error('Error fetching messages:', err);
        return errorResponse(res, err.message);
    }
};

/**
 * Get text message history by phone
 */
exports.getPatientMessageHistory = async (req, res) => {
    try {
        const { phone } = req.params;
        const history = await TextMessage.find({ phone }).sort({ timestamp: -1 });
        return successResponse(res, history, 'Messages retrieved successfully');
    } catch (err) {
        console.error('Error fetching patient messages:', err);
        return errorResponse(res, err.message);
    }
};
