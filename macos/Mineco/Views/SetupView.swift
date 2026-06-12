// SPDX-License-Identifier: MIT
//
// SetupView — first-run / empty-profile sheet. The app can't create a session
// until at least one connection profile exists (core resolves the profile on
// session/create, §6), so we block on this until one is saved.

import SwiftUI

struct SetupView: View {
    @Environment(AppModel.self) private var appModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Label("Connect a provider", systemImage: "key.fill")
                .font(.headline)

            Text("Add an API key so the agent can talk to a model. Stored locally by core (plaintext SQLite by design).")
                .font(.callout)
                .foregroundStyle(.secondary)

            ProfileEditorForm(initial: nil) { profile in
                Task {
                    await appModel.saveProfile(profile, makeActive: true)
                    dismiss()
                }
            }
        }
        .padding()
        .frame(width: 480)
    }
}
