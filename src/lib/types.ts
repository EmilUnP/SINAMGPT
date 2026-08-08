export type UserRole = "admin" | "user";

export type User = {
  id: string;
  username: string;
  role: UserRole;
  is_active: number;
  created_at: string;
  last_active_at: string | null;
};

export type Conversation = {
  id: string;
  user_id: string;
  title: string;
  model: string;
  is_pinned: number;
  created_at: string;
  updated_at: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
};

export type SessionPayload = {
  userId: string;
  username: string;
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
