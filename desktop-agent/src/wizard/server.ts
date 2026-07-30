import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { saveProfile, type BusinessProfile } from "../lib/profile.js";
import { writeApiKeyToEnvFile } from "./env-writer.js";
import { logger } from "../lib/logger.js";
import { env } from "../config/env.js";
import { tierConfig } from "../config/tiers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const setupSchema = z.object({
  businessName: z.string().min(1),
  hours: z.string().min(1),
  services: z.string().min(1),
  pricingNotes: z.string().default(""),
  tone: z.string().min(1),
  contactEmail: z.string().email(),
  contactPhone: z.string().min(1),
  anthropicApiKey: z.string().optional().default(""),
});

export function createWizardApp() {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, "public")));

  app.get("/api/status", (_req, res) => {
    const config = tierConfig(env.SUBSCRIPTION_TIER);
    res.json({ tier: env.SUBSCRIPTION_TIER, label: config.label, capabilityLanes: config.capabilityLanes });
  });

  app.post("/api/setup", (req, res) => {
    const parsed = setupSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_input", details: parsed.error.flatten().fieldErrors });
      return;
    }

    const profile: BusinessProfile = {
      businessName: parsed.data.businessName,
      hours: parsed.data.hours,
      services: parsed.data.services,
      pricingNotes: parsed.data.pricingNotes,
      tone: parsed.data.tone,
      contactEmail: parsed.data.contactEmail,
      contactPhone: parsed.data.contactPhone,
    };
    saveProfile(profile);

    if (parsed.data.anthropicApiKey.trim()) {
      writeApiKeyToEnvFile(parsed.data.anthropicApiKey.trim());
    }

    logger.info({ businessName: profile.businessName }, "setup wizard: profile saved");
    res.status(200).json({ ok: true, needsRestart: true });
  });

  return app;
}

export function startWizard(): void {
  const app = createWizardApp();
  const server = app.listen(env.WIZARD_PORT, () => {
    logger.info(`Setup wizard running — open http://localhost:${env.WIZARD_PORT} in your browser to finish setup.`);
  });
  process.on("SIGINT", () => {
    server.close();
    process.exit(0);
  });
}
