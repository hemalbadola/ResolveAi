const express = require('express');
const multer = require('multer');
const FormData = require('form-data');
const axios = require('axios');
const Complaint = require('../models/Complaint');
const { auth, adminOnly } = require('../middleware/auth');
const { classifyComplaint, detectDuplicate } = require('../utils/nlpClient');

const path = require('path');
const fs = require('fs');

// Configuration Constants
const TRENDING_DAYS_THRESHOLD = parseInt(process.env.TRENDING_DAYS_THRESHOLD) || 7;
const TRENDING_COUNT_THRESHOLD = parseInt(process.env.TRENDING_COUNT_THRESHOLD) || 5;

const router = express.Router();

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname.replace(/[^a-zA-Z0-9.]/g, '_'));
  }
});
const upload = multer({ storage: storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

// POST /api/complaints — Submit a new complaint (student)
router.post('/', auth, upload.single('evidenceAttachment'), async (req, res) => {
  try {
    const { title } = req.body;
    let description = req.body.description || '';

    if (!title || !description.trim()) {
      return res.status(400).json({ message: 'Title and detailed description are required for AI categorization.' });
    }

    let evidenceUrl = null;
    if (req.file) {
      evidenceUrl = `/uploads/${req.file.filename}`;
    }

    // AI classification
    const classification = await classifyComplaint(description);
    
    // Determine priority based on AI Sentiment
    let basePriority = 4; // Default Neutral
    if (classification.sentiment === 'Urgent') basePriority = 1;
    else if (classification.sentiment === 'Angry') basePriority = 2;
    else if (classification.sentiment === 'Frustrated') basePriority = 3;

    // Create complaint
    const complaint = await Complaint.create({
      title,
      description,
      category: classification.category || 'Uncategorized',
      aiConfidence: classification.confidence || 0,
      sentiment: classification.sentiment || 'Neutral',
      aiReply: classification.reply_message || '',
      evidenceUrl: evidenceUrl,
      priority: basePriority,
      slaStatus: 'On-Track',
      submittedBy: req.user._id
    });

    // Duplicate detection (async, don't block response)
    detectDuplicate(description, complaint._id.toString())
      .then(async (dupResult) => {
        if (dupResult.is_duplicate && dupResult.similar_to) {
          complaint.duplicateOf = dupResult.similar_to;
          // Duplicate -> lower priority (higher number)
          complaint.priority = Math.min(complaint.priority + 1, 5);
          await complaint.save();
        }
      })
      .catch((err) => console.error('Duplicate check failed:', err.message));

    // Check for frequent similar category complaints — boost priority
    const recentSimilar = await Complaint.countDocuments({
      category: complaint.category,
      createdAt: { $gte: new Date(Date.now() - TRENDING_DAYS_THRESHOLD * 24 * 60 * 60 * 1000) }
    });

    if (recentSimilar > TRENDING_COUNT_THRESHOLD) {
      // Trending issue -> boost priority (lower number)
      complaint.priority = Math.max(complaint.priority - 1, 1);
      await complaint.save();
    }

    // Populate before sending event
    const populatedComplaint = await complaint.populate('submittedBy', 'name email');

    // Emit real-time event to admin dashboard
    const io = req.app.get('io');
    if (io) {
      io.emit('new_complaint', populatedComplaint);
    }

    res.status(201).json({
      message: 'Complaint submitted successfully',
      complaint: populatedComplaint
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/complaints — Get complaints (students: own, admins: all)
router.get('/', auth, async (req, res) => {
  try {
    const { status, category, page = 1, limit = 20, sort = '-createdAt' } = req.query;

    const filter = {};
    if (req.user.role === 'student') {
      filter.submittedBy = req.user._id;
    }
    if (status) filter.status = status;
    if (category) filter.category = category;

    const complaints = await Complaint.find(filter)
      .populate('submittedBy', 'name email')
      .populate('duplicateOf', 'title')
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Complaint.countDocuments(filter);

    res.json({
      complaints,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/complaints/:id — Get single complaint
router.get('/:id', auth, async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id)
      .populate('submittedBy', 'name email')
      .populate('duplicateOf', 'title description category');

    if (!complaint) {
      return res.status(404).json({ message: 'Complaint not found' });
    }

    // Students can only view their own complaints
    if (req.user.role === 'student' && complaint.submittedBy._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json({ complaint });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PATCH /api/complaints/:id/status — Update status (admin only)
router.patch('/:id/status', auth, adminOnly, async (req, res) => {
  try {
    const { status, adminNotes } = req.body;

    const updateData = { status };
    if (adminNotes) updateData.adminNotes = adminNotes;
    if (status === 'resolved') updateData.resolvedAt = new Date();

    const complaint = await Complaint.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('submittedBy', 'name email');

    if (!complaint) {
      return res.status(404).json({ message: 'Complaint not found' });
    }

    // Emit real-time event
    const io = req.app.get('io');
    if (io) {
      io.emit('complaint_updated', complaint);
    }

    res.json({ message: 'Status updated', complaint });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
