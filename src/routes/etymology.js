const express = require('express');
const EtymologyController = require('../controllers/etymologyController');
const { validateRequest, schemas } = require('../validations');
const { authenticateToken, requireAdmin, optionalAuth } = require('../middlewares/auth');
const { auditLog } = require('../middlewares/auth');

const router = express.Router();

// Get etymology for a specific word
router.get('/word/:wordId',
  optionalAuth,
  EtymologyController.getEtymologyByWordId
);

// Get all etymology entries with pagination
router.get('/',
  validateRequest(schemas.pagination, 'query'),
  optionalAuth,
  EtymologyController.getAllEtymology
);

// Get etymology by ID
router.get('/:id',
  EtymologyController.getEtymologyById
);

// Create new etymology entry (admin only)
router.post('/',
  authenticateToken,
  requireAdmin,
  validateRequest(schemas.createEtymology),
  auditLog,
  EtymologyController.createEtymology
);

// Update etymology entry (admin only)
router.put('/:id',
  authenticateToken,
  requireAdmin,
  validateRequest(schemas.updateEtymology),
  auditLog,
  EtymologyController.updateEtymology
);

// Delete etymology entry (admin only)
router.delete('/:id',
  authenticateToken,
  requireAdmin,
  auditLog,
  EtymologyController.deleteEtymology
);

// Get etymology statistics
router.get('/stats/overview',
  EtymologyController.getEtymologyStats
);

module.exports = router;
