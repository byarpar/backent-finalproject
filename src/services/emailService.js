const nodemailer = require('nodemailer');
const axios = require('axios');
const logger = require('../utils/logger');

// ─── Branding ────────────────────────────────────────────────────────────────
const BRAND_NAME = process.env.EMAIL_SENDER_NAME || 'A Modern Discussion Forum (AMDF)';
const BRAND_FROM = process.env.EMAIL_FROM || 'noreply@educlaas.com';
const BRAND_COLOR = '#0d9488';
const BRAND_TAGLINE = 'A Modern Discussion Forum for Everyone';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

/**
 * Email Service
 * Supports: mandrill (Mailchimp Transactional), smtp, sendgrid, gmail, ses
 */
class EmailService {
  constructor() {
    this.transporter = null;
    this.isConfigured = false;
    this.initialize();
  }

  // ─── Initialization ──────────────────────────────────────────────────────────

  initialize() {
    try {
      const provider = (process.env.EMAIL_PROVIDER || 'smtp').toLowerCase();

      // ── Mandrill: use HTTP API (more reliable than SMTP) ──────────────────
      if (provider === 'mandrill') {
        const apiKey = process.env.SMTP_PASSWORD || process.env.SMTP_USER;
        if (!apiKey) {
          logger.warn('📧 Mandrill API key not set (SMTP_PASSWORD). Falling back to console.');
          this.isConfigured = false;
          return;
        }
        this.mandrillApiKey = apiKey;
        this.provider = 'mandrill';
        this.isConfigured = true;
        logger.info('✓ Email service configured [mandrill] → https://mandrillapp.com/api/1.0');
        logger.info(`📧 Sending as: ${BRAND_NAME} <${BRAND_FROM}>`);
        return;
      }

      // ── SMTP providers ────────────────────────────────────────────────────
      const configs = {
        // Generic SMTP (AWS SES, custom)
        smtp: {
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT) || 587,
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD
          },
          tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' }
        },

        // Gmail
        gmail: {
          host: 'smtp.gmail.com',
          port: 587,
          secure: false,
          auth: {
            user: process.env.SMTP_USER || process.env.EMAIL_USER,
            pass: process.env.SMTP_PASSWORD || process.env.EMAIL_PASSWORD
          }
        },

        // SendGrid
        sendgrid: {
          host: 'smtp.sendgrid.net',
          port: 587,
          secure: false,
          auth: { user: 'apikey', pass: process.env.SENDGRID_API_KEY }
        },

        // AWS SES
        ses: {
          host: process.env.AWS_SES_HOST || 'email-smtp.us-east-1.amazonaws.com',
          port: 587,
          secure: false,
          auth: {
            user: process.env.AWS_SES_USER,
            pass: process.env.AWS_SES_PASSWORD
          },
          tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' }
        }
      };

      const config = configs[provider] || configs.smtp;

      if (!config.auth.user || !config.auth.pass) {
        logger.warn('📧 Email service not configured (missing SMTP_USER / SMTP_PASSWORD).');
        logger.info('💡 Codes and reset links will be logged to console in dev mode.');
        this.isConfigured = false;
        return;
      }

      this.transporter = nodemailer.createTransport(config);
      this.provider = provider;
      this.isConfigured = true;
      logger.info(`✓ Email service configured [${provider}] → ${config.host}:${config.port}`);
      logger.info(`📧 Sending as: ${BRAND_NAME} <${BRAND_FROM}>`);

    } catch (err) {
      logger.warn('📧 Email service initialization failed:', err.message);
      this.isConfigured = false;
    }
  }

  // ─── Internal helpers ────────────────────────────────────────────────────────

  async _send(to, subject, html, text) {
    // ── Mandrill HTTP API ────────────────────────────────────────────────────
    if (this.provider === 'mandrill') {
      const payload = {
        key: this.mandrillApiKey,
        message: {
          html,
          text,
          subject,
          from_email: BRAND_FROM,
          from_name: BRAND_NAME,
          to: [{ email: to, type: 'to' }]
        }
      };
      const response = await axios.post(
        'https://mandrillapp.com/api/1.0/messages/send',
        payload,
        { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
      );
      const result = response.data?.[0];
      if (result?.status === 'rejected' || result?.status === 'invalid') {
        throw new Error(`Mandrill rejected email: ${result.reject_reason || result.status}`);
      }
      logger.info('✓ Email sent via Mandrill API', { to, subject, status: result?.status, id: result?._id });
      return { success: true, mode: 'sent', messageId: result?._id };
    }

    // ── Nodemailer SMTP (all other providers) ────────────────────────────────
    const info = await this.transporter.sendMail({
      from: { name: BRAND_NAME, address: BRAND_FROM },
      to,
      subject,
      html,
      text
    });
    logger.info('✓ Email sent', { to, subject, messageId: info.messageId });
    return { success: true, mode: 'sent', messageId: info.messageId };
  }

  _consoleLog(label, to, extra = {}) {
    const lines = [
      '',
      '='.repeat(62),
      `📧  ${label}`,
      '='.repeat(62),
      `To: ${to}`,
      ...Object.entries(extra).map(([k, v]) => `${k}: ${v}`),
      '='.repeat(62),
      ''
    ];
    console.log(lines.join('\n'));
    logger.warn(`${label} (console fallback)`, { to, ...extra });
  }

  // ─── Verification email ──────────────────────────────────────────────────────

  async sendVerificationCode(email, code) {
    if (!this.isConfigured) {
      this._consoleLog('EMAIL VERIFICATION CODE', email, { Code: code });
      return { success: true, mode: 'logged' };
    }
    try {
      return await this._send(
        email,
        `Verify your email – ${BRAND_NAME}`,
        this._verificationHtml(code),
        this._verificationText(code)
      );
    } catch (err) {
      logger.error('Failed to send verification email', { email, error: err.message });
      this._consoleLog('VERIFICATION CODE (send failed — use this to verify)', email, {
        Code: code,
        Error: err.message
      });
      return { success: true, mode: 'logged_fallback' };
    }
  }

  // ─── Password reset email ────────────────────────────────────────────────────

  async sendPasswordReset(email, resetToken, resetUrl) {
    if (!this.isConfigured) {
      this._consoleLog('PASSWORD RESET LINK', email, { URL: resetUrl });
      return { success: true, mode: 'logged' };
    }
    try {
      return await this._send(
        email,
        `Reset your password – ${BRAND_NAME}`,
        this._resetHtml(resetUrl),
        this._resetText(resetUrl)
      );
    } catch (err) {
      logger.error('Failed to send password reset email', { email, error: err.message });
      this._consoleLog('PASSWORD RESET LINK (send failed)', email, {
        URL: resetUrl,
        Error: err.message
      });
      return { success: true, mode: 'logged_fallback' };
    }
  }

  // ─── HTML email layout ───────────────────────────────────────────────────────

  _baseLayout(title, content) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0"
        style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);width:100%;max-width:600px;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#0f766e 0%,${BRAND_COLOR} 100%);padding:32px 40px;text-align:center;">
            <p style="margin:0 0 4px;color:rgba(255,255,255,0.8);font-size:11px;letter-spacing:3px;text-transform:uppercase;font-weight:600;">
              ${BRAND_TAGLINE}
            </p>
            <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.5px;">
              ${BRAND_NAME}
            </h1>
          </td>
        </tr>

        <!-- Body -->
        <tr><td style="padding:40px 40px 32px;">${content}</td></tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:24px 40px;text-align:center;">
            <p style="margin:0 0 4px;color:#64748b;font-size:13px;font-weight:600;">${BRAND_NAME}</p>
            <p style="margin:0 0 10px;color:#94a3b8;font-size:12px;">${BRAND_TAGLINE}</p>
            <p style="margin:0;color:#cbd5e1;font-size:11px;">This is an automated message — please do not reply.</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }

  // ─── Verification template ───────────────────────────────────────────────────

  _verificationHtml(code) {
    const digits = String(code).split('').map(d =>
      `<span style="display:inline-block;width:44px;height:52px;line-height:52px;text-align:center;` +
      `background:#f0fdfa;border:2px solid ${BRAND_COLOR};border-radius:8px;font-size:28px;` +
      `font-weight:700;color:${BRAND_COLOR};font-family:'Courier New',monospace;margin:0 3px;">${d}</span>`
    ).join('');

    return this._baseLayout(`Verify your email – ${BRAND_NAME}`, `
      <h2 style="margin:0 0 16px;color:#0f172a;font-size:22px;font-weight:700;">Verify your email address</h2>
      <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.7;">
        Thanks for joining <strong>${BRAND_NAME}</strong>!
        Enter the 6-digit code below to complete your registration.
      </p>

      <div style="margin:0 0 28px;text-align:center;padding:28px 20px;background:#f8fafc;border-radius:10px;">
        ${digits}
      </div>

      <div style="padding:16px 20px;background:#f0fdfa;border-left:4px solid ${BRAND_COLOR};border-radius:4px;margin-bottom:24px;">
        <p style="margin:0;color:#0f766e;font-size:13px;line-height:1.7;">
          ⏱&nbsp; This code expires in <strong>15 minutes</strong>.<br>
          🔒&nbsp; If you did not create an account, you can safely ignore this email.
        </p>
      </div>

      <p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;">
        Having trouble? Visit
        <a href="${FRONTEND_URL}" style="color:${BRAND_COLOR};text-decoration:none;">${FRONTEND_URL}</a>
      </p>
    `);
  }

  _verificationText(code) {
    return [
      `VERIFY YOUR EMAIL — ${BRAND_NAME}`,
      '',
      `Your 6-digit verification code: ${code}`,
      '',
      'This code expires in 15 minutes.',
      'If you did not register, please ignore this email.',
      '',
      `— ${BRAND_NAME}`
    ].join('\n');
  }

  // ─── Password reset template ─────────────────────────────────────────────────

  _resetHtml(resetUrl) {
    return this._baseLayout(`Reset your password – ${BRAND_NAME}`, `
      <h2 style="margin:0 0 16px;color:#0f172a;font-size:22px;font-weight:700;">Reset your password</h2>
      <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.7;">
        We received a request to reset the password for your <strong>${BRAND_NAME}</strong> account.
        Click the button below to choose a new password.
      </p>

      <div style="text-align:center;margin:0 0 32px;">
        <a href="${resetUrl}"
          style="display:inline-block;padding:14px 36px;background:${BRAND_COLOR};color:#ffffff;
                 font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;letter-spacing:0.3px;">
          Reset Password
        </a>
      </div>

      <div style="padding:16px 20px;background:#fff7ed;border-left:4px solid #f97316;border-radius:4px;">
        <p style="margin:0;color:#9a3412;font-size:13px;line-height:1.7;">
          ⏱&nbsp; This link expires in <strong>1 hour</strong>.<br>
          🔒&nbsp; If you did not request a password reset, you can safely ignore this email — your password will not change.
        </p>
      </div>
    `);
  }

  _resetText(resetUrl) {
    return [
      `RESET YOUR PASSWORD — ${BRAND_NAME}`,
      '',
      'We received a request to reset your password.',
      '',
      'Reset link (expires in 1 hour):',
      resetUrl,
      '',
      'If you did not request this, please ignore this email.',
      '',
      `— ${BRAND_NAME}`
    ].join('\n');
  }
}

module.exports = new EmailService();

