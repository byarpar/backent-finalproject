const express = require('express');
const AdminController = require('../controllers/adminController');
const { authenticateToken, requireAdmin, auditLog } = require('../middlewares/auth');

const router = express.Router();

// Get admin dashboard statistics
router.get('/dashboard',
  authenticateToken,
  requireAdmin,
  AdminController.getDashboardStats
);

// Get all users (admin only)
router.get('/users',
  authenticateToken,
  requireAdmin,
  AdminController.getAllUsers
);

// Get all words (admin only)
router.get('/words',
  authenticateToken,
  requireAdmin,
  AdminController.getAllWords
);

// Update user status (admin only)
router.put('/users/:id/status',
  authenticateToken,
  requireAdmin,
  auditLog,
  AdminController.updateUserStatus
);

// Update user role (admin only)
router.put('/users/:id/role',
  authenticateToken,
  requireAdmin,
  auditLog,
  AdminController.updateUserRole
);

// Delete user (admin only)
router.delete('/users/:id',
  authenticateToken,
  requireAdmin,
  auditLog,
  AdminController.deleteUser
);

// Get audit logs (admin only)
router.get('/audit-logs',
  authenticateToken,
  requireAdmin,
  AdminController.getAuditLogs
);

// Advanced admin search
router.post('/search',
  authenticateToken,
  requireAdmin,
  AdminController.adminSearch
);

// Export data (admin only)
router.get('/export/:type',
  authenticateToken,
  requireAdmin,
  AdminController.exportData
);

// Get system health (admin only)
router.get('/health',
  authenticateToken,
  requireAdmin,
  AdminController.getSystemHealth
);

// Bulk operations on words (admin only)
router.post('/words/bulk',
  authenticateToken,
  requireAdmin,
  auditLog,
  AdminController.bulkWords
);

// Import words from Excel (admin only)
router.post('/words/import',
  authenticateToken,
  requireAdmin,
  auditLog,
  AdminController.importWords
);

// Export words to Excel (admin only)
router.get('/words/export',
  authenticateToken,
  requireAdmin,
  AdminController.exportWords
);

module.exports = router;
