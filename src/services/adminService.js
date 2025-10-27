/**
 * Admin Service
 * Business logic layer for admin operations
 */

const AdminRepository = require('../repositories/AdminRepository');
const UserRepository = require('../repositories/UserRepository');
const WordRepository = require('../repositories/WordRepository');
const { NotFoundError, ValidationError } = require('../utils/errors');
const logger = require('../utils/logger');

class AdminService {
  /**
   * Get dashboard statistics
   */
  async getDashboardStats() {
    try {
      const stats = await AdminRepository.getDashboardStats();

      // Add additional computed metrics
      const pendingVerification = await AdminRepository.getPendingVerificationCount();
      stats.overview.pending_verification = pendingVerification;

      return stats;
    } catch (error) {
      logger.error('Error in getDashboardStats service', { error: error.message });
      throw error;
    }
  }

  /**
   * Get all reports with filters
   */
  async getReports(filters) {
    try {
      return await AdminRepository.getReports(filters);
    } catch (error) {
      logger.error('Error in getReports service', { error: error.message });
      throw error;
    }
  }

  /**
   * Resolve a report
   */
  async resolveReport(reportId, adminId, action, notes) {
    try {
      if (!action) {
        throw new ValidationError('Resolution action is required');
      }

      const report = await AdminRepository.resolveReport(reportId, adminId, action, notes);

      // Log moderation action
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

  /**
   * Dismiss a report
   */
  async dismissReport(reportId, adminId) {
    try {
      const report = await AdminRepository.dismissReport(reportId, adminId);

      // Log moderation action
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

  /**
   * Get moderation history
   */
  async getModerationHistory(filters) {
    try {
      return await AdminRepository.getModerationHistory(filters);
    } catch (error) {
      logger.error('Error in getModerationHistory service', { error: error.message });
      throw error;
    }
  }

  /**
   * Get activity statistics
   */
  async getActivityStats(days = 7) {
    try {
      return await AdminRepository.getActivityStats(days);
    } catch (error) {
      logger.error('Error in getActivityStats service', { error: error.message });
      throw error;
    }
  }

  /**
   * Get user growth statistics
   */
  async getUserGrowthStats(months = 6) {
    try {
      return await AdminRepository.getUserGrowthStats(months);
    } catch (error) {
      logger.error('Error in getUserGrowthStats service', { error: error.message });
      throw error;
    }
  }

  /**
   * Get top contributors
   */
  async getTopContributors(limit = 10) {
    try {
      return await AdminRepository.getTopContributors(limit);
    } catch (error) {
      logger.error('Error in getTopContributors service', { error: error.message });
      throw error;
    }
  }

  /**
   * Log admin action for audit trail
   */
  async logAdminAction(actionData) {
    try {
      return await AdminRepository.logModerationAction(actionData);
    } catch (error) {
      logger.error('Error logging admin action', { error: error.message });
      throw error;
    }
  }
}

module.exports = new AdminService();
