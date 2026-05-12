const express = require('express');
const multer = require('multer');
const FormData = require('form-data');
const axios = require('axios');
const Complaint = require('../models/Complaint');
const { auth, adminOnly } = require('../middleware/auth');
const { classifyComplaint, detectDuplicate } = require('../utils/nlpClient');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB limit

// POST /api/complaints — Submit a new complaint (student)
router.post('/', auth, upload.single('pdfAttachment'), async (req, res) => {
  try {
    const { title } = req.body;
    let description = req.body.description || '';

    if (!title || (!description && !req.file)) {
      return res.status(400).json({ message: 'Title and either description or PDF attachment are required' });
    }

    // If PDF uploaded, extract text via Python service
    if (req.file && req.file.mimetype === 'application/pdf') {
      try {
        const form = new FormData();
        form.append('file', req.file.buffer, req.file.originalname);

        const pdfRes = await axios.post(`${process.env.PYTHON_SERVICE_URL || 'http://localhost:8000'}/parse-pdf`, form, {
          headers: { ...form.getHeaders() }
        });

        if (pdfRes.data.text) {
          description += `\n\n[Extracted from attached PDF]:\n${pdfRes.data.text}`;
        }
      } catch (err) {
        console.error('PDF parsing failed:', err.message);
        // Continue with whatever description was provided manually
      }
    }

    if (!description.trim()) {
      return res.status(400).json({ message: 'Could not extract any text from PDF and no description was provided.' });
    }

    // AI classification
    const classification = await classifyComplaint(description);

    // Create complaint
    const complaint = await Complaint.create({
      title,
      description,
      category: classification.category || 'Uncategorized',
      aiConfidence: classification.confidence || 0,
      sentiment: classification.sentiment || 'Neutral',
      aiReply: classification.reply_message || '',
      slaStatus: 'On-Track',
      submittedBy: req.user._id
    });

    // Duplicate detection (async, don't block response)
    detectDuplicate(description, complaint._id.toString())
      .then(async (dupResult) => {
        if (dupResult.is_duplicate && dupResult.similar_to) {
          complaint.duplicateOf = dupResult.similar_to;
          complaint.priority = Math.min(complaint.priority + 2, 5);
          await complaint.save();
        }
      })
      .catch((err) => console.error('Duplicate check failed:', err.message));

    // Check for frequent similar category complaints — boost priority
    const recentSimilar = await Complaint.countDocuments({
      category: complaint.category,
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    });

    if (recentSimilar > 5) {
      complaint.priority = Math.min(complaint.priority + 1, 5);
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
