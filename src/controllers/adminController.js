/**
 * Admin Controller v2
 * Professional admin management with service layer integration
 */

const adminService = require('../services/adminService');
const userService = require('../services/userService');
const wordService = require('../services/wordService');
const { sendSuccess, sendCreated, sendError } = require('../utils/response');
const { asyncHandler } = require('../utils/helpers');
const { HTTP_STATUS } = require('../config/constants');
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
 * @desc    Get all words with admin filters
 * @route   GET /api/admin/words
 * @access  Admin
 */
const getAllWords = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    search,
    part_of_speech,
    is_verified,
    created_by,
    sort_by = 'created_at',
    order = 'desc'
  } = req.query;

  const filters = {
    page: parseInt(page),
    limit: parseInt(limit),
    sortBy: sort_by,
    order: order.toLowerCase()
  };

  if (search) filters.search = search;
  if (part_of_speech) filters.part_of_speech = part_of_speech;
  if (is_verified !== undefined) filters.is_verified = is_verified === 'true';
  if (created_by) filters.created_by = parseInt(created_by);

  const result = await wordService.searchWords(search || '', filters);

  sendSuccess(
    res,
    HTTP_STATUS.OK,
    { words: result.words || result },
    'Words retrieved successfully',
    {
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages
      }
    }
  );
});

/**
 * @desc    Create new word (admin)
 * @route   POST /api/admin/words
 * @access  Admin
 */
const createWord = asyncHandler(async (req, res) => {
  const wordData = req.body;
  const adminId = req.user.id;

  const word = await wordService.createWord(wordData, adminId);

  logger.info('Admin created word', {
    adminId,
    wordId: word.id,
    english_word: word.english_word
  });

  sendCreated(res, word, 'Word created successfully');
});

/**
 * @desc    Update word (admin)
 * @route   PUT /api/admin/words/:id
 * @access  Admin
 */
const updateWord = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  const adminId = req.user.id;

  const word = await wordService.updateWord(parseInt(id), updates, adminId);

  logger.info('Admin updated word', {
    adminId,
    wordId: id,
    changes: Object.keys(updates)
  });

  sendSuccess(res, HTTP_STATUS.OK, word, 'Word updated successfully');
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
 * @desc    Bulk import words from JSON
 * @route   POST /api/admin/words/bulk
 * @access  Admin
 */
const bulkWords = asyncHandler(async (req, res) => {
  const { words } = req.body;
  const adminId = req.user.id;

  if (!Array.isArray(words) || words.length === 0) {
    return sendError(res, HTTP_STATUS.BAD_REQUEST, 'Words array is required');
  }

  const result = await wordService.bulkImport(words, adminId);

  logger.info('Admin bulk imported words', {
    adminId,
    total: words.length,
    imported: result.imported,
    failed: result.failed
  });

  sendCreated(res, result, 'Bulk import completed');
});

/**
 * @desc    Import words from Excel/CSV file
 * @route   POST /api/admin/words/import
 * @access  Admin
 */
const importWords = asyncHandler(async (req, res) => {
  if (!req.file) {
    return sendError(res, HTTP_STATUS.BAD_REQUEST, 'File is required');
  }

  const adminId = req.user.id;
  const XLSX = require('xlsx');
  const fs = require('fs');

  try {
    // Read the uploaded file
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);

    // Map Excel columns to word schema
    const words = jsonData.map(row => ({
      english_word: row['English Word'] || row.english_word,
      lisu_word: row['Lisu Word'] || row.lisu_word,
      english_definition: row['English Definition'] || row.english_definition,
      lisu_definition: row['Lisu Definition'] || row.lisu_definition,
      part_of_speech: row['Part of Speech'] || row.part_of_speech,
      pronunciation: row['Pronunciation'] || row.pronunciation,
      examples: row['Examples'] ? (Array.isArray(row.Examples) ? row.Examples : [row.Examples]) : [],
      synonyms: row['Synonyms'] ? (Array.isArray(row.Synonyms) ? row.Synonyms : row.Synonyms.split(',').map(s => s.trim())) : [],
      antonyms: row['Antonyms'] ? (Array.isArray(row.Antonyms) ? row.Antonyms : row.Antonyms.split(',').map(s => s.trim())) : [],
      etymology: row['Etymology'] || row.etymology,
      tags: row['Tags'] ? (Array.isArray(row.Tags) ? row.Tags : row.Tags.split(',').map(t => t.trim())) : []
    }));

    // Import words
    const result = await wordService.bulkImport(words, adminId);

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    logger.info('Admin imported words from file', {
      adminId,
      filename: req.file.originalname,
      total: words.length,
      imported: result.imported,
      failed: result.failed
    });

    sendCreated(res, result, 'File import completed');

  } catch (error) {
    // Clean up file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    throw error;
  }
});

/**
 * @desc    Export words to Excel/CSV/JSON
 * @route   POST /api/admin/words/export
 * @access  Admin
 */
const exportWords = asyncHandler(async (req, res) => {
  const { format = 'xlsx', filters = {} } = req.body;
  const XLSX = require('xlsx');
  const path = require('path');

  // Get words based on filters
  const result = await wordService.getWords({
    ...filters,
    limit: 10000 // Export limit
  });

  const words = result.data;

  if (format === 'json') {
    // Export as JSON
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="words.json"');
    return res.json(words);
  }

  // Prepare data for Excel/CSV
  const exportData = words.map(word => ({
    'ID': word.id,
    'English Word': word.english_word,
    'Lisu Word': word.lisu_word,
    'English Definition': word.english_definition,
    'Lisu Definition': word.lisu_definition,
    'Part of Speech': word.part_of_speech,
    'Pronunciation': word.pronunciation,
    'Examples': Array.isArray(word.examples) ? word.examples.join('; ') : word.examples,
    'Synonyms': Array.isArray(word.synonyms) ? word.synonyms.join(', ') : word.synonyms,
    'Antonyms': Array.isArray(word.antonyms) ? word.antonyms.join(', ') : word.antonyms,
    'Etymology': word.etymology,
    'Tags': Array.isArray(word.tags) ? word.tags.join(', ') : word.tags,
    'Verified': word.is_verified ? 'Yes' : 'No',
    'Created By': word.created_by_username,
    'Created At': word.created_at
  }));

  // Create workbook and worksheet
  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Words');

  // Generate buffer
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: format === 'csv' ? 'csv' : 'xlsx' });

  // Send file
  const filename = `words_export_${Date.now()}.${format === 'csv' ? 'csv' : 'xlsx'}`;
  res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);

  logger.info('Admin exported words', {
    adminId: req.user.id,
    format,
    count: words.length
  });
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

module.exports = {
  getDashboardStats,
  getAllUsers,
  getAllWords,
  createWord,
  updateWord,
  updateUserStatus,
  updateUserRole,
  deleteUser,
  bulkWords,
  importWords,
  exportWords,
  downloadTemplate,
  getReports,
  resolveReport,
  dismissReport,
  getModerationHistory
};
