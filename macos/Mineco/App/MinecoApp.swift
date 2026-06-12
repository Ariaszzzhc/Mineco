// SPDX-License-Identifier: MIT
//
// Mineco — entry point. Builds the main window and hosts AppModel.
// Thin client (§2.2): the app renders + forwards; all logic is in core.
//
// The Liquid Glass chrome draws its OWN traffic lights (part of the mock), so
// the native window buttons are hidden on appear to avoid a duplicate pair.

import SwiftUI
import AppKit

@main
struct MinecoApp: App {
    @State private var appModel = AppModel()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(appModel)
                .frame(minWidth: 980, minHeight: 620)
                .background(HideNativeTrafficLights())
                .task { await appModel.connect() }
        }
        .windowStyle(.hiddenTitleBar)
        .windowResizability(.contentMinSize)

        // Settings (Profile editor) — wired in step 6.
        Settings {
            SettingsPlaceholder()
                .environment(appModel)
        }
    }
}

/// Hides the standard close/minimize/zoom buttons so the chrome's own traffic
/// lights (ToolbarView) are the only set visible. The Liquid Glass mock ships
/// its own; leaving the native ones would render two overlapping pairs.
private struct HideNativeTrafficLights: NSViewRepresentable {
    func makeNSView(context: Context) -> NSView {
        let v = NSView()
        DispatchQueue.main.async { Self.apply() }
        return v
    }
    func updateNSView(_ nsView: NSView, context: Context) {
        DispatchQueue.main.async { Self.apply() }
    }

    static func apply() {
        for window in NSApp.windows {
            guard let container = window.standardWindowButton(.closeButton)?.superview else { continue }
            for button in container.subviews where button is NSButton {
                button.isHidden = true
            }
            return
        }
    }
}
