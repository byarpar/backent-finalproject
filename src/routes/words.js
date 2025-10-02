const express = require('express');
const WordController = require('../controllers/wordController');
const { validateRequest, schemas } = require('../validations');
const { authenticateToken, requireRole } = require('../middlewares/auth');

const router = express.Router();

// Get all words with pagination and filtering
router.get('/',
  authenticateToken,
  WordController.getAllWords
);

// Get trending words
router.get('/trending/list',
  WordController.getTrendingWords
);

// Get word by ID
router.get('/:id',
  WordController.getWordById
);

// Create new word (admin only)
router.post('/',
  authenticateToken,
  requireRole('admin'),
  validateRequest(schemas.createWord),
  WordController.createWord
);

// Update word (admin only)
router.put('/:id',
  authenticateToken,
  requireRole('admin'),
  validateRequest(schemas.updateWord),
  WordController.updateWord
);

// Delete word (admin only)
router.delete('/:id',
  authenticateToken,
  requireRole('admin'),
  WordController.deleteWord
);

// Get similar words
router.get('/:id/similar',
  WordController.getSimilarWords
);

// Add word to favorites (authenticated users)
router.post('/:id/favorite',
  authenticateToken,
  WordController.addToFavorites
);

// Remove word from favorites (authenticated users)
router.delete('/:id/favorite',
  authenticateToken,
  WordController.removeFromFavorites
);

// Get user's favorite words (authenticated users)
router.get('/favorites/list',
  authenticateToken,
  WordController.getFavoriteWords
);

module.exports = router;
