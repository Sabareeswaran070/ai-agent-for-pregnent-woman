const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    phone: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    email: {
        type: String,
        required: false,
        trim: true,
        lowercase: true
    },
    dueDate: {
        type: Date,
        required: false
    },
    pregnancyWeek: {
        type: Number,
        required: false,
        min: 1,
        max: 42
    },
    bloodType: {
        type: String,
        enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
        required: false
    },
    address: {
        street: { type: String, trim: true },
        city: { type: String, trim: true },
        state: { type: String, trim: true },
        zipCode: { type: String, trim: true },
        country: { type: String, trim: true, default: 'India' }
    },
    emergencyContact: {
        name: { type: String, trim: true },
        relationship: { type: String, trim: true },
        phone: { type: String, trim: true }
    },
    allergies: [{
        type: String,
        trim: true
    }],
    medicalHistory: [{
        condition: { type: String, required: true, trim: true },
        diagnosedDate: { type: Date },
        notes: { type: String, trim: true }
    }],
    medications: [{
        name: { type: String, required: true, trim: true },
        dosage: { type: String, trim: true },
        frequency: { type: String, trim: true },
        startDate: { type: Date },
        endDate: { type: Date }
    }],
    upcomingTests: [{
        testName: { type: String, trim: true },
        testDate: Date,
        testType: {
            type: String,
            enum: ['lab', 'vaccination', 'checkup', 'ultrasound'],
            default: 'lab'
        },
        status: {
            type: String,
            enum: ['scheduled', 'completed', 'cancelled'],
            default: 'scheduled'
        },
        results: { type: String, trim: true },
        reminderMessage: { type: String, trim: true }
    }],
    notes: [{
        content: { type: String, required: true, trim: true },
        category: {
            type: String,
            enum: ['general', 'medical', 'appointment', 'reminder'],
            default: 'general'
        },
        createdBy: { type: String, trim: true },
        createdAt: { type: Date, default: Date.now }
    }],
    lastVisitDate: {
        type: Date,
        required: false
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'completed'],
        default: 'active'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update the updatedAt timestamp before saving
patientSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Auto-calculate pregnancy week if dueDate is available
patientSchema.virtual('calculatedPregnancyWeek').get(function() {
    if (!this.dueDate) return null;
    const today = new Date();
    const due = new Date(this.dueDate);
    const diffTime = due - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const weeksRemaining = Math.floor(diffDays / 7);
    const currentWeek = 40 - weeksRemaining;
    return currentWeek > 0 && currentWeek <= 42 ? currentWeek : null;
});

// Ensure virtuals are included when converting to JSON
patientSchema.set('toJSON', { virtuals: true });
patientSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Patient', patientSchema);
