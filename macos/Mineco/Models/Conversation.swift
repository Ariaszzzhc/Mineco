// SPDX-License-Identifier: MIT
//
// Conversation model — the UI's projection of an agent transcript, rendered as
// an ordered list of typed blocks. The agent streams SDK messages via
// `session/message`; AppModel maps them into these blocks (heuristic in v1,
// deepened in design step 7). Blocks are append-only and value-typed so the
// whole transcript is `@State`-friendly and `Hashable` for diffing.
//
// `ConversationBlock` is a stable-identity wrapper around a `Content` payload;
// card views receive the extracted payload, the stage dispatches by id.

import Foundation

/// Coarse kind of an agent execution step (maps the prototype's step kinds).
enum StepKind: String, Codable, Hashable, Sendable {
    case search
    case read
    case edit
    case run
    case think

    /// SF Symbol used for this step.
    var symbol: String {
        switch self {
        case .search: return "magnifyingglass"
        case .read: return "doc.text"
        case .edit: return "pencil"
        case .run: return "play.fill"
        case .think: return "lightbulb"
        }
    }
}

/// Runtime state of a todo item / step.
enum RunState: String, Codable, Hashable, Sendable {
    case todo
    case run
    case done
}

/// A plan checklist item.
struct PlanItem: Hashable, Identifiable, Sendable {
    let id: String
    var label: String
    var state: RunState
}

/// A trace-ledger row (one tool/execution step).
struct TraceStep: Hashable, Identifiable, Sendable {
    let id: String
    var kind: StepKind
    var title: String
    var detail: String
    var result: String?      // shown when done (e.g. "128 lines", "+14 −3", "3 passed")
    var ok: Bool             // green result when done
    var duration: String?    // e.g. "0.4s"
    var state: RunState
}

/// One row of a unified diff.
struct DiffRow: Hashable, Sendable {
    enum Kind: String, Codable, Hashable, Sendable { case ctx, add, del }
    var kind: Kind
    var number: String   // line number for ctx; marker for add/del
    var code: String
}

/// One terminal line.
struct TermLine: Hashable, Sendable {
    enum Style: String, Codable, Hashable, Sendable { case plain, ok, dim }
    var prompt: String   // "$" or ""
    var text: String
    var style: Style
}

/// An action button under an agent turn.
struct ActionButton: Hashable, Identifiable, Sendable {
    let id: String
    var label: String
    var symbol: String?      // leading SF Symbol
    var primary: Bool

    init(id: String = UUID().uuidString, label: String, symbol: String? = nil, primary: Bool = false) {
        self.id = id
        self.label = label
        self.symbol = symbol
        self.primary = primary
    }
}

/// The typed payload of one conversation block.
enum ConversationContent: Hashable {
    case task(eyebrow: String, title: String)
    case user(text: String, time: String)
    case agentByline(time: String)
    case prose(text: String)                 // streamed agent text
    case plan(items: [PlanItem])
    case trace(steps: [TraceStep])
    case diff(path: String, add: Int, del: Int, rows: [DiffRow])
    case terminal(cmd: String, lines: [TermLine], okLabel: String?, running: Bool)
    case actions([ActionButton])
    case turnRule(time: String)
    case queuedNotice(text: String)
}

/// One rendered block: a stable identity plus its payload. Stable id lets
/// SwiftUI animate insertions (the `.riseIn()` entrance).
struct ConversationBlock: Hashable, Identifiable {
    let id: UUID
    let content: ConversationContent

    init(_ content: ConversationContent, id: UUID = UUID()) {
        self.id = id
        self.content = content
    }
}

// MARK: - Conversation container

/// A live transcript the UI renders. Append-only; mutating functions update in
/// place so SwiftUI diffing sees the change.
struct Conversation: Hashable {
    var blocks: [ConversationBlock] = []

    mutating func append(_ content: ConversationContent) { blocks.append(ConversationBlock(content)) }
    mutating func append(block: ConversationBlock) { blocks.append(block) }
    mutating func append(contentsOf: [ConversationContent]) {
        blocks.append(contentsOf: contentsOf.map { ConversationBlock($0) })
    }

    var isEmpty: Bool { blocks.isEmpty }
}
