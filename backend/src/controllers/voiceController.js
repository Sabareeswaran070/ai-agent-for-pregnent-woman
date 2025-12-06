const twilio = require("twilio");
const CallResponse = require("../models/CallResponse");
const Patient = require("../models/Patient");
const {
    generateAIResponse,
    generateReminderMessage,
    ensureReminderAudio,
    getReminderAudioEntry,
    deleteReminderAudioEntry
} = require("./aiController");

// Initialize Twilio Client
let client;
try {
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    } else {
        console.warn("Twilio credentials missing. Using mock client for demo.");
        client = {
            calls: {
                create: async () => ({ sid: "MOCK_CALL_SID_" + Date.now() })
            }
        };
    }
} catch (err) {
    console.warn("Twilio initialization error. Using mock client.");
    client = {
        calls: {
            create: async () => ({ sid: "MOCK_CALL_SID_" + Date.now() })
        }
    };
}

// Global store for call messages (in-memory)
// Note: In a production environment with multiple instances, use Redis.
global.callMessages = global.callMessages || {};

/**
 * Trigger a call to a patient
 */
exports.triggerCall = async (req, res) => {
    let { phone, patientId, customMessage } = req.body;

    if (!phone) {
        return res.status(400).json({ status: "error", message: "Phone number is required" });
    }

    // Auto-format Indian numbers if missing country code
    if (!phone.startsWith('+') && phone.length === 10) {
        phone = '+91' + phone;
    }

    try {
        // Get patient details if patientId is provided
        let patient = null;
        let message = customMessage;

        if (patientId) {
            patient = await Patient.findById(patientId);
            if (patient) {
                message = generateReminderMessage(patient);
            }
        }

        // Store message in a temporary map for the voice endpoint to access
        const callKey = phone.replace(/\D/g, '');
        global.callMessages[callKey] = {
            message: message || "This is your health reminder. Please listen carefully.",
            patientName: patient ? patient.name : null
        };
        console.log(`[Call Setup] Phone: ${phone}, Message: "${message}"`);

        // OpenAI TTS disabled due to quota limits - using Twilio text-to-speech instead
        // If you have OpenAI credits, uncomment below:
        /*
        try {
            console.log(`[Call Setup] Generating audio for ${callKey}...`);
            await ensureReminderAudio(callKey, message);
            console.log(`[Call Setup] Audio generated successfully for ${callKey}`);
        } catch (audioErr) {
            console.error("[Call Setup] Audio generation failed, falling back to text-to-speech:", audioErr);
        }
        */

        // Initiate the call
        const voiceUrl = `${process.env.BASE_URL}/voice?phone=${encodeURIComponent(phone)}&stage=reminder`;
        console.log(`[Call] Voice webhook URL: ${voiceUrl}`);

        const call = await client.calls.create({
            url: voiceUrl,
            method: 'POST',
            to: phone,
            from: process.env.TWILIO_PHONE,
            statusCallback: `${process.env.BASE_URL}/call-status`,
            statusCallbackEvent: ["initiated", "ringing", "answered", "completed"]
        });

        // Create initial call response record
        const newCall = new CallResponse({
            phone: phone,
            patientName: patient ? patient.name : null,
            response: "Call initiated",
            callStatus: "initiated",
            callSid: call.sid
        });
        await newCall.save();

        res.json({
            status: "success",
            message: "Call triggered successfully",
            callSid: call.sid
        });

    } catch (err) {
        console.error("Error triggering call:", err);
        res.status(500).json({ status: "error", message: err.message });
    }
};

/**
 * Handle Twilio Voice Webhook
 */
exports.handleVoiceWebhook = async (req, res) => {
    console.log("🎤 Voice endpoint hit!");
    console.log("Query:", req.query);
    console.log("Body:", req.body);

    try {
        const VoiceResponse = twilio.twiml.VoiceResponse;
        const response = new VoiceResponse();

        const phone = req.query.phone || req.body.To || req.body.From;
        
        if (!phone) {
            console.error("[Voice] No phone number provided");
            response.say("Sorry, we could not identify your phone number.");
            response.hangup();
            res.type('text/xml');
            return res.send(response.toString());
        }

        // Retrieve message from global map if available
        const callKey = phone.replace(/\D/g, '');
        const callData = global.callMessages?.[callKey] || {};
        const messageToSay = callData.message || "Hello, this is your health reminder.";

        console.log(`[Voice] Generating TwiML for ${phone}. Message: "${messageToSay}"`);

        // Try to use OpenAI audio if available, otherwise fallback to text-to-speech
        const audioEntry = getReminderAudioEntry(callKey);
        const audioUrl = audioEntry ? `${process.env.BASE_URL}/reminder-audio/${callKey}` : null;

        if (audioUrl) {
            console.log(`[Voice] Using OpenAI audio: ${audioUrl}`);
            response.play(audioUrl);
        } else {
            console.log(`[Voice] Using Twilio text-to-speech`);
            response.say({
                voice: 'alice',
                language: 'en-US'
            }, messageToSay);
        }

        // Pause
        response.pause({ length: 1 });

        // Ask for response
        response.say({
            voice: 'alice',
            language: 'en-US'
        }, "After the beep, please say YES if you will attend, or NO if you cannot.");

        // Record response - finishOnKey: '' means no keys will finish the recording
        const actionUrl = `${process.env.BASE_URL.replace(/\/$/, '')}/process-recording?phone=${encodeURIComponent(phone)}`;
        response.record({
            action: actionUrl,
            method: 'POST',
            maxLength: 10,
            playBeep: true,
            transcribe: false,
            timeout: 5,
            finishOnKey: ''  // Empty string = no key will finish recording, only voice
        });

        // Fallback if no input
        response.say({
            voice: 'alice'
        }, "We did not hear a response. Goodbye.");
        
        response.hangup();

        const twimlString = response.toString();
        console.log("[Voice] Generated TwiML:", twimlString);

        res.type('text/xml');
        res.send(twimlString);

    } catch (err) {
        console.error("[Voice] Error generating TwiML:", err);
        console.error("[Voice] Stack:", err.stack);
        
        try {
            const response = new twilio.twiml.VoiceResponse();
            response.say({
                voice: 'alice'
            }, "Sorry, an error occurred. Please try again later.");
            response.hangup();
            res.type('text/xml');
            res.send(response.toString());
        } catch (innerErr) {
            console.error("[Voice] Failed to send error TwiML:", innerErr);
            res.status(500).type('text/xml').send('<Response><Say>Error</Say></Response>');
        }
    }
};

/**
 * Handle Recording Webhook (Process user response)
 */
exports.handleRecordingWebhook = async (req, res) => {
    console.log("📼 Recording webhook hit!");
    console.log("Body:", req.body);
    console.log("Query:", req.query);
    
    const recordingUrl = req.body.RecordingUrl;
    const phone = req.query.phone || req.body.From;
    const callKey = phone ? phone.replace(/\D/g, '') : null;

    console.log("Recording URL:", recordingUrl);
    console.log("Phone:", phone);

    // Always return valid TwiML immediately
    const sendSuccessTwiml = () => {
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Thank you. Your response has been saved. Take care!</Say>
  <Hangup/>
</Response>`;
        res.type('text/xml');
        res.send(twiml);
    };

    const sendErrorTwiml = () => {
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Thank you for your response.</Say>
  <Hangup/>
</Response>`;
        res.type('text/xml');
        res.send(twiml);
    };

    try {
        if (!recordingUrl || !phone) {
            console.error("[Recording] Missing recording URL or phone");
            return sendErrorTwiml();
        }

        // Convert audio → text and analyze using OpenAI
        const aiResult = await generateAIResponse(recordingUrl);
        console.log("[Recording] AI Result:", aiResult);

        // Get patient name from call data
        const callData = global.callMessages?.[callKey] || {};

        // Save to DB (Update existing record)
        const callSid = req.body.CallSid;
        let updated = false;

        if (callSid) {
            const result = await CallResponse.findOneAndUpdate(
                { callSid: callSid },
                {
                    response: aiResult.fullResponse || aiResult.transcription || "No response",
                    confirmationStatus: aiResult.confirmationStatus || 'unclear',
                    recordingUrl: recordingUrl,
                    callStatus: 'completed'
                },
                { new: true }
            );
            if (result) {
                console.log("[Recording] Updated existing call record:", result._id);
                updated = true;
            }
        }

        if (!updated) {
            // Fallback if no CallSid or record not found
            const newCall = new CallResponse({
                phone: phone,
                patientName: callData.patientName,
                response: aiResult.fullResponse || aiResult.transcription || "No response",
                confirmationStatus: aiResult.confirmationStatus || 'unclear',
                recordingUrl: recordingUrl,
                callStatus: "completed",
                callSid: callSid
            });
            await newCall.save();
            console.log("[Recording] Created new call record:", newCall._id);
        }

        // Clean up the temporary message and audio
        if (global.callMessages?.[callKey]) {
            delete global.callMessages[callKey];
        }
        if (callKey) {
            deleteReminderAudioEntry(callKey);
        }

        sendSuccessTwiml();

    } catch (error) {
        console.error("Error processing recording:", error);
        console.error("Error stack:", error.stack);

        if (callKey) {
            deleteReminderAudioEntry(callKey);
        }

        sendErrorTwiml();
    }
};

/**
 * Handle Call Status Webhook
 */
exports.handleCallStatusWebhook = async (req, res) => {
    const { CallStatus, To, From } = req.body;
    console.log(`CALL STATUS: ${CallStatus} | To: ${To} | From: ${From}`);

    // Update the call status in database
    try {
        const { CallSid } = req.body;
        if (CallSid) {
            await CallResponse.findOneAndUpdate(
                { callSid: CallSid },
                { callStatus: CallStatus }
            );
        } else {
            // Fallback to phone match
            await CallResponse.findOneAndUpdate(
                { phone: To },
                { callStatus: CallStatus },
                { sort: { timestamp: -1 } }
            );
        }
    } catch (error) {
        console.error("Error updating call status:", error);
    }

    res.send("Status Received");
};

/**
 * Get Call History
 */
exports.getCallHistory = async (req, res) => {
    try {
        const history = await CallResponse.find().sort({ timestamp: -1 });
        res.json({ status: "success", history });
    } catch (err) {
        console.error("Error fetching call history:", err);
        res.status(500).json({ status: "error", message: err.message });
    }
};

/**
 * Get Call History for a specific patient
 */
exports.getPatientCallHistory = async (req, res) => {
    try {
        const history = await CallResponse.find({ phone: req.params.phone }).sort({ timestamp: -1 });
        res.json({ status: "success", history });
    } catch (err) {
        console.error("Error fetching call history:", err);
        res.status(500).json({ status: "error", message: err.message });
    }
};

/**
 * Serve Reminder Audio File
 */
exports.serveReminderAudio = (req, res) => {
    const entry = getReminderAudioEntry(req.params.callKey);
    if (!entry) {
        return res.status(404).send("Audio not ready");
    }
    res.set({
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-cache"
    });
    res.sendFile(entry.path);
};
