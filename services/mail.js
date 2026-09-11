// @ts-nocheck
/**
 * SmartPay CRM — Mail Delivery Service
 * Production-ready email dispatcher with SMTP (Nodemailer) and Resend support.
 * Securely reads credentials from environment variables.
 */

const nodemailer = require('nodemailer');
const { Resend } = require('resend');

let smtpTransporter = null;
let resendClient = null;

function isConfigured(value) {
  if (!value) return false;
  const str = String(value).trim();
  return str.length > 0 && !str.includes('your_') && !str.includes('re_your_') && !str.includes('placeholder');
}

/**
 * Initialize or get the active mail transporter
 */
function initMailService() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

  if (isConfigured(host) && isConfigured(user) && isConfigured(pass)) {
    try {
      smtpTransporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
        tls: {
          rejectUnauthorized: process.env.NODE_ENV === 'production'
        }
      });
      console.log(`✅ SMTP Mail Transporter initialized (${host}:${port})`);
      return { provider: 'smtp', client: smtpTransporter };
    } catch (err) {
      console.error('⚠️  SMTP Transporter initialization error:', err.message);
    }
  }

  // Fallback to Resend if configured
  const resendKey = process.env.RESEND_API_KEY;
  if (isConfigured(resendKey)) {
    try {
      resendClient = new Resend(resendKey);
      console.log('✅ Resend Mail Client initialized');
      return { provider: 'resend', client: resendClient };
    } catch (err) {
      console.error('⚠️  Resend Client initialization error:', err.message);
    }
  }

  console.log('⚠️  No active mail provider configured (SMTP or Resend needed in .env)');
  return { provider: 'none', client: null };
}

/**
 * Validate email format
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const re = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return re.test(email.trim());
}

/**
 * Send an email with an optional PDF buffer attachment
 * @param {Object} options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML email body
 * @param {string} [options.text] - Plaintext fallback
 * @param {Buffer} [options.pdfBuffer] - PDF attachment buffer
 * @param {string} [options.filename] - Filename for attachment
 * @returns {Promise<{success: boolean, messageId: string, provider: string}>}
 */
async function sendLetterEmail({ to, subject, html, text, pdfBuffer, filename = 'HR_Document.pdf' }) {
  if (!isValidEmail(to)) {
    throw new Error(`Invalid recipient email address: "${to}". Please enter a valid email.`);
  }
  if (!subject || !String(subject).trim()) {
    throw new Error('Email subject is required.');
  }

  // Re-check or init transporter
  const status = initMailService();

  // 1. Send via SMTP (Nodemailer)
  if (status.provider === 'smtp' && smtpTransporter) {
    const from = process.env.SMTP_FROM || process.env.SMTP_USER;
    const mailOptions = {
      from,
      to: to.trim(),
      subject: subject.trim(),
      html,
      text: text || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    };

    if (pdfBuffer && Buffer.isBuffer(pdfBuffer)) {
      mailOptions.attachments = [
        {
          filename,
          content: pdfBuffer,
          contentType: 'application/pdf'
        }
      ];
    }

    const info = await smtpTransporter.sendMail(mailOptions);
    return {
      success: true,
      messageId: info.messageId,
      provider: 'smtp'
    };
  }

  // 2. Send via Resend
  if (status.provider === 'resend' && resendClient) {
    const from = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
    const emailData = {
      from,
      to: [to.trim()],
      subject: subject.trim(),
      html
    };

    if (pdfBuffer && Buffer.isBuffer(pdfBuffer)) {
      emailData.attachments = [
        {
          filename,
          content: pdfBuffer.toString('base64')
        }
      ];
    }

    const result = await resendClient.emails.send(emailData);
    if (result.error) {
      throw new Error(result.error.message || 'Resend delivery failed');
    }

    return {
      success: true,
      messageId: result.data?.id || result.id || 'resend-ok',
      provider: 'resend'
    };
  }

  // Neither configured
  throw new Error(
    'No active email service configured. Please configure SMTP credentials (SMTP_HOST, SMTP_USER, SMTP_PASS) or RESEND_API_KEY in your .env file.'
  );
}

/**
 * Get active provider status without exposing credentials
 */
function getEmailProviderStatus() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const resendKey = process.env.RESEND_API_KEY;

  if (isConfigured(host) && isConfigured(user)) {
    return { configured: true, provider: 'smtp', host, user: user.replace(/(.{2})(.*)(@.*)/, '$1***$3') };
  }
  if (isConfigured(resendKey)) {
    return { configured: true, provider: 'resend', from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev' };
  }
  return { configured: false, provider: 'none' };
}

module.exports = {
  sendLetterEmail,
  initMailService,
  isValidEmail,
  getEmailProviderStatus
};
