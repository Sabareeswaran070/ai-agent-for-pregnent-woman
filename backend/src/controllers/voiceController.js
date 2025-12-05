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

        // Generate audio using OpenAI
        try {
            console.log(`[Call Setup] Generating audio for ${callKey}...`);
            await ensureReminderAudio(callKey, message);
            console.log(`[Call Setup] Audio generated successfully for ${callKey}`);
        } catch (audioErr) {
            console.error("[Call Setup] Audio generation failed, falling back to text-to-speech:", audioErr);
        }

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

    try {
        const VoiceResponse = twilio.twiml.VoiceResponse;
        const response = new VoiceResponse();

        const phone = req.query.phone || req.body.To;
        const reminder = req.query.reminder || "This is a reminder."; // We might need to pass reminder in query if state is lost, but we use global map.

        // Retrieve message from global map if available
        const callKey = phone ? phone.replace(/\D/g, '') : null;
        const callData = global.callMessages?.[callKey] || {};
        const messageToSay = callData.message || "Hello, this is your health reminder.";

        console.log(`[Voice] Generating TwiML for ${phone}. Message: "${messageToSay}"`);

        // Try to use OpenAI audio if available, otherwise fallback to text-to-speech
        const audioEntry = callKey ? getReminderAudioEntry(callKey) : null;
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

        // 2. Pause
        response.pause({ length: 1 });

        // 3. Ask for response
        response.say({
            voice: 'alice'
        }, "After the beep, please say YES if you will attend, or NO if you cannot.");

        // 4. Record
        const actionUrl = `${process.env.BASE_URL.replace(/\/$/, '')}/process-recording?phone=${encodeURIComponent(phone)}`;
        response.record({
            action: actionUrl,
            maxLength: 10,
            playBeep: true,
            transcribe: false
        });

        // 5. Fallback if no input
        response.say("We did not hear a response. Goodbye.");

        const twimlString = response.toString();
        console.log("[Voice] Generated TwiML:", twimlString);

        res.set('Content-Type', 'text/xml');
        res.send(twimlString);

    } catch (err) {
        console.error("[Voice] Error generating TwiML:", err);
        const response = new twilio.twiml.VoiceResponse();
        response.say("Sorry, an error occurred.");
        res.set('Content-Type', 'text/xml');
        res.send(response.toString());
    }
};

/**
 * Handle Recording Webhook (Process user response)
 */
exports.handleRecordingWebhook = async (req, res) => {
    const recordingUrl = req.body.RecordingUrl;
    const phone = req.query.phone || req.body.From;
    const callKey = phone ? phone.replace(/\D/g, '') : null;

    console.log("Recording URL:", recordingUrl);
    console.log("Phone:", phone);

    try {
        // Convert audio → text using OpenAI (or mock)
        const userResponse = await generateAIResponse(recordingUrl);

        // Get patient name from call data
        const callData = global.callMessages?.[callKey] || {};

        // Save to DB (Update existing record)
        const callSid = req.body.CallSid;
        let updated = false;

        if (callSid) {
            const result = await CallResponse.findOneAndUpdate(
                { callSid: callSid },
                {
                    response: userResponse,
                    recordingUrl: recordingUrl
                }
            );
            if (result) updated = true;
        }

        if (!updated) {
            // Fallback if no CallSid or record not found
            const newCall = new CallResponse({
                phone: phone,
                patientName: callData.patientName,
                response: userResponse,
                recordingUrl: recordingUrl,
                callStatus: "completed",
                callSid: callSid
            });
            await newCall.save();
        }

        // Clean up the temporary message and audio
        if (global.callMessages?.[callKey]) {
            delete global.callMessages[callKey];
        }
        if (callKey) {
            deleteReminderAudioEntry(callKey);
        }

        const twiml = `
        <Response>
          <Say>Thank you. Your response has been saved. Take care!</Say>
          <Hangup/>
        </Response>
      `;

        res.type("text/xml");
        res.send(twiml);
    } catch (error) {
        console.error("Error processing recording:", error);

        if (callKey) {
            deleteReminderAudioEntry(callKey);
        }

        const twiml = `
        <Response>
          <Say>Thank you for your response.</Say>
          <Hangup/>
        </Response>
      `;

        res.type("text/xml");
        res.send(twiml);
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
