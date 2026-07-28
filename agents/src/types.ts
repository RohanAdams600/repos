export type SubAgentName = "scout" | "wordsmith" | "patch" | "warden";

export type TaskType =
  | "research"
  | "content"
  | "code"
  | "review"
  | "lead-score"
  | "lead-brief";

export type TrustStage = "manual" | "supervised" | "autonomous";

export type TaskRiskLevel = "low" | "medium" | "high";

export interface IncomingTask {
  id: string;
  type: TaskType;
  summary: string;
  payload: Record<string, unknown>;
  /** who/what triggered this: 'heartbeat' | 'webhook' | 'founder' | api caller id */
  source: string;
  createdAt: string;
}

export interface AgentAssembly {
  agent: SubAgentName;
  systemPrompt: string;
  model: string;
  maxTokens: number;
  riskLevel: TaskRiskLevel;
  requiresApproval: boolean;
}

export interface AgentActionResult {
  taskId: string;
  agent: SubAgentName;
  status: "completed" | "failed" | "queued_for_review" | "blocked";
  output: string;
  tokensIn: number;
  tokensOut: number;
  model: string;
  durationMs: number;
  blockedReason?: string;
}

export interface AssessResult {
  taskId: string;
  passed: boolean;
  notes: string;
  retryRecommended: boolean;
}

export interface LoopRunRecord {
  taskId: string;
  taskType: TaskType;
  agent: SubAgentName;
  status: AgentActionResult["status"];
  attempt: number;
  startedAt: string;
  finishedAt: string;
  assessment?: AssessResult;
}
