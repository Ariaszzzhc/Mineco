// SPDX-License-Identifier: MIT
//
// A `Session` summary as returned by `session/list`, plus the live conversation
// the UI renders. The full transcript lives in core's SQLite + SDK JSONL; the
// UI only holds the projection it needs to render the list and the conversation.

import Foundation

struct SessionSummary: Codable, Identifiable, Hashable {
    let id: String
    let title: String?
    let workspacePath: String?
    let updatedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id
        case title
        case workspacePath = "workspace_path"
        case updatedAt = "updated_at"
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
