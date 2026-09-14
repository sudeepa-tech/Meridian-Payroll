import nodemailer from 'nodemailer';

/*
 * Real email sending via nodemailer/SMTP. If SMTP_HOST is not set in the environment, this
 * module runs in "dry-run" mode: it builds the exact email (subject, body, attachment) and
 * logs it, but never attempts a network call — the response is clearly marked status:
 * 'dry-run' so the UI can be honest about the difference. Set SMTP_HOST/PORT/USER/PASS/FROM
 * to enable real delivery.
 */
let transporter = null;
function getTransporter() {
  if (!process.env.SMTP_HOST) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

export function emailConfigured() { return !!process.env.SMTP_HOST; }

export async function sendPayslipEmail({ to, subject, html, attachmentBuffer, attachmentName }) {
  const t = getTransporter();
  if (!t) {
    return { status: 'dry-run', detail: `SMTP not configured on this server — email composed but not sent. Set SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_FROM to enable real delivery. Would have sent to: ${to || '(no email on file)'}` };
  }
  if (!to) return { status: 'failed', detail: 'Employee has no email address on file' };
  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to, subject, html,
      attachments: [{ filename: attachmentName, content: attachmentBuffer, contentType: 'application/pdf' }],
    });
    return { status: 'sent', detail: `Delivered to ${to}` };
  } catch (e) {
    return { status: 'failed', detail: e.message };
  }
}

export function payslipEmailHtml({ companyName, employeeName, period, net, currency }) {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h2 style="color:#17603f">${companyName}</h2>
      <p>Hi ${employeeName},</p>
      <p>Your payslip for <b>${period}</b> is attached as a PDF. Net pay this period: <b>${net} ${currency}</b>.</p>
      <p style="color:#8a968f;font-size:12px">This is an automated message from your payroll system. Please do not reply.</p>
    </div>`;
}
