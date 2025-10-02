const express = require('express');
const multer = require('multer');
const path = require('path');
const DiscussionController = require('../controllers/discussionController');
const { authenticateToken, optionalAuth } = require('../middlewares/auth');

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

// Get all discussions with pagination and filtering
router.get('/',
  optionalAuth,
  DiscussionController.getAllDiscussions
);

// Get discussion categories
router.get('/categories',
  DiscussionController.getCategories
);



// Get discussion by ID
router.get('/:id',
  optionalAuth,
  DiscussionController.getDiscussionById
);

// Create new discussion (authenticated users only)
router.post('/',
  authenticateToken,
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
  DiscussionController.createDiscussion
);

// Update discussion (author or admin only)
router.put('/:id',
  authenticateToken,
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

// Delete discussion (author or admin only)
router.delete('/:id',
  authenticateToken,
  DiscussionController.deleteDiscussion
);

// Save/Unsave discussion (authenticated users only)
router.post('/:id/save',
  authenticateToken,
  DiscussionController.saveDiscussion
);

router.delete('/:id/save',
  authenticateToken,
  DiscussionController.unsaveDiscussion
);

// Share discussion (track sharing activity)
router.post('/:id/share',
  optionalAuth, // Optional auth since sharing can be done by anonymous users
  DiscussionController.shareDiscussion
);

// Like/Unlike discussion (authenticated users only)
router.post('/:id/like',
  authenticateToken,
  DiscussionController.likeDiscussion
);

router.delete('/:id/like',
  authenticateToken,
  DiscussionController.unlikeDiscussion
);

// Get saved discussions for user
router.get('/user/saved',
  authenticateToken,
  DiscussionController.getSavedDiscussions
);

// Get liked discussions for user
router.get('/user/liked',
  authenticateToken,
  DiscussionController.getLikedDiscussions
);

module.exports = router;
