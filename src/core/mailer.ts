import { createTransport } from 'nodemailer';
import type { SentMessageInfo, Transporter } from 'nodemailer';

export interface MailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
  from?: string;
}

/** The only cached state is the SMTP connection, keyed by SMTP_URL. Recipients,
 * subjects and bodies are never retained or logged, so nothing crosses tenants. */
let cached: { url: string; transporter: Transporter<SentMessageInfo> } | null = null;

const SECRET_PATTERN = /(?:token|password|passwd|secret|otp|code|key)\s*[:=]\s*[^\s,;]+|\/\/[^/@\s]+:[^/@\s]+@|[A-Za-z0-9+/_-]{24,}={0,2}/gi;

/** Scrub secrets and embedded credentials from anything that may be logged. */
function safe(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').replace(SECRET_PATTERN, '[redacted]');
}

function headerField(name: string, value: string): string {
  const clean = value.trim();
  if (!clean) throw new Error(`${name} is required for email delivery`);
  if (/[\r\n]/.test(clean)) throw new Error(`${name} must not contain line breaks`);
  return clean;
}

function defaultFrom(): string {
  const configured = process.env.SMTP_FROM?.trim();
  if (configured) return configured;
  try {
    const url = new URL(process.env.SMTP_URL || '');
    const user = decodeURIComponent(url.username);
    if (user.includes('@')) return user;
    if (url.hostname) return `no-reply@${url.hostname}`;
  } catch {
    // Fall through to a harmless local default.
  }
  return 'no-reply@localhost';
}

function getTransporter(): Transporter<SentMessageInfo> {
  const url = process.env.SMTP_URL?.trim();
  if (!url) throw new Error('SMTP_URL is required to send email in production');
  if (cached?.url === url) return cached.transporter;
  const transporter = createTransport(url, { from: defaultFrom() });
  cached = { url, transporter };
  return transporter;
}

/** Sends a transactional email in production; elsewhere it is a dry run. */
export async function sendMail(input: MailInput): Promise<void> {
  const to = headerField('to', input.to);
  const subject = headerField('subject', input.subject);
  const from = input.from ? headerField('from', input.from) : undefined;

  if (process.env.NODE_ENV !== 'production') {
    console.log(JSON.stringify({ event: 'mail.dry-run', to: safe(to), subject: safe(subject) }));
    return;
  }

  const url = process.env.SMTP_URL?.trim() || '';
  try {
    await getTransporter().sendMail({
      from: from ?? defaultFrom(),
      to,
      subject,
      text: input.text,
      ...(input.html ? { html: input.html } : {})
    });
  } catch (error) {
    let detail = safe(error instanceof Error ? error.message : String(error));
    if (url) detail = detail.split(url).join('[redacted]');
    throw new Error(`Email delivery failed: ${detail || 'unknown SMTP error'}`);
  }
}

export function mailerConfigured(): boolean {
  return Boolean(process.env.SMTP_URL?.trim());
}

export function resetMailerForTests(): void {
  if (cached) {
    try {
      cached.transporter.close();
    } catch {
      // Closing is best-effort; tests may use a stub transporter.
    }
    cached = null;
  }
}
