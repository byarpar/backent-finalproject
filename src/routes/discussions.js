const express = require('express');
const multer = require('multer');
const path = require('path');
const DiscussionController = require('../controllers/discussionController');
const { authenticate, optionalAuth } = require('../middlewares');
const { validate, schemas } = require('../validations/schemas');

const router = express.Router();

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/') // Make sure this directory exists
  },
  filename: function (req, file, cb) {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'image-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  // Accept images only
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 5 // Maximum 5 files
  }
});

// ============================================
// Public Routes
// ============================================

/**
 * @route   GET /api/discussions
 * @desc    Get all discussions with pagination and filtering
 * @access  Public (with optional auth for personalization)
 */
router.get('/',
  optionalAuth,
  validate(schemas.discussion.listDiscussions, 'query'),
  DiscussionController.getAllDiscussions
);

/**
 * @route   GET /api/discussions/categories
 * @desc    Get discussion categories
 * @access  Public
 */
router.get('/categories',
  DiscussionController.getCategories
);

// ============================================
// Protected Routes - Authentication Required
// ============================================

/**
 * @route   GET /api/discussions/user/saved
 * @desc    Get saved discussions for current user
 * @access  Private
 */
router.get('/user/saved',
  authenticate,
  DiscussionController.getSavedDiscussions
);

/**
 * @route   GET /api/discussions/:id/related
 * @desc    Get related discussions by ID
 * @access  Public (with optional auth)
 */
router.get('/:id/related',
  optionalAuth,
  validate(schemas.common.params.id, 'params'),
  DiscussionController.getRelatedDiscussions
);

/**
 * @route   GET /api/discussions/:id
 * @desc    Get discussion by ID
 * @access  Public (with optional auth)
 */
router.get('/:id',
  optionalAuth,
  validate(schemas.common.params.id, 'params'),
  DiscussionController.getDiscussionById
);

/**
 * @route   POST /api/discussions
 * @desc    Create new discussion (supports JSON with base64 or multipart file upload)
 * @access  Private
 */
router.post('/',
  authenticate,
  (req, res, next) => {
    // Check content-type - if it's JSON, skip multer
    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('application/json')) {
      // JSON request with base64 images - skip multer
      return next();
    }

    // Otherwise, use multer for multipart/form-data
    upload.array('images', 5)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            error: 'File too large',
            details: 'Maximum file size is 5MB'
          });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({
            error: 'Too many files',
            details: 'Maximum 5 files allowed'
          });
        }
        return res.status(400).json({
          error: 'File upload error',
          details: err.message
        });
      } else if (err) {
        return res.status(400).json({
          error: 'Invalid file type',
          details: err.message
        });
      }
      next();
    });
  },
  DiscussionController.createDiscussion
);

/**
 * @route   PUT /api/discussions/:id
 * @desc    Update discussion (author or moderator+)
 * @access  Private
 */
router.put('/:id',
  authenticate,
  validate(schemas.common.params.id, 'params'),
  (req, res, next) => {
    upload.array('images', 5)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            error: 'File too large',
            details: 'Maximum file size is 5MB'
          });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({
            error: 'Too many files',
            details: 'Maximum 5 files allowed'
          });
        }
        return res.status(400).json({
          error: 'File upload error',
          details: err.message
        });
      } else if (err) {
        return res.status(400).json({
          error: 'Invalid file type',
          details: err.message
        });
      }
      next();
    });
  },
  DiscussionController.updateDiscussion
);

/**
 * @route   DELETE /api/discussions/:id
 * @desc    Delete discussion (author or moderator+)
 * @access  Private
 */
router.delete('/:id',
  authenticate,
  validate(schemas.common.params.id, 'params'),
  DiscussionController.deleteDiscussion
);

/**
 * @route   POST /api/discussions/:id/vote
 * @desc    Vote on discussion (upvote/downvote)
 * @access  Private
 */
router.post('/:id/vote',
  authenticate,
  validate(schemas.common.params.id, 'params'),
  validate(schemas.discussion.vote),
  DiscussionController.voteDiscussion
);

/**
 * @route   POST /api/discussions/:id/save
 * @desc    Save/bookmark discussion
 * @access  Private
 */
router.post('/:id/save',
  authenticate,
  validate(schemas.common.params.id, 'params'),
  DiscussionController.saveDiscussion
);

/**
 * @route   DELETE /api/discussions/:id/save
 * @desc    Unsave/unbookmark discussion
 * @access  Private
 */
router.delete('/:id/save',
  authenticate,
  validate(schemas.common.params.id, 'params'),
  DiscussionController.unsaveDiscussion
);

/**
 * @route   POST /api/discussions/:id/report
 * @desc    Report inappropriate discussion
 * @access  Private
 */
router.post('/:id/report',
  authenticate,
  validate(schemas.common.params.id, 'params'),
  validate(schemas.discussion.report),
  DiscussionController.reportDiscussion
);

/**
 * @route   PUT /api/discussions/:id/solve
 * @desc    Mark discussion as solved (author only)
 * @access  Private
 */
router.put('/:id/solve',
  authenticate,
  validate(schemas.common.params.id, 'params'),
  DiscussionController.markAsSolved
);

/**
 * @route   DELETE /api/discussions/:id/solve
 * @desc    Unmark discussion as solved
 * @access  Private
 */
router.delete('/:id/solve',
  authenticate,
  validate(schemas.common.params.id, 'params'),
  DiscussionController.unmarkAsSolved
);

// ============================================
// Moderator/Admin Routes
// ============================================

/**
 * @route   PUT /api/discussions/:id/pin
 * @desc    Pin discussion (moderator+)
 * @access  Moderator+
 */
router.put('/:id/pin',
  authenticate,
  validate(schemas.common.params.id, 'params'),
  DiscussionController.pinDiscussion
);

/**
 * @route   DELETE /api/discussions/:id/pin
 * @desc    Unpin discussion (moderator+)
 * @access  Moderator+
 */
router.delete('/:id/pin',
  authenticate,
  validate(schemas.common.params.id, 'params'),
  DiscussionController.unpinDiscussion
);

/**
 * @route   PUT /api/discussions/:id/lock
 * @desc    Lock discussion (moderator+)
 * @access  Moderator+
 */
router.put('/:id/lock',
  authenticate,
  validate(schemas.common.params.id, 'params'),
  DiscussionController.lockDiscussion
);

/**
 * @route   DELETE /api/discussions/:id/lock
 * @desc    Unlock discussion (moderator+)
 * @access  Moderator+
 */
router.delete('/:id/lock',
  authenticate,
  validate(schemas.common.params.id, 'params'),
  DiscussionController.unlockDiscussion
);

module.exports = router;
