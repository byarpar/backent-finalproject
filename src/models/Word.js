const { db } = require('../config/database');
const { safeParseInt } = require('../utils/helpers');

class Word {
  static async findById(id) {
    const result = await db.query(`
      SELECT w.id, w.english_word, w.lisu_word, w.english_definition, w.lisu_definition,
             w.part_of_speech, w.pronunciation_english, w.pronunciation_lisu,
             w.examples, w.tags, w.is_verified,
             w.meaning, w.phrase, w.synonyms, w.antonyms,
             w.etymology_origin, w.etymology_context,
             w.created_by, w.created_at, w.updated_at,
             u.email as created_by_email, u.full_name as created_by_name,
             CASE WHEN w.etymology_origin IS NOT NULL OR w.etymology_context IS NOT NULL THEN true ELSE false END as has_etymology
      FROM words w
      LEFT JOIN users u ON w.created_by = u.id
      WHERE w.id = $1
    `, [id]);
    return result.rows[0];
  }

  static async create(wordData, userId) {
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
      antonyms
    } = wordData;

    const result = await db.query(`
      INSERT INTO words (
        english_word, lisu_word, english_definition, lisu_definition,
        part_of_speech, pronunciation_english, pronunciation_lisu,
        examples, tags, 
        meaning, phrase, synonyms, antonyms, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `, [
      english_word,
      lisu_word,
      english_definition,
      lisu_definition,
      part_of_speech,
      pronunciation_english,
      pronunciation_lisu,
      // Convert examples to JSON string for JSONB column
      examples ? (typeof examples === 'string' ? examples : JSON.stringify(examples)) : '[]',
      // Convert tags to JSON string for JSONB column
      tags ? (typeof tags === 'string' ? tags : JSON.stringify(tags)) : '[]',
      meaning,
      phrase,
      synonyms || '{}',
      antonyms || '{}',
      userId
    ]);

    return result.rows[0];
  }

  static async update(id, wordData) {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    Object.keys(wordData).forEach(key => {
      if (wordData[key] !== undefined) {
        fields.push(`${key} = $${paramIndex}`);

        // Convert arrays to JSON strings for JSONB columns (examples, tags)
        if ((key === 'examples' || key === 'tags') && wordData[key] !== null) {
          values.push(typeof wordData[key] === 'string' ? wordData[key] : JSON.stringify(wordData[key]));
        } else {
          values.push(wordData[key]);
        }
        paramIndex++;
      }
    });

    values.push(id);

    const result = await db.query(`
      UPDATE words 
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);

    return result.rows[0];
  }

  static async delete(id) {
    await db.query('DELETE FROM words WHERE id = $1', [id]);
  }

  static async list(options = {}) {
    const { page = 1, limit = 10, sort = 'created_at', order = 'DESC' } = options;
    const offset = (page - 1) * limit;

    // Validate sort column to prevent SQL injection
    const allowedSortColumns = ['id', 'english_word', 'lisu_word', 'part_of_speech', 'created_at', 'updated_at'];
    const sortColumn = allowedSortColumns.includes(sort) ? sort : 'created_at';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const result = await db.query(`
      SELECT w.id, w.english_word, w.lisu_word, w.english_definition, w.lisu_definition,
             w.part_of_speech, w.pronunciation_english, w.pronunciation_lisu,
             w.examples, w.tags, w.is_verified,
             w.meaning, w.phrase, w.synonyms, w.antonyms,
             w.etymology_origin, w.etymology_context,
             w.created_by, w.created_at, w.updated_at,
             u.email as created_by_email, u.full_name as created_by_name,
             CASE WHEN w.etymology_origin IS NOT NULL OR w.etymology_context IS NOT NULL THEN true ELSE false END as has_etymology
      FROM words w
      LEFT JOIN users u ON w.created_by = u.id
      ORDER BY w.${sortColumn} ${sortOrder}
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    const countResult = await db.query('SELECT COUNT(*) as total FROM words');

    return {
      words: result.rows,
      total: safeParseInt(countResult.rows[0]?.total, 0),
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(safeParseInt(countResult.rows[0]?.total, 0) / limit)
    };
  }

  static async search(query, options = {}) {
    const { page = 1, limit = 20, language = 'auto' } = options;
    const offset = (page - 1) * limit;

    let searchCondition;
    if (language === 'english') {
      searchCondition = 'w.english_word ILIKE $1 OR w.english_definition ILIKE $1';
    } else if (language === 'lisu') {
      searchCondition = 'w.lisu_word ILIKE $1 OR w.lisu_definition ILIKE $1';
    } else {
      searchCondition = `
        w.english_word ILIKE $1 OR w.english_definition ILIKE $1 OR w.lisu_word ILIKE $1 OR w.lisu_definition ILIKE $1
        OR to_tsvector('english', w.english_word || ' ' || COALESCE(w.english_definition, ''))
           @@ plainto_tsquery('english', $3)
      `;
    }

    const result = await db.query(`
      SELECT w.id, w.english_word, w.lisu_word, w.english_definition, w.lisu_definition,
             w.part_of_speech, w.pronunciation_english, w.pronunciation_lisu,
             w.examples, w.tags, w.is_verified,
             w.meaning, w.phrase, w.synonyms, w.antonyms,
             w.etymology_origin, w.etymology_context,
             w.created_by, w.created_at, w.updated_at,
             u.email as created_by_email, u.full_name as created_by_name,
             CASE WHEN w.etymology_origin IS NOT NULL OR w.etymology_context IS NOT NULL THEN true ELSE false END as has_etymology
      FROM words w
      LEFT JOIN users u ON w.created_by = u.id
      WHERE ${searchCondition}
      ORDER BY w.created_at DESC
      LIMIT $1 OFFSET $2
    `, language === 'auto' ? [limit, offset, query.replace('%', '')] : [`%${query}%`, limit, offset]);

    return result.rows;
  }

  /**
   * Get words by first letter - for alphabetical browsing
   */
  static async findByFirstLetter(letter, options = {}) {
    const { page = 1, limit = 20 } = options;
    const offset = (page - 1) * limit;

    const result = await db.query(`
      SELECT w.id, w.english_word, w.lisu_word, w.english_definition, w.lisu_definition,
             w.part_of_speech, w.pronunciation_english, w.pronunciation_lisu,
             w.examples, w.tags, w.is_verified,
             w.meaning, w.phrase, w.synonyms, w.antonyms,
             w.etymology_origin, w.etymology_context,
             w.created_by, w.created_at, w.updated_at
      FROM words w
      WHERE UPPER(SUBSTRING(w.english_word, 1, 1)) = UPPER($1)
      ORDER BY w.english_word ASC
      LIMIT $2 OFFSET $3
    `, [letter, limit, offset]);

    const countResult = await db.query(
      'SELECT COUNT(*) as total FROM words WHERE UPPER(SUBSTRING(english_word, 1, 1)) = UPPER($1)',
      [letter]
    );

    return {
      words: result.rows,
      total: safeParseInt(countResult.rows[0]?.total, 0),
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(safeParseInt(countResult.rows[0]?.total, 0) / limit)
    };
  }

  /**
   * Get alphabetical index with word counts
   */
  static async getAlphabeticalIndex() {
    const result = await db.query(`
      SELECT UPPER(SUBSTRING(english_word, 1, 1)) as letter, COUNT(*) as count
      FROM words
      WHERE english_word IS NOT NULL AND english_word != ''
      GROUP BY UPPER(SUBSTRING(english_word, 1, 1))
      ORDER BY letter ASC
    `);

    return result.rows;
  }
}

module.exports = Word;
