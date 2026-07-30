import { complete, MODELS } from "../lib/anthropic-client.js";
import { loadQueue, saveQueue, pendingItems } from "./queue.js";
import { recordProcessed, canProcessOneMore } from "../lib/state.js";
import { profileToContextBlock, type BusinessProfile } from "../lib/profile.js";
import { logger } from "../lib/logger.js";
import type { CapabilityLane, Tier } from "../config/tiers.js";

export interface LaneResult {
  lane: CapabilityLane;
  processed: number;
  failed: number;
  skippedAtCapacity: boolean;
}

/**
 * Shared drafting loop behind every queue-backed lane (front-desk,
 * sales-ledger, back-office). Every item gets a drafted reply written
 * back into data/inbound/<lane>.json — nothing here ever sends
 * anything for real; that's the same "agent drafts, human sends"
 * boundary every other part of Autonoma holds to. The daily cap is
 * checked before *every* item, not once per cycle, since capacity is
 * shared across all enabled lanes and another lane may have used it up
 * earlier in the same cycle.
 */
export async function runLane(input: {
  lane: CapabilityLane;
  roleBlock: string;
  profile: BusinessProfile;
  tier: Tier;
  model?: string;
}): Promise<LaneResult> {
  const items = loadQueue(input.lane);
  const pending = pendingItems(items);
  let processed = 0;
  let failed = 0;
  let skippedAtCapacity = false;

  for (const item of pending) {
    if (!canProcessOneMore(input.tier)) {
      skippedAtCapacity = true;
      break;
    }

    // Caught per-item, not left to propagate: one bad Anthropic call
    // (a rate limit, a network blip, a stale key) must not take down
    // the whole process — the customer's agent should keep running and
    // pick this item back up next cycle, not crash and stop everything.
    try {
      const system = [input.roleBlock, "", profileToContextBlock(input.profile)].join("\n");
      const result = await complete({
        model: input.model ?? MODELS.SONNET,
        system,
        maxTokens: 512,
        messages: [{ role: "user", content: `From: ${item.contact}\nSubject: ${item.subject}\n\n${item.body}` }],
      });

      item.draftedReply = result.text;
      item.draftedAt = new Date().toISOString();
      processed += 1;
      recordProcessed({ lane: input.lane, summary: `Drafted a reply to ${item.contact} (${item.subject})` });
      logger.info(
        { lane: input.lane, itemId: item.id },
        "drafted — review it in data/inbound/*.json before anything goes out"
      );
    } catch (err) {
      failed += 1;
      logger.error(
        { lane: input.lane, itemId: item.id, err },
        "couldn't draft this item — leaving it pending for the next cycle"
      );
    }
  }

  saveQueue(input.lane, items);
  return { lane: input.lane, processed, failed, skippedAtCapacity };
}
