const mongoose = require('mongoose');

const scheduledCallSchema = new mongoose.Schema({
    phone: {
        type: String,
        required: true,
        trim: true,
        index: true
    },
    patientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Patient',
        required: true,
        index: true
    },
    language: {
        type: String,
        default: 'english',
        enum: ['english', 'urdu', 'punjabi', 'en', 'ta', 'ta-in', 'tamil']
    },
    customMessage: {
        type: String,
        trim: true
    },
    testInfo: {
        _id: mongoose.Schema.Types.ObjectId,
        testName: String,
        testDate: Date,
        testType: String,
        reminderMessage: String,
        type: String,
        name: String,
        date: Date
    },
    scheduledDateTime: {
        type: Date,
        required: true,
        index: true
    },
    status: {
        type: String,
        enum: ['pending', 'in-progress', 'executed', 'completed', 'failed', 'cancelled'],
        default: 'pending',
        index: true
    },
    executedAt: {
        type: Date
    },
    completedAt: {
        type: Date
    },
    callSid: {
        type: String,
        trim: true
    },
    callDuration: {
        type: Number // in seconds
    },
    callStatus: {
        type: String,
        enum: ['queued', 'ringing', 'in-progress', 'completed', 'busy', 'failed', 'no-answer', 'canceled']
    },
    error: {
        type: String
    },
    errorMessage: {
        type: String
    },
    retryCount: {
        type: Number,
        default: 0
    },
    notes: {
        type: String
    }
}, {
    timestamps: true
});

// Indexes for efficient querying
scheduledCallSchema.index({ scheduledDateTime: 1, status: 1 });
scheduledCallSchema.index({ patientId: 1, scheduledDateTime: -1 });
scheduledCallSchema.index({ status: 1, scheduledDateTime: 1 });

// Virtual for checking if call is overdue
scheduledCallSchema.virtual('isOverdue').get(function() {
    return this.status === 'pending' && this.scheduledDateTime < new Date();
});

// Method to mark call as in-progress
scheduledCallSchema.methods.markInProgress = function(callSid) {
    this.status = 'in-progress';
    this.callSid = callSid;
    this.executedAt = new Date();
    return this.save();
};

// Method to mark call as completed
scheduledCallSchema.methods.markCompleted = function(callSid, duration) {
    this.status = 'completed';
    this.callSid = callSid || this.callSid;
    this.callDuration = duration;
    this.completedAt = new Date();
    return this.save();
};

// Method to mark call as failed
scheduledCallSchema.methods.markFailed = function(errorMessage) {
    this.status = 'failed';
    this.errorMessage = errorMessage;
    this.error = errorMessage;
    this.completedAt = new Date();
    this.retryCount += 1;
    return this.save();
};

// Method to cancel scheduled call
scheduledCallSchema.methods.cancel = function(reason) {
    this.status = 'cancelled';
    this.notes = reason || this.notes;
    this.completedAt = new Date();
    return this.save();
};

// Static method to get pending calls that are due
scheduledCallSchema.statics.getDueCalls = function() {
    return this.find({
        status: 'pending',
        scheduledDateTime: { $lte: new Date() }
    }).populate('patientId').sort({ scheduledDateTime: 1 });
};

// Static method to get upcoming calls for a patient
scheduledCallSchema.statics.getPatientUpcomingCalls = function(patientId) {
    return this.find({
        patientId,
        status: { $in: ['pending', 'in-progress'] },
        scheduledDateTime: { $gte: new Date() }
    }).sort({ scheduledDateTime: 1 });
};

// Static method to get all scheduled calls with filters
scheduledCallSchema.statics.getScheduledCalls = function(filters = {}) {
    const query = {};
    
    if (filters.status) query.status = filters.status;
    if (filters.patientId) query.patientId = filters.patientId;
    if (filters.startDate && filters.endDate) {
        query.scheduledDateTime = { 
            $gte: new Date(filters.startDate), 
            $lte: new Date(filters.endDate) 
        };
    }
    
    return this.find(query)
        .populate('patientId')
        .sort({ scheduledDateTime: -1 });
};

module.exports = mongoose.model('ScheduledCall', scheduledCallSchema);
