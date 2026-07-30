import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, ensureDataDir } from "./paths.js";

export interface BusinessProfile {
  businessName: string;
  hours: string;
  services: string;
  pricingNotes: string;
  tone: string;
  contactEmail: string;
  contactPhone: string;
}

const PROFILE_PATH = path.join(DATA_DIR, "business-profile.json");

export function profileExists(): boolean {
  return fs.existsSync(PROFILE_PATH);
}

export function loadProfile(): BusinessProfile | null {
  if (!profileExists()) return null;
  const raw = fs.readFileSync(PROFILE_PATH, "utf8");
  return JSON.parse(raw) as BusinessProfile;
}

export function saveProfile(profile: BusinessProfile): void {
  ensureDataDir();
  fs.writeFileSync(PROFILE_PATH, JSON.stringify(profile, null, 2), "utf8");
}

/** Rendered into every lane's system prompt so drafts sound like this specific business, not a generic one — the same "voice from real operating patterns" idea as agents/playbooks/voice-style-guide.md, just collected directly from the owner instead of extracted from history. */
export function profileToContextBlock(profile: BusinessProfile): string {
  return [
    `Business: ${profile.businessName}`,
    `Hours: ${profile.hours}`,
    `Services: ${profile.services}`,
    `Pricing notes: ${profile.pricingNotes}`,
    `Tone: ${profile.tone}`,
    `Contact for anything you can't handle: ${profile.contactEmail} / ${profile.contactPhone}`,
  ].join("\n");
}
