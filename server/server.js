const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const connectDB = require('./config/db');
const http = require('http');
const { Server } = require('socket.io');
const authRoutes = require('./routes/auth');
const complaintRoutes = require('./routes/complaints');
const adminRoutes = require('./routes/admin');
const publicRoutes = require('./routes/public');
const { auth, adminOnly } = require('./middleware/auth');
const Complaint = require('./models/Complaint');
const { checkHealth } = require('./utils/nlpClient');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, '..', 'public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/public', publicRoutes);

// WebSocket for real-time dashboard updates
io.on('connection', (socket) => {
  console.log('Admin dashboard connected to real-time feed');
  socket.on('disconnect', () => {
    console.log('Admin disconnected');
  });
});

// Pass socket.io to routes so they can emit events
app.set('io', io);

// Health check
app.get('/api/health', async (req, res) => {
  const nlpStatus = await checkHealth();
  res.json({
    status: 'ok',
    server: 'Node.js/Express',
    nlpService: nlpStatus,
    timestamp: new Date().toISOString()
  });
});

// Root route
app.get('/', (req, res) => {
  res.send('AI Complaint System API is running');
});

// SLA Tracking Background Job (runs every minute in dev)
setInterval(async () => {
  try {
    const activeComplaints = await Complaint.find({ status: { $in: ['pending', 'in-progress'] } });
    const now = new Date();
    
    for (const c of activeComplaints) {
      const hoursAlive = (now - new Date(c.createdAt)) / (1000 * 60 * 60);
      let newSla = c.slaStatus;
      
      // Basic SLA logic based on priority (lower priority number = more urgent)
      // P1: Breach at 4h. P2: Breach at 8h. P3: Breach at 24h.
      const slas = { 1: 4, 2: 8, 3: 24 };
      const maxHours = slas[c.priority] || 48;
      
      if (hoursAlive >= maxHours) {
        newSla = 'Breached';
      } else if (hoursAlive >= maxHours * 0.75) {
        newSla = 'At-Risk';
      }
      
      if (newSla !== c.slaStatus) {
        c.slaStatus = newSla;
        await c.save();
        io.emit('complaint_updated', c);
      }
    }
  } catch (error) {
    console.error('SLA CRON Error:', error);
  }
}, 60 * 1000);

// SPA fallback — serve index.html for non-API routes
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  } else {
    next();
  }
});

// Start server
const PORT = process.env.PORT || 3000;

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`NLP service expected at ${process.env.PYTHON_SERVICE_URL || 'http://localhost:8000'}`);
  });
});

module.exports = app;
