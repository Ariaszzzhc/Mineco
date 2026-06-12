# macos/Mineco/Resources

Runtime resources copied into the app bundle. **Gitignored** — populated at
build time, not checked in.

| File          | Source                                              | Purpose                                  |
|---------------|-----------------------------------------------------|------------------------------------------|
| `mineco-core` | `deno task compile` (from repo root, §9.2)          | The single Deno core process the app spawns. |
| `claude`      | extracted from `npm:@anthropic-ai/claude-agent-sdk-darwin-arm64` (§9.2) | Native agent binary the SDK drives per session. |

`JSONRPCClient` resolves `mineco-core` via `Bundle.main.url(forResource:)`, so
both must sit in this directory before a release build. For development you can
point the client at a dev binary with `AppModel.coreExecutable = .path(...)`.

Do not commit binaries here.
