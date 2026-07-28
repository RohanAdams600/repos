import { describe, expect, it } from "vitest";
import { routeTask } from "./router.js";
import type { IncomingTask } from "../types.js";

function taskOf(type: IncomingTask["type"]): IncomingTask {
  return { id: "t1", type, summary: "test", payload: {}, source: "test", createdAt: new Date().toISOString() };
}

describe("routeTask — one task type maps to exactly one lane", () => {
  it.each([
    ["research", "scout"],
    ["lead-score", "scout"],
    ["lead-brief", "scout"],
    ["content", "wordsmith"],
    ["code", "patch"],
    ["review", "warden"],
  ] as const)("%s -> %s", (type, expectedAgent) => {
    expect(routeTask(taskOf(type)).agent).toBe(expectedAgent);
  });

  it("assigns 'high' risk only to code and review", () => {
    expect(routeTask(taskOf("code")).riskLevel).toBe("high");
    expect(routeTask(taskOf("review")).riskLevel).toBe("high");
    expect(routeTask(taskOf("research")).riskLevel).toBe("low");
    expect(routeTask(taskOf("lead-score")).riskLevel).toBe("low");
    expect(routeTask(taskOf("content")).riskLevel).toBe("medium");
  });
});
