const express = require('express');
const Complaint = require('../models/Complaint');
const router = express.Router();

// GET /api/public/status — Public unauthenticated status aggregates
router.get('/status', async (req, res) => {
  try {
    const totalComplaints = await Complaint.countDocuments();
    const resolvedComplaints = await Complaint.countDocuments({ status: 'resolved' });
    const pendingComplaints = totalComplaints - resolvedComplaints;
    
    const activeByCategory = await Complaint.aggregate([
      { $match: { status: { $ne: 'resolved' } } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    const recentResolved = await Complaint.find({ status: 'resolved' })
      .sort('-resolvedAt')
      .limit(5)
      .select('title category resolvedAt');

    res.json({
      overall: {
        total: totalComplaints,
        resolved: resolvedComplaints,
        pending: pendingComplaints,
        resolutionRate: totalComplaints ? Math.round((resolvedComplaints / totalComplaints) * 100) : 0
      },
      activeByCategory,
      recentResolved
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
