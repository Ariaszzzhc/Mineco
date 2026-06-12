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
        if let session = appModel.currentSession {
            stage(for: session)
        } else {
            StageWashBackground()
                .overlay { emptyState }
        }
    }

    private func stage(for session: Session) -> some View {
        ZStack(alignment: .topLeading) {
            StageWashBackground()

            // 2 — scrolling conversation column (clears sidebar on the left)
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(spacing: 18) {
                        ForEach(session.conversation.blocks) { block in
                            BlockView(block: block)
                                .id(block.id)
                        }
                        // bottom anchor for auto-scroll
                        Color.clear.frame(height: 1).id("__bottom__")
                    }
                    .frame(maxWidth: 660)
                    .frame(maxWidth: .infinity)            // center within the cleared region
                    .padding(.top, 78)
                    .padding(.bottom, 168)
                    .padding(.horizontal, 28)
                }
                .padding(.leading, 244)                    // clear the glass sidebar
                .defaultScrollAnchor(.bottom)
                .onChange(of: session.conversation.blocks.count) { _, _ in
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

            // 5 — sidebar pinned left
            SidebarView(onNewTask: { Task { await appModel.newSession() } })
                .padding(.leading, 12)
                .padding(.top, 64)
                .padding(.bottom, 12)
                .frame(width: 232, alignment: .top)

            // 6 — floating bottom: work pill + composer, right of the sidebar
            bottomLayer
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                .padding(.leading, 244)
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
        ContentUnavailableView(
            "No session selected",
            systemImage: "bubble.left.and.bubble.right",
            description: Text("Create a session to start a conversation with the agent.")
        )
    }
}
