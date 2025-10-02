const Word = require('../models/Word');
const { db } = require('../config/database');
const logger = require('../utils/logger');
const { formatResponse, formatError, paginate, safeParseInt } = require('../utils/helpers');

/**
 * Validate and parse word ID from request parameters
 * @param {string} id - The word ID from request params
 * @returns {number} - Parsed word ID
 * @throws {Error} - If ID is invalid
 */
const validateWordId = (id) => {
  const wordId = parseInt(id);
  if (isNaN(wordId) || wordId <= 0) {
    throw new Error('Invalid word ID - must be a positive number');
  }
  return wordId;
};

class WordController {
  // Get all words with pagination and filtering
  static async getAllWords(req, res) {
    try {
      const { page = 1, limit = 10, sort = 'created_at', order = 'DESC' } = req.query;

      const result = await Word.list({
        page: safeParseInt(page, 1),
        limit: safeParseInt(limit, 10),
        sort,
        order
      });

      res.json(formatResponse(true, result));

    } catch (error) {
      logger.error('Get words failed:', { error: error.message });
      res.status(500).json(formatError('Failed to get words', error.message));
    }
  }

  // Get single word by ID
  static async getWordById(req, res) {
    try {
      const { id } = req.params;

      // Validate ID is a valid number
      const wordId = validateWordId(id);

      const word = await Word.findById(wordId);
      if (!word) {
        return res.status(404).json(formatError('Word not found'));
      }

      res.json(formatResponse(true, { word }));

    } catch (error) {
      if (error.message.includes('Invalid word ID')) {
        return res.status(400).json(formatError('Invalid word ID', error.message));
      }
      logger.error('Get word failed:', { error: error.message });
      res.status(500).json(formatError('Failed to get word', error.message));
    }
  }

  // Create new word
  static async createWord(req, res) {
    try {
      const wordData = req.body;
      const userId = req.user.id;

      // Check if word already exists
      const existingWord = await db.query(
        'SELECT id FROM words WHERE LOWER(english_word) = LOWER($1)',
        [wordData.english_word]
      );

      if (existingWord.rows.length > 0) {
        return res.status(409).json(formatError(
          'Word already exists',
          'A word with this English term already exists'
        ));
      }

      const word = await Word.create(wordData, userId);

      logger.info('Word created successfully', {
        wordId: word.id,
        english_word: word.english_word,
        userId
      });

      res.status(201).json(formatResponse(true, { word }, 'Word created successfully'));

    } catch (error) {
      logger.error('Create word failed:', { error: error.message });
      res.status(500).json(formatError('Failed to create word', error.message));
    }
  }

  // Update word
  static async updateWord(req, res) {
    try {
      const { id } = req.params;
      const wordData = req.body;
      
      const wordId = validateWordId(id);

      // Check if word exists
      const existingWord = await Word.findById(wordId);
      if (!existingWord) {
        return res.status(404).json(formatError('Word not found'));
      }

      // Check if english_word is being changed and already exists
      if (wordData.english_word && wordData.english_word.toLowerCase() !== existingWord.english_word.toLowerCase()) {
        const duplicateWord = await db.query(
          'SELECT id FROM words WHERE LOWER(english_word) = LOWER($1) AND id != $2',
          [wordData.english_word, id]
        );

        if (duplicateWord.rows.length > 0) {
          return res.status(409).json(formatError(
            'Word already exists',
            'Another word with this English term already exists'
          ));
        }
      }

      const word = await Word.update(wordId, wordData);

      logger.info('Word updated successfully', {
        wordId: word.id,
        english_word: word.english_word,
        userId: req.user.id
      });

      res.json(formatResponse(true, { word }, 'Word updated successfully'));

    } catch (error) {
      logger.error('Update word failed:', { error: error.message });
      res.status(500).json(formatError('Failed to update word', error.message));
    }
  }

  // Delete word
  static async deleteWord(req, res) {
    try {
      const { id } = req.params;
      
      const wordId = validateWordId(id);

      // Check if word exists
      const existingWord = await Word.findById(wordId);
      if (!existingWord) {
        return res.status(404).json(formatError('Word not found'));
      }

      await Word.delete(wordId);

      logger.info('Word deleted successfully', {
        wordId: id,
        english_word: existingWord.english_word,
        userId: req.user.id
      });

      res.json(formatResponse(true, null, 'Word deleted successfully'));

    } catch (error) {
      logger.error('Delete word failed:', { error: error.message });
      res.status(500).json(formatError('Failed to delete word', error.message));
    }
  }

  // Get similar words
  static async getSimilarWords(req, res) {
    try {
      const { id } = req.params;
      
      const wordId = validateWordId(id);

      const word = await Word.findById(wordId);
      if (!word) {
        return res.status(404).json(formatError('Word not found'));
      }

      // Find similar words based on part of speech and synonyms
      const result = await db.query(`
        SELECT w.*, 
               CASE WHEN e.id IS NOT NULL THEN true ELSE false END as has_etymology
        FROM words w
        LEFT JOIN etymology e ON w.id = e.word_id
        WHERE w.id != $1 
        AND (
          w.part_of_speech = $2
          OR w.synonyms ILIKE $3
          OR w.english_word ILIKE $3
        )
        ORDER BY 
          CASE WHEN w.part_of_speech = $2 THEN 1 ELSE 2 END,
          w.created_at DESC
        LIMIT 10
      `, [id, word.part_of_speech, `%${word.english_word}%`]);

      res.json(formatResponse(true, { similar_words: result.rows }));

    } catch (error) {
      logger.error('Get similar words failed:', { error: error.message });
      res.status(500).json(formatError('Failed to get similar words', error.message));
    }
  }

  // Get user's favorite words
  static async getFavoriteWords(req, res) {
    try {
      const { page = 1, limit = 10 } = req.query;
      const userId = req.user.id;
      const { limit: limitNum, offset } = paginate(safeParseInt(page, 1), safeParseInt(limit, 10));

      const result = await db.query(`
        SELECT w.*, u.email as created_by_email,
               CASE WHEN e.id IS NOT NULL THEN true ELSE false END as has_etymology
        FROM words w
        JOIN user_favorites f ON w.id = f.word_id
        LEFT JOIN users u ON w.created_by = u.id
        LEFT JOIN etymology e ON w.id = e.word_id
        WHERE f.user_id = $1
        ORDER BY f.created_at DESC
        LIMIT $2 OFFSET $3
      `, [userId, limitNum, offset]);

      const countResult = await db.query(
        'SELECT COUNT(*) as total FROM user_favorites WHERE user_id = $1',
        [userId]
      );

      const total = safeParseInt(countResult.rows[0]?.total, 0);

      res.json(formatResponse(true, {
        words: result.rows,
        pagination: {
          page: safeParseInt(page, 1),
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum)
        }
      }));

    } catch (error) {
      logger.error('Get favorites failed:', { error: error.message });
      res.status(500).json(formatError('Failed to get favorites', error.message));
    }
  }

  // Add word to favorites
  static async addToFavorites(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      
      const wordId = validateWordId(id);

      // Check if word exists
      const word = await Word.findById(wordId);
      if (!word) {
        return res.status(404).json(formatError('Word not found'));
      }

      // Check if already in favorites
      const existing = await db.query(
        'SELECT id FROM user_favorites WHERE user_id = $1 AND word_id = $2',
        [userId, id]
      );

      if (existing.rows.length > 0) {
        return res.status(409).json(formatError(
          'Already in favorites',
          'This word is already in your favorites'
        ));
      }

      await db.query(
        'INSERT INTO user_favorites (user_id, word_id) VALUES ($1, $2)',
        [userId, id]
      );

      logger.info('Word added to favorites', { userId, wordId: id });

      res.json(formatResponse(true, null, 'Word added to favorites'));

    } catch (error) {
      logger.error('Add to favorites failed:', { error: error.message });
      res.status(500).json(formatError('Failed to add to favorites', error.message));
    }
  }

  // Remove word from favorites
  static async removeFromFavorites(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const result = await db.query(
        'DELETE FROM user_favorites WHERE user_id = $1 AND word_id = $2 RETURNING id',
        [userId, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json(formatError('Favorite not found'));
      }

      logger.info('Word removed from favorites', { userId, wordId: id });

      res.json(formatResponse(true, null, 'Word removed from favorites'));

    } catch (error) {
      logger.error('Remove from favorites failed:', { error: error.message });
      res.status(500).json(formatError('Failed to remove from favorites', error.message));
    }
  }

  // Get trending words
  static async getTrendingWords(req, res) {
    try {
      const { limit = 10 } = req.query;

      // Get trending words based on search frequency
      const result = await db.query(`
        SELECT w.*, u.email as created_by_email,
               CASE WHEN e.id IS NOT NULL THEN true ELSE false END as has_etymology,
               COUNT(sh.id) as search_count
        FROM words w
        LEFT JOIN users u ON w.created_by = u.id
        LEFT JOIN etymology e ON w.id = e.word_id
        LEFT JOIN search_history sh ON w.english_word ILIKE '%' || sh.search_query || '%' 
                                    OR w.lisu_word ILIKE '%' || sh.search_query || '%'
        WHERE sh.created_at >= NOW() - INTERVAL '7 days'
        GROUP BY w.id, u.email, e.id
        ORDER BY search_count DESC, w.created_at DESC
        LIMIT $1
      `, [safeParseInt(limit, 10)]);

      res.json(formatResponse(true, { trending_words: result.rows }));

    } catch (error) {
      logger.error('Get trending words failed:', { error: error.message });
      res.status(500).json(formatError('Failed to get trending words', error.message));
    }
  }
}

module.exports = WordController;
