const mongoose = require('mongoose');

const streamSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    title: {
        type: String,
        required: true
    },
    description: {
        type: String,
        default: ''
    },
    streamKey: {
        type: String,
        required: true,
        unique: true
    },
    status: {
        type: String,
        enum: ['scheduled', 'live', 'ended'],
        default: 'scheduled'
    },
    viewerCount: {
        type: Number,
        default: 0
    },
    startedAt: {
        type: Date
    },
    endedAt: {
        type: Date
    },
    rtmpUrl: {
        type: String,
        required: true
    },
    playbackUrl: {
        type: String
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Stream', streamSchema);