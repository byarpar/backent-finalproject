/**
 * Answer Controller v2
 * Professional answer management with service layer integration
 */

const answerService = require('../services/answerService');
const { sendSuccess, sendCreated, sendError } = require('../utils/response');
const { asyncHandler } = require('../utils/helpers');
const { HTTP_STATUS } = require('../config/constants');
const logger = require('../utils/logger');
const notificationController = require('./notificationController');

/**
 * @desc    Get answers for a discussion
 * @route   GET /api/discussions/:discussionId/answers
 * @access  Public
 */
const getAnswersForDiscussion = asyncHandler(async (req, res) => {
  const { discussionId } = req.params;
  const userId = req.user?.id;

  const answers = await answerService.getAnswersForDiscussion(discussionId, userId);

  sendSuccess(res, HTTP_STATUS.OK, { answers }, 'Answers retrieved successfully');
});

/**
 * @desc    Create new answer
 * @route   POST /api/discussions/:discussionId/answers
 * @access  Private
 */
const createAnswer = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { discussion_id, content, images, parent_answer_id } = req.body;

  const result = await answerService.createAnswer(
    { discussion_id, content, images, parent_answer_id },
    userId
  );

  const { answer, discussion, author } = result;

  // Create notification for parent answer author if this is a reply
  if (parent_answer_id) {
    try {
      // Get parent answer to find its author
      const AnswerRepository = require('../repositories/AnswerRepository');
      const parentAnswer = await AnswerRepository.findById(parent_answer_id);

      if (parentAnswer && parentAnswer.author_id !== userId) {
        const actorName = author.full_name || author.username;

        await notificationController.createNotification({
          userId: parentAnswer.author_id,
          type: 'reply',
          category: 'replies',
          actorId: userId,
          actorName,
          actorAvatar: author.profile_photo_url,
          message: 'replied to your answer',
          targetTitle: discussion.title,
          targetLink: `/discussions/${discussion_id}`,
          actionButtons: [{ label: 'View Reply', action: 'view' }]
        });

        logger.info('Notification created for parent answer author', {
          parentAnswerAuthorId: parentAnswer.author_id
        });

        // Emit real-time notification
        const socketService = req.app.get('socketService');
        if (socketService) {
          socketService.emitNotification(parentAnswer.author_id, {
            type: 'reply',
            category: 'replies',
            message: 'replied to your answer',
            targetLink: `/discussions/${discussion_id}`,
            actorName
          });
        }
      }
    } catch (notifError) {
      logger.error('Error creating reply notification', { error: notifError.message });
    }
  }

  // Create notification for discussion author (if different user and not a reply to answer)
  if (!parent_answer_id && discussion.author_id !== userId) {
    try {
      const actorName = author.full_name || author.username;

      await notificationController.createNotification({
        userId: discussion.author_id,
        type: 'reply',
        category: 'replies',
        actorId: userId,
        actorName,
        actorAvatar: author.profile_photo_url,
        message: 'replied to your discussion',
        targetTitle: discussion.title,
        targetLink: `/discussions/${discussion_id}`,
        actionButtons: [{ label: 'View Reply', action: 'view' }]
      });

      logger.info('Notification created for discussion author', {
        discussionAuthorId: discussion.author_id
      });

      // Emit real-time notification if Socket.IO available
      const socketService = req.app.get('socketService');
      if (socketService) {
        socketService.emitNotification(discussion.author_id, {
          type: 'reply',
          category: 'replies',
          message: 'replied to your discussion',
          targetLink: `/discussions/${discussion_id}`,
          actorName
        });
      }
    } catch (notifError) {
      // Don't fail answer creation if notification fails
      logger.error('Error creating notification', { error: notifError.message });
    }
  }

  sendCreated(res, { answer }, 'Answer created successfully');
});

/**
 * @desc    Update answer
 * @route   PUT /api/answers/:id
 * @access  Private (Author or Admin)
 */
const updateAnswer = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;
  const { content, images } = req.body;

  const answer = await answerService.updateAnswer(
    id,
    { content, images },
    userId,
    userRole
  );

  logger.info('Answer updated', { answerId: id, userId });

  sendSuccess(res, HTTP_STATUS.OK, { answer }, 'Answer updated successfully');
});

/**
 * @desc    Delete answer
 * @route   DELETE /api/answers/:id
 * @access  Private (Author or Admin)
 */
const deleteAnswer = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;

  await answerService.deleteAnswer(id, userId, userRole);

  logger.info('Answer deleted', { answerId: id, userId });

  sendSuccess(res, HTTP_STATUS.OK, null, 'Answer deleted successfully');
});

/**
 * @desc    Vote on answer (upvote/downvote)
 * @route   POST /api/answers/:id/vote
 * @access  Private
 */
const voteAnswer = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { vote_type } = req.body;
  const userId = req.user.id;

  const result = await answerService.voteAnswer(id, userId, vote_type);

  const { action, voteType, vote_count, upvotes, downvotes, answer } = result;

  // Create notification for answer author (if different user and vote was created)
  if (action === 'created' && answer.author_id !== userId) {
    try {
      // Get voter info
      const UserRepository = require('../repositories/UserRepository');
      const voter = await UserRepository.findById(userId);
      const voterName = voter.full_name || voter.username;
      const voteMessage = vote_type === 'up' ? 'upvoted your answer' : 'downvoted your answer';

      await notificationController.createNotification({
        userId: answer.author_id,
        type: vote_type,
        category: 'votes',
        actorId: userId,
        actorName: voterName,
        actorAvatar: voter.profile_photo_url,
        message: voteMessage,
        targetTitle: answer.discussion_title,
        targetLink: `/discussions/${answer.discussion_id}`
      });

      logger.info('Vote notification created', { answerAuthorId: answer.author_id });

      // Emit real-time notification
      const socketService = req.app.get('socketService');
      if (socketService) {
        socketService.emitNotification(answer.author_id, {
          type: vote_type,
          category: 'votes',
          message: voteMessage,
          targetLink: `/discussions/${answer.discussion_id}`,
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
 * @desc    Remove vote from answer
 * @route   DELETE /api/answers/:id/vote
 * @access  Private
 */
const removeVote = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const voteCounts = await answerService.removeVote(id, userId);

  sendSuccess(res, HTTP_STATUS.OK, voteCounts, 'Vote removed successfully');
});

/**
 * @desc    Get user's vote on answer
 * @route   GET /api/answers/:id/user-vote
 * @access  Private
 */
const getUserVote = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const vote = await answerService.getUserVote(id, userId);

  sendSuccess(res, HTTP_STATUS.OK, vote);
});

module.exports = {
  getAnswersForDiscussion,
  createAnswer,
  updateAnswer,
  deleteAnswer,
  voteAnswer,
  removeVote,
  getUserVote
};
