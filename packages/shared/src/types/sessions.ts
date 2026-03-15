// Session-related types

export type SessionStatus = "active" | "ended" | "error";

export type Session = {
  id: string;
  sessionKey: string;
  channel: string;
  agentId: string | null;
  status: SessionStatus;
  workspaceId: string | null;
  createdAt: Date;
  updatedAt: Date;
  endedAt: Date | null;
};

export type CreateSessionParams = {
  channel: string;
  agentId?: string;
  workspaceId?: string;
};
