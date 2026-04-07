/**
 * Consolidated Admin & Analytics Services
 * Combined admin operations and mention analytics
 */

const AdminRepository = require('../repositories/AdminRepository');
const UserRepository = require('../repositories/UserRepository');
const DiscussionRepository = require('../repositories/DiscussionRepository');
const AnswerRepository = require('../repositories/AnswerRepository');
const { NotFoundError, ValidationError, extractMentions } = require('../utils');
const logger = require('../utils/logger');

// =============================================================================
// ADMIN SERVICE
// =============================================================================

class AdminService {
  async getDashboardStats() {
    try {
      const stats = await AdminRepository.getDashboardStats();
      const pendingVerification = await AdminRepository.getPendingVerificationCount();
      stats.overview.pending_verification = pendingVerification;
      return stats;
    } catch (error) {
      logger.error('Error in getDashboardStats service', { error: error.message });
      throw error;
    }
  }

  async getReports(filters) {
    try {
      return await AdminRepository.getReports(filters);
    } catch (error) {
      logger.error('Error in getReports service', { error: error.message });
      throw error;
    }
  }

  async resolveReport(reportId, adminId, action, notes) {
    try {
      if (!action) {
        throw new ValidationError('Resolution action is required');
      }

      const report = await AdminRepository.resolveReport(reportId, adminId, action, notes);

      await AdminRepository.logModerationAction({
        moderator_id: adminId,
        action_type: 'resolve_report',
        target_type: 'report',
        target_id: reportId,
        details: { action, notes }
      });

      return report;
    } catch (error) {
      logger.error('Error in resolveReport service', { reportId, error: error.message });
      throw error;
    }
  }

  async dismissReport(reportId, adminId) {
    try {
      const report = await AdminRepository.dismissReport(reportId, adminId);

      await AdminRepository.logModerationAction({
        moderator_id: adminId,
        action_type: 'dismiss_report',
        target_type: 'report',
        target_id: reportId,
        details: {}
      });

      return report;
    } catch (error) {
      logger.error('Error in dismissReport service', { reportId, error: error.message });
      throw error;
    }
  }

  async getModerationHistory(filters) {
    try {
      return await AdminRepository.getModerationHistory(filters);
    } catch (error) {
      logger.error('Error in getModerationHistory service', { error: error.message });
      throw error;
    }
  }

  async getActivityStats(days = 7) {
    try {
      return await AdminRepository.getActivityStats(days);
    } catch (error) {
      logger.error('Error in getActivityStats service', { error: error.message });
      throw error;
    }
  }

  async getUserGrowthStats(months = 6) {
    try {
      return await AdminRepository.getUserGrowthStats(months);
    } catch (error) {
      logger.error('Error in getUserGrowthStats service', { error: error.message });
      throw error;
    }
  }

  async getTopContributors(limit = 10) {
    try {
      return await AdminRepository.getTopContributors(limit);
    } catch (error) {
      logger.error('Error in getTopContributors service', { error: error.message });
      throw error;
    }
  }

  async logAdminAction(actionData) {
    try {
      return await AdminRepository.logModerationAction(actionData);
    } catch (error) {
      logger.error('Error logging admin action', { error: error.message });
      throw error;
    }
  }
}

// =============================================================================
// MENTION ANALYTICS SERVICE
// =============================================================================

class MentionAnalyticsService {
  async getUserMentionStats(userId) {
    try {
      const user = await UserRepository.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const discussions = await DiscussionRepository.findAll();
      const answers = await AnswerRepository.findAll();

      let mentionCount = 0;
      let mentionSources = {
        discussions: 0,
        replies: 0
      };

      const username = user.username?.toLowerCase();
      if (!username) {
        return {
          totalMentions: 0,
          mentionSources,
          mentionedBy: [],
          recentMentions: []
        };
      }

      for (const discussion of discussions) {
        const titleMentions = extractMentions(discussion.title || '');
        const contentMentions = extractMentions(discussion.content || '');

        if (titleMentions.includes(username) || contentMentions.includes(username)) {
          mentionCount++;
          mentionSources.discussions++;
        }
      }

      for (const answer of answers) {
        const contentMentions = extractMentions(answer.content || '');

        if (contentMentions.includes(username)) {
          mentionCount++;
          mentionSources.replies++;
        }
      }

      return {
        user: {
          id: user.id,
          username: user.username,
          full_name: user.full_name
        },
        totalMentions: mentionCount,
        mentionSources
      };

    } catch (error) {
      logger.error('Error getting user mention stats', { userId, error: error.message });
      throw error;
    }
  }

  async getGlobalMentionStats() {
    try {
      const discussions = await DiscussionRepository.findAll({ limit: 100 });
      const users = await UserRepository.findAll({ limit: 100 });

      let totalMentions = 0;
      let discussionsWithMentions = 0;
      const mentionFrequency = {};

      for (const discussion of discussions) {
        const titleMentions = extractMentions(discussion.title || '');
        const contentMentions = extractMentions(discussion.content || '');
        const allMentions = [...titleMentions, ...contentMentions];

        if (allMentions.length > 0) {
          discussionsWithMentions++;
          totalMentions += allMentions.length;

          allMentions.forEach(mention => {
            mentionFrequency[mention] = (mentionFrequency[mention] || 0) + 1;
          });
        }
      }

      const topMentioned = Object.entries(mentionFrequency)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([username, count]) => ({ username, count }));

      return {
        totalMentions,
        totalDiscussions: discussions.length,
        discussionsWithMentions,
        mentionRate: discussionsWithMentions / discussions.length,
        totalUsers: users.length,
        topMentioned,
        uniqueMentionedUsers: Object.keys(mentionFrequency).length
      };

    } catch (error) {
      logger.error('Error getting global mention stats', { error: error.message });
      throw error;
    }
  }

  async getTopMentioners(limit = 10) {
    try {
      return {
        message: 'Feature coming soon - requires enhanced database queries',
        limit
      };
    } catch (error) {
      logger.error('Error getting top mentioners', { error: error.message });
      throw error;
    }
  }

  validateMentions(content) {
    if (!content || typeof content !== 'string') {
      return {
        isValid: true,
        mentions: [],
        warnings: []
      };
    }

    const mentions = extractMentions(content);
    const warnings = [];

    if (mentions.length > 10) {
      warnings.push('Content has many mentions (>10) - consider if all are necessary');
    }

    const shortMentions = mentions.filter(m => m.length <= 2);
    if (shortMentions.length > 0) {
      warnings.push(`Very short mentions detected: @${shortMentions.join(', @')} - verify these are valid usernames`);
    }

    return {
      isValid: warnings.length === 0,
      mentions,
      warnings,
      mentionCount: mentions.length
    };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  adminService: new AdminService(),
  mentionAnalyticsService: new MentionAnalyticsService()
};