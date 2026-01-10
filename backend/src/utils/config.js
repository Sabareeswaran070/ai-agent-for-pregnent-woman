const logger = require('./logger');

/**
 * Validate Required Environment Variables
 */
// Allow mock mode in development to skip strict requirements for Twilio/OpenAI
const allowMocks = (process.env.ALLOW_MOCKS === 'true') || (process.env.NODE_ENV === 'development');

const baseRequiredEnvVars = allowMocks ? [
    'MONGO_URI',
    'PORT'
] : [
    'MONGO_URI',
    'PORT',
    'BASE_URL'
];

const twilioRequiredEnvVars = allowMocks ? [] : [
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'TWILIO_PHONE'
];

const openaiRequiredEnvVars = allowMocks ? [] : [
    'OPENAI_API_KEY'
];

const requiredEnvVars = [
    ...baseRequiredEnvVars,
    ...twilioRequiredEnvVars,
    ...openaiRequiredEnvVars
];

const optionalEnvVars = [
    'NODE_ENV',
    'LOG_LEVEL',
    'DEFAULT_LANGUAGE',
    'ALLOW_MOCKS'
];

/**
 * Validate environment configuration
 */
const validateEnv = () => {
    const missingVars = [];
    const warnings = [];

    // Check required variables
    requiredEnvVars.forEach(varName => {
        if (!process.env[varName]) {
            missingVars.push(varName);
        }
    });

    // Check optional variables
    optionalEnvVars.forEach(varName => {
        if (!process.env[varName]) {
            warnings.push(varName);
        }
    });

    // Report results
    if (missingVars.length > 0) {
        logger.error('❌ Missing required environment variables:', missingVars);
        console.error('\n❌ CONFIGURATION ERROR: Missing required environment variables:');
        missingVars.forEach(varName => {
            console.error(`   - ${varName}`);
        });
        console.error('\nPlease create a .env file in the backend folder with all required variables.');
        console.error('See .env.example for reference.\n');
        process.exit(1);
    }

    if (warnings.length > 0) {
        logger.warn('⚠️  Optional environment variables not set:', warnings);
        warnings.forEach(varName => {
            logger.warn(`   - ${varName} (using default)`);
        });
    }

    // Validate specific formats
    if (process.env.PORT && isNaN(parseInt(process.env.PORT))) {
        logger.error('❌ PORT must be a valid number');
        process.exit(1);
    }

    if (process.env.TWILIO_PHONE && !process.env.TWILIO_PHONE.startsWith('+')) {
        logger.warn('⚠️  TWILIO_PHONE should start with country code (+)');
    }

    logger.info('✅ Environment configuration validated successfully');
    return true;
};

/**
 * Get configuration object
 */
const getConfig = () => {
    return {
        nodeEnv: process.env.NODE_ENV || 'development',
        port: parseInt(process.env.PORT) || 5000,
        mongoUri: process.env.MONGO_URI,
        baseUrl: process.env.BASE_URL,
        twilio: {
            accountSid: process.env.TWILIO_ACCOUNT_SID,
            authToken: process.env.TWILIO_AUTH_TOKEN,
            phone: process.env.TWILIO_PHONE
        },
        openai: {
            apiKey: process.env.OPENAI_API_KEY
        },
        logLevel: process.env.LOG_LEVEL || 'info',
        allowMocks
    };
};

module.exports = {
    validateEnv,
    getConfig
};
