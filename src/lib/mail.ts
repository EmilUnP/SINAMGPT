export const DEFAULT_MAIL_FROM = "SINAMGPT <onboarding@resend.dev>";

export class MailError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "MailError";
    this.status = status;
  }
}

export const isMailConfigured = (): boolean =>
  Boolean(process.env.RESEND_API_KEY?.trim());

export const getMailFrom = (): string => {
  const from = process.env.MAIL_FROM?.trim();
  return from || DEFAULT_MAIL_FROM;
};

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

type ResendErrorBody = {
  message?: string;
  error?: { message?: string };
};

export const sendMail = async (message: MailMessage): Promise<void> => {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new MailError("RESEND_API_KEY is not set", 503);
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: getMailFrom(),
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
  });

  if (response.ok) return;

  const body = (await response.json().catch(() => null)) as ResendErrorBody | null;
  const detail =
    body?.message || body?.error?.message || `Resend HTTP ${response.status}`;
  throw new MailError(detail, 502);
};
