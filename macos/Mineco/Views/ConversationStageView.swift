// SPDX-License-Identifier: MIT
//
// ConversationStageView — the Liquid Glass window interior (`lqg-win`).
//
// A single ZStack layering, top to bottom in z-order:
//   1. StageWashBackground     — warm content wash; glass blurs it
//   2. scroll content column   — opaque blocks; scrolls BENEATH the glass
//   3. TopScrollEdge           — blur fade under the toolbar
//   4. ToolbarView             — floating symbol clusters (traffic lights, title, branch/replay)
//   5. SidebarView             — the primary glass sheet (recent threads)
//   6. bottom floating layer   — work pill (when busy) + composer
//
// Content is inset to clear the sidebar (left) and the toolbar/composer
// (top/bottom), matching the prototype's absolute layout.

import SwiftUI

struct ConversationStageView: View {
    @Environment(AppModel.self) private var appModel

    var body: some View {
        ZStack(alignment: .topLeading) {
            StageWashBackground()

            // 2 — scrolling conversation column, or the empty placeholder.
            //     Always present so the layout is stable; content swaps in.
            ScrollViewReader { proxy in
                ScrollView {
                    Group {
                        if let session = appModel.currentSession {
                            VStack(spacing: 18) {
                                ForEach(session.conversation.blocks) { block in
                                    BlockView(block: block)
                                        .id(block.id)
                                }
                                Color.clear.frame(height: 1).id("__bottom__")
                            }
                            .frame(maxWidth: 660)
                            .frame(maxWidth: .infinity)
                        } else {
                            emptyState
                                .frame(maxWidth: 520)
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .padding(.top, 78)
                    .padding(.bottom, 168)
                    .padding(.horizontal, 28)
                }
                .padding(.leading, 244)                    // clear the glass sidebar
                .defaultScrollAnchor(.bottom)
                .onChange(of: appModel.currentSession?.conversation.blocks.count ?? 0) { _, _ in
                    guard appModel.currentSession != nil else { return }
                    withAnimation(.easeOut(duration: 0.25)) {
                        proxy.scrollTo("__bottom__", anchor: .bottom)
                    }
                }
            }

            // 3 — blur fade under the toolbar
            TopScrollEdge()

            // 4 — toolbar across the top
            ToolbarView()
                .frame(maxWidth: .infinity, maxHeight: 58, alignment: .top)

            // 5 — sidebar pinned left (always visible — it owns "New task")
            SidebarView(onNewTask: { Task { await appModel.newSession() } })
                .padding(.leading, 12)
                .padding(.top, 64)
                .padding(.bottom, 12)
                .frame(width: 232, alignment: .top)

            // 6 — floating bottom: work pill + composer, right of the sidebar.
            //     Only once a session exists (the composer is inert otherwise).
            if appModel.currentSession != nil {
                bottomLayer
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                    .padding(.leading, 244)
            }
        }
    }

    /// Work pill (only while the agent is mid-turn) + composer, centered, max 604.
    private var bottomLayer: some View {
        VStack(spacing: 10) {
            if appModel.agentBusy, let label = appModel.workLabel {
                WorkPillView(state: .running(label: label),
                             onStop: { appModel.interrupt() },
                             onResume: { })
            }
            ComposerBarView(contextCount: 4, onSend: { appModel.send($0) })
        }
        .frame(maxWidth: 604)
        .padding(.horizontal, 28)
        .padding(.bottom, 14)
    }

    private var emptyState: some View {
        VStack(spacing: 14) {
            Image(systemName: "bubble.left.and.bubble.right")
                .font(.system(size: 34, weight: .light))
                .foregroundStyle(.mInk3)
            Text("Start a new task")
                .minecoFont(17, weight: .semibold)
                .foregroundStyle(.mInk)
            Text(emptyHint)
                .minecoFont(13)
                .foregroundStyle(.mInk3)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 380)
            Button {
                if appModel.canStartSession {
                    Task { await appModel.newSession() }
                } else {
                    appModel.showSettings = true
                }
            } label: {
                Label(appModel.canStartSession ? "New task" : "Set up to start",
                      systemImage: appModel.canStartSession ? "plus" : "gearshape")
                    .minecoFont(13, weight: .semibold)
                    .foregroundStyle(.white)
                    .padding(.vertical, 9)
                    .padding(.horizontal, 18)
                    .background(Capsule().fill(Color.mAccent))
            }
            .buttonStyle(.plain)
        }
    }

    /// Contextual guidance for the empty state depending on what's missing.
    private var emptyHint: String {
        switch appModel.connectionState {
        case .failed(let m): return "Couldn't connect to core: \(m)\nOpen Settings → Core to configure launch."
        case .connecting: return "Connecting to core…"
        case .disconnected: return "Connecting to core…"
        case .connected:
            if appModel.activeProfile == nil {
                return "Add a connection profile (API key) in Settings, then start a task."
            }
            if appModel.workspacePath == nil {
                return "Pick a working folder in Settings → Workspace, then start a task."
            }
            return "Create a session to start a conversation with the agent."
        }
    }
}
