export interface AgentUsage {
  totalTokens: number;
  toolUses: number;
  durationMs: number;
}

export interface AgentActivity {
  toolName: string;
  summary: string;
  timestamp: number;
}

export interface Agent {
  id: number;
  description: string;
  prompt: string;
  subagentType: string;
  background: boolean;
  status: "running" | "completed" | "error";
  startedAt: string;
  completedAt?: string;
  elapsed?: number;
  sessionId?: string;
  resultPreview?: string;
  usage?: AgentUsage;
  currentActivity?: AgentActivity;
  activityLog?: AgentActivity[];
}

export interface AgentEvent {
  type: "agent_started" | "agent_completed";
  agentId: number;
  agent: Agent;
  timestamp: string;
  usage?: AgentUsage;
}

export interface GlobalUsage {
  totalTokens: number;
  totalToolUses: number;
  totalDurationMs: number;
}

export interface InitEvent {
  type: "init";
  agents: Agent[];
  events: AgentEvent[];
  usage: GlobalUsage;
  sessionStartedAt: string;
}

export type SSEEvent = AgentEvent | InitEvent;
