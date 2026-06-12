// SPDX-License-Identifier: MIT
//
// Root view: hosts the Liquid Glass conversation stage. The stage owns its own
// sidebar + toolbar + composer (custom chrome, not a NavigationSplitView), so
// this is a thin host that injects AppModel and fills the window.

import SwiftUI

struct ContentView: View {
    @Environment(AppModel.self) private var appModel

    var body: some View {
        ConversationStageView()
            .environment(appModel)
    }
}

/// Settings window placeholder (Profile CRUD arrives in step 6).
struct SettingsPlaceholder: View {
    @Environment(AppModel.self) private var appModel

    var body: some View {
        Form {
            Section("Connection") {
                LabeledContent("State") {
                    Text(stateText(appModel.connectionState))
                        .foregroundStyle(.secondary)
                }
            }
        }
        .formStyle(.grouped)
        .padding()
        .frame(width: 420)
    }

    private func stateText(_ s: AppModel.ConnectionState) -> String {
        switch s {
        case .disconnected: return "Disconnected"
        case .connecting: return "Connecting…"
        case .connected(let v): return "Connected (\(v))"
        case .failed(let m): return "Failed: \(m)"
        }
    }
}
