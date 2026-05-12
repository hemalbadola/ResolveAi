const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    minlength: 5,
    maxlength: 200
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
    minlength: 10,
    maxlength: 2000
  },
  category: {
    type: String,
    enum: ['Academic', 'Technical', 'Hostel', 'Infrastructure', 'Administrative', 'Uncategorized'],
    default: 'Uncategorized'
  },
  priority: {
    type: Number,
    min: 1,
    max: 5,
    default: 1
  },
  status: {
    type: String,
    enum: ['pending', 'in-progress', 'resolved', 'rejected'],
    default: 'pending'
  },
  submittedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  duplicateOf: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Complaint',
    default: null
  },
  aiConfidence: {
    type: Number,
    min: 0,
    max: 100,
    default: null
  },
  sentiment: {
    type: String,
    enum: ['Neutral', 'Frustrated', 'Urgent', 'Positive'],
    default: 'Neutral'
  },
  slaStatus: {
    type: String,
    enum: ['On-Track', 'At-Risk', 'Breached'],
    default: 'On-Track'
  },
  adminNotes: {
    type: String,
    default: ''
  },
  aiReply: {
    type: String,
    default: ''
  },
  resolvedAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

complaintSchema.index({ category: 1, status: 1 });
complaintSchema.index({ submittedBy: 1 });
complaintSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Complaint', complaintSchema);
