const express = require('express');
const Complaint = require('../models/Complaint');
const { auth, adminOnly } = require('../middleware/auth');

const router = express.Router();

// GET /api/admin/stats — Dashboard statistics
router.get('/stats', auth, adminOnly, async (req, res) => {
  try {
    const [
      totalComplaints,
      pendingCount,
      inProgressCount,
      resolvedCount,
      rejectedCount,
      categoryStats,
      priorityStats,
      sentimentStats,
      slaStats,
      recentComplaints
    ] = await Promise.all([
      Complaint.countDocuments(),
      Complaint.countDocuments({ status: 'pending' }),
      Complaint.countDocuments({ status: 'in-progress' }),
      Complaint.countDocuments({ status: 'resolved' }),
      Complaint.countDocuments({ status: 'rejected' }),
      Complaint.aggregate([
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      Complaint.aggregate([
        { $group: { _id: '$priority', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      Complaint.aggregate([
        { $group: { _id: '$sentiment', count: { $sum: 1 } } }
      ]),
      Complaint.aggregate([
        { $group: { _id: '$slaStatus', count: { $sum: 1 } } }
      ]),
      Complaint.find()
        .populate('submittedBy', 'name email')
        .sort('-createdAt')
        .limit(10)
    ]);

    res.json({
      total: totalComplaints,
      byStatus: { pending: pendingCount, 'in-progress': inProgressCount, resolved: resolvedCount, rejected: rejectedCount },
      byCategory: categoryStats,
      byPriority: priorityStats,
      bySentiment: sentimentStats,
      bySLA: slaStats,
      recent: recentComplaints
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/admin/analytics — Time-series analytics
router.get('/analytics', auth, adminOnly, async (req, res) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [dailyComplaints, avgResolutionTime, duplicateCount] = await Promise.all([
      Complaint.aggregate([
        { $match: { createdAt: { $gte: thirtyDaysAgo } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      Complaint.aggregate([
        { $match: { status: 'resolved', resolvedAt: { $ne: null } } },
        {
          $project: {
            resolutionTime: { $subtract: ['$resolvedAt', '$createdAt'] }
          }
        },
        {
          $group: {
            _id: null,
            avgTime: { $avg: '$resolutionTime' }
          }
        }
      ]),
      Complaint.countDocuments({ duplicateOf: { $ne: null } })
    ]);

    res.json({
      dailyComplaints,
      avgResolutionTime: avgResolutionTime[0]?.avgTime || 0,
      duplicateCount
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
