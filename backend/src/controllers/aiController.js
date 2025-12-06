const OpenAI = require('openai');
const axios = require('axios');

const fs = require('fs');
const path = require('path');
const os = require('os');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const REMINDER_AUDIO_TTL_MS = 5 * 60 * 1000;
const reminderAudioDir = path.join(os.tmpdir(), 'ai-reminder-audio');
if (!fs.existsSync(reminderAudioDir)) {
    fs.mkdirSync(reminderAudioDir, { recursive: true });
}

const reminderAudioCache = new Map();

async function createReminderSpeechBuffer(text) {
    const speech = await openai.audio.speech.create({
        model: 'tts-1',
        voice: 'alloy',
        input: text,
        response_format: 'mp3'
    });
    const arrayBuffer = await speech.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

async function ensureReminderAudio(callKey, reminder) {
    if (!callKey || !reminder) {
        console.log('[Audio] Missing callKey or reminder, skipping audio generation');
        return null;
    }

    const existing = reminderAudioCache.get(callKey);
    const now = Date.now();

    if (existing && existing.expiresAt > now && fs.existsSync(existing.path)) {
        console.log(`[Audio] Using cached audio for ${callKey}`);
        return existing;
    }

    try {
        console.log(`[Audio] Generating new audio for ${callKey}`);
        console.log(`[Audio] Reminder text: "${reminder}"`);

        const buffer = await createReminderSpeechBuffer(reminder);
        const filename = `${callKey}_${now}.mp3`;
        const filePath = path.join(reminderAudioDir, filename);
        fs.writeFileSync(filePath, buffer);

        console.log(`[Audio] Audio file created: ${filePath} (${buffer.length} bytes)`);

        if (existing && fs.existsSync(existing.path)) {
            fs.unlinkSync(existing.path);
        }

        const entry = {
            path: filePath,
            expiresAt: now + REMINDER_AUDIO_TTL_MS
        };
        reminderAudioCache.set(callKey, entry);
        console.log(`[Audio] Successfully generated audio for ${callKey}`);
        return entry;
    } catch (error) {
        console.error('[Audio] Error generating reminder audio:', error);
        console.error('[Audio] Error details:', error.message);
        return null;
    }
}

function getReminderAudioEntry(callKey) {
    const entry = reminderAudioCache.get(callKey);
    if (!entry) {
        return null;
    }
    if (entry.expiresAt < Date.now() || !fs.existsSync(entry.path)) {
        deleteReminderAudioEntry(callKey);
        return null;
    }
    return entry;
}

function deleteReminderAudioEntry(callKey) {
    const entry = reminderAudioCache.get(callKey);
    if (!entry) {
        return;
    }
    try {
        if (fs.existsSync(entry.path)) {
            fs.unlinkSync(entry.path);
        }
    } catch (error) {
        console.warn('Failed to delete reminder audio file', error);
    }
    reminderAudioCache.delete(callKey);
}

/**
 * Transcribe audio recording to text using OpenAI Whisper
 * @param {string} recordingUrl - URL of the Twilio recording
 * @returns {Promise<string>} - Transcribed text
 */
async function transcribeAudio(recordingUrl) {
    try {
        console.log('Downloading audio from:', recordingUrl);

        // Add .mp3 extension to get the audio file
        const audioUrl = recordingUrl + '.mp3';
        
        // Retry logic - recordings take a few seconds to be available
        let response;
        let retries = 3;
        
        for (let i = 0; i < retries; i++) {
            try {
                // Download the audio file with Twilio authentication
                response = await axios({
                    method: 'get',
                    url: audioUrl,
                    responseType: 'stream',
                    auth: {
                        username: process.env.TWILIO_ACCOUNT_SID,
                        password: process.env.TWILIO_AUTH_TOKEN
                    }
                });
                console.log('Audio downloaded successfully');
                break; // Success, exit retry loop
            } catch (err) {
                if (err.response?.status === 404 && i < retries - 1) {
                    console.log(`Recording not ready yet, retrying in ${(i + 1) * 2} seconds... (attempt ${i + 1}/${retries})`);
                    await new Promise(resolve => setTimeout(resolve, (i + 1) * 2000)); // Wait 2, 4 seconds
                } else {
                    throw err; // Final failure or different error
                }
            }
        }
        
        if (!response) {
            throw new Error('Failed to download recording after retries');
        }

        // Create a temporary file
        const tempFilePath = path.join(os.tmpdir(), `recording_${Date.now()}.wav`);
        const writer = fs.createWriteStream(tempFilePath);

        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        console.log('Audio downloaded to:', tempFilePath);

        // Transcribe using OpenAI Whisper
        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(tempFilePath),
            model: "whisper-1",
        });

        // Clean up temp file
        fs.unlinkSync(tempFilePath);

        console.log('Transcription result:', transcription.text);
        return transcription.text;

    } catch (error) {
        console.error('Error transcribing audio:', error);
        return 'Unable to transcribe response';
    }
}


/**
 * Generate AI response based on user input
 * @param {string} recordingUrl - URL of the recording
 * @returns {Promise<string>} - AI-generated response
 */
async function generateAIResponse(recordingUrl) {
    try {
        // First, transcribe the audio
        const transcribedText = await transcribeAudio(recordingUrl);

        if (!transcribedText || transcribedText === 'Unable to transcribe response') {
            return {
                fullResponse: "Could not understand response",
                transcription: "Unable to transcribe",
                confirmationStatus: "unclear"
            };
        }

        // Analyze the response using GPT
        const completion = await openai.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: "You are analyzing a patient's response to an appointment reminder. Reply ONLY with one word: CONFIRMED, REJECTED, or UNCLEAR."
                },
                {
                    role: "user",
                    content: `Patient said: "${transcribedText}". Did they confirm (yes/will attend) or reject (no/cannot attend)?`
                }
            ],
            model: "gpt-3.5-turbo",
            max_tokens: 10
        });

        const aiStatus = completion.choices[0].message.content.trim().toUpperCase();
        let confirmationStatus = 'unclear';
        
        if (aiStatus.includes('CONFIRMED')) {
            confirmationStatus = 'confirmed';
        } else if (aiStatus.includes('REJECTED')) {
            confirmationStatus = 'rejected';
        }

        return {
            fullResponse: transcribedText,
            transcription: transcribedText,
            confirmationStatus: confirmationStatus
        };

    } catch (error) {
        console.error('Error generating AI response:', error);
        return {
            fullResponse: 'Error processing response',
            transcription: 'Error',
            confirmationStatus: 'unclear'
        };
    }
}


/**
 * Generate personalized reminder message
 * @param {Object} patient - Patient object with test details
 * @returns {string} - Personalized reminder message
 */
function generateReminderMessage(patient) {
    const testInfo = patient.upcomingTests && patient.upcomingTests.length > 0
        ? patient.upcomingTests[0]
        : null;

    if (!testInfo) {
        return `Hello ${patient.name}, this is a reminder about your upcoming health appointment. Please confirm if you will be able to attend.`;
    }

    const testDate = new Date(testInfo.testDate).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric'
    });

    const testTypeMap = {
        'lab': 'laboratory test',
        'vaccination': 'vaccination',
        'checkup': 'checkup appointment',
        'ultrasound': 'ultrasound scan'
    };

    const testType = testTypeMap[testInfo.testType] || 'appointment';

    return `Hello ${patient.name}, this is a reminder about your ${testInfo.testName} ${testType} scheduled for ${testDate}. Please confirm if you will be able to attend.`;
}

module.exports = {
    transcribeAudio,
    generateAIResponse,
    generateReminderMessage,
    ensureReminderAudio,
    getReminderAudioEntry,
    deleteReminderAudioEntry
};
