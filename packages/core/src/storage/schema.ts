export interface Database {
  workspaces: {
    id: string;
    path: string;
    name: string;
    last_opened_at: number;
    created_at: number;
  };
  sessions: {
    id: string;
    title: string;
    workspace_id: string;
    created_at: number;
    updated_at: number;
  };
  messages: {
    id: string;
    session_id: string;
    role: string;
    content: string;
    thinking: string | null;
    tool_calls: string | null;
    tool_call_id: string | null;
    tool_name: string | null;
    is_error: number;
    usage: string | null;
    run_id: string | null;
    created_at: number;
  };
  runs: {
    id: string;
    session_id: string;
    parent_tool_call_id: string;
    agent_type: string;
    status: string;
    summary: string | null;
    created_at: number;
    completed_at: number | null;
  };
  usage_records: {
    id: string;
    provider_id: string;
    model: string;
    session_id: string | null;
    message_id: string | null;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost: number;
    created_at: number;
  };
  usage_daily: {
    provider_id: string;
    model: string;
    date: string;
    requests: number;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost: number;
  };
  session_notes: {
    id: string;
    session_id: string;
    content: string;
    note_type: string;
    token_count: number;
    created_at: number;
    updated_at: number;
  };
}
