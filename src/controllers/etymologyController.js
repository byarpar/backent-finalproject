const { db } = require('../config/database');
const logger = require('../utils/logger');
const { formatResponse, formatError, paginate, safeParseInt } = require('../utils/helpers');

class EtymologyController {
  // Get etymology for a specific word
  static async getEtymologyByWordId(req, res) {
    try {
      const { wordId } = req.params;

      const parsedWordId = safeParseInt(wordId);
      if (parsedWordId === null) {
        return res.status(400).json(formatError(
          'Invalid word ID',
          'Word ID must be a number'
        ));
      }

      const result = await db.query(`
        SELECT e.*, w.english_word, w.lisu_translation
        FROM etymology e
        JOIN words w ON e.word_id = w.id
        WHERE e.word_id = $1
        ORDER BY e.created_at DESC
      `, [parsedWordId]);

      res.json(formatResponse(true, { etymology: result.rows }));

    } catch (error) {
      logger.error('Get etymology by word failed:', { error: error.message });
      res.status(500).json(formatError('Failed to get etymology', error.message));
    }
  }

  // Get single etymology entry
  static async getEtymologyById(req, res) {
    try {
      const { id } = req.params;

      const parsedId = safeParseInt(id);
      if (parsedId === null) {
        return res.status(400).json(formatError(
          'Invalid etymology ID',
          'Etymology ID must be a number'
        ));
      }

      const result = await db.query(`
        SELECT e.*, w.english_word, w.lisu_translation, u.email as created_by_email
        FROM etymology e
        JOIN words w ON e.word_id = w.id
        LEFT JOIN users u ON e.created_by = u.id
        WHERE e.id = $1
      `, [parsedId]);

      if (result.rows.length === 0) {
        return res.status(404).json(formatError('Etymology not found'));
      }

      res.json(formatResponse(true, { etymology: result.rows[0] }));

    } catch (error) {
      logger.error('Get etymology failed:', { error: error.message });
      res.status(500).json(formatError('Failed to get etymology', error.message));
    }
  }

  // Create new etymology entry
  static async createEtymology(req, res) {
    try {
      const {
        word_id,
        origin,
        historical_development,
        first_recorded_date,
        etymology_notes,
        linguistic_family,
        related_words
      } = req.body;

      // Check if word exists
      const wordResult = await db.query('SELECT id FROM words WHERE id = $1', [word_id]);
      if (wordResult.rows.length === 0) {
        return res.status(404).json(formatError('Word not found'));
      }

      // Check if etymology already exists for this word
      const existingEtymology = await db.query(
        'SELECT id FROM etymology WHERE word_id = $1',
        [word_id]
      );

      if (existingEtymology.rows.length > 0) {
        return res.status(409).json(formatError(
          'Etymology already exists',
          'Etymology entry already exists for this word'
        ));
      }

      const result = await db.query(`
        INSERT INTO etymology (
          word_id, origin, historical_development, first_recorded_date,
          etymology_notes, linguistic_family, related_words, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [
        word_id,
        origin,
        historical_development,
        first_recorded_date,
        etymology_notes,
        linguistic_family,
        related_words,
        req.user.id
      ]);

      const etymology = result.rows[0];

      logger.info('Etymology created successfully', {
        etymologyId: etymology.id,
        wordId: word_id,
        userId: req.user.id
      });

      res.status(201).json(formatResponse(true, { etymology }, 'Etymology created successfully'));

    } catch (error) {
      logger.error('Create etymology failed:', { error: error.message });
      res.status(500).json(formatError('Failed to create etymology', error.message));
    }
  }

  // Update etymology entry
  static async updateEtymology(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const parsedId = safeParseInt(id);
      if (parsedId === null) {
        return res.status(400).json(formatError(
          'Invalid etymology ID',
          'Etymology ID must be a number'
        ));
      }

      // Check if etymology exists
      const existingEtymology = await db.query('SELECT * FROM etymology WHERE id = $1', [parsedId]);
      if (existingEtymology.rows.length === 0) {
        return res.status(404).json(formatError('Etymology not found'));
      }

      // Build update query
      const fields = [];
      const values = [];
      let paramIndex = 1;

      Object.keys(updateData).forEach(key => {
        if (updateData[key] !== undefined && key !== 'id' && key !== 'created_by' && key !== 'created_at') {
          fields.push(`${key} = $${paramIndex}`);
          values.push(updateData[key]);
          paramIndex++;
        }
      });

      if (fields.length === 0) {
        return res.status(400).json(formatError(
          'No update data provided',
          'Please provide at least one field to update'
        ));
      }

      values.push(parsedId);

      const result = await db.query(`
        UPDATE etymology 
        SET ${fields.join(', ')}, updated_at = NOW()
        WHERE id = $${paramIndex}
        RETURNING *
      `, values);

      const etymology = result.rows[0];

      logger.info('Etymology updated successfully', {
        etymologyId: etymology.id,
        userId: req.user.id
      });

      res.json(formatResponse(true, { etymology }, 'Etymology updated successfully'));

    } catch (error) {
      logger.error('Update etymology failed:', { error: error.message });
      res.status(500).json(formatError('Failed to update etymology', error.message));
    }
  }

  // Delete etymology entry
  static async deleteEtymology(req, res) {
    try {
      const { id } = req.params;

      const parsedId = safeParseInt(id);
      if (parsedId === null) {
        return res.status(400).json(formatError(
          'Invalid etymology ID',
          'Etymology ID must be a number'
        ));
      }

      // Check if etymology exists
      const existingEtymology = await db.query('SELECT * FROM etymology WHERE id = $1', [parsedId]);
      if (existingEtymology.rows.length === 0) {
        return res.status(404).json(formatError('Etymology not found'));
      }

      await db.query('DELETE FROM etymology WHERE id = $1', [parsedId]);

      logger.info('Etymology deleted successfully', {
        etymologyId: id,
        userId: req.user.id
      });

      res.json(formatResponse(true, null, 'Etymology deleted successfully'));

    } catch (error) {
      logger.error('Delete etymology failed:', { error: error.message });
      res.status(500).json(formatError('Failed to delete etymology', error.message));
    }
  }

  // Get all etymology entries with pagination
  static async getAllEtymology(req, res) {
    try {
      const { page = 1, limit = 10, sort = 'created_at', order = 'DESC' } = req.query;
      const { limit: limitNum, offset } = paginate(safeParseInt(page, 1), safeParseInt(limit, 10));

      const result = await db.query(`
        SELECT e.*, w.english_word, w.lisu_translation, u.email as created_by_email
        FROM etymology e
        JOIN words w ON e.word_id = w.id
        LEFT JOIN users u ON e.created_by = u.id
        ORDER BY e.${sort} ${order}
        LIMIT $1 OFFSET $2
      `, [limitNum, offset]);

      const countResult = await db.query('SELECT COUNT(*) as total FROM etymology');
      const total = safeParseInt(countResult.rows[0]?.total, 0);

      res.json(formatResponse(true, {
        etymology: result.rows,
        pagination: {
          page: safeParseInt(page, 1),
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum)
        }
      }));

    } catch (error) {
      logger.error('Get all etymology failed:', { error: error.message });
      res.status(500).json(formatError('Failed to get etymology entries', error.message));
    }
  }

  // Get etymology statistics
  static async getEtymologyStats(req, res) {
    try {
      const stats = await Promise.all([
        // Total etymology entries
        db.query('SELECT COUNT(*) as total FROM etymology'),

        // Etymology by linguistic family
        db.query(`
          SELECT linguistic_family, COUNT(*) as count
          FROM etymology
          WHERE linguistic_family IS NOT NULL AND linguistic_family != ''
          GROUP BY linguistic_family
          ORDER BY count DESC
          LIMIT 10
        `),

        // Words with vs without etymology
        db.query(`
          SELECT 
            COUNT(CASE WHEN e.id IS NOT NULL THEN 1 END) as with_etymology,
            COUNT(CASE WHEN e.id IS NULL THEN 1 END) as without_etymology
          FROM words w
          LEFT JOIN etymology e ON w.id = e.word_id
        `),

        // Recent etymology additions
        db.query(`
          SELECT e.*, w.english_word
          FROM etymology e
          JOIN words w ON e.word_id = w.id
          ORDER BY e.created_at DESC
          LIMIT 5
        `)
      ]);

      res.json(formatResponse(true, {
        total_entries: safeParseInt(stats[0].rows[0]?.total, 0),
        by_linguistic_family: stats[1].rows,
        coverage: stats[2].rows[0],
        recent_additions: stats[3].rows
      }));

    } catch (error) {
      logger.error('Get etymology stats failed:', { error: error.message });
      res.status(500).json(formatError('Failed to get etymology statistics', error.message));
    }
  }
}

module.exports = EtymologyController;
