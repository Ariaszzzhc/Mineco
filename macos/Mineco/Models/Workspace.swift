// SPDX-License-Identifier: MIT
//
// A workspace (local project directory) the user has opened (§5.8). Recorded
// as "recent projects"; sessions belong to a workspace.

import Foundation

struct Workspace: Codable, Identifiable, Hashable {
    let id: String
    let path: String
    let name: String
    let lastOpenedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id, path, name
        case lastOpenedAt = "last_opened_at"
    }
}
