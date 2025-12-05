const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    phone: {
        type: String,
        required: true,
        unique: true
    },
    email: {
        type: String,
        required: false
    },
    dueDate: {
        type: Date,
        required: false
    },
    upcomingTests: [{
        testName: String,
        testDate: Date,
        testType: {
            type: String,
            enum: ['lab', 'vaccination', 'checkup', 'ultrasound'],
            default: 'lab'
        }
    }],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Patient', patientSchema);
