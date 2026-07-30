import { beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import { DATA_DIR } from "../lib/paths.js";
import { loadQueue, saveQueue, pendingItems } from "./queue.js";

describe("queue", () => {
  beforeEach(() => {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  });

  it("seeds an example item the first time a lane's queue is loaded", () => {
    const items = loadQueue("front-desk");
    expect(items).toHaveLength(1);
    expect(items[0].draftedReply).toBeUndefined();
  });

  it("night-report seeds no example items — it has no queue, it summarizes state instead", () => {
    expect(loadQueue("night-report")).toEqual([]);
  });

  it("persists whatever is saved back, not the seed forever", () => {
    saveQueue("front-desk", [{ id: "custom-1", contact: "real@customer.com", subject: "Hi", body: "body" }]);
    const items = loadQueue("front-desk");
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("custom-1");
  });

  it("pendingItems only returns items without a drafted reply yet", () => {
    const items = [
      { id: "1", contact: "a", subject: "s", body: "b", draftedReply: "already drafted" },
      { id: "2", contact: "a", subject: "s", body: "b" },
    ];
    expect(pendingItems(items).map((i) => i.id)).toEqual(["2"]);
  });
});
