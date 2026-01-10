const mongoose = require('mongoose');

const textMessageSchema = new mongoose.Schema({
    phone: {
        type: String,
        required: true
    },
    patientName: {
        type: String,
        required: false
    },
    body: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['queued', 'sent', 'delivered', 'failed'],
        default: 'queued'
    },
    error: {
        type: String,
        required: false
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    messageSid: {
        type: String,
        required: false,
        unique: true
    }
});

module.exports = mongoose.model('TextMessage', textMessageSchema);
