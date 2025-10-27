/**
 * Discussion Controller v2
 * Professional discussion forum management with service layer integration
 */

const discussionService = require('../services/discussionService');
const { sendSuccess, sendCreated, sendError } = require('../utils/response');
const { asyncHandler } = require('../utils/helpers');
const { HTTP_STATUS } = require('../config/constants');
const logger = require('../utils/logger');
const notificationController = require('./notificationController');

/**
 * @desc    Get all discussions with filters
 * @route   GET /api/discussions
 * @access  Public (with optional auth)
 */
const getAllDiscussions = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    category,
    search,
    sortBy = 'recent',
    author_id,
    filter
  } = req.query;

  const userId = req.user?.id;

  const filters = {
    page: parseInt(page),
    limit: parseInt(limit),
    category,
    search,
    sortBy,
    authorId: author_id,
    filter
  };

  const result = await discussionService.getAllDiscussions(filters, userId);

  sendSuccess(
    res,
    HTTP_STATUS.OK,
    { discussions: result.data },
    'Discussions retrieved successfully',
    { pagination: result.pagination }
  );
});

/**
 * @desc    Get discussion by ID
 * @route   GET /api/discussions/:id
 * @access  Public (with optional auth)
 */
const getDiscussionById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;

  const discussion = await discussionService.getDiscussionById(id, userId);

  sendSuccess(res, HTTP_STATUS.OK, { discussion }, 'Discussion retrieved successfully');
});

/**
 * @desc    Create new discussion
 * @route   POST /api/discussions
 * @access  Private
 */
const createDiscussion = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { title, content, category, tags, images } = req.body;

  const result = await discussionService.createDiscussion(
    { title, content, category, tags, images },
    userId
  );

  const { discussion, author } = result;

  logger.info('Discussion created', {
    discussionId: discussion.id,
    userId,
    category: discussion.category
  });

  sendCreated(res, { discussion }, 'Discussion created successfully');
});

/**
 * @desc    Update discussion
 * @route   PUT /api/discussions/:id
 * @access  Private (Author or Admin)
 */
const updateDiscussion = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;
  const { title, content, category, tags, images } = req.body;

  const discussion = await discussionService.updateDiscussion(
    id,
    { title, content, category, tags, images },
    userId,
    userRole
  );

  logger.info('Discussion updated', { discussionId: id, userId });

  sendSuccess(res, HTTP_STATUS.OK, { discussion }, 'Discussion updated successfully');
});

/**
 * @desc    Delete discussion
 * @route   DELETE /api/discussions/:id
 * @access  Private (Author or Admin)
 */
const deleteDiscussion = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;

  await discussionService.deleteDiscussion(id, userId, userRole);

  logger.info('Discussion deleted', { discussionId: id, userId });

  sendSuccess(res, HTTP_STATUS.OK, null, 'Discussion deleted successfully');
});

/**
 * @desc    Get discussion categories
 * @route   GET /api/discussions/meta/categories
 * @access  Public
 */
const getCategories = asyncHandler(async (req, res) => {
  const categories = await discussionService.getCategoriesWithCounts();

  sendSuccess(res, HTTP_STATUS.OK, { categories });
});

/**
 * @desc    Vote on discussion (upvote/downvote)
 * @route   POST /api/discussions/:id/vote
 * @access  Private
 */
const voteDiscussion = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { vote_type } = req.body;
  const userId = req.user.id;

  const result = await discussionService.voteDiscussion(id, userId, vote_type);

  const { action, voteType, vote_count, upvotes, downvotes, discussion } = result;

  // Create notification for discussion author (if different user and vote was created)
  if (action === 'created' && discussion.author_id !== userId) {
    try {
      const UserRepository = require('../repositories/UserRepository');
      const voter = await UserRepository.findById(userId);
      const voterName = voter.full_name || voter.username;
      const voteMessage = vote_type === 'up' ? 'upvoted your discussion' : 'downvoted your discussion';

      await notificationController.createNotification({
        userId: discussion.author_id,
        type: vote_type,
        category: 'votes',
        actorId: userId,
        actorName: voterName,
        actorAvatar: voter.profile_photo_url,
        message: voteMessage,
        targetTitle: discussion.title,
        targetLink: `/discussions/${id}`
      });

      logger.info('Vote notification created', { discussionAuthorId: discussion.author_id });

      // Emit real-time notification
      const socketService = req.app.get('socketService');
      if (socketService) {
        socketService.emitNotification(discussion.author_id, {
          type: vote_type,
          category: 'votes',
          message: voteMessage,
          targetLink: `/discussions/${id}`,
          actorName: voterName
        });
      }
    } catch (notifError) {
      logger.error('Error creating vote notification', { error: notifError.message });
    }
  }

  sendSuccess(
    res,
    HTTP_STATUS.OK,
    {
      action,
      vote_type: voteType,
      vote_count,
      upvotes,
      downvotes
    },
    `Vote ${action} successfully`
  );
});

/**
 * @desc    Mark discussion as solved
 * @route   POST /api/discussions/:id/solve
 * @access  Private (Author only)
 */
const markAsSolved = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const discussion = await discussionService.markAsSolved(id, userId);

  logger.info('Discussion marked as solved', { discussionId: id, userId });

  sendSuccess(res, HTTP_STATUS.OK, { discussion }, 'Discussion marked as solved');
});

/**
 * @desc    Unmark discussion as solved
 * @route   POST /api/discussions/:id/unsolve
 * @access  Private (Author only)
 */
const unmarkAsSolved = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const discussion = await discussionService.unmarkAsSolved(id, userId);

  logger.info('Discussion unmarked as solved', { discussionId: id, userId });

  sendSuccess(res, HTTP_STATUS.OK, { discussion }, 'Discussion unmarked as solved');
});

/**
 * @desc    Pin discussion
 * @route   POST /api/discussions/:id/pin
 * @access  Admin
 */
const pinDiscussion = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userRole = req.user.role;

  const discussion = await discussionService.pinDiscussion(id, userRole);

  logger.info('Discussion pinned', { discussionId: id, userId: req.user.id });

  sendSuccess(res, HTTP_STATUS.OK, { discussion }, 'Discussion pinned successfully');
});

/**
 * @desc    Unpin discussion
 * @route   POST /api/discussions/:id/unpin
 * @access  Admin
 */
const unpinDiscussion = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userRole = req.user.role;

  const discussion = await discussionService.unpinDiscussion(id, userRole);

  logger.info('Discussion unpinned', { discussionId: id, userId: req.user.id });

  sendSuccess(res, HTTP_STATUS.OK, { discussion }, 'Discussion unpinned successfully');
});

/**
 * @desc    Lock discussion
 * @route   POST /api/discussions/:id/lock
 * @access  Admin
 */
const lockDiscussion = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userRole = req.user.role;

  const discussion = await discussionService.lockDiscussion(id, userRole);

  logger.info('Discussion locked', { discussionId: id, userId: req.user.id });

  sendSuccess(res, HTTP_STATUS.OK, { discussion }, 'Discussion locked successfully');
});

/**
 * @desc    Unlock discussion
 * @route   POST /api/discussions/:id/unlock
 * @access  Admin
 */
const unlockDiscussion = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userRole = req.user.role;

  const discussion = await discussionService.unlockDiscussion(id, userRole);

  logger.info('Discussion unlocked', { discussionId: id, userId: req.user.id });

  sendSuccess(res, HTTP_STATUS.OK, { discussion }, 'Discussion unlocked successfully');
});

/**
 * @desc    Save discussion (bookmark)
 * @route   POST /api/discussions/:id/save
 * @access  Private
 */
const saveDiscussion = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  await discussionService.saveDiscussion(id, userId);

  logger.info('Discussion saved', { discussionId: id, userId });

  sendSuccess(res, HTTP_STATUS.OK, null, 'Discussion saved successfully');
});

/**
 * @desc    Unsave discussion (remove bookmark)
 * @route   DELETE /api/discussions/:id/save
 * @access  Private
 */
const unsaveDiscussion = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  await discussionService.unsaveDiscussion(id, userId);

  logger.info('Discussion unsaved', { discussionId: id, userId });

  sendSuccess(res, HTTP_STATUS.OK, null, 'Discussion unsaved successfully');
});

/**
 * @desc    Get saved discussions
 * @route   GET /api/discussions/saved
 * @access  Private
 */
const getSavedDiscussions = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { page = 1, limit = 10 } = req.query;

  const result = await discussionService.getSavedDiscussions(
    userId,
    parseInt(page),
    parseInt(limit)
  );

  sendSuccess(
    res,
    HTTP_STATUS.OK,
    { discussions: result.data },
    'Saved discussions retrieved successfully',
    result.pagination
  );
});

/**
 * @desc    Get related discussions
 * @route   GET /api/discussions/:id/related
 * @access  Public
 */
const getRelatedDiscussions = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { limit = 5 } = req.query;

  const discussions = await discussionService.getRelatedDiscussions(id, parseInt(limit));

  sendSuccess(res, HTTP_STATUS.OK, { discussions }, 'Related discussions retrieved successfully');
});

/**
 * @desc    Report discussion
 * @route   POST /api/discussions/:id/report
 * @access  Private
 */
const reportDiscussion = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { reason, details } = req.body;

  const report = await discussionService.reportDiscussion(id, userId, reason, details);

  logger.info('Discussion reported', { discussionId: id, userId, reason });

  sendCreated(res, { report }, 'Report submitted successfully');
});

module.exports = {
  getAllDiscussions,
  getDiscussionById,
  createDiscussion,
  updateDiscussion,
  deleteDiscussion,
  getCategories,
  voteDiscussion,
  markAsSolved,
  unmarkAsSolved,
  pinDiscussion,
  unpinDiscussion,
  lockDiscussion,
  unlockDiscussion,
  saveDiscussion,
  unsaveDiscussion,
  getSavedDiscussions,
  getRelatedDiscussions,
  reportDiscussion
};
