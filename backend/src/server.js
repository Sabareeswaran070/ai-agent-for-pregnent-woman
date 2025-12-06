// ---------------------------
// IMPORTS
// ---------------------------
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, '..', '.env') });
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const voiceController = require("./controllers/voiceController");
const mongoose = require("mongoose");
const Patient = require("./models/Patient");

// ---------------------------
// INITIAL SETUP
// ---------------------------
const app = express();
app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// ---------------------------
// MONGODB CONNECTION
// ---------------------------
mongoose
    .connect(process.env.MONGO_URI)
    .then(() => {
        console.log("✅ MongoDB Connected Successfully");
        console.log("📊 Database: MongoDB Atlas");
    })
    .catch((err) => {
        console.error("❌ MongoDB Connection Error:", err.message);
        console.error("⚠️  Please check your MONGO_URI in .env file");
        process.exit(1);
    });




// ----------------------------------------------------------
// 🏥 PATIENT MANAGEMENT ENDPOINTS
// ----------------------------------------------------------

// Create new patient
app.post("/patients", async (req, res) => {
    try {
        const newPatient = new Patient(req.body);
        await newPatient.save();
        console.log("Patient added:", newPatient.name);
        res.json({ status: "success", patient: newPatient });
    } catch (err) {
        console.error("Error creating patient:", err);
        res.status(400).json({ status: "error", message: err.message });
    }
});

const CallResponse = require("./models/CallResponse");

// Get all patients
app.get("/patients", async (req, res) => {
    try {
        const patients = await Patient.find().sort({ createdAt: -1 });

        // Fetch latest call for each patient
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
        console.error("Error fetching patients:", err);
        res.status(500).json({ status: "error", message: err.message });
    }
});

// Get single patient
app.get("/patients/:id", async (req, res) => {
    try {
        const patient = await Patient.findById(req.params.id);
        if (!patient) {
            return res.status(404).json({ status: "error", message: "Patient not found" });
        }
        res.json({ status: "success", patient });
    } catch (err) {
        console.error("Error fetching patient:", err);
        res.status(500).json({ status: "error", message: err.message });
    }
});

// Update patient
app.put("/patients/:id", async (req, res) => {
    try {
        const patient = await Patient.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );
        if (!patient) {
            return res.status(404).json({ status: "error", message: "Patient not found" });
        }
        res.json({ status: "success", patient });
    } catch (err) {
        console.error("Error updating patient:", err);
        res.status(400).json({ status: "error", message: err.message });
    }
});

// Delete patient
app.delete("/patients/:id", async (req, res) => {
    try {
        const patient = await Patient.findByIdAndDelete(req.params.id);
        if (!patient) {
            return res.status(404).json({ status: "error", message: "Patient not found" });
        }
        res.json({ status: "success", message: "Patient deleted" });
    } catch (err) {
        console.error("Error deleting patient:", err);
        res.status(500).json({ status: "error", message: err.message });
    }
});


// ----------------------------------------------------------
// 📞 CALL MANAGEMENT ENDPOINTS
// ----------------------------------------------------------

// 1️⃣ Trigger call
app.post("/call", voiceController.triggerCall);

// 2️⃣ Voice Webhook
app.post("/voice", voiceController.handleVoiceWebhook);
app.get("/voice", voiceController.handleVoiceWebhook);

// 3️⃣ Serve Audio
app.get("/reminder-audio/:callKey", voiceController.serveReminderAudio);

// 4️⃣ Process Recording
app.post("/process-recording", voiceController.handleRecordingWebhook);

// 4️⃣-B Process Keypress (NEW - replaces recording)
app.post("/process-keypress", voiceController.handleKeypressWebhook);

// 5️⃣ Call Status
app.post("/call-status", voiceController.handleCallStatusWebhook);

// 6️⃣ Call History
app.get("/call-history", voiceController.getCallHistory);
app.get("/call-history/:phone", voiceController.getPatientCallHistory);


// ----------------------------------------------------------
// 🏠 HEALTH CHECK
// ----------------------------------------------------------
app.get("/", (req, res) => {
    res.json({
        status: "running",
        message: "AI Voice Agent API for Pregnant Women",
        database: "MongoDB Atlas",
        endpoints: {
            patients: "/patients",
            call: "/call",
            callHistory: "/call-history"
        }
    });
});


// ----------------------------------------------------------
// START SERVER
// ----------------------------------------------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(` Make sure to set BASE_URL in .env to your ngrok URL`);
    console.log(`Database: MongoDB Atlas - All data will persist`);
});
