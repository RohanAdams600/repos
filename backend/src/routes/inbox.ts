import { Router } from "express";
import { requireDashboardToken } from "../lib/auth.js";
import { getInboxMessage, listInboxMessages, setInboxStatus } from "../lib/db.js";
import { sendEmailReply } from "../lib/gmail.js";
import { logger } from "../lib/logger.js";

export const inboxRouter = Router();
inboxRouter.use(requireDashboardToken);

inboxRouter.get("/", async (_req, res) => {
  const messages = await listInboxMessages();
  res.status(200).json({ messages });
});

/**
 * The founder's authenticated dashboard session IS the approval step —
 * this is the only path that ever actually sends an email reply. Wordsmith
 * only ever drafts (PATCH /api/agents/inbox/:id/draft).
 */
inboxRouter.post("/:id/send", async (req, res) => {
  const message = await getInboxMessage(req.params.id);
  if (!message) {
    res.status(404).json({ error: "message_not_found" });
    return;
  }
  if (!message.drafted_reply) {
    res.status(400).json({ error: "no_draft", message: "This message has no drafted reply yet." });
    return;
  }

  try {
    const result = await sendEmailReply({
      threadId: message.external_id ?? message.id,
      to: message.from_email,
      subject: message.subject,
      body: message.drafted_reply,
    });
    await setInboxStatus(message.id, "sent");
    res.status(200).json({ mock: result.mock });
  } catch (err) {
    logger.error({ err, messageId: message.id }, "failed to send inbox reply");
    res.status(500).json({ error: "internal_error" });
  }
});

inboxRouter.post("/:id/ignore", async (req, res) => {
  await setInboxStatus(req.params.id, "ignored");
  res.status(200).json({ ok: true });
});
