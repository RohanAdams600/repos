/**
 * Gmail integration — the "inbox" claim. Runs in mock mode (returns
 * canned sample messages, logs sends instead of delivering) until all
 * three GMAIL_* credentials are set — same pattern as every other
 * integration in this file set (payments, Vapi, email). Reading/listing
 * is unrestricted; sending a reply is only ever called from the
 * founder-gated route in routes/inbox.ts — Wordsmith drafts, it never
 * sends (see identity.md).
 */
import { env } from "./env.js";
import { getGoogleAccessToken } from "./google-oauth.js";
import { logger } from "./logger.js";

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export const isGmailConfigured = Boolean(
  env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET && env.GMAIL_REFRESH_TOKEN && env.GMAIL_USER_EMAIL
);

async function gmailAccessToken(): Promise<string> {
  return getGoogleAccessToken({
    clientId: env.GMAIL_CLIENT_ID!,
    clientSecret: env.GMAIL_CLIENT_SECRET!,
    refreshToken: env.GMAIL_REFRESH_TOKEN!,
  });
}

export interface IncomingEmail {
  externalId: string;
  threadId: string;
  fromEmail: string;
  subject: string;
  body: string;
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

function encodeBase64Url(data: string): string {
  return Buffer.from(data, "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

interface GmailMessagePart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailMessagePart[];
}

function extractBodyText(payload: GmailMessagePart | undefined): string {
  if (payload?.body?.data) return decodeBase64Url(payload.body.data);
  const textPart = payload?.parts?.find((p) => p.mimeType === "text/plain");
  if (textPart?.body?.data) return decodeBase64Url(textPart.body.data);
  const anyPart = payload?.parts?.find((p) => p.body?.data);
  return anyPart?.body?.data ? decodeBase64Url(anyPart.body.data) : "";
}

function headerValue(headers: { name: string; value: string }[], name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

const MOCK_INBOX: IncomingEmail[] = [
  {
    externalId: "mock-email-1",
    threadId: "mock-thread-1",
    fromEmail: "owner@acmeautorepair.example.com",
    subject: "Do you have anything Thursday afternoon?",
    body: "Hey, my check engine light is on and I was hoping to get in sometime Thursday afternoon if you have room. Let me know!",
  },
  {
    externalId: "mock-email-2",
    threadId: "mock-thread-2",
    fromEmail: "newlead@example.com",
    subject: "Question about pricing",
    body: "Hi, I saw your site and I'm curious what the Core plan actually includes month to month. Can you break it down?",
  },
];

/**
 * Lists unread messages. Mock mode returns the same small fixed set every
 * time (stable external ids so the DB's ON CONFLICT dedupes repeats,
 * rather than growing forever on every heartbeat).
 */
export async function fetchUnreadEmails(maxResults = 10): Promise<IncomingEmail[]> {
  if (!isGmailConfigured) {
    logger.info("[mock gmail] returning sample inbox — set GMAIL_* env vars to sync a real inbox");
    return MOCK_INBOX;
  }

  const token = await gmailAccessToken();
  const listResponse = await fetch(
    `${GMAIL_API_BASE}/messages?q=is:unread&maxResults=${maxResults}`,
    { headers: { authorization: `Bearer ${token}` } }
  );
  if (!listResponse.ok) {
    throw new Error(`Gmail list messages failed: ${listResponse.status}`);
  }
  const listData = (await listResponse.json()) as { messages?: { id: string; threadId: string }[] };
  const messages = listData.messages ?? [];

  const details = await Promise.all(
    messages.map(async (m) => {
      const detailResponse = await fetch(`${GMAIL_API_BASE}/messages/${m.id}?format=full`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!detailResponse.ok) return null;
      const detail = (await detailResponse.json()) as {
        payload?: GmailMessagePart & { headers?: { name: string; value: string }[] };
      };
      const headers = detail.payload?.headers ?? [];
      return {
        externalId: m.id,
        threadId: m.threadId,
        fromEmail: headerValue(headers, "From"),
        subject: headerValue(headers, "Subject"),
        body: extractBodyText(detail.payload),
      } satisfies IncomingEmail;
    })
  );

  return details.filter((d): d is IncomingEmail => d !== null);
}

export interface SendReplyResult {
  mock: boolean;
}

export async function sendEmailReply(input: {
  threadId: string;
  to: string;
  subject: string;
  body: string;
}): Promise<SendReplyResult> {
  if (!isGmailConfigured) {
    logger.info({ to: input.to, subject: input.subject }, "[mock gmail] would send reply — not actually delivered");
    return { mock: true };
  }

  const token = await gmailAccessToken();
  const mimeMessage = [
    `To: ${input.to}`,
    `From: ${env.GMAIL_USER_EMAIL}`,
    `Subject: ${input.subject.startsWith("Re:") ? input.subject : `Re: ${input.subject}`}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    input.body,
  ].join("\r\n");

  const response = await fetch(`${GMAIL_API_BASE}/messages/send`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ raw: encodeBase64Url(mimeMessage), threadId: input.threadId }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Gmail send failed: ${response.status} ${body}`);
  }

  return { mock: false };
}
