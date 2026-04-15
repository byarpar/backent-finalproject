/**
 * Admin Controller v2
 * Professional admin management with service layer integration
 */

const adminService = require('../services/adminService');
const userService = require('../services/userService');
const { successResponse, errorResponse, sendSuccess, sendError, sendCreated, asyncHandler } = require('../utils');
const { constants: { STATUS_CODES: HTTP_STATUS } } = require('../config');
const logger = require('../utils/logger');

/**
 * @desc    Get admin dashboard statistics
 * @route   GET /api/admin/dashboard
 * @access  Admin
 */
const getDashboardStats = asyncHandler(async (req, res) => {
  const dashboard = await adminService.getDashboardStats();
  sendSuccess(res, HTTP_STATUS.OK, dashboard, 'Dashboard statistics retrieved successfully');
});

/**
 * @desc    Get all users with admin filters
 * @route   GET /api/admin/users
 * @access  Admin
 */
const getAllUsers = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    role,
    is_active,
    is_verified,
    search,
    sort_by = 'created_at',
    order = 'desc'
  } = req.query;

  const filters = {
    page: parseInt(page),
    limit: parseInt(limit),
    sortBy: sort_by,
    order: order.toLowerCase()
  };

  if (role) filters.role = role;
  if (is_active !== undefined) filters.is_active = is_active === 'true';
  if (is_verified !== undefined) filters.is_verified = is_verified === 'true';
  if (search) filters.search = search;

  const result = await userService.listUsers(filters);

  sendSuccess(
    res,
    HTTP_STATUS.OK,
    { users: result.users },
    'Users retrieved successfully',
    { pagination: result.pagination }
  );
});

/**
 * @desc    Get system health / info
 * @route   GET /api/admin/system-info
 * @access  Admin
 */
const getSystemInfo = asyncHandler(async (req, res) => {
  const data = await adminService.getSystemHealth();
  sendSuccess(res, HTTP_STATUS.OK, data, 'System info retrieved successfully');
});

/**
 * @desc    Get single user with stats
 * @route   GET /api/admin/users/:id
 * @access  Admin
 */
const getUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = await userService.getUserById(id);
  const stats = await userService.getUserStatistics(id);
  sendSuccess(res, HTTP_STATUS.OK, { user, stats }, 'User retrieved successfully');
});

/**
 * @desc    Update user status (active/inactive)
 * @route   PUT /api/admin/users/:id/status
 * @access  Admin
 */
const updateUserStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { is_active } = req.body;
  const adminId = req.user.id;

  const user = await userService.updateUserStatus(parseInt(id), is_active, adminId);

  logger.info('Admin updated user status', {
    adminId,
    userId: id,
    is_active
  });

  sendSuccess(res, HTTP_STATUS.OK, user, 'User status updated successfully');
});

/**
 * @desc    Update user role
 * @route   PUT /api/admin/users/:id/role
 * @access  Admin
 */
const updateUserRole = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;
  const adminId = req.user.id;

  const user = await userService.updateUserRole(parseInt(id), role, adminId);

  logger.info('Admin updated user role', {
    adminId,
    userId: id,
    newRole: role
  });

  sendSuccess(res, HTTP_STATUS.OK, user, 'User role updated successfully');
});

/**
 * @desc    Delete user (soft delete)
 * @route   DELETE /api/admin/users/:id
 * @access  Admin
 */
const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const adminId = req.user.id;

  await userService.deleteUser(parseInt(id), adminId);

  logger.info('Admin deleted user', {
    adminId,
    userId: id
  });

  sendSuccess(res, HTTP_STATUS.OK, null, 'User deleted successfully');
});

/**
 * @desc    Download import template file
 * @route   GET /api/admin/words/template
 * @access  Admin
 */
const downloadTemplate = asyncHandler(async (req, res) => {
  const XLSX = require('xlsx');

  // Create template data
  const templateData = [
    {
      'English Word': 'hello',
      'Lisu Word': 'ꓠꓬꓵ',
      'English Definition': 'A greeting or expression of goodwill',
      'Lisu Definition': '',
      'Part of Speech': 'noun',
      'Pronunciation': 'he-lo',
      'Examples': 'Hello, how are you?',
      'Synonyms': 'hi, hey, greetings',
      'Antonyms': 'goodbye, farewell',
      'Etymology': 'From Old English hǣl ("health, welfare")',
      'Tags': 'greeting, common'
    },
    {
      'English Word': 'water',
      'Lisu Word': 'ꓪꓳ',
      'English Definition': 'A clear liquid necessary for life',
      'Lisu Definition': '',
      'Part of Speech': 'noun',
      'Pronunciation': 'waw-ter',
      'Examples': 'I need a glass of water.',
      'Synonyms': 'H2O, aqua',
      'Antonyms': '',
      'Etymology': 'From Proto-Germanic *watōr',
      'Tags': 'nature, liquid, essential'
    }
  ];

  // Create workbook
  const worksheet = XLSX.utils.json_to_sheet(templateData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Words Template');

  // Set column widths
  worksheet['!cols'] = [
    { wch: 15 }, // English Word
    { wch: 15 }, // Lisu Word
    { wch: 40 }, // English Definition
    { wch: 40 }, // Lisu Definition
    { wch: 15 }, // Part of Speech
    { wch: 15 }, // Pronunciation
    { wch: 50 }, // Examples
    { wch: 30 }, // Synonyms
    { wch: 30 }, // Antonyms
    { wch: 50 }, // Etymology
    { wch: 30 }  // Tags
  ];

  // Generate buffer
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  // Send file
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="words_import_template.xlsx"');
  res.send(buffer);

  logger.info('Admin downloaded import template', { adminId: req.user.id });
});

/**
 * @desc    Get all user reports
 * @route   GET /api/admin/reports
 * @access  Admin
 */
const getReports = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    status,
    type,
    sort_by = 'created_at',
    order = 'desc'
  } = req.query;

  const filters = {
    page: parseInt(page),
    limit: parseInt(limit),
    status,
    type,
    sortBy: sort_by,
    order: order.toLowerCase()
  };

  const result = await adminService.getReports(filters);

  sendSuccess(
    res,
    HTTP_STATUS.OK,
    { reports: result.data },
    'Reports retrieved successfully',
    { pagination: result.pagination }
  );
});

/**
 * @desc    Resolve a report
 * @route   POST /api/admin/reports/:id/resolve
 * @access  Admin
 */
const resolveReport = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { action, notes } = req.body;
  const adminId = req.user.id;

  const report = await adminService.resolveReport(parseInt(id), adminId, action, notes);

  logger.info('Admin resolved report', {
    adminId,
    reportId: id,
    action
  });

  sendSuccess(res, HTTP_STATUS.OK, report, 'Report resolved successfully');
});

/**
 * @desc    Dismiss a report
 * @route   POST /api/admin/reports/:id/dismiss
 * @access  Admin
 */
const dismissReport = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const adminId = req.user.id;

  const report = await adminService.dismissReport(parseInt(id), adminId);

  logger.info('Admin dismissed report', {
    adminId,
    reportId: id
  });

  sendSuccess(res, HTTP_STATUS.OK, report, 'Report dismissed successfully');
});

/**
 * @desc    Get moderation action history
 * @route   GET /api/admin/moderation-history
 * @access  Admin
 */
const getModerationHistory = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    moderator_id,
    action_type,
    sort_by = 'created_at',
    order = 'desc'
  } = req.query;

  const filters = {
    page: parseInt(page),
    limit: parseInt(limit),
    moderator_id: moderator_id ? parseInt(moderator_id) : undefined,
    action_type,
    sortBy: sort_by,
    order: order.toLowerCase()
  };

  const result = await adminService.getModerationHistory(filters);

  sendSuccess(
    res,
    HTTP_STATUS.OK,
    { history: result.data },
    'Moderation history retrieved successfully',
    { pagination: result.pagination }
  );
});

/**
 * @desc    Get discussion stats (24h, 7d counts, most active)
 * @route   GET /api/admin/discussion-stats
 * @access  Admin
 */
const getDiscussionStats = asyncHandler(async (req, res) => {
  const data = await adminService.getDiscussionStats();
  sendSuccess(res, HTTP_STATUS.OK, data, 'Discussion stats retrieved successfully');
});

/**
 * @desc    Get categories and tags data
 * @route   GET /api/admin/categories-tags
 * @access  Admin
 */
const getCategoriesAndTags = asyncHandler(async (req, res) => {
  const data = await adminService.getCategoriesAndTags();
  sendSuccess(res, HTTP_STATUS.OK, data, 'Categories and tags retrieved successfully');
});

/**
 * @desc    Get analytics data
 * @route   GET /api/admin/analytics
 * @access  Admin
 */
const getAnalytics = asyncHandler(async (req, res) => {
  const { timeRange = '30days' } = req.query;
  const data = await adminService.getAnalytics(timeRange);
  sendSuccess(res, HTTP_STATUS.OK, data, 'Analytics retrieved successfully');
});

module.exports = {
  getDashboardStats,
  getAllUsers,
  updateUserStatus,
  updateUserRole,
  deleteUser,
  downloadTemplate,
  getReports,
  resolveReport,
  dismissReport,
  getModerationHistory,
  getAnalytics,
  getCategoriesAndTags,
  getDiscussionStats,
  getUser,
  getSystemInfo
};
