const OpenAI = require('openai');
const axios = require('axios');
const googleTTS = require('google-tts-api');
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

async function createReminderSpeechBuffer(text, language = 'en') {
    const isTamil = language === 'ta' || language === 'ta-in' || language === 'tamil';
    
    console.log(`[Audio] ========================================`);
    console.log(`[Audio] Creating speech for ${isTamil ? 'Tamil' : 'English'}`);
    console.log(`[Audio] - Language: ${language}`);
    console.log(`[Audio] - Text: "${text}"`);
    if (isTamil) {
        console.log(`[Audio] - Using FREE gTTS for Tamil (no API key needed!)`);
        return await createFreeTamilSpeech(text);
    }
    if (process.env.OPENAI_API_KEY) {
        try {
            console.log(`[Audio] - Using OpenAI TTS for English`);
            const speech = await openai.audio.speech.create({
                model: 'tts-1-hd',
                voice: 'alloy',
                input: text,
                response_format: 'mp3',
                speed: 0.85
            });
            const arrayBuffer = await speech.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            console.log(`[Audio] ✓ OpenAI TTS generated ${buffer.length} bytes`);
            console.log(`[Audio] ========================================`);
            return buffer;
        } catch (error) {
            console.warn(`[Audio] OpenAI failed, falling back to free gTTS:`, error.message);
        }
    }
    
    // Fallback to free gTTS for English
    console.log(`[Audio] - Using FREE gTTS for English`);
    return await createFreeEnglishSpeech(text);
}

// FREE Tamil Text-to-Speech using Google TTS (No API key needed!)
async function createFreeTamilSpeech(text) {
    console.log(`[Audio] Generating FREE Tamil speech with Google TTS API...`);
    console.log(`[Audio] Text length: ${text.length} characters`);
    
    try {
        // Google TTS has a limit of ~200 characters per request
        // Split long text into chunks if needed
        const MAX_CHARS = 180;
        
        if (text.length <= MAX_CHARS) {
            // Short text - single request
            const url = googleTTS.getAudioUrl(text, {
                lang: 'ta',
                slow: false,
                host: 'https://translate.google.com'
            });
            
            console.log(`[Audio] Downloading Tamil audio from Google TTS...`);
            
            const response = await axios({
                method: 'get',
                url: url,
                responseType: 'arraybuffer'
            });
            
            const buffer = Buffer.from(response.data);
            console.log(`[Audio] ✓ FREE Tamil TTS generated ${buffer.length} bytes`);
            console.log(`[Audio] ========================================`);
            return buffer;
        } else {
            // Long text - split into sentences and combine audio
            console.log(`[Audio] Text is long (${text.length} chars), splitting into chunks...`);
            
            // Split by Tamil sentence markers (period, question mark, etc.)
            const sentences = text.split(/([.!?।।।])/g).filter(s => s.trim());
            const chunks = [];
            let currentChunk = '';
            
            for (const sentence of sentences) {
                if ((currentChunk + sentence).length <= MAX_CHARS) {
                    currentChunk += sentence;
                } else {
                    if (currentChunk) chunks.push(currentChunk);
                    currentChunk = sentence;
                }
            }
            if (currentChunk) chunks.push(currentChunk);
            
            console.log(`[Audio] Split into ${chunks.length} chunks`);
            
            // Generate audio for each chunk
            const audioBuffers = [];
            for (let i = 0; i < chunks.length; i++) {
                console.log(`[Audio] Generating chunk ${i + 1}/${chunks.length}: "${chunks[i].substring(0, 50)}..."`);
                
                const url = googleTTS.getAudioUrl(chunks[i], {
                    lang: 'ta',
                    slow: false,
                    host: 'https://translate.google.com'
                });
                
                const response = await axios({
                    method: 'get',
                    url: url,
                    responseType: 'arraybuffer'
                });
                
                audioBuffers.push(Buffer.from(response.data));
                
                // Small delay to avoid rate limiting
                if (i < chunks.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
            }
            
            // Concatenate all audio buffers
            const combinedBuffer = Buffer.concat(audioBuffers);
            console.log(`[Audio] ✓ FREE Tamil TTS generated ${combinedBuffer.length} bytes (${chunks.length} chunks combined)`);
            console.log(`[Audio] ========================================`);
            return combinedBuffer;
        }
    } catch (error) {
        console.error(`[Audio] ✗ Google TTS Tamil failed:`, error.message);
        throw new Error(`Failed to generate Tamil speech: ${error.message}`);
    }
}

// FREE English Text-to-Speech using Google TTS (No API key needed!)
async function createFreeEnglishSpeech(text) {
    console.log(`[Audio] Generating FREE English speech with Google TTS API...`);
    
    try {
        // Get audio URL from Google TTS
        const url = googleTTS.getAudioUrl(text, {
            lang: 'en',
            slow: false,
            host: 'https://translate.google.com'
        });
        
        console.log(`[Audio] Downloading English audio from Google TTS...`);
        
        // Download the audio
        const response = await axios({
            method: 'get',
            url: url,
            responseType: 'arraybuffer'
        });
        
        const buffer = Buffer.from(response.data);
        console.log(`[Audio] ✓ FREE English TTS generated ${buffer.length} bytes`);
        console.log(`[Audio] ========================================`);
        return buffer;
    } catch (error) {
        console.error(`[Audio] ✗ Google TTS English failed:`, error.message);
        throw new Error(`Failed to generate English speech: ${error.message}`);
    }
}

async function ensureReminderAudio(callKey, reminder, language = 'en') {
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
        console.log(`[Audio] Generating new audio for ${callKey} in language: ${language}`);
        console.log(`[Audio] Reminder text: "${reminder}"`);
        const buffer = await createReminderSpeechBuffer(reminder, language);
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

        // Transcribe using OpenAI Whisper with retry logic
        let transcription;
        let retryCount = 0;
        const maxRetries = 3;

        while (retryCount < maxRetries) {
            try {
                console.log(`[Transcription] Attempt ${retryCount + 1}/${maxRetries}...`);
                transcription = await openai.audio.transcriptions.create({
                    file: fs.createReadStream(tempFilePath),
                    model: "whisper-1",
                });
                console.log('[Transcription] Success:', transcription.text);
                break;
            } catch (apiError) {
                retryCount++;
                console.error(`[Transcription] Attempt ${retryCount} failed:`, apiError.message);
                
                if (retryCount < maxRetries) {
                    // Wait before retrying (exponential backoff)
                    await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
                } else {
                    throw apiError;
                }
            }
        }

        // Clean up temp file
        fs.unlinkSync(tempFilePath);

        return transcription?.text || 'Unable to transcribe response';

    } catch (error) {
        console.error('Error transcribing audio:', error.message);
        console.error('Error type:', error.constructor.name);
        
        // Check if it's a network error
        if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.type === 'system') {
            console.warn('[Transcription] Network error - OpenAI API may be temporarily unavailable');
        }
        
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
            console.warn('[AI Analysis] Transcription failed, marking as unclear');
            return {
                fullResponse: "Could not understand response (transcription failed)",
                transcription: "Unable to transcribe",
                confirmationStatus: "unclear"
            };
        }

        console.log('[AI Analysis] Analyzing transcription:', transcribedText);

        // Analyze the response using GPT with retry logic
        let completion;
        let retryCount = 0;
        const maxRetries = 2;

        while (retryCount < maxRetries) {
            try {
                completion = await openai.chat.completions.create({
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
                break;
            } catch (apiError) {
                retryCount++;
                console.error(`[AI Analysis] Attempt ${retryCount} failed:`, apiError.message);
                
                if (retryCount < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
                } else {
                    // Fallback to simple keyword matching if API fails
                    console.warn('[AI Analysis] OpenAI API failed, using fallback keyword matching');
                    return analyzeWithKeywords(transcribedText);
                }
            }
        }

        const aiStatus = completion.choices[0].message.content.trim().toUpperCase();
        let confirmationStatus = 'unclear';
        
        if (aiStatus.includes('CONFIRMED')) {
            confirmationStatus = 'confirmed';
        } else if (aiStatus.includes('REJECTED')) {
            confirmationStatus = 'rejected';
        }

        console.log('[AI Analysis] Result:', confirmationStatus);

        return {
            fullResponse: transcribedText,
            transcription: transcribedText,
            confirmationStatus: confirmationStatus
        };

    } catch (error) {
        console.error('Error generating AI response:', error.message);
        
        // Try keyword-based fallback
        if (transcribedText && transcribedText !== 'Unable to transcribe response') {
            console.warn('[AI Analysis] Using fallback keyword matching');
            return analyzeWithKeywords(transcribedText);
        }
        
        return {
            fullResponse: 'Error processing response',
            transcription: 'Error',
            confirmationStatus: 'unclear'
        };
    }
}

/**
 * Fallback function to analyze response using simple keyword matching
 * @param {string} text - Transcribed text
 * @returns {Object} - Analysis result
 */
function analyzeWithKeywords(text) {
    const lowerText = text.toLowerCase();
    
    // Check for confirmation keywords
    const confirmKeywords = ['yes', 'yeah', 'sure', 'okay', 'ok', 'will attend', 'confirm', 'definitely', 'absolutely'];
    const rejectKeywords = ['no', 'not', 'cannot', 'can\'t', 'won\'t', 'unable', 'busy', 'unavailable'];
    
    const hasConfirm = confirmKeywords.some(keyword => lowerText.includes(keyword));
    const hasReject = rejectKeywords.some(keyword => lowerText.includes(keyword));
    
    let status = 'unclear';
    if (hasConfirm && !hasReject) {
        status = 'confirmed';
    } else if (hasReject && !hasConfirm) {
        status = 'rejected';
    }
    
    console.log(`[Keyword Analysis] Text: "${text}" -> Status: ${status}`);
    
    return {
        fullResponse: text + ' (analyzed with keyword matching)',
        transcription: text,
        confirmationStatus: status
    };
}

/**
 * AUTO-DETECT LANGUAGE from text (Tamil vs English)
 * Uses multiple detection methods for accuracy
 * @param {string} text - Text to analyze
 * @returns {Promise<Object>} - { language: 'ta' | 'en', confidence: 0-1, method: string }
 */
async function detectLanguage(text) {
    if (!text || text.trim().length === 0) {
        return { language: 'en', confidence: 0, method: 'default' };
    }

    const cleanText = text.trim();
    
    // Method 1: Unicode range detection (FAST & FREE)
    const tamilUnicodeRegex = /[\u0B80-\u0BFF]/g;
    const tamilChars = (cleanText.match(tamilUnicodeRegex) || []).length;
    const totalChars = cleanText.replace(/\s+/g, '').length;
    const tamilPercentage = totalChars > 0 ? tamilChars / totalChars : 0;
    
    console.log('[Language Detection] ========================================')
    console.log(`[Language Detection] Text: "${cleanText.substring(0, 100)}..."`);
    console.log(`[Language Detection] Tamil chars: ${tamilChars}/${totalChars} (${(tamilPercentage * 100).toFixed(1)}%)`);
    
    // High confidence if >30% Tamil characters
    if (tamilPercentage > 0.3) {
        console.log('[Language Detection] ✓ Detected: TAMIL (Unicode method)');
        console.log('[Language Detection] ========================================');
        return { 
            language: 'ta', 
            confidence: Math.min(tamilPercentage * 2, 1), // Scale 0.3-0.5 to 0.6-1.0
            method: 'unicode' 
        };
    }
    
    // Method 2: Common Tamil words detection (for transliterated text)
    const tamilCommonWords = [
        'வணக்கம்', 'நன்றி', 'ஆம்', 'இல்லை', 'சரி', 'தேதி', 
        'மருத்துவ', 'பரிசோதனை', 'நேரம்', 'இடம்', 'பெயர்'
    ];
    const hasTamilWords = tamilCommonWords.some(word => cleanText.includes(word));
    
    if (hasTamilWords) {
        console.log('[Language Detection] ✓ Detected: TAMIL (keyword method)');
        console.log('[Language Detection] ========================================');
        return { 
            language: 'ta', 
            confidence: 0.9, 
            method: 'keywords' 
        };
    }
    
    // Method 3: OpenAI language detection (ACCURATE but costs API credits)
    if (process.env.OPENAI_API_KEY && cleanText.length > 20) {
        try {
            console.log('[Language Detection] Using OpenAI for advanced detection...');
            const completion = await openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [
                    {
                        role: "system",
                        content: "Detect the language of the text. Reply ONLY with 'TAMIL' or 'ENGLISH'."
                    },
                    {
                        role: "user",
                        content: cleanText
                    }
                ],
                max_tokens: 10,
                temperature: 0
            });
            
            const aiResult = completion.choices[0].message.content.trim().toUpperCase();
            const detectedLang = aiResult.includes('TAMIL') ? 'ta' : 'en';
            
            console.log(`[Language Detection] ✓ OpenAI detected: ${detectedLang === 'ta' ? 'TAMIL' : 'ENGLISH'}`);
            console.log('[Language Detection] ========================================');
            
            return { 
                language: detectedLang, 
                confidence: 0.95, 
                method: 'openai' 
            };
        } catch (error) {
            console.warn('[Language Detection] OpenAI detection failed:', error.message);
        }
    }
    
    // Default: English (if no Tamil indicators found)
    console.log('[Language Detection] ✓ Default: ENGLISH (no Tamil indicators)');
    console.log('[Language Detection] ========================================');
    return { 
        language: 'en', 
        confidence: 0.7, 
        method: 'default' 
    };
}

/**
 * ENHANCED: Transcribe with automatic language detection
 * Detects Tamil vs English and uses appropriate Whisper language hint
 * @param {string} recordingUrl - URL of the Twilio recording
 * @returns {Promise<Object>} - { text: string, language: string, confidence: number }
 */
async function transcribeAudioWithLanguageDetection(recordingUrl) {
    try {
        console.log('[Transcription] Downloading audio from:', recordingUrl);

        const audioUrl = recordingUrl + '.mp3';
        let response;
        let retries = 3;
        
        for (let i = 0; i < retries; i++) {
            try {
                response = await axios({
                    method: 'get',
                    url: audioUrl,
                    responseType: 'stream',
                    auth: {
                        username: process.env.TWILIO_ACCOUNT_SID,
                        password: process.env.TWILIO_AUTH_TOKEN
                    }
                });
                console.log('[Transcription] Audio downloaded successfully');
                break;
            } catch (err) {
                if (err.response?.status === 404 && i < retries - 1) {
                    console.log(`[Transcription] Recording not ready, retrying in ${(i + 1) * 2}s...`);
                    await new Promise(resolve => setTimeout(resolve, (i + 1) * 2000));
                } else {
                    throw err;
                }
            }
        }
        
        if (!response) {
            throw new Error('Failed to download recording after retries');
        }

        const tempFilePath = path.join(os.tmpdir(), `recording_${Date.now()}.wav`);
        const writer = fs.createWriteStream(tempFilePath);
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        console.log('[Transcription] Audio saved to:', tempFilePath);

        // STEP 1: First transcription to detect language
        let initialTranscription;
        try {
            console.log('[Transcription] Step 1: Initial transcription for language detection...');
            initialTranscription = await openai.audio.transcriptions.create({
                file: fs.createReadStream(tempFilePath),
                model: "whisper-1",
            });
            console.log('[Transcription] Initial text:', initialTranscription.text);
        } catch (apiError) {
            console.error('[Transcription] Failed:', apiError.message);
            fs.unlinkSync(tempFilePath);
            return { text: 'Unable to transcribe response', language: 'unknown', confidence: 0 };
        }

        // STEP 2: Detect language from transcription
        const langDetection = await detectLanguage(initialTranscription.text);
        console.log(`[Transcription] Step 2: Language detected as ${langDetection.language.toUpperCase()} (${(langDetection.confidence * 100).toFixed(0)}% confidence)`);

        // STEP 3: Re-transcribe with language hint for better accuracy (Tamil only)
        let finalText = initialTranscription.text;
        if (langDetection.language === 'ta' && langDetection.confidence > 0.5) {
            try {
                console.log('[Transcription] Step 3: Re-transcribing with Tamil language hint...');
                const tamilTranscription = await openai.audio.transcriptions.create({
                    file: fs.createReadStream(tempFilePath),
                    model: "whisper-1",
                    language: "ta" // Tamil language hint for better accuracy
                });
                finalText = tamilTranscription.text;
                console.log('[Transcription] ✓ Tamil-optimized text:', finalText);
            } catch (error) {
                console.warn('[Transcription] Tamil re-transcription failed, using initial result');
            }
        }

        // Clean up temp file
        fs.unlinkSync(tempFilePath);

        return {
            text: finalText || 'Unable to transcribe response',
            language: langDetection.language,
            confidence: langDetection.confidence
        };

    } catch (error) {
        console.error('[Transcription] Error:', error.message);
        return { text: 'Unable to transcribe response', language: 'unknown', confidence: 0 };
    }
}

/**
 * ENHANCED: Generate AI response with language-aware analysis
 * @param {string} recordingUrl - URL of the recording
 * @returns {Promise<Object>} - Response with language info
 */
async function generateAIResponseWithLanguageDetection(recordingUrl) {
    try {
        // Transcribe with language detection
        const transcriptionResult = await transcribeAudioWithLanguageDetection(recordingUrl);

        if (!transcriptionResult.text || transcriptionResult.text === 'Unable to transcribe response') {
            console.warn('[AI Analysis] Transcription failed');
            return {
                fullResponse: "Could not understand response (transcription failed)",
                transcription: "Unable to transcribe",
                confirmationStatus: "unclear",
                detectedLanguage: "unknown",
                confidence: 0
            };
        }

        console.log('[AI Analysis] Analyzing:', transcriptionResult.text);
        console.log('[AI Analysis] Language:', transcriptionResult.language);

        // Language-specific analysis prompts
        const isTamil = transcriptionResult.language === 'ta';
        const systemPrompt = isTamil
            ? "You are analyzing a Tamil patient's response to an appointment reminder. Reply ONLY with: CONFIRMED, REJECTED, or UNCLEAR."
            : "You are analyzing a patient's response to an appointment reminder. Reply ONLY with: CONFIRMED, REJECTED, or UNCLEAR.";

        // Analyze with GPT
        let completion;
        let retryCount = 0;
        const maxRetries = 2;

        while (retryCount < maxRetries) {
            try {
                completion = await openai.chat.completions.create({
                    messages: [
                        { role: "system", content: systemPrompt },
                        {
                            role: "user",
                            content: `Patient said: "${transcriptionResult.text}". Did they confirm or reject the appointment?`
                        }
                    ],
                    model: "gpt-3.5-turbo",
                    max_tokens: 10
                });
                break;
            } catch (apiError) {
                retryCount++;
                console.error(`[AI Analysis] Attempt ${retryCount} failed:`, apiError.message);
                
                if (retryCount >= maxRetries) {
                    console.warn('[AI Analysis] Using keyword fallback');
                    return analyzeWithKeywordsMultilingual(
                        transcriptionResult.text, 
                        transcriptionResult.language
                    );
                }
                await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
            }
        }

        const aiStatus = completion.choices[0].message.content.trim().toUpperCase();
        let confirmationStatus = 'unclear';
        
        if (aiStatus.includes('CONFIRMED')) confirmationStatus = 'confirmed';
        else if (aiStatus.includes('REJECTED')) confirmationStatus = 'rejected';

        console.log('[AI Analysis] Result:', confirmationStatus);

        return {
            fullResponse: transcriptionResult.text,
            transcription: transcriptionResult.text,
            confirmationStatus: confirmationStatus,
            detectedLanguage: transcriptionResult.language,
            languageConfidence: transcriptionResult.confidence
        };

    } catch (error) {
        console.error('[AI Analysis] Error:', error.message);
        return {
            fullResponse: 'Error processing response',
            transcription: 'Error',
            confirmationStatus: 'unclear',
            detectedLanguage: 'unknown',
            confidence: 0
        };
    }
}

/**
 * ENHANCED: Multilingual keyword analysis (Tamil + English)
 * @param {string} text - Transcribed text
 * @param {string} language - Detected language ('ta' or 'en')
 * @returns {Object} - Analysis result
 */
function analyzeWithKeywordsMultilingual(text, language = 'en') {
    const lowerText = text.toLowerCase();
    
    // English keywords
    const confirmKeywordsEN = ['yes', 'yeah', 'sure', 'okay', 'ok', 'will attend', 'confirm', 'definitely', 'absolutely'];
    const rejectKeywordsEN = ['no', 'not', 'cannot', 'can\'t', 'won\'t', 'unable', 'busy', 'unavailable'];
    
    // Tamil keywords (both Tamil script and transliteration)
    const confirmKeywordsTamil = ['ஆம்', 'சரி', 'வருகிறேன்', 'வரேன்', 'okay', 'ok'];
    const rejectKeywordsTamil = ['இல்லை', 'வர முடியாது', 'முடியாது', 'no', 'இல்ல'];
    
    // Combine based on detected language
    let confirmKeywords = confirmKeywordsEN;
    let rejectKeywords = rejectKeywordsEN;
    
    if (language === 'ta') {
        confirmKeywords = [...confirmKeywordsEN, ...confirmKeywordsTamil];
        rejectKeywords = [...rejectKeywordsEN, ...rejectKeywordsTamil];
    }
    
    const hasConfirm = confirmKeywords.some(keyword => lowerText.includes(keyword));
    const hasReject = rejectKeywords.some(keyword => lowerText.includes(keyword));
    
    let status = 'unclear';
    if (hasConfirm && !hasReject) status = 'confirmed';
    else if (hasReject && !hasConfirm) status = 'rejected';
    
    console.log(`[Keyword Analysis] Language: ${language}, Status: ${status}`);
    
    return {
        fullResponse: text + ' (keyword analysis)',
        transcription: text,
        confirmationStatus: status,
        detectedLanguage: language,
        languageConfidence: 0.8
    };
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

    // Use custom reminder message if available
    if (testInfo.reminderMessage && testInfo.reminderMessage.trim()) {
        return `Hello ${patient.name}, ${testInfo.reminderMessage.trim()}`;
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

/**
 * Generate Tamil reminder message
 * @param {Object} patient
 * @returns {string}
 */
function generateReminderMessageTamil(patient) {
    const testInfo = patient.upcomingTests && patient.upcomingTests.length > 0
        ? patient.upcomingTests[0]
        : null;

    if (!testInfo) {
        return `வணக்கம், இது உங்கள் சுகாதார நினைவூட்டல். உங்கள் வரவிருக்கும் மருத்துவ சந்திப்பிற்கு வருகையை உறுதிப்படுத்தவும்.`;
    }

    // Use custom reminder message if available
    if (testInfo.reminderMessage && testInfo.reminderMessage.trim()) {
        return `வணக்கம், ${testInfo.reminderMessage.trim()}`;
    }

    const testDate = new Date(testInfo.testDate);
    const day = testDate.getDate();
    const month = testDate.toLocaleDateString('ta-IN', { month: 'long' });
    const year = testDate.getFullYear();
    
    // Convert test name to Tamil or use Tamil description
    const testTypeMap = {
        'lab': 'இரத்த பரிசோதனை',
        'Lab Test': 'இரத்த பரிசோதனை',
        'vaccination': 'தடுப்பூசி',
        'Vaccination': 'தடுப்பூசி',
        'checkup': 'மருத்துவ பரிசோதனை',
        'Checkup': 'மருத்துவ பரிசோதனை',
        'ultrasound': 'அல்ட்ராசவுண்ட் ஸ்கேன்',
        'Ultrasound': 'அல்ட்ராசவுண்ட் ஸ்கேன்',
        'Blood Test': 'இரத்த பரிசோதனை',
        'Urine Test': 'சிறுநீர் பரிசோதனை',
        'Glucose Test': 'சர்க்கரை பரிசோதனை',
        'BP Check': 'இரத்த அழுத்த பரிசோதனை'
    };

    const tamilTestName = testTypeMap[testInfo.testName] || testTypeMap[testInfo.testType] || 'மருத்துவ பரிசோதனை';

    return `வணக்கம், இது உங்கள் சுகாதார நினைவூட்டல். உங்கள் ${tamilTestName} ${month} மாதம் ${day} ஆம் தேதி திட்டமிடப்பட்டுள்ளது. தயவுசெய்து ஒன் அழுத்தி வருகையை உறுதிப்படுத்தவும். நீங்கள் வர முடியாவிட்டால் டூ அழுத்தவும். நன்றி.`;
}

module.exports = {
    transcribeAudio,
    generateAIResponse,
    generateReminderMessage,
    generateReminderMessageTamil,
    analyzeWithKeywords,
    ensureReminderAudio,
    getReminderAudioEntry,
    deleteReminderAudioEntry,
    createFreeTamilSpeech,
    createFreeEnglishSpeech,
    
    // Language auto-detection functions
    detectLanguage,
    transcribeAudioWithLanguageDetection,
    generateAIResponseWithLanguageDetection,
    analyzeWithKeywordsMultilingual
};
