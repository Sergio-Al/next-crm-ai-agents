// Auth & workspace membership types

export type WorkspaceRole = "owner" | "admin" | "member" | "viewer";

export type User = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type WorkspaceMember = {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  invitedBy: string | null;
  joinedAt: Date;
};

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  settings: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};
