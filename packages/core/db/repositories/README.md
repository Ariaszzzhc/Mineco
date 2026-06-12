Repositories — typed access over the greenfield schema (§5).

Added in step 3, one module per table:

- workspaces.ts
- sessions.ts
- messages.ts
- usage.ts
- profiles.ts

Each exports a repository bound to a Db handle, exposing only the queries the
server/runner actually need. Single connection, serialized writes (§5).
