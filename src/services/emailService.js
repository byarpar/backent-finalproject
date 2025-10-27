const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

/**
 * Email Service for sending verification codes and notifications
 * Supports multiple email providers: Gmail, Outlook, SendGrid, AWS SES
 */
class EmailService {
  constructor() {
    this.transporter = null;
    this.isConfigured = false;
    this.initialize();
  }

  /**
   * Initialize email transporter based on environment configuration
   */
  initialize() {
    try {
      const emailProvider = process.env.EMAIL_PROVIDER || 'gmail';

      // Configuration for different email providers
      const configs = {
        // Gmail Configuration (Recommended for development)
        gmail: {
          host: 'smtp.gmail.com',
          port: 587,
          secure: false,
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD // Use App Password, not regular password
          }
        },

        // Outlook/Hotmail Configuration
        outlook: {
          service: 'hotmail',
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD
          }
        },

        // SendGrid Configuration (Recommended for production)
        sendgrid: {
          host: 'smtp.sendgrid.net',
          port: 587,
          secure: false,
          auth: {
            user: 'apikey',
            pass: process.env.SENDGRID_API_KEY
          }
        },

        // AWS SES Configuration (Recommended for production)
        ses: {
          host: process.env.AWS_SES_HOST || 'email-smtp.us-east-1.amazonaws.com',
          port: 587,
          secure: false,
          auth: {
            user: process.env.AWS_SES_USER,
            pass: process.env.AWS_SES_PASSWORD
          }
        },

        // Custom SMTP Configuration (AWS SES, etc.)
        smtp: {
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT) || 587,
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD
          },
          // AWS SES specific configuration
          tls: {
            rejectUnauthorized: true, // Verify SSL certificates
            minVersion: 'TLSv1.2'
          },
          requireTLS: true,
          connectionTimeout: 10000, // 10 seconds
          greetingTimeout: 10000,
          socketTimeout: 30000, // 30 seconds
          logger: false,
          debug: false
        }
      };

      const config = configs[emailProvider];

      if (!config || !config.auth.user || !config.auth.pass) {
        logger.info('📧 Email service not configured. Running in development mode.');
        logger.info('💡 Verification codes will be logged to console instead of sent via email.');
        this.isConfigured = false;
        return;
      }

      this.transporter = nodemailer.createTransport(config);
      this.isConfigured = true;

      // Skip verification for SMTP to avoid DNS issues
      // AWS SES connection will be tested when actually sending emails
      if (emailProvider === 'smtp') {
        logger.info(`✓ Email service configured using ${emailProvider} (AWS SES)`);
        logger.info(`📧 SMTP Host: ${process.env.SMTP_HOST}`);
      } else {
        // Verify connection configuration for other providers
        this.transporter.verify((error) => {
          if (error) {
            logger.warn(`📧 Email service connection failed: ${error.message}`);
            logger.info('💡 Running in fallback mode - verification codes will be logged to console.');
            this.isConfigured = false;
          } else {
            logger.info(`✓ Email service configured successfully using ${emailProvider}`);
          }
        });
      }

    } catch (error) {
      logger.warn('📧 Email service initialization failed:', error.message);
      logger.info('💡 Running in fallback mode - verification codes will be logged to console.');
      this.isConfigured = false;
    }
  }

  /**
   * Send verification code email
   */
  async sendVerificationCode(email, code) {
    try {
      // If email service is not configured, just log the code (for development)
      if (!this.isConfigured) {
        console.log('\n' + '='.repeat(60));
        console.log('📧 VERIFICATION CODE (Email Service Not Configured)');
        console.log('='.repeat(60));
        console.log(`Email: ${email}`);
        console.log(`Code:  ${code}`);
        console.log('='.repeat(60) + '\n');

        logger.info('Verification code generated (not sent via email):', {
          email,
          code,
          note: 'Email service not configured - code logged to console'
        });
        return { success: true, mode: 'logged' };
      }

      const mailOptions = {
        from: {
          name: 'Lisu Dictionary',
          address: process.env.EMAIL_FROM || process.env.EMAIL_USER
        },
        to: email,
        subject: 'Verify Your Email - Lisu Dictionary',
        html: this.getVerificationEmailTemplate(code),
        text: this.getVerificationEmailText(code)
      };

      const info = await this.transporter.sendMail(mailOptions);

      logger.info('✓ Verification email sent successfully', {
        email,
        messageId: info.messageId
      });

      return { success: true, mode: 'sent', messageId: info.messageId };

    } catch (error) {
      logger.error('Failed to send verification email:', {
        email,
        error: error.message
      });

      // Fallback: log the code if email sending fails
      const codeMessage = `\n${'='.repeat(60)}\n📧 VERIFICATION CODE (Email Sending Failed - Fallback)\n${'='.repeat(60)}\nEmail: ${email}\nCode:  ${code}\nError: ${error.message}\n${'='.repeat(60)}\n`;

      console.log(codeMessage);

      // Also log to file so it's easier to find
      logger.warn('⚠️ EMAIL SENDING FAILED - VERIFICATION CODE:', {
        email,
        code,
        error: error.message,
        note: 'User can use this code to verify their email'
      });

      return { success: true, mode: 'logged_fallback' };
    }
  }

  /**
   * HTML template for verification email
   */
  getVerificationEmailTemplate(code) {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #0d9488 0%, #14b8a6 100%); border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Verify Your Email</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.5;">
                Thank you for registering with <strong>Lisu Dictionary</strong>! To complete your registration and access all features, please verify your email address.
              </p>

              <p style="margin: 0 0 30px; color: #374151; font-size: 16px; line-height: 1.5;">
                Your verification code is:
              </p>

              <!-- Verification Code Box -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center" style="padding: 20px; background-color: #f3f4f6; border-radius: 8px;">
                    <div style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #0d9488; font-family: 'Courier New', monospace;">
                      ${code}
                    </div>
                  </td>
                </tr>
              </table>

              <p style="margin: 30px 0 20px; color: #6b7280; font-size: 14px; line-height: 1.5;">
                This code will expire in <strong>15 minutes</strong>. If you didn't request this code, please ignore this email.
              </p>

              <!-- Tips -->
              <div style="margin: 30px 0; padding: 20px; background-color: #f0fdfa; border-left: 4px solid #14b8a6; border-radius: 4px;">
                <p style="margin: 0; color: #115e59; font-size: 14px; line-height: 1.5;">
                  <strong>💡 Quick Tips:</strong><br>
                  • Enter the code on the verification page<br>
                  • Make sure to complete verification within 15 minutes<br>
                  • You can request a new code if this one expires
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0 0 10px; color: #6b7280; font-size: 14px;">
                <strong>Lisu Dictionary</strong><br>
                Preserving and promoting the Lisu language
              </p>
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                This is an automated email. Please do not reply to this message.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;
  }

  /**
   * Plain text version for verification email (fallback)
   */
  getVerificationEmailText(code) {
    return `
VERIFY YOUR EMAIL - LISU DICTIONARY

Thank you for registering with Lisu Dictionary!

Your verification code is: ${code}

This code will expire in 15 minutes.

To verify your email:
1. Go to the verification page
2. Enter the code above
3. Complete your registration

If you didn't request this code, please ignore this email.

---
Lisu Dictionary
Preserving and promoting the Lisu language
    `;
  }

  /**
   * Send password reset email
   */
  async sendPasswordReset(email, resetToken, resetUrl) {
    if (!this.isConfigured) {
      logger.warn('Password reset email not sent (service not configured)', {
        email,
        resetUrl
      });
      return { success: true, mode: 'logged' };
    }

    const mailOptions = {
      from: {
        name: 'Lisu Dictionary',
        address: process.env.EMAIL_FROM || process.env.EMAIL_USER
      },
      to: email,
      subject: 'Reset Your Password - Lisu Dictionary',
      html: `
        <h2>Password Reset Request</h2>
        <p>You requested to reset your password. Click the link below to reset it:</p>
        <p><a href="${resetUrl}" style="color: #0d9488; font-weight: bold;">Reset Password</a></p>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request this, please ignore this email.</p>
      `,
      text: `Password Reset Request\n\nClick this link to reset your password: ${resetUrl}\n\nThis link will expire in 1 hour.`
    };

    await this.transporter.sendMail(mailOptions);
    logger.info('Password reset email sent', { email });

    return { success: true, mode: 'sent' };
  }
}

// Export singleton instance
module.exports = new EmailService();
