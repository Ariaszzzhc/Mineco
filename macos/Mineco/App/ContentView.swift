// SPDX-License-Identifier: MIT
//
// Root view: hosts the Liquid Glass conversation stage. The stage owns its own
// sidebar + toolbar + composer (custom chrome, not a NavigationSplitView), so
// this is a thin host that injects AppModel, fills the window, and overlays the
// first-run setup + permission sheets.

import SwiftUI

struct ContentView: View {
    @Environment(AppModel.self) private var appModel

    var body: some View {
        ConversationStageView()
            .environment(appModel)
            .sheet(isPresented: setupBinding) {
                SettingsView()
                    .environment(appModel)
            }
            .sheet(item: permissionBinding) { req in
                PermissionSheet(
                    toolName: req.toolName,
                    summary: permissionSummary(req.input)
                ) { behavior in
                    appModel.respondPermission(behavior)
                }
                .environment(appModel)
            }
    }

    /// First-run setup shows whenever there's no profile to connect with, or the
    /// user explicitly opened settings via the in-app affordance.
    private var setupBinding: Binding<Bool> {
        Binding(
            get: { appModel.needsSetup || appModel.showSettings },
            set: { appModel.showSettings = $0 }
        )
    }

    /// `@Environment` values can't be `$`-projected, so bind the optional
    /// permission request by hand.
    private var permissionBinding: Binding<PermissionRequestNotification?> {
        Binding(
            get: { appModel.pendingPermission },
            set: { appModel.pendingPermission = $0 }
        )
    }

    private func permissionSummary(_ input: AnyJSON?) -> String {
        guard let input else { return "—" }
        // Best-effort: show the most useful single field of the tool input.
        for key in ["file_path", "command", "pattern", "path", "url"] {
            if let v = input[key]?.stringValue { return "\(key): \(v)" }
        }
        return "\(input)"
    }
}
