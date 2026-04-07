const express = require('express');
const AnswerController = require('../controllers/answerController');
const { authenticate, optionalAuth } = require('../middlewares');
const { validate, schemas } = require('../validations/schemas');

const router = express.Router();

// ============================================
// Public Routes
// ============================================

/**
 * @route   GET /api/answers/discussion/:discussionId
 * @desc    Get answers for a specific discussion
 * @access  Public (with optional auth)
 */
router.get('/discussion/:discussionId',
  optionalAuth,
  validate(schemas.answer.getByDiscussion, 'params'),
  validate(schemas.answer.listAnswers, 'query'),
  AnswerController.getAnswersForDiscussion
);

// ============================================
// Protected Routes - Authentication Required
// ============================================

/**
 * @route   POST /api/answers
 * @desc    Create a new answer
 * @access  Private
 */
router.post('/',
  authenticate,
  validate(schemas.answer.createAnswer),
  AnswerController.createAnswer
);

/**
 * @route   PUT /api/answers/:id
 * @desc    Update an answer (author only)
 * @access  Private
 */
router.put('/:id',
  authenticate,
  validate(schemas.common.params.id, 'params'),
  validate(schemas.answer.updateAnswer),
  AnswerController.updateAnswer
);

/**
 * @route   DELETE /api/answers/:id
 * @desc    Delete an answer (author or moderator+)
 * @access  Private
 */
router.delete('/:id',
  authenticate,
  validate(schemas.common.params.id, 'params'),
  AnswerController.deleteAnswer
);

/**
 * @route   POST /api/answers/:id/vote
 * @desc    Vote on an answer (upvote/downvote)
 * @access  Private
 */
router.post('/:id/vote',
  authenticate,
  validate(schemas.common.params.id, 'params'),
  validate(schemas.answer.vote),
  AnswerController.voteAnswer
);

/**
 * @route   DELETE /api/answers/:id/vote
 * @desc    Remove vote from an answer
 * @access  Private
 */
router.delete('/:id/vote',
  authenticate,
  validate(schemas.common.params.id, 'params'),
  AnswerController.removeVote
);

/**
 * @route   GET /api/answers/:id/user-vote
 * @desc    Get user's vote on an answer
 * @access  Private
 */
router.get('/:id/user-vote',
  authenticate,
  validate(schemas.common.params.id, 'params'),
  AnswerController.getUserVote
);

module.exports = router;
