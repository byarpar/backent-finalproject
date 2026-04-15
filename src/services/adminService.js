/**
 * Admin Service
 * Basic implementation to prevent import errors
 */

const logger = require('../utils/logger');
const { db } = require('../config/database');

class AdminService {
  async getDashboardStats() {
    const [overview, recentUsers, recentDiscussions, recentReports, weeklyActivity] = await Promise.all([
      // --- Overview counts ---
      db.query(`
        SELECT
          (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL)::int AS total_users,
          (SELECT COUNT(*) FROM users WHERE is_active = true AND deleted_at IS NULL)::int AS active_users,
          (SELECT COUNT(*) FROM users WHERE is_active = false AND deleted_at IS NULL)::int AS inactive_users,
          (SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '24 hours' AND deleted_at IS NULL)::int AS new_users_24h,
          (SELECT COUNT(*) FROM discussions)::int AS total_discussions,
          (SELECT COUNT(*) FROM discussions WHERE created_at >= NOW() - INTERVAL '24 hours')::int AS new_discussions_24h,
          (SELECT COUNT(*) FROM answers)::int AS total_answers,
          (SELECT COUNT(*) FROM answers WHERE created_at >= NOW() - INTERVAL '24 hours')::int AS new_answers_24h,
          (SELECT COUNT(*) FROM discussion_reports WHERE status = 'pending')::int AS pending_reports,
          (SELECT COALESCE(SUM(views_count), 0) FROM discussions)::int AS total_views
      `),

      // --- 5 most recent user registrations ---
      db.query(`
        SELECT id, username, email, role, is_active, created_at, profile_photo_url
        FROM users
        WHERE deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT 5
      `),

      // --- 5 most recent discussions ---
      db.query(`
        SELECT d.id, d.title, d.category, d.views_count, d.answers_count, d.vote_count, d.created_at,
               u.username AS author, u.profile_photo_url AS author_avatar
        FROM discussions d
        JOIN users u ON d.author_id = u.id
        ORDER BY d.created_at DESC
        LIMIT 5
      `),

      // --- Recent pending reports ---
      db.query(`
        SELECT r.id, r.reason, r.status, r.created_at,
               u.username AS reporter,
               d.title AS discussion_title
        FROM discussion_reports r
        LEFT JOIN users u ON r.reporter_id = u.id
        LEFT JOIN discussions d ON r.discussion_id = d.id
        WHERE r.status = 'pending'
        ORDER BY r.created_at DESC
        LIMIT 5
      `),

      // --- 7-day daily new users + discussions for mini sparklines ---
      db.query(`
        SELECT
          TO_CHAR(gs::date, 'Mon DD') AS day,
          COALESCE(u.cnt, 0)::int AS new_users,
          COALESCE(d.cnt, 0)::int AS new_discussions
        FROM generate_series(NOW()::date - 6, NOW()::date, '1 day') AS gs
        LEFT JOIN (
          SELECT DATE(created_at) AS dt, COUNT(*)::int AS cnt
          FROM users WHERE created_at >= NOW() - INTERVAL '7 days' AND deleted_at IS NULL
          GROUP BY DATE(created_at)
        ) u ON u.dt = gs::date
        LEFT JOIN (
          SELECT DATE(created_at) AS dt, COUNT(*)::int AS cnt
          FROM discussions WHERE created_at >= NOW() - INTERVAL '7 days'
          GROUP BY DATE(created_at)
        ) d ON d.dt = gs::date
        ORDER BY gs
      `)
    ]);

    const o = overview.rows[0];
    return {
      dashboard: {
        overview: {
          total_users: o.total_users,
          active_users: o.active_users,
          inactive_users: o.inactive_users,
          new_users_24h: o.new_users_24h,
          total_discussions: o.total_discussions,
          new_discussions_24h: o.new_discussions_24h,
          total_answers: o.total_answers,
          new_answers_24h: o.new_answers_24h,
          pending_reports: o.pending_reports,
          total_views: o.total_views,
        },
        recentUsers: recentUsers.rows,
        recentDiscussions: recentDiscussions.rows,
        recentReports: recentReports.rows,
        weeklyActivity: weeklyActivity.rows,
      }
    };
  }

  /**
   * Get analytics data for a given time range.
   * @param {'7days'|'30days'|'90days'} range
   */
  async getAnalytics(range = '30days') {
    const days = range === '7days' ? 7 : range === '90days' ? 90 : 30;
    const prevDays = days * 2; // previous period for comparison

    const [summary, userGrowth, discussionActivity, topCategories, topContributors, reportsSummary] = await Promise.all([
      // --- Summary stats (current period vs previous period) ---
      db.query(`
        SELECT
          (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL)::int AS total_users,
          (SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '${days} days' AND deleted_at IS NULL)::int AS new_users,
          (SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '${prevDays} days' AND created_at < NOW() - INTERVAL '${days} days' AND deleted_at IS NULL)::int AS prev_new_users,
          (SELECT COUNT(*) FROM discussions)::int AS total_discussions,
          (SELECT COUNT(*) FROM discussions WHERE created_at >= NOW() - INTERVAL '${days} days')::int AS new_discussions,
          (SELECT COUNT(*) FROM discussions WHERE created_at >= NOW() - INTERVAL '${prevDays} days' AND created_at < NOW() - INTERVAL '${days} days')::int AS prev_new_discussions,
          (SELECT COUNT(*) FROM answers)::int AS total_answers,
          (SELECT COUNT(*) FROM answers WHERE created_at >= NOW() - INTERVAL '${days} days')::int AS new_answers,
          (SELECT COUNT(*) FROM answers WHERE created_at >= NOW() - INTERVAL '${prevDays} days' AND created_at < NOW() - INTERVAL '${days} days')::int AS prev_new_answers,
          (SELECT COUNT(*) FROM users WHERE is_active = true AND deleted_at IS NULL)::int AS active_users,
          (SELECT COALESCE(SUM(views_count), 0) FROM discussions WHERE created_at >= NOW() - INTERVAL '${days} days')::int AS total_views,
          (SELECT COUNT(*) FROM discussion_reports WHERE status = 'pending')::int AS pending_reports
      `),

      // --- Daily user registrations for trend chart ---
      db.query(`
        SELECT
          TO_CHAR(DATE_TRUNC('day', created_at), 'Mon DD') AS day,
          COUNT(*)::int AS count
        FROM users
        WHERE created_at >= NOW() - INTERVAL '${days} days'
          AND deleted_at IS NULL
        GROUP BY DATE_TRUNC('day', created_at)
        ORDER BY DATE_TRUNC('day', created_at)
      `),

      // --- Daily discussion + answer activity ---
      db.query(`
        SELECT
          TO_CHAR(DATE_TRUNC('day', created_at), 'Mon DD') AS day,
          COUNT(*)::int AS discussions,
          0 AS answers
        FROM discussions
        WHERE created_at >= NOW() - INTERVAL '${days} days'
        GROUP BY DATE_TRUNC('day', created_at)
        UNION ALL
        SELECT
          TO_CHAR(DATE_TRUNC('day', created_at), 'Mon DD') AS day,
          0 AS discussions,
          COUNT(*)::int AS answers
        FROM answers
        WHERE created_at >= NOW() - INTERVAL '${days} days'
        GROUP BY DATE_TRUNC('day', created_at)
        ORDER BY day
      `),

      // --- Top categories by discussion count ---
      db.query(`
        SELECT
          category,
          COUNT(*)::int AS count
        FROM discussions
        WHERE created_at >= NOW() - INTERVAL '${days} days'
        GROUP BY category
        ORDER BY count DESC
        LIMIT 6
      `),

      // --- Top contributors by answer + discussion count ---
      db.query(`
        SELECT
          u.username,
          u.profile_photo_url,
          (COUNT(DISTINCT d.id) + COUNT(DISTINCT a.id))::int AS contributions,
          COUNT(DISTINCT d.id)::int AS discussions,
          COUNT(DISTINCT a.id)::int AS answers
        FROM users u
        LEFT JOIN discussions d ON d.author_id = u.id AND d.created_at >= NOW() - INTERVAL '${days} days'
        LEFT JOIN answers a ON a.author_id = u.id AND a.created_at >= NOW() - INTERVAL '${days} days'
        WHERE u.deleted_at IS NULL
        GROUP BY u.id, u.username, u.profile_photo_url
        HAVING (COUNT(DISTINCT d.id) + COUNT(DISTINCT a.id)) > 0
        ORDER BY contributions DESC
        LIMIT 5
      `),

      // --- Recent reports summary ---
      db.query(`
        SELECT
          status,
          COUNT(*)::int AS count
        FROM discussion_reports
        GROUP BY status
        ORDER BY count DESC
      `)
    ]);

    // Merge discussion activity by day
    const activityMap = {};
    for (const row of discussionActivity.rows) {
      if (!activityMap[row.day]) activityMap[row.day] = { day: row.day, discussions: 0, answers: 0 };
      activityMap[row.day].discussions += row.discussions;
      activityMap[row.day].answers += row.answers;
    }

    const s = summary.rows[0];
    const pctChange = (cur, prev) => prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 100);

    return {
      summary: {
        totalUsers: s.total_users,
        newUsers: s.new_users,
        newUsersPct: pctChange(s.new_users, s.prev_new_users),
        totalDiscussions: s.total_discussions,
        newDiscussions: s.new_discussions,
        newDiscussionsPct: pctChange(s.new_discussions, s.prev_new_discussions),
        totalAnswers: s.total_answers,
        newAnswers: s.new_answers,
        newAnswersPct: pctChange(s.new_answers, s.prev_new_answers),
        activeUsers: s.active_users,
        totalViews: s.total_views,
        pendingReports: s.pending_reports,
      },
      userGrowth: userGrowth.rows,
      activity: Object.values(activityMap).sort((a, b) => a.day.localeCompare(b.day)),
      topCategories: topCategories.rows,
      topContributors: topContributors.rows,
      reportsSummary: reportsSummary.rows,
    };
  }

  async getCategoriesAndTags() {
    const [categories, topTags, recentByCategory, tagCloud, totalTags] = await Promise.all([
      // Categories with discussion count + last activity
      db.query(`
        SELECT
          category,
          COUNT(*)::int AS discussion_count,
          SUM(views_count)::int AS total_views,
          SUM(answers_count)::int AS total_answers,
          MAX(created_at) AS last_activity
        FROM discussions
        GROUP BY category
        ORDER BY discussion_count DESC
      `),

      // Top 20 tags from tags table
      db.query(`
        SELECT
          name AS tag,
          usage_count::int AS count
        FROM tags
        ORDER BY usage_count DESC, name ASC
        LIMIT 20
      `),

      // Most recently active discussion per category
      db.query(`
        SELECT DISTINCT ON (category)
          category,
          id,
          title,
          created_at
        FROM discussions
        ORDER BY category, created_at DESC
      `),

      // Tags created in the last 30 days (new tags)
      db.query(`
        SELECT
          name AS tag,
          usage_count::int AS count
        FROM tags
        WHERE created_at >= NOW() - INTERVAL '30 days'
        ORDER BY usage_count DESC, name ASC
        LIMIT 10
      `),

      db.query('SELECT COUNT(*)::int AS total FROM tags')
    ]);

    const recentMap = {};
    for (const r of recentByCategory.rows) {
      recentMap[r.category] = r;
    }

    return {
      categories: categories.rows.map(c => ({
        ...c,
        recent_discussion: recentMap[c.category] || null,
      })),
      topTags: topTags.rows,
      newTags: tagCloud.rows,
      totalCategories: categories.rows.length,
      totalUniqueTags: totalTags.rows[0]?.total || 0,
    };
  }

  async getDiscussionStats() {
    const result = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM discussions)::int AS total_discussions,
        (SELECT COUNT(*) FROM discussions WHERE created_at >= NOW() - INTERVAL '24 hours')::int AS new_24h,
        (SELECT COUNT(*) FROM discussions WHERE created_at >= NOW() - INTERVAL '7 days')::int AS new_7d,
        (SELECT COUNT(*) FROM discussions WHERE is_locked = true)::int AS locked_count,
        (SELECT COUNT(*) FROM discussions WHERE is_pinned = true)::int AS pinned_count,
        (SELECT COUNT(*) FROM discussion_reports WHERE status = 'pending')::int AS pending_reports
    `);

    const topActive = await db.query(`
      SELECT d.id, d.title, d.answers_count, d.views_count, u.username AS author
      FROM discussions d
      JOIN users u ON d.author_id = u.id
      ORDER BY d.answers_count DESC, d.views_count DESC
      LIMIT 1
    `);

    const s = result.rows[0];
    return {
      totalDiscussions: s.total_discussions,
      new24h: s.new_24h,
      new7d: s.new_7d,
      lockedCount: s.locked_count,
      pinnedCount: s.pinned_count,
      pendingReports: s.pending_reports,
      mostActiveThread: topActive.rows[0] || null,
    };
  }

  async getRecentActivities() {
    // TODO: Implement recent activities
    return [];
  }

  async getSystemHealth() {
    const startTime = Date.now();
    let dbStatus = 'connected';
    let dbResponseMs = 0;
    try {
      const t0 = Date.now();
      await db.query('SELECT 1');
      dbResponseMs = Date.now() - t0;
    } catch {
      dbStatus = 'error';
    }

    const uptimeSecs = Math.floor(process.uptime());
    const d = Math.floor(uptimeSecs / 86400);
    const h = Math.floor((uptimeSecs % 86400) / 3600);
    const m = Math.floor((uptimeSecs % 3600) / 60);
    const uptimeStr = [d && `${d}d`, h && `${h}h`, `${m}m`].filter(Boolean).join(' ');

    const memMb = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
    const totalMemMb = (process.memoryUsage().heapTotal / 1024 / 1024).toFixed(1);

    const { env: cfgEnv } = require('../config');

    return {
      status: dbStatus === 'connected' ? 'healthy' : 'degraded',
      uptime: uptimeStr,
      uptimeSecs,
      database: {
        status: dbStatus,
        responseMs: dbResponseMs,
        host: cfgEnv.DB_HOST,
        name: cfgEnv.DB_NAME,
      },
      server: {
        nodeVersion: process.version,
        env: cfgEnv.NODE_ENV,
        port: cfgEnv.PORT,
        clientUrl: cfgEnv.CLIENT_URL,
      },
      memory: {
        usedMb: parseFloat(memMb),
        totalMb: parseFloat(totalMemMb),
        pct: Math.round((memMb / totalMemMb) * 100),
      },
      features: {
        emailEnabled: !!(cfgEnv.SMTP_HOST && cfgEnv.SMTP_USER),
        googleAuthEnabled: !!cfgEnv.GOOGLE_CLIENT_ID,
        maxFileSizeMb: Math.round(cfgEnv.MAX_FILE_SIZE / 1024 / 1024),
        jwtExpire: cfgEnv.JWT_EXPIRE,
      },
    };
  }
}

module.exports = new AdminService();