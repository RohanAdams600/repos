import { Router } from "express";
import { requireDashboardToken } from "../lib/auth.js";
import { getInvoice, listInvoices, markInvoiceSent } from "../lib/db.js";
import { sendInvoice } from "../lib/invoicing.js";
import { logger } from "../lib/logger.js";

export const invoicesRouter = Router();
invoicesRouter.use(requireDashboardToken);

invoicesRouter.get("/", async (_req, res) => {
  const invoices = await listInvoices();
  res.status(200).json({ invoices });
});

/**
 * The only path that actually creates and sends a real Stripe invoice —
 * identity.md boundary #1. Wordsmith only ever drafts line items
 * (POST /api/agents/invoices/draft).
 */
invoicesRouter.post("/:id/send", async (req, res) => {
  const invoice = await getInvoice(req.params.id);
  if (!invoice) {
    res.status(404).json({ error: "invoice_not_found" });
    return;
  }
  if (invoice.status !== "draft") {
    res.status(400).json({ error: "already_processed", status: invoice.status });
    return;
  }

  try {
    const result = await sendInvoice({ clientEmail: invoice.client_email, lineItems: invoice.line_items });
    await markInvoiceSent(invoice.id, result.stripeInvoiceId);
    res.status(200).json({ mock: result.mock, stripeInvoiceId: result.stripeInvoiceId });
  } catch (err) {
    logger.error({ err, invoiceId: invoice.id }, "failed to send invoice");
    res.status(500).json({ error: "internal_error" });
  }
});
