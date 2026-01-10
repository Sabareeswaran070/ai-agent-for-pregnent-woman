const path = require("path");
require("dotenv").config({ path: path.join(__dirname, '..', '.env') });

// Import utilities and configuration
const { validateEnv, getConfig } = require("./utils/config");
const logger = require("./utils/logger");

// Validate environment variables before starting
validateEnv();
const config = getConfig();

const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");
const cors = require("cors");
const mongoose = require("mongoose");

// Import middleware
const { errorHandler, notFoundHandler } = require("./middleware/errorHandler");

// Import routes
const patientRoutes = require("./routes/patientRoutes");
const callRoutes = require("./routes/callRoutes");

// INITIAL SETUP
const app = express();

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false, // Disable for Twilio webhooks
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', limiter);

// CORS configuration
app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// HTTP request logging
if (config.nodeEnv === 'development') {
    app.use(morgan('dev'));
} else {
    app.use(morgan('combined', { stream: logger.stream }));
}

// Request logging middleware
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('user-agent')
    });
    next();
});

// MONGODB CONNECTION (skipped in mock/dev mode if no URI)
if (config.mongoUri) {
    mongoose
        .connect(config.mongoUri)
        .then(() => {
            logger.info("✅ MongoDB Connected Successfully");
            logger.info("📊 Database: MongoDB Atlas");
        })
        .catch((err) => {
            logger.error("❌ MongoDB Connection Error:", err.message);
            if (!config.allowMocks) {
                process.exit(1);
            } else {
                logger.warn("⚠️  Continuing in mock mode without database connection");
            }
        });
} else {
    logger.warn("⚠️  No MONGO_URI provided. Running without database (mock mode). Data will not persist.");
}

// Database connection event handlers
mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
    logger.info('MongoDB reconnected');
});

// ----------------------------------------------------------
// API ROUTES
// ----------------------------------------------------------

// Health check endpoint
app.get("/", (req, res) => {
    res.json({
        status: "running",
        service: "Allobot - AI Voice Agent API for Pregnant Women",
        version: "1.0.0",
        environment: config.nodeEnv,
        database: "MongoDB Atlas",
        endpoints: {
            patients: "/api/patients",
            calls: "/api/calls",
            callHistory: "/api/calls/history",
            health: "/health"
        },
        timestamp: new Date().toISOString()
    });
});

// Health check for monitoring
app.get("/health", (req, res) => {
    const healthCheck = {
        status: "healthy",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    };
    res.json(healthCheck);
});

// API routes
app.use("/api/patients", patientRoutes);
app.use("/api/calls", callRoutes);
// SMS is now patient-scoped; no generic messages routes

// Legacy routes for backward compatibility with Twilio webhooks
const voiceController = require("./controllers/voiceController");
app.post("/call", voiceController.triggerCall);
app.post("/voice", voiceController.handleVoiceWebhook);
app.get("/voice", voiceController.handleVoiceWebhook);
app.get("/reminder-audio/:callKey", voiceController.serveReminderAudio);
app.post("/process-recording", voiceController.handleRecordingWebhook);
app.post("/process-keypress", voiceController.handleKeypressWebhook);
app.post("/call-status", voiceController.handleCallStatusWebhook);
app.get("/call-history", voiceController.getCallHistory);
app.get("/call-history/:phone", voiceController.getPatientCallHistory);

// Patients endpoint for backward compatibility
const Patient = require("./models/Patient");
const CallResponse = require("./models/CallResponse");

app.get("/patients", async (req, res) => {
    try {
        const patients = await Patient.find().sort({ createdAt: -1 });
        const patientsWithCallInfo = await Promise.all(patients.map(async (p) => {
            const lastCall = await CallResponse.findOne({ phone: p.phone }).sort({ timestamp: -1 });
            return {
                ...p.toObject(),
                lastCall: lastCall ? {
                    status: lastCall.callStatus,
                    response: lastCall.response,
                    timestamp: lastCall.timestamp
                } : null
            };
        }));
        res.json({ status: "success", patients: patientsWithCallInfo });
    } catch (err) {
        logger.error("Error fetching patients:", err);
        res.status(500).json({ status: "error", message: err.message });
    }
});

app.post("/patients", async (req, res) => {
    try {
        const newPatient = new Patient(req.body);
        await newPatient.save();
        logger.info("Patient added:", newPatient.name);
        res.json({ status: "success", patient: newPatient });
    } catch (err) {
        logger.error("Error creating patient:", err);
        res.status(400).json({ status: "error", message: err.message });
    }
});

// 404 handler - must be after all routes
app.use(notFoundHandler);

// Global error handler - must be last
app.use(errorHandler);

// ----------------------------------------------------------
// START SERVER
// ----------------------------------------------------------
const server = app.listen(config.port, () => {
    logger.info(`🚀 Server running on port ${config.port}`);
    logger.info(`📝 Environment: ${config.nodeEnv}`);
    logger.info(`🌐 BASE_URL: ${config.baseUrl}`);
    logger.info(`📊 Database: MongoDB Atlas`);
    logger.info(`📞 Twilio Phone: ${config.twilio.phone}`);
    logger.info(`✅ All systems operational`);
    
    if (!config.baseUrl || config.baseUrl === 'your_ngrok_url') {
        logger.warn('⚠️  BASE_URL not properly configured. Please set it in .env file with your ngrok URL');
    }
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
    logger.info(`\n${signal} signal received: closing HTTP server gracefully`);
    
    server.close(() => {
        logger.info('HTTP server closed');
        
        // Close database connection
        mongoose.connection.close(false, () => {
            logger.info('MongoDB connection closed');
            process.exit(0);
        });
    });
    
    // Force shutdown after 10 seconds
    setTimeout(() => {
        logger.error('Forced shutdown due to timeout');
        process.exit(1);
    }, 10000);
};

// Listen for termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    gracefulShutdown('UNCAUGHT_EXCEPTION');
});

module.exports = app;
