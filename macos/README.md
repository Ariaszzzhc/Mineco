# macos — Mineco SwiftUI app

Native macOS thin client (§2.2, §9.1). Not part of the Deno workspace.

## Layout

```
Mineco/
  App/        @main App (hides native traffic lights), AppModel (@Observable root), ContentView
  DesignSystem/  Liquid Glass tokens: palette, radii, fontScale, glass material, motion
  RPC/        JSONRPCClient (Process + newline JSON-RPC), Protocol (Codable contract), AnyJSON accessors
  Models/     Session, Workspace, Conversation (typed blocks), Scenario (demo seed)
  Views/
    ConversationStageView.swift   the lqg-win ZStack (wash, scroll, edge, toolbar, sidebar, composer)
    Chrome/     ToolbarView (glass clusters), SidebarView (glass sheet), TopScrollEdge (blur fade)
    Conversation/   task header, user bubble, agent byline, plan/trace/diff/terminal cards, action row
    Composer/  WorkPillView (busy state), ComposerBarView (glass input)
    PermissionSheet.swift
project.yml   xcodegen project definition (single source of truth)
```

## UI — Liquid Glass

A macOS Tahoe-style stage (port of the `glass.css` design): chrome (toolbar
clusters, sidebar, composer) is **floating glass** over a warm stage wash;
conversation content (messages, plan, diff, terminal) stays **opaque white**.
Concentric radii (window → panel → card → field), one locked top light.

A demo scenario (the canonical "fix comment box + optimistic updates" run) is
seeded by `AppModel`/`Scenario`, so the full UI renders before a real core is
bundled. `AppModel` routes inbound `session/message` notifications into the
conversation as typed blocks and forwards `session/send`.

## Generate the Xcode project

```bash
cd macos
xcodegen generate
```

This writes `Mineco.xcodeproj`. Never hand-edit it — change `project.yml` and
regenerate.

## Build (CLI)

```bash
xcodebuild -project Mineco.xcodeproj -scheme Mineco -configuration Debug build \
  -derivedDataPath build
```

Or open `Mineco.xcodeproj` in Xcode and run.

## Run with a real core

The app spawns a bundled `mineco-core`. Populate it first:

```bash
# from repo root
deno task compile                         # → macos/Mineco/Resources/mineco-core
# extract native claude into macos/Mineco/Resources/claude (§9.2)
```

Without those binaries the app still builds and launches, but `AppModel.connect()`
reports a `coreNotFound` failure in the sidebar until they're present.

## Status

Liquid Glass UI is implemented and builds (zero warnings). It renders the demo
scenario immediately and is wired to streaming via `AppModel`. Remaining design
steps: bundling a real `mineco-core` (so live sessions replace the demo), the
new-session folder/profile flow, and the permission sheet ↔
`session/respondPermission` round-trip.
