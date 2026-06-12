Greenfield schema migrations (§5).

Tables (added in step 3):

- workspaces id, path(unique), name, last_opened_at, created_at
- sessions id, title, workspace_id, profile_id, created_at, updated_at
- messages id, session_id, seq, payload(json=SDKMessage), created_at
- usage_records id, session_id, model, provider_id, input_tokens,
  output_tokens, cache_read, cache_write, cost_usd, created_at
- provider_profiles id, name, provider, api_key, base_url, default_model,
  permission_mode, allowed_tools(json), mcp_servers(json),
  is_active

One file per migration, numbered (e.g. 0001_initial.ts), exporting a Migration.
