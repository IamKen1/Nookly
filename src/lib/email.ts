import nodemailer from "nodemailer";

interface EmailPayload {
  to: string[];
  subject: string;
  text: string;
  html?: string;
}

export const isEmailNotificationConfigured = () =>
  Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS);

let transporter: nodemailer.Transporter | null = null;

const getTransporter = () => {
  if (transporter) return transporter;

  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!smtpHost || !smtpPort || !smtpUser || !smtpPass) {
    throw new Error("SMTP settings are incomplete");
  }

  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
  });

  return transporter;
};

export const sendAlertEmail = async ({ to, subject, text, html }: EmailPayload) => {
  const recipients = to.map((email) => email.trim()).filter(Boolean);
  if (!isEmailNotificationConfigured() || recipients.length === 0) {
    console.warn("[email] skipped: SMTP or recipients not configured");
    return { skipped: true };
  }

  const mailer = getTransporter();
  const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;

  try {
    await mailer.sendMail({ from: fromEmail, to: recipients, subject, text, html });
    return { skipped: false };
  } catch (err) {
    console.error("[email] failed to send", subject, err);
    throw err;
  }
};
