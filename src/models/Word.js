const { db } = require('../config/database');
const { safeParseInt } = require('../utils/helpers');

class Word {
  static async findById(id) {
    const result = await db.query(`
      SELECT w.*, u.email as created_by_email,
             CASE WHEN e.id IS NOT NULL THEN true ELSE false END as has_etymology
      FROM words w
      LEFT JOIN users u ON w.created_by = u.id
      LEFT JOIN etymology e ON w.id = e.word_id
      WHERE w.id = $1
    `, [id]);
    return result.rows[0];
  }

  static async create(wordData, userId) {
    const {
      english_word,
      lisu_translation,
      part_of_speech,
      definition,
      example_usage,
      phonetic,
      synonyms,
      antonyms
    } = wordData;

    const result = await db.query(`
      INSERT INTO words (
        english_word, lisu_word, english_definition, part_of_speech, created_by
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [
      english_word,
      lisu_translation, // This will go into lisu_word column
      definition, // This will go into english_definition column
      part_of_speech,
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
        values.push(wordData[key]);
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

    const result = await db.query(`
      SELECT w.*, u.email as created_by_email,
             CASE WHEN e.id IS NOT NULL THEN true ELSE false END as has_etymology
      FROM words w
      LEFT JOIN users u ON w.created_by = u.id
      LEFT JOIN etymology e ON w.id = e.word_id
      ORDER BY w.${sort} ${order}
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    const countResult = await db.query('SELECT COUNT(*) as total FROM words');

    return {
      words: result.rows,
      total: safeParseInt(countResult.rows[0]?.total, 0),
      page,
      limit,
      totalPages: Math.ceil(safeParseInt(countResult.rows[0]?.total, 0) / limit)
    };
  }

  static async search(query, options = {}) {
    const { page = 1, limit = 20, language = 'auto' } = options;
    const offset = (page - 1) * limit;

    let searchCondition;
    if (language === 'english') {
      searchCondition = 'w.english_word ILIKE $1 OR w.definition ILIKE $1 OR w.synonyms ILIKE $1';
    } else if (language === 'lisu') {
      searchCondition = 'w.lisu_translation ILIKE $1';
    } else {
      searchCondition = `
        w.english_word ILIKE $1 OR w.definition ILIKE $1 OR w.synonyms ILIKE $1 OR w.lisu_translation ILIKE $1
        OR to_tsvector('english', w.english_word || ' ' || COALESCE(w.definition, '') || ' ' || COALESCE(w.synonyms, ''))
           @@ plainto_tsquery('english', $3)
      `;
    }

    const result = await db.query(`
      SELECT w.*, u.email as created_by_email,
             CASE WHEN e.id IS NOT NULL THEN true ELSE false END as has_etymology
      FROM words w
      LEFT JOIN users u ON w.created_by = u.id
      LEFT JOIN etymology e ON w.id = e.word_id
      WHERE ${searchCondition}
      ORDER BY w.created_at DESC
      LIMIT $1 OFFSET $2
    `, language === 'auto' ? [limit, offset, query.replace('%', '')] : [`%${query}%`, limit, offset]);

    return result.rows;
  }
}

module.exports = Word;
