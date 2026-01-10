const twilio = require("twilio");
const { translate } = require("@vitalets/google-translate-api");
const CallResponse = require("../models/CallResponse");
const Patient = require("../models/Patient");
const ScheduledCall = require("../models/ScheduledCall");
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
    generateAIResponse,
    generateReminderMessage,
    generateReminderMessageTamil,
    ensureReminderAudio,
    getReminderAudioEntry,
    deleteReminderAudioEntry,
    createFreeTamilSpeech,
    createFreeEnglishSpeech
} = require("./aiController");

// Initialize Twilio Client
const isTwilioConfigured = Boolean(
    process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE
);
let client;
try {
    if (isTwilioConfigured) {
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
    let { phone, patientId, customMessage, language, testInfo } = req.body;

    console.log('[Call] Received request:');
    console.log('[Call] - customMessage:', customMessage);
    console.log('[Call] - patientId:', patientId);
    console.log('[Call] - testInfo:', testInfo);
    console.log('[Call] - language:', language);

    if (!phone) {
        return res.status(400).json({ status: "error", message: "Phone number is required" });
    }

    // Check if BASE_URL is configured (only required when Twilio is configured)
    if (!process.env.BASE_URL && isTwilioConfigured) {
        console.error("[Call] BASE_URL not configured in .env file");
        return res.status(500).json({ 
            status: "error", 
            message: "Server configuration error: BASE_URL is not set. Please configure your ngrok URL in the .env file." 
        });
    }

    // Auto-format Indian numbers if missing country code
    if (!phone.startsWith('+') && phone.length === 10) {
        phone = '+91' + phone;
    }

    try {
        // Get patient details if patientId is provided
        let patient = null;
        let message = null;
        let scheduledDate = null;
        let useCustomMessage = false;

        // Priority 1: Use customMessage if explicitly provided
        if (customMessage && customMessage.trim()) {
            message = customMessage.trim();
            useCustomMessage = true;
            
            // AUTO-TRANSLATE to Tamil if Tamil language is selected
            const lang = (language || process.env.DEFAULT_LANGUAGE || '').toLowerCase();
            if (lang === 'ta' || lang === 'ta-in' || lang === 'tamil') {
                console.log('[Call] Tamil language selected - translating custom message...');
                console.log('[Call] Original message:', message);
                
                try {
                    const translated = await translate(message, { to: 'ta' });
                    message = translated.text;
                    console.log('[Call] ✓ Translated to Tamil:', message);
                } catch (translateErr) {
                    console.warn('[Call] ⚠ Translation failed, using original message:', translateErr.message);
                }
            }
            
            console.log('[Call] Using CUSTOM message (overrides all defaults):', message);
        }

        if (patientId) {
            patient = await Patient.findById(patientId);
            if (patient) {
                // If testInfo is provided from frontend, replace the first test with it temporarily
                // This ensures the test reminder message can be used (only if no customMessage)
                if (testInfo && !useCustomMessage) {
                    const originalTests = patient.upcomingTests;
                    patient.upcomingTests = [testInfo, ...originalTests.filter(t => t._id?.toString() !== testInfo._id?.toString())];
                }
                
                // Determine scheduled date from first upcoming test or dueDate
                if (Array.isArray(patient.upcomingTests) && patient.upcomingTests.length > 0) {
                    scheduledDate = patient.upcomingTests[0]?.testDate ? new Date(patient.upcomingTests[0].testDate) : null;
                }
                if (!scheduledDate && patient.dueDate) {
                    scheduledDate = new Date(patient.dueDate);
                }

                // Validate scheduled date: must be today or future
                if (scheduledDate && !isNaN(scheduledDate.getTime())) {
                    const now = new Date();
                    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    const scheduledStart = new Date(scheduledDate.getFullYear(), scheduledDate.getMonth(), scheduledDate.getDate());
                    if (scheduledStart < todayStart) {
                        return res.status(400).json({
                            status: 'error',
                            message: 'Cannot make a call for a past date. Please select today or a future date.'
                        });
                    }
                }
                
                // Priority 2: Generate message from patient data ONLY if no custom message
                if (!useCustomMessage && !message) {
                    // Choose language for reminder
                    const lang = (language || process.env.DEFAULT_LANGUAGE || '').toLowerCase();
                    if (lang === 'ta' || lang === 'ta-in' || lang === 'tamil') {
                        message = generateReminderMessageTamil(patient);
                    } else {
                        message = generateReminderMessage(patient);
                    }
                    console.log('[Call] Generated message from patient/test data:', message);
                }
            }
        }

        // Priority 3: Fallback message (only if still no message)
        if (!message) {
            message = "This is your health reminder. Please listen carefully.";
            console.log('[Call] Using fallback message');
        }

        // Store message in a temporary map for the voice endpoint to access
        const callKey = phone.replace(/\D/g, '');
        global.callMessages[callKey] = {
            message: message,
            patientName: patient ? patient.name : null,
            language: (language || process.env.DEFAULT_LANGUAGE || '').toLowerCase()
        };
        
        console.log('='.repeat(80));
        console.log(`[Call Setup] Phone: ${phone}`);
        console.log(`[Call Setup] Custom Message Provided: ${customMessage ? 'YES ✓' : 'NO ✗'}`);
        console.log(`[Call Setup] Message Source: ${useCustomMessage ? 'CUSTOM (User Input)' : 'GENERATED (Default/Test)'}`);
        console.log(`[Call Setup] Final Message to be spoken: "${message}"`);
        console.log(`[Call Setup] Stored in callMessages[${callKey}]`);
        console.log('='.repeat(80));

        // Pre-generate audio (Tamil/English) for playback via Twilio <Play>
        const audioLanguage = (language || process.env.DEFAULT_LANGUAGE || '').toLowerCase();
        console.log('========================================');
        console.log('[Audio Pre-generation] Starting...');
        console.log(`[Audio Pre-generation] Language: ${audioLanguage}`);
        console.log(`[Audio Pre-generation] Message: "${message}"`);
        console.log(`[Audio Pre-generation] Call Key: ${callKey}`);
        
        let audioGenerated = false;
        try {
            const result = await ensureReminderAudio(callKey, message, audioLanguage);
            if (result) {
                audioGenerated = true;
                console.log(`[Audio Pre-generation] ✓ SUCCESS - Audio file generated`);
                console.log(`[Audio Pre-generation] File path: ${result.path}`);
            } else {
                console.error('[Audio Pre-generation] ✗ FAILED - ensureReminderAudio returned null');
            }
        } catch (audioErr) {
            console.error('[Audio Pre-generation] ✗ FAILED');
            console.error('[Audio Pre-generation] Error:', audioErr.message);
            console.error('[Audio Pre-generation] Full error:', audioErr);
            
            // For Tamil, audio generation failure is critical
            if (audioLanguage === 'ta' || audioLanguage === 'ta-in' || audioLanguage === 'tamil') {
                console.error('[Audio Pre-generation] ⚠ CRITICAL: Tamil audio generation failed!');
                console.error('[Audio Pre-generation] ⚠ Possible causes:');
                console.error('[Audio Pre-generation]   1. OpenAI API key is invalid/expired');
                console.error('[Audio Pre-generation]   2. OpenAI API quota exceeded');
                console.error('[Audio Pre-generation]   3. Network connection issue');
                console.error('[Audio Pre-generation] ⚠ Tamil voice will NOT work in the call!');
                console.error('[Audio Pre-generation] ⚠ Please check your OpenAI API key or set up Google Cloud TTS');
            }
        }
        console.log(`[Audio Pre-generation] Audio Generated: ${audioGenerated}`);
        console.log('========================================');

       

        // Initiate the call
        const baseUrl = (process.env.BASE_URL || 'http://localhost:5000').replace(/\/$/, ''); // Remove trailing slash
        const voiceUrl = `${baseUrl}/voice?phone=${encodeURIComponent(phone)}&stage=reminder&lang=${encodeURIComponent((language || process.env.DEFAULT_LANGUAGE || '').toLowerCase())}`;
        console.log(`[Call] Voice webhook URL: ${voiceUrl}`);

        const call = await client.calls.create({
            url: voiceUrl,
            method: 'POST',
            to: phone,
            from: process.env.TWILIO_PHONE || '+10000000000',
            statusCallback: isTwilioConfigured ? `${baseUrl}/call-status` : undefined,
            statusCallbackEvent: isTwilioConfigured ? ["initiated", "ringing", "answered", "completed"] : undefined
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
        console.error("Error details:", {
            message: err.message,
            code: err.code,
            moreInfo: err.moreInfo
        });
        
        // Provide more user-friendly error messages
        let errorMessage = err.message;
        if (err.code === 21211) {
            errorMessage = "Invalid phone number format. Please check the phone number.";
        } else if (err.code === 21608) {
            errorMessage = "The phone number is not a valid mobile number or cannot receive calls.";
        } else if (err.message.includes('BASE_URL')) {
            errorMessage = "Server configuration error: Please ensure BASE_URL is set in environment variables.";
        }
        
        res.status(500).json({ status: "error", message: errorMessage });
    }
};

/**
 * Handle Twilio Voice Webhook
 */
exports.handleVoiceWebhook = async (req, res) => {
    console.log(" Voice endpoint hit!");
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
        const langPref = (callData.language || req.query.lang || process.env.DEFAULT_LANGUAGE || '').toLowerCase();

        console.log('========================================');
        console.log(`[Voice] Processing call for ${phone}`);
        console.log(`[Voice] Call Key: ${callKey}`);
        console.log(`[Voice] Language Preference: ${langPref}`);
        console.log(`[Voice] Message to Say: "${messageToSay}"`);
        console.log(`[Voice] Call Data:`, callData);
        console.log('========================================');

        // Try to use OpenAI audio if available, otherwise fallback to text-to-speech
        const audioEntry = getReminderAudioEntry(callKey);
        const computedBase = (process.env.BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
        const audioUrl = audioEntry ? `${computedBase}/reminder-audio/${callKey}` : null;
        
        console.log(`[Voice] Audio Entry Found: ${audioEntry ? 'YES' : 'NO'}`);
        console.log(`[Voice] Audio URL: ${audioUrl || 'NONE - Will use Twilio fallback'}`);

        if (audioUrl) {
            console.log(`[Voice] ✓ Using OpenAI audio: ${audioUrl}`);
            response.play(audioUrl);
        } else {
            console.warn(`[Voice] ✗ No OpenAI audio available - using Twilio TTS`);
            console.warn(`[Voice] ⚠ WARNING: Twilio does not support Tamil TTS well!`);
            console.warn(`[Voice] ⚠ Language: ${langPref}`);
            
            // For Tamil, we MUST have OpenAI audio
            if (langPref === 'ta' || langPref === 'ta-in' || langPref === 'tamil') {
                console.error('[Voice] ✗ CRITICAL: Tamil selected but OpenAI audio not available!');
                console.error('[Voice] ✗ Check if audio generation succeeded in triggerCall');
                // Use Polly Aditi voice as last resort (Hindi voice, not ideal for Tamil)
                response.say({ voice: 'Polly.Aditi', language: 'hi-IN' }, messageToSay);
            } else {
                response.say({ voice: 'alice', language: 'en-US' }, messageToSay);
            }
        }

        // Pause
        response.pause({ length: 1 });

        // Ask for keypress response - generate audio for Tamil prompts too
        const gather = response.gather({
            numDigits: 1,
            action: `${computedBase}/process-keypress?phone=${encodeURIComponent(phone)}`,
            method: 'POST',
            timeout: 10
        });

        if (langPref === 'ta' || langPref === 'ta-in' || langPref === 'tamil') {
            // Generate Tamil audio for the confirmation prompt
            const tamilPrompt = "தயவுசெய்து ஒன்று அழுத்தி வருகையை உறுதிப்படுத்தவும். நீங்கள் வர முடியாவிட்டால் இரண்டு அழுத்தவும்.";
            
            try {
                console.log('[Voice] Generating Tamil audio for confirmation prompt...');
                
                // Generate audio buffer
                const audioBuffer = await createFreeTamilSpeech(tamilPrompt);
                console.log(`[Voice] ✓ Tamil prompt audio generated: ${audioBuffer.length} bytes`);
                
                // Save to temp file
                const tempDir = path.join(os.tmpdir(), 'reminder-audio');
                if (!fs.existsSync(tempDir)) {
                    fs.mkdirSync(tempDir, { recursive: true });
                }
                
                const promptFilename = `prompt-tamil-${callKey}.mp3`;
                const promptPath = path.join(tempDir, promptFilename);
                fs.writeFileSync(promptPath, audioBuffer);
                
                // Serve via public URL
                const promptAudioUrl = `${computedBase}/reminder-audio/${promptFilename}`;
                console.log('[Voice] ✓ Using Tamil audio for confirmation prompt:', promptAudioUrl);
                gather.play(promptAudioUrl);
            } catch (err) {
                console.error('[Voice] ✗ Failed to generate Tamil prompt audio:', err);
                console.error('[Voice] Error details:', err.message);
                gather.say({ voice: 'Polly.Aditi', language: 'hi-IN' }, tamilPrompt);
            }
        } else {
            gather.say({ voice: 'alice', language: 'en-US' }, "Please press 1 to confirm your attendance, or press 2 if you cannot attend.");
        }

        // Fallback if no input
        const goodbyeMessage = (langPref === 'ta' || langPref === 'ta-in' || langPref === 'tamil') 
            ? "உங்கள் பதிலைப் பெறவில்லை. நன்றி." 
            : "We did not receive your response. Goodbye.";
            
        if (langPref === 'ta' || langPref === 'ta-in' || langPref === 'tamil') {
            try {
                console.log('[Voice] Generating Tamil audio for goodbye message...');
                
                const audioBuffer = await createFreeTamilSpeech(goodbyeMessage);
                console.log(`[Voice] ✓ Tamil goodbye audio generated: ${audioBuffer.length} bytes`);
                
                const tempDir = path.join(os.tmpdir(), 'reminder-audio');
                if (!fs.existsSync(tempDir)) {
                    fs.mkdirSync(tempDir, { recursive: true });
                }
                
                const goodbyeFilename = `goodbye-tamil-${callKey}.mp3`;
                const goodbyePath = path.join(tempDir, goodbyeFilename);
                fs.writeFileSync(goodbyePath, audioBuffer);
                
                const goodbyeUrl = `${computedBase}/reminder-audio/${goodbyeFilename}`;
                console.log('[Voice] ✓ Using Tamil audio for goodbye message:', goodbyeUrl);
                response.play(goodbyeUrl);
            } catch (err) {
                console.error('[Voice] ✗ Failed to generate Tamil goodbye audio:', err);
                console.error('[Voice] Error details:', err.message);
                response.say({ voice: 'Polly.Aditi', language: 'hi-IN' }, goodbyeMessage);
            }
        } else {
            response.say({ voice: 'alice' }, goodbyeMessage);
        }
        
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
 * Handle Keypress Response (Process user confirmation via keypress)
 */
exports.handleKeypressWebhook = async (req, res) => {
    console.log("🔢 Keypress webhook hit!");
    console.log("Body:", req.body);
    console.log("Query:", req.query);
    
    const digit = req.body.Digits;
    const phone = req.query.phone || req.body.From;
    const callSid = req.body.CallSid;
    const callKey = phone ? phone.replace(/\D/g, '') : null;

    console.log("Digit pressed:", digit);
    console.log("Phone:", phone);

    // Get language preference from stored call data
    const callData = global.callMessages?.[callKey] || {};
    const langPref = callData.language || 'en';
    const isTamil = langPref === 'ta' || langPref === 'ta-in' || langPref === 'tamil';

    // Generate appropriate TwiML response
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const response = new VoiceResponse();

    let confirmationStatus = 'unclear';
    let responseMessage = '';

    if (digit === '1') {
        confirmationStatus = 'confirmed';
        responseMessage = isTamil 
            ? 'உறுதிப்படுத்தியதற்கு நன்றி. உங்கள் சந்திப்பில் உங்களைப் பார்க்க ஆவலுடன் காத்திருக்கிறோம். நலமாக இருங்கள்!' 
            : 'Thank you for confirming. We look forward to seeing you at your appointment. Take care!';
    } else if (digit === '2') {
        confirmationStatus = 'rejected';
        responseMessage = isTamil 
            ? 'தெரிவித்ததற்கு நன்றி. உங்கள் சந்திப்பை மாற்றி அமைக்க எங்களைத் தொடர்பு கொள்ளவும். நலமாக இருங்கள்!' 
            : 'Thank you for letting us know. Please contact us to reschedule your appointment. Take care!';
    } else {
        confirmationStatus = 'unclear';
        responseMessage = isTamil 
            ? 'தவறான பதில் கிடைத்தது. உங்கள் நேரத்திற்கு நன்றி.' 
            : 'Invalid response received. Thank you for your time.';
    }

    // Generate Tamil audio for response if language is Tamil
    if (isTamil) {
        try {
            console.log('[Keypress] Generating Tamil audio for response...');
            console.log('[Keypress] Response message:', responseMessage);
            
            const audioBuffer = await createFreeTamilSpeech(responseMessage);
            console.log(`[Keypress] ✓ Tamil response audio generated: ${audioBuffer.length} bytes`);
            
            const tempDir = path.join(os.tmpdir(), 'reminder-audio');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            
            const responseFilename = `response-tamil-${callKey}-${digit}.mp3`;
            const responsePath = path.join(tempDir, responseFilename);
            fs.writeFileSync(responsePath, audioBuffer);
            
            // Get base URL from environment or construct it
            const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
            const responseUrl = `${BASE_URL}/reminder-audio/${responseFilename}`;
            
            console.log('[Keypress] ✓ Using Tamil audio for response:', responseUrl);
            response.play(responseUrl);
        } catch (err) {
            console.error('[Keypress] ✗ Failed to generate Tamil response audio:', err);
            console.error('[Keypress] Error details:', err.message);
            response.say({ voice: 'Polly.Aditi', language: 'hi-IN' }, responseMessage);
        }
    } else {
        response.say({
            voice: 'alice',
            language: 'en-US'
        }, responseMessage);
    }
    
    response.hangup();

    // Save to database asynchronously
    (async () => {
        try {
            const callData = global.callMessages?.[callKey] || {};
            const fullResponse = `User pressed ${digit} - ${confirmationStatus}`;

            let updated = false;
            if (callSid) {
                const result = await CallResponse.findOneAndUpdate(
                    { callSid: callSid },
                    {
                        response: fullResponse,
                        confirmationStatus: confirmationStatus,
                        callStatus: 'completed'
                    },
                    { new: true }
                );
                if (result) {
                    console.log("[Keypress] Updated existing call record:", result._id);
                    updated = true;
                }
            }

            if (!updated) {
                const newCall = new CallResponse({
                    phone: phone,
                    patientName: callData.patientName,
                    response: fullResponse,
                    confirmationStatus: confirmationStatus,
                    callStatus: "completed",
                    callSid: callSid
                });
                await newCall.save();
                console.log("[Keypress] Created new call record:", newCall._id);
            }

            // Clean up temporary data
            if (global.callMessages?.[callKey]) {
                delete global.callMessages[callKey];
            }
            if (callKey) {
                deleteReminderAudioEntry(callKey);
            }
        } catch (error) {
            console.error("Error saving keypress response:", error);
        }
    })();

    // Send TwiML response immediately
    res.type('text/xml');
    res.send(response.toString());
};

/**
 * Handle Recording Webhook (Legacy - kept for backward compatibility)
 */
exports.handleRecordingWebhook = async (req, res) => {
    console.log("📼 Recording webhook hit (legacy)!");
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
 * Delete All Call History
 */
exports.deleteAllCallHistory = async (req, res) => {
    try {
        const result = await CallResponse.deleteMany({});
        res.json({ status: 'success', deletedCount: result.deletedCount });
    } catch (err) {
        console.error('Error deleting all call history:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
};


/**
 * Delete a single call history record by its _id
 */
exports.deleteCallHistoryRecord = async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await CallResponse.findByIdAndDelete(id);
        if (!deleted) {
            return res.status(404).json({ status: 'error', message: 'Record not found' });
        }
        res.json({ status: 'success', id: deleted._id });
    } catch (err) {
        console.error('Error deleting call history record:', err);
        res.status(500).json({ status: 'error', message: err.message });
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

/**
 * Schedule a call for later
 */
exports.scheduleCall = async (req, res) => {
    try {
        const { phone, patientId, customMessage, language, testInfo, scheduledDateTime } = req.body;

        if (!phone || !scheduledDateTime) {
            return res.status(400).json({ 
                status: "error", 
                message: "Phone number and scheduled date/time are required" 
            });
        }

        const scheduledTime = new Date(scheduledDateTime);
        const now = new Date();

        if (scheduledTime <= now) {
            return res.status(400).json({ 
                status: "error", 
                message: "Scheduled time must be in the future" 
            });
        }

        // Auto-format Indian numbers if missing country code
        let formattedPhone = phone;
        if (!phone.startsWith('+') && phone.length === 10) {
            formattedPhone = '+91' + phone;
        }

        // Create scheduled call record
        const scheduledCall = new ScheduledCall({
            phone: formattedPhone,
            patientId,
            language: language || 'en',
            customMessage: customMessage || null,
            testInfo: testInfo || null,
            scheduledDateTime: scheduledTime,
            status: 'pending'
        });

        await scheduledCall.save();

        console.log(`[Schedule] Call scheduled for ${formattedPhone} at ${scheduledTime.toISOString()}`);
        console.log(`[Schedule] Scheduled Call ID: ${scheduledCall._id}`);

        res.json({ 
            status: 'success', 
            message: 'Call scheduled successfully',
            scheduledCallId: scheduledCall._id,
            scheduledTime: scheduledTime
        });

    } catch (err) {
        console.error('[Schedule] Error scheduling call:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
};

/**
 * Background scheduler to check and execute pending scheduled calls
 */
function startScheduledCallChecker() {
    setInterval(async () => {
        try {
            const now = new Date();
            
            // Find all pending scheduled calls that are due
            const dueCalls = await ScheduledCall.find({
                status: 'pending',
                scheduledDateTime: { $lte: now }
            }).limit(10); // Process up to 10 at a time

            if (dueCalls.length === 0) return;

            console.log(`[Scheduler] Found ${dueCalls.length} due calls to execute`);

            for (const scheduledCall of dueCalls) {
                try {
                    console.log(`[Scheduler] Executing scheduled call ${scheduledCall._id}`);

                    // Call the triggerCall logic
                    const callData = {
                        phone: scheduledCall.phone,
                        patientId: scheduledCall.patientId,
                        customMessage: scheduledCall.customMessage,
                        language: scheduledCall.language,
                        testInfo: scheduledCall.testInfo
                    };

                    // Execute the call using internal trigger logic
                    // We'll use the existing triggerCall but bypass HTTP response
                    const mockReq = { body: callData };
                    const mockRes = {
                        status: (code) => mockRes,
                        json: (data) => {
                            if (data.status === 'success') {
                                scheduledCall.status = 'executed';
                                scheduledCall.executedAt = new Date();
                                scheduledCall.callSid = data.callSid;
                            } else {
                                scheduledCall.status = 'failed';
                                scheduledCall.error = data.message || 'Unknown error';
                            }
                            return mockRes;
                        }
                    };

                    await exports.triggerCall(mockReq, mockRes);
                    await scheduledCall.save();

                    console.log(`[Scheduler] Successfully executed scheduled call ${scheduledCall._id}`);

                } catch (callError) {
                    console.error(`[Scheduler] Error executing call ${scheduledCall._id}:`, callError);
                    scheduledCall.status = 'failed';
                    scheduledCall.error = callError.message;
                    await scheduledCall.save();
                }
            }

        } catch (err) {
            console.error('[Scheduler] Error in scheduled call checker:', err);
        }
    }, 60000); // Check every minute

    console.log('[Scheduler] Scheduled call checker started (checking every 60 seconds)');
}

// Start the scheduler
startScheduledCallChecker();

// ========================================
// SCHEDULED CALL STATUS MANAGEMENT
// ========================================

/**
 * Get all scheduled calls with optional filters
 */
exports.getScheduledCalls = async (req, res) => {
    try {
        const { status, startDate, endDate, patientId } = req.query;
        
        const filters = {};
        if (status) filters.status = status;
        if (patientId) filters.patientId = patientId;
        if (startDate && endDate) {
            filters.startDate = startDate;
            filters.endDate = endDate;
        }
        
        const scheduledCalls = await ScheduledCall.getScheduledCalls(filters);
        
        res.status(200).json({
            status: 'success',
            count: scheduledCalls.length,
            data: scheduledCalls
        });
    } catch (error) {
        console.error('[Scheduled Calls] Error fetching scheduled calls:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch scheduled calls',
            error: error.message
        });
    }
};

/**
 * Get scheduled calls by status
 */
exports.getScheduledCallsByStatus = async (req, res) => {
    try {
        const { status } = req.params;
        
        const validStatuses = ['pending', 'in-progress', 'executed', 'completed', 'failed', 'cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                status: 'error',
                message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
            });
        }
        
        const scheduledCalls = await ScheduledCall.find({ status })
            .populate('patientId')
            .sort({ scheduledDateTime: -1 });
        
        res.status(200).json({
            status: 'success',
            count: scheduledCalls.length,
            requestedStatus: status,
            data: scheduledCalls
        });
    } catch (error) {
        console.error(`[Scheduled Calls] Error fetching calls with status ${req.params.status}:`, error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch scheduled calls by status',
            error: error.message
        });
    }
};

/**
 * Get scheduled calls for a specific patient
 */
exports.getPatientScheduledCalls = async (req, res) => {
    try {
        const { patientId } = req.params;
        const { includeCompleted } = req.query;
        
        let query = { patientId };
        
        // By default, only show pending and in-progress calls
        if (includeCompleted !== 'true') {
            query.status = { $in: ['pending', 'in-progress'] };
        }
        
        const scheduledCalls = await ScheduledCall.find(query)
            .populate('patientId')
            .sort({ scheduledDateTime: 1 });
        
        res.status(200).json({
            status: 'success',
            patientId,
            count: scheduledCalls.length,
            data: scheduledCalls
        });
    } catch (error) {
        console.error(`[Scheduled Calls] Error fetching calls for patient ${req.params.patientId}:`, error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch patient scheduled calls',
            error: error.message
        });
    }
};

/**
 * Update scheduled call status
 */
exports.updateScheduledCallStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, notes, errorMessage } = req.body;
        
        const validStatuses = ['pending', 'in-progress', 'executed', 'completed', 'failed', 'cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                status: 'error',
                message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
            });
        }
        
        const scheduledCall = await ScheduledCall.findById(id);
        
        if (!scheduledCall) {
            return res.status(404).json({
                status: 'error',
                message: 'Scheduled call not found'
            });
        }
        
        // Use the model methods for status updates
        if (status === 'completed') {
            await scheduledCall.markCompleted(scheduledCall.callSid, null);
        } else if (status === 'failed') {
            await scheduledCall.markFailed(errorMessage || 'Manual failure');
        } else if (status === 'cancelled') {
            await scheduledCall.cancel(notes || 'Cancelled by user');
        } else if (status === 'in-progress') {
            await scheduledCall.markInProgress(scheduledCall.callSid);
        } else {
            scheduledCall.status = status;
            if (notes) scheduledCall.notes = notes;
            await scheduledCall.save();
        }
        
        const updatedCall = await ScheduledCall.findById(id).populate('patientId');
        
        res.status(200).json({
            status: 'success',
            message: `Scheduled call status updated to ${status}`,
            data: updatedCall
        });
    } catch (error) {
        console.error(`[Scheduled Calls] Error updating call status:`, error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to update scheduled call status',
            error: error.message
        });
    }
};

/**
 * Cancel a scheduled call
 */
exports.cancelScheduledCall = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        
        const scheduledCall = await ScheduledCall.findById(id);
        
        if (!scheduledCall) {
            return res.status(404).json({
                status: 'error',
                message: 'Scheduled call not found'
            });
        }
        
        if (scheduledCall.status === 'cancelled') {
            return res.status(400).json({
                status: 'error',
                message: 'Scheduled call is already cancelled'
            });
        }
        
        if (scheduledCall.status === 'completed' || scheduledCall.status === 'executed') {
            return res.status(400).json({
                status: 'error',
                message: 'Cannot cancel a call that has already been executed or completed'
            });
        }
        
        await scheduledCall.cancel(reason || 'Cancelled by user');
        
        const updatedCall = await ScheduledCall.findById(id).populate('patientId');
        
        res.status(200).json({
            status: 'success',
            message: 'Scheduled call cancelled successfully',
            data: updatedCall
        });
    } catch (error) {
        console.error(`[Scheduled Calls] Error cancelling call:`, error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to cancel scheduled call',
            error: error.message
        });
    }
};
