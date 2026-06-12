// SPDX-License-Identifier: MIT
//
// Permission sheet — shown when core sends a `session/permissionRequest`
// (§4.3, §5.5). The user's choice is sent back via `session/respondPermission`.
// Skeleton — real tool-input rendering + "remember rule" arrive in step 7.

import SwiftUI

struct PermissionSheet: View {
    let toolName: String
    let summary: String
    let onRespond: (PermissionBehavior) -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Permission required", systemImage: "exclamationmark.shield")
                .font(.headline)

            Text("The agent wants to run **\(toolName)**.")
                .font(.callout)

            GroupBox {
                Text(summary)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(4)
            }

            HStack {
                Button("Deny", role: .destructive) { respond(.deny) }
                Spacer()
                Button("Allow Once") { respond(.allow) }
                    .buttonStyle(.borderedProminent)
                Button("Always Allow") { respond(.allowAlways) }
            }
        }
        .padding()
        .frame(width: 420)
    }

    private func respond(_ behavior: PermissionBehavior) {
        onRespond(behavior)
        dismiss()
    }
}
