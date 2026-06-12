// SPDX-License-Identifier: MIT
//
// A `Session` summary as returned by `session/list`, plus the live conversation
// the UI renders. The full transcript lives in core's SQLite + SDK JSONL; the
// UI only holds the projection it needs to render the list and the conversation.

import Foundation

/// `session/list` row — the UI projection of a persisted session (§5).
/// Mirrors core's `SessionMeta` wire shape (camelCase) exactly, so it decodes
/// straight from `session/list`. The full transcript lives in core's SQLite +
/// SDK JSONL; the UI only holds this projection.
struct SessionMeta: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let cwd: String
    let profileId: String?
    let title: String?
    let status: String
    let createdAt: Double
    let updatedAt: Double
}

extension SessionMeta {
    /// Build the in-memory `Session` the UI renders, deriving the decorative
    /// branch/repo/updatedAt fields core doesn't track (no git query in v1).
    func toSession() -> Session {
        Session(
            id: id,
            title: title ?? "Untitled task",
            branch: "main",
            repo: (cwd as NSString).lastPathComponent.isEmpty ? cwd : (cwd as NSString).lastPathComponent,
            updatedAt: Self.relativeLabel(fromMs: updatedAt)
        )
    }

    /// Render an ms-epoch timestamp as a coarse relative label ("now", "2h", …).
    static func relativeLabel(fromMs ms: Double) -> String {
        let then = Date(timeIntervalSince1970: ms / 1000.0)
        let secs = max(0, Date().timeIntervalSince(then))
        if secs < 60 { return "now" }
        if secs < 3600 { return "\(Int(secs / 60))m" }
        if secs < 86_400 { return "\(Int(secs / 3600))h" }
        if secs < 604_800 { return "\(Int(secs / 86_400))d" }
        let f = DateFormatter()
        f.dateFormat = "MMM d"
        return f.string(from: then)
    }
}

/// A live session the UI is driving: metadata + the block-based conversation.
struct Session: Identifiable, Hashable {
    let id: String
    var title: String
    var branch: String        // git branch shown in toolbar + task eyebrow
    var repo: String          // repo slug shown in the sidebar foot
    var updatedAt: String     // human label for the sidebar ("now", "2h", …)
    var conversation: Conversation = Conversation()

    /// Most recent user bubble text — used for the sidebar preview.
    var lastUserText: String? {
        conversation.blocks.last(where: {
            if case .user = $0.content { return true }
            return false
        }).flatMap {
            if case .user(let text, _) = $0.content { return text }
            return nil
        }
    }
}
