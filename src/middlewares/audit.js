const { db } = require('../config/database');
const logger = require('../utils/logger');

const logAction = async (userId, action, tableName, recordId, oldValues = null, newValues = null, req = null) => {
  try {
    // Safely extract IP and User-Agent without circular references
    const ipAddress = req ? (req.ip || req.connection?.remoteAddress || 'unknown') : null;
    const userAgent = req ? req.get('User-Agent') : null;

    // Prepare metadata object combining old and new values
    const metadata = {};
    if (oldValues) metadata.oldValues = oldValues;
    if (newValues) metadata.newValues = newValues;

    await db.query(`
      INSERT INTO audit_logs (user_id, action, table_name, record_id, old_values, new_values, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      userId,
      action,
      tableName,
      recordId,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null,
      ipAddress,
      userAgent
    ]);

    logger.audit(userId, action, {
      table: tableName,
      recordId,
      ip: ipAddress,
      userAgent
    });
  } catch (error) {
    logger.error('Failed to log action:', error);
    // Don't throw error to avoid breaking the main operation
  }
};

const auditLogger = (action, tableName) => {
  return (req, res, next) => {
    const originalSend = res.send;

    res.send = function (data) {
      // Log successful operations (2xx status codes)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const recordId = req.params.id || null;
        const oldValues = req.oldValues || null;
        const newValues = req.body || null;

        // Don't await this to avoid blocking the response
        logAction(
          req.user?.id,
          action,
          tableName,
          recordId,
          oldValues,
          newValues,
          req
        );
      }

      originalSend.call(this, data);
    };

    next();
  };
};

module.exports = {
  logAction,
  auditLogger
};
