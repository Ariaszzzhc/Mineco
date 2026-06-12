// SPDX-License-Identifier: MIT
//
// `BlockView` — dispatcher mapping a `ConversationBlock` to its card view.
// The stage does `ForEach(conversation.blocks) { BlockView(block: $0) }`;
// per-block alignment is handled here so the stage only owns spacing.

import SwiftUI

/// Renders one `ConversationBlock` as the matching card, with `.riseIn()`
/// applied. User bubbles are right-aligned; byline/prose/cards are
/// left-aligned; turn rules and queued notices are full-width.
struct BlockView: View {
    let block: ConversationBlock

    var body: some View {
        content
            .riseIn()
    }

    @ViewBuilder
    private var content: some View {
        switch block.content {
        case .task(let eyebrow, let title):
            TaskHeaderView(eyebrow: eyebrow, title: title)
        case .user(let text, let time):
            HStack(spacing: 0) {
                Spacer(minLength: 0)
                UserBubbleView(text: text, time: time)
            }
        case .agentByline(let time):
            AgentBylineView(time: time)
        case .prose(let text):
            ProseView(text: text)
        case .plan(let items):
            PlanCardView(items: items)
        case .trace(let steps):
            TraceLedgerView(steps: steps)
        case .diff(let path, let add, let del, let rows):
            DiffSheetView(path: path, add: add, del: del, rows: rows)
        case .terminal(let cmd, let lines, let okLabel, let running):
            TerminalCardView(cmd: cmd, lines: lines, okLabel: okLabel, running: running)
        case .actions(let actions):
            ActionRowView(actions: actions)
        case .turnRule(let time):
            TurnRuleView(time: time)
        case .queuedNotice(let text):
            QueuedNoticeView(text: text)
        }
    }
}
