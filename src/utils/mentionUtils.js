/**
 * Mention Utilities
 * Functions for handling user mentions in content
 */

/**
 * Extract user mentions from text
 * @param {string} text - The text to extract mentions from
 * @returns {Array} Array of mentioned usernames
 */
function extractMentions(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  // Find mentions in format @username
  const mentionRegex = /@(\w+)/g;
  const mentions = [];
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    mentions.push(match[1]);
  }

  return [...new Set(mentions)]; // Remove duplicates
}

/**
 * Get context around mentions for notifications
 * @param {string} text - The full text content
 * @param {string} username - The mentioned username
 * @returns {Object} Context object with snippet
 */
function getMentionContext(text, username) {
  if (!text || !username) {
    return { snippet: '', position: -1 };
  }

  const mentionPattern = new RegExp(`@${username}\\b`, 'i');
  const match = text.match(mentionPattern);

  if (!match) {
    return { snippet: '', position: -1 };
  }

  const position = match.index;
  const start = Math.max(0, position - 50);
  const end = Math.min(text.length, position + 50);

  return {
    snippet: text.substring(start, end).trim(),
    position
  };
}

/**
 * Normalize mentions for consistent formatting
 * @param {Array} mentions - Array of mentioned usernames
 * @returns {Array} Array of normalized usernames
 */
function normalizeMentions(mentions) {
  if (!Array.isArray(mentions)) {
    return [];
  }

  return mentions
    .map(mention => mention.toLowerCase().trim())
    .filter(mention => mention.length > 0 && mention.length <= 50) // Basic validation
    .filter((mention, index, array) => array.indexOf(mention) === index); // Remove duplicates
}

/**
 * Replace mentions with links (for rendering)
 * @param {string} text - The text containing mentions
 * @param {Object} options - Options for link generation
 * @returns {string} Text with mentions replaced by links
 */
function replaceMentionsWithLinks(text, options = {}) {
  if (!text || typeof text !== 'string') {
    return text;
  }

  const baseUrl = options.baseUrl || '/users/';

  return text.replace(/@(\w+)/g, (match, username) => {
    return `<a href="${baseUrl}${username}" class="mention">@${username}</a>`;
  });
}

module.exports = {
  extractMentions,
  getMentionContext,
  normalizeMentions,
  replaceMentionsWithLinks
};