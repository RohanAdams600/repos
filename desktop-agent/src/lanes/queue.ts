import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, ensureDataDir } from "../lib/paths.js";
import type { CapabilityLane } from "../config/tiers.js";

export interface InboundItem {
  id: string;
  contact: string;
  subject: string;
  body: string;
  draftedReply?: string;
  draftedAt?: string;
}

/**
 * Ships with one example item per lane so `npm start` visibly does
 * something on the very first cycle instead of an empty log — same
 * "mock mode shows real behavior, not a blank screen" principle as the
 * rest of Autonoma. Replace/add real items in data/inbound/<lane>.json
 * as work actually comes in; nothing here talks to a live inbox or
 * phone line — that wiring (Gmail/Twilio/Calendar) is what the hosted
 * product does, not this local package. See README.md.
 */
const EXAMPLE_ITEMS: Record<CapabilityLane, InboundItem[]> = {
  "front-desk": [
    {
      id: "example-1",
      contact: "(555) 019-2231",
      subject: "Missed call",
      body: "Hi, do you have anything open this Thursday afternoon?",
    },
  ],
  "sales-ledger": [
    {
      id: "example-1",
      contact: "jane@example.com",
      subject: "Pricing inquiry",
      body: "Saw your site — what would it cost to get started?",
    },
  ],
  "back-office": [
    {
      id: "example-1",
      contact: "owner",
      subject: "Draft this month's invoice",
      body: "Bill Riverside Plaza for 3 service calls at $180 each, due in 14 days.",
    },
  ],
  "night-report": [],
};

function queuePath(lane: CapabilityLane): string {
  return path.join(DATA_DIR, "inbound", `${lane}.json`);
}

export function loadQueue(lane: CapabilityLane): InboundItem[] {
  const file = queuePath(lane);
  if (!fs.existsSync(file)) {
    ensureDataDir();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(EXAMPLE_ITEMS[lane], null, 2), "utf8");
    return EXAMPLE_ITEMS[lane];
  }
  return JSON.parse(fs.readFileSync(file, "utf8")) as InboundItem[];
}

export function saveQueue(lane: CapabilityLane, items: InboundItem[]): void {
  const file = queuePath(lane);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(items, null, 2), "utf8");
}

export function pendingItems(items: InboundItem[]): InboundItem[] {
  return items.filter((item) => !item.draftedReply);
}
