const express = require('express')
const cors = require('cors')
const path = require('path')
const mongoose = require('mongoose')
require('dotenv').config()

const app = express()
app.use(cors())
app.use(express.json())

const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/resolveai'
mongoose.connect(mongoUri, { dbName: 'resolveai' })
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err))

// ─── Status Stages ─────────────────────────────────────────────────────────────
const STATUS_STAGES = [
  'Pending',
  'Under Review',
  'Assigned',
  'In Progress',
  'Awaiting Response',
  'Resolved',
  'Closed',
  'Rejected'
]

// ─── Schemas ────────────────────────────────────────────────────────────────────

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' }
})
const User = mongoose.model('User', userSchema)

const commentSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  username: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], required: true },
  text: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
})

const complaintSchema = new mongoose.Schema({
  complaint_text: { type: String, required: true },
  predicted_category: { type: String, required: true },
  confidence: { type: Number, required: true },
  assigned_department: { type: String, required: true },
  priority: { type: String, enum: ['High', 'Medium', 'Low'], required: true },
  status: { type: String, enum: STATUS_STAGES, default: 'Pending' },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  attachment: {
    url: { type: String },
    fileType: { type: String }
  },
  comments: [commentSchema],
  timestamp: { type: Date, default: Date.now }
})
const Complaint = mongoose.model('Complaint', complaintSchema)

// ─── Routes ─────────────────────────────────────────────────────────────────────

const model = require('./model')
const authRouter = require('./routes/auth')({ User })
const predictRouter = require('./routes/predict')({ model, Complaint })

app.use('/auth', authRouter)
app.use('/predict', predictRouter)

const { authenticate, authorize } = require('./middleware/auth')

// ─── Get Status Stages (for frontend dropdown) ─────────────────────────────────
app.get('/status-stages', (req, res) => {
  res.json(STATUS_STAGES)
})

// ─── Complaints List ────────────────────────────────────────────────────────────
app.get('/complaints', authenticate, async (req, res) => {
  try {
    const { status, priority, department, search } = req.query
    let query = {}
    
    if (req.user.role === 'user') {
      query.user_id = req.user.id
    } else {
      if (status) query.status = status
      if (priority) query.priority = priority
      if (department) query.assigned_department = department
      if (search) {
        query.$or = [
          { complaint_text: { $regex: search, $options: 'i' } },
          { _id: mongoose.isValidObjectId(search) ? search : undefined }
        ].filter(f => f._id !== undefined || f.complaint_text)
      }
    }
    
    const list = await Complaint.find(query).populate('user_id', 'username').sort({ timestamp: -1 })
    res.json(list)
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch complaints' })
  }
})

// ─── Analytics ──────────────────────────────────────────────────────────────────
app.get('/analytics/stats', authenticate, authorize('admin'), async (req, res) => {
  try {
    const total = await Complaint.countDocuments()
    const pending = await Complaint.countDocuments({ status: 'Pending' })
    const underReview = await Complaint.countDocuments({ status: 'Under Review' })
    const assigned = await Complaint.countDocuments({ status: 'Assigned' })
    const inProgress = await Complaint.countDocuments({ status: 'In Progress' })
    const awaitingResponse = await Complaint.countDocuments({ status: 'Awaiting Response' })
    const resolved = await Complaint.countDocuments({ status: 'Resolved' })
    const closed = await Complaint.countDocuments({ status: 'Closed' })
    const rejected = await Complaint.countDocuments({ status: 'Rejected' })
    const highPriority = await Complaint.countDocuments({ priority: 'High' })

    const activeFilter = { status: { $nin: ['Resolved', 'Closed', 'Rejected'] } }

    const deptStats = await Complaint.aggregate([
      { $match: activeFilter },
      { $group: { _id: '$assigned_department', count: { $sum: 1 } } }
    ])

    const categoryStats = await Complaint.aggregate([
      { $match: activeFilter },
      { $group: { _id: '$predicted_category', count: { $sum: 1 } } }
    ])

    const statusStats = await Complaint.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ])

    res.json({
      total,
      pending,
      underReview,
      assigned,
      inProgress,
      awaitingResponse,
      resolved,
      closed,
      rejected,
      highPriority,
      deptStats,
      categoryStats,
      statusStats
    })
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch stats' })
  }
})

// ─── Update Complaint Status / Department ────────────────────────────────────────
app.patch('/complaints/:id/status', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { status, assigned_department } = req.body
    const update = {}
    if (status) {
      if (!STATUS_STAGES.includes(status)) {
        return res.status(400).json({ error: 'Invalid status: ' + status })
      }
      update.status = status
    }
    if (assigned_department) update.assigned_department = assigned_department
    
    const doc = await Complaint.findByIdAndUpdate(req.params.id, update, { new: true })
    if (!doc) return res.status(404).json({ error: 'Complaint not found' })

    res.json(doc)
  } catch (e) {
    res.status(500).json({ error: 'Update failed' })
  }
})

// ─── Comments ───────────────────────────────────────────────────────────────────

// Add comment to a complaint
app.post('/complaints/:id/comments', authenticate, async (req, res) => {
  try {
    const { text } = req.body
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'Comment text is required' })
    }

    const complaint = await Complaint.findById(req.params.id)
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' })

    // Users can only comment on their own complaints
    if (req.user.role === 'user' && complaint.user_id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Cannot comment on others\' complaints' })
    }

    const comment = {
      user_id: req.user.id,
      username: req.user.username || 'Unknown',
      role: req.user.role,
      text: text.trim(),
      timestamp: new Date()
    }

    complaint.comments.push(comment)
    await complaint.save()

    res.status(201).json(comment)
  } catch (e) {
    console.error('Comment error:', e)
    res.status(500).json({ error: 'Failed to add comment' })
  }
})

// Get comments for a complaint
app.get('/complaints/:id/comments', authenticate, async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id)
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' })

    // Users can only see comments on their own complaints
    if (req.user.role === 'user' && complaint.user_id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    res.json(complaint.comments || [])
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch comments' })
  }
})

// ─── Static + Health ────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

app.use(express.static(path.join(__dirname, '..', 'frontend')))
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')))

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'))
})

const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log('Server running at http://localhost:' + port)
})