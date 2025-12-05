const mongoose = require('mongoose');

const callResponseSchema = new mongoose.Schema({
    phone: {
        type: String,
        required: true
    },
    patientName: {
        type: String,
        required: false
    },
    response: {
        type: String,
        required: true
    },
    recordingUrl: {
        type: String,
        required: false
    },
    callStatus: {
        type: String,
        enum: ['initiated', 'ringing', 'answered', 'completed', 'failed'],
        default: 'initiated'
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    callSid: {
        type: String,
        required: false,
        unique: true
    }
});

module.exports = mongoose.model('CallResponse', callResponseSchema);
