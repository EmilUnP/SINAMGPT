export type UserRole = "admin" | "user";

export type User = {
  id: string;
  username: string;
  role: UserRole;
  is_active: number;
  created_at: string;
  last_active_at: string | null;
};

export type Project = {
  id: string;
  name: string;
  description: string;
  created_by: string | null;
  is_archived: number;
  created_at: string;
  updated_at: string;
};

export type Conversation = {
  id: string;
  user_id: string;
  title: string;
  model: string;
  project_id: string | null;
  /** When set, any logged-in colleague can open /share/[token] (read-only) */
  share_token?: string | null;
  is_pinned: number;
  created_at: string;
  updated_at: string;
};

export type KnowledgeCitation = {
  id: string;
  title: string;
  category: string;
};

export type MessageAttachment = {
  type: "image" | "audio";
  mime: string;
  name: string;
  index: number;
};

export type ToolTraceEntry = {
  callId: string;
  toolName: string;
  status:
    | "completed"
    | "unknown_tool"
    | "invalid_input"
    | "blocked_input"
    | "handler_error"
    | "invalid_output"
    | "blocked_output";
  input?: string;
  output?: string;
  error?: string;
  durationMs: number;
};

export type Message = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
  /** Knowledge docs used for this assistant reply (JSON in DB) */
  sources?: KnowledgeCitation[] | null;
  /** Image / audio attachments on user messages */
  attachments?: MessageAttachment[] | null;
  /** Bounded, redacted tool execution metadata (JSON in DB). */
  tool_trace?: ToolTraceEntry[] | null;
};

export type SessionPayload = {
  userId: string;
  username: string;
  /** Present on sessions created after v1.1; missing → re-login for admin routes */
  role?: UserRole;
  exp: number;
};

export type AdminUserRow = {
  id: string;
  username: string;
  role: UserRole;
  is_active: number;
  created_at: string;
  last_active_at: string | null;
  conversation_count: number;
  message_count: number;
  user_message_count: number;
};
