/**
 * Word Repository
 * Data access layer for words
 */

const BaseRepository = require('../models/BaseRepository');
const { NotFoundError, ConflictError } = require('../utils/errors');
const logger = require('../utils/logger');

class WordRepository extends BaseRepository {
  constructor() {
    super('words');

    this.columns = `
      w.id, w.english_word, w.lisu_word, w.english_definition, w.lisu_definition,
      w.part_of_speech, w.pronunciation_english, w.pronunciation_lisu,
      w.examples, w.tags, w.is_verified,
      w.meaning, w.phrase, w.synonyms, w.antonyms,
      w.etymology_origin, w.etymology_context,
      w.created_by, w.created_at, w.updated_at,
      u.email as created_by_email, u.full_name as created_by_name
    `;
  }

  /**
   * Find word by ID with creator info
   */
  async findById(id) {
    const query = `
      SELECT ${this.columns},
        CASE WHEN w.etymology_origin IS NOT NULL OR w.etymology_context IS NOT NULL 
        THEN true ELSE false END as has_etymology
      FROM ${this.tableName} w
      LEFT JOIN users u ON w.created_by = u.id
      WHERE w.id = $1
    `;

    const result = await this.db.query(query, [id]);
    return result.rows[0] || null;
  }

  /**
   * Find word by English word
   */
  async findByEnglishWord(englishWord) {
    const query = `
      SELECT ${this.columns}
      FROM ${this.tableName} w
      LEFT JOIN users u ON w.created_by = u.id
      WHERE LOWER(w.english_word) = LOWER($1)
      LIMIT 1
    `;

    const result = await this.db.query(query, [englishWord]);
    return result.rows[0] || null;
  }

  /**
   * Create word
   */
  async create(wordData, userId) {
    const {
      english_word,
      lisu_word,
      english_definition,
      lisu_definition,
      part_of_speech,
      pronunciation_english,
      pronunciation_lisu,
      examples,
      tags,
      meaning,
      phrase,
      synonyms,
      antonyms,
      etymology_origin,
      etymology_context
    } = wordData;

    // Check for duplicates
    const existing = await this.findByEnglishWord(english_word);
    if (existing) {
      throw new ConflictError('Word already exists', {
        field: 'english_word',
        existingId: existing.id
      });
    }

    const query = `
      INSERT INTO ${this.tableName} (
        english_word, lisu_word, english_definition, lisu_definition,
        part_of_speech, pronunciation_english, pronunciation_lisu,
        examples, tags, 
        meaning, phrase, synonyms, antonyms,
        etymology_origin, etymology_context,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `;

    const result = await this.db.query(query, [
      english_word,
      lisu_word,
      english_definition || null,
      lisu_definition || null,
      part_of_speech || null,
      pronunciation_english || null,
      pronunciation_lisu || null,
      this._serializeJSON(examples),
      this._serializeJSON(tags),
      meaning || null,
      phrase || null,
      synonyms || null,
      antonyms || null,
      etymology_origin || null,
      etymology_context || null,
      userId
    ]);

    logger.info('Word created', {
      wordId: result.rows[0].id,
      english_word,
      userId
    });

    return result.rows[0];
  }

  /**
   * Update word
   */
  async update(id, wordData) {
    // Check if word exists
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundError('Word');
    }

    // Check for duplicate english_word if being updated
    if (wordData.english_word && wordData.english_word.toLowerCase() !== existing.english_word.toLowerCase()) {
      const duplicate = await this.findByEnglishWord(wordData.english_word);
      if (duplicate && duplicate.id !== id) {
        throw new ConflictError('Another word with this English word already exists', {
          field: 'english_word',
          existingId: duplicate.id
        });
      }
    }

    // Serialize arrays/objects for JSONB fields
    if (wordData.examples) {
      wordData.examples = this._serializeJSON(wordData.examples);
    }
    if (wordData.tags) {
      wordData.tags = this._serializeJSON(wordData.tags);
    }

    const updated = await super.update(id, wordData);

    logger.info('Word updated', {
      wordId: id,
      updatedFields: Object.keys(wordData)
    });

    return updated;
  }

  /**
   * List words with filters and pagination
   */
  async list(options = {}) {
    const {
      page = 1,
      limit = 10,
      search = null,
      part_of_speech = null,
      is_verified = null,
      created_by = null,
      has_etymology = null,
      sort = 'created_at',
      order = 'DESC'
    } = options;

    const offset = (page - 1) * limit;
    const conditions = [];
    const values = [];
    let paramIndex = 1;

    // Build WHERE clause
    if (search) {
      conditions.push(`(
        w.english_word ILIKE $${paramIndex} OR
        w.lisu_word ILIKE $${paramIndex} OR
        w.english_definition ILIKE $${paramIndex} OR
        w.lisu_definition ILIKE $${paramIndex}
      )`);
      values.push(`%${search}%`);
      paramIndex++;
    }

    if (part_of_speech) {
      conditions.push(`w.part_of_speech = $${paramIndex}`);
      values.push(part_of_speech);
      paramIndex++;
    }

    if (is_verified !== null) {
      conditions.push(`w.is_verified = $${paramIndex}`);
      values.push(is_verified);
      paramIndex++;
    }

    if (created_by) {
      conditions.push(`w.created_by = $${paramIndex}`);
      values.push(created_by);
      paramIndex++;
    }

    if (has_etymology !== null) {
      if (has_etymology) {
        conditions.push(`(w.etymology_origin IS NOT NULL OR w.etymology_context IS NOT NULL)`);
      } else {
        conditions.push(`(w.etymology_origin IS NULL AND w.etymology_context IS NULL)`);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Main query
    const query = `
      SELECT ${this.columns},
        CASE WHEN w.etymology_origin IS NOT NULL OR w.etymology_context IS NOT NULL 
        THEN true ELSE false END as has_etymology
      FROM ${this.tableName} w
      LEFT JOIN users u ON w.created_by = u.id
      ${whereClause}
      ORDER BY w.${sort} ${order}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    values.push(limit, offset);

    // Count query
    const countQuery = `
      SELECT COUNT(*) as total
      FROM ${this.tableName} w
      ${whereClause}
    `;
    const countValues = values.slice(0, -2); // Remove limit and offset

    const [wordsResult, countResult] = await Promise.all([
      this.db.query(query, values),
      this.db.query(countQuery, countValues)
    ]);

    const total = parseInt(countResult.rows[0].total, 10);
    const totalPages = Math.ceil(total / limit);

    return {
      words: wordsResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
        nextPage: page < totalPages ? page + 1 : null,
        prevPage: page > 1 ? page - 1 : null
      }
    };
  }

  /**
   * Get similar words
   */
  async findSimilar(wordId, limit = 5) {
    const word = await this.findById(wordId);
    if (!word) {
      throw new NotFoundError('Word');
    }

    const query = `
      SELECT ${this.columns}
      FROM ${this.tableName} w
      LEFT JOIN users u ON w.created_by = u.id
      WHERE w.id != $1
        AND (
          w.part_of_speech = $2 OR
          w.english_word ILIKE $3 OR
          w.tags::text ILIKE $3
        )
      ORDER BY 
        CASE WHEN w.part_of_speech = $2 THEN 0 ELSE 1 END,
        w.created_at DESC
      LIMIT $4
    `;

    const result = await this.db.query(query, [
      wordId,
      word.part_of_speech,
      `%${word.english_word.substring(0, 3)}%`,
      limit
    ]);

    return result.rows;
  }

  /**
   * Get random words
   */
  async getRandom(count = 10) {
    const query = `
      SELECT ${this.columns}
      FROM ${this.tableName} w
      LEFT JOIN users u ON w.created_by = u.id
      WHERE w.is_verified = true
      ORDER BY RANDOM()
      LIMIT $1
    `;

    const result = await this.db.query(query, [count]);
    return result.rows;
  }

  /**
   * Verify word (admin)
   */
  async verify(id) {
    return await this.update(id, { is_verified: true });
  }

  /**
   * Unverify word (admin)
   */
  async unverify(id) {
    return await this.update(id, { is_verified: false });
  }

  /**
   * Helper: Serialize JSON data
   */
  _serializeJSON(data) {
    if (!data) return '[]';
    return typeof data === 'string' ? data : JSON.stringify(data);
  }
}

module.exports = new WordRepository();
