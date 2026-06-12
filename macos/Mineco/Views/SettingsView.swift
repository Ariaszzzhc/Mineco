// SPDX-License-Identifier: MIT
//
// SettingsView — the Settings window. Owns connection profiles (CRUD + active),
// the workspace (cwd) used for new sessions, and the dev core-launch mode.

import SwiftUI
import AppKit

struct SettingsView: View {
    @Environment(AppModel.self) private var appModel

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Settings").font(.headline)
                Spacer()
                Button("Done") { appModel.showSettings = false }
                    .keyboardShortcut(.defaultAction)
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 4)

            TabView {
                ProfilesTab().tabItem { Label("Profiles", systemImage: "key") }
                WorkspaceTab().tabItem { Label("Workspace", systemImage: "folder") }
                CoreTab().tabItem { Label("Core", systemImage: "gearshape") }
            }
        }
        .frame(width: 560, height: 460)
    }
}

// MARK: - Profiles

private struct ProfilesTab: View {
    @Environment(AppModel.self) private var appModel
    @State private var editing: Profile?
    @State private var isNew = false

    var body: some View {
        Form {
            Section("Connection profiles") {
                if appModel.profiles.isEmpty {
                    Text("No profiles yet. Add one to get started.")
                        .foregroundStyle(.secondary)
                }
                ForEach(appModel.profiles) { profile in
                    profileRow(profile)
                }
                Button {
                    editing = Profile(id: "", name: "New profile", provider: .anthropic)
                    isNew = true
                } label: {
                    Label("Add profile", systemImage: "plus")
                }
            }

            if let editing {
                Section(isNew ? "New profile" : "Edit profile") {
                    ProfileEditorForm(initial: editing) { saved in
                        Task {
                            await appModel.saveProfile(saved, makeActive: appModel.profiles.isEmpty)
                            self.editing = nil
                            isNew = false
                        }
                    }
                }
            }
        }
        .formStyle(.grouped)
        .padding()
    }

    @ViewBuilder
    private func profileRow(_ profile: Profile) -> some View {
        HStack {
            VStack(alignment: .leading) {
                Text(profile.name).font(.callout.weight(.semibold))
                Text(display(for: profile))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if appModel.activeProfileID == profile.id {
                Text("Active")
                    .font(.caption)
                    .foregroundStyle(.green)
            }
            Menu {
                Button("Set active") { setActive(profile.id) }
                Button("Edit") { editing = profile; isNew = false }
                Divider()
                Button("Delete", role: .destructive) {
                    Task { await appModel.deleteProfile(profile.id) }
                }
            } label: {
                Image(systemName: "ellipsis.circle")
            }
            .menuStyle(.borderlessButton)
            .fixedSize()
        }
    }

    private func display(for p: Profile) -> String {
        switch p.provider {
        case .anthropic:
            return "Anthropic" + (p.defaultModel.isEmpty ? "" : " · \(p.defaultModel)")
        case .custom:
            return "Custom" + (p.baseUrl.isEmpty ? "" : " · \(p.baseUrl)")
        }
    }

    private func setActive(_ id: String) {
        appModel.activeProfileID = id
        Task {
            if let client = appModel.client {
                _ = try? await client.send(
                    RPCRequestMethod.configSetActiveProfile,
                    params: IDParam(id), as: AnyJSON.self
                )
            }
        }
    }
}

/// Reusable profile editor. `onSave` returns the profile to persist (core
/// assigns the id when empty).
struct ProfileEditorForm: View {
    let initial: Profile?
    let onSave: (Profile) -> Void

    @State private var name: String = ""
    @State private var provider: ProviderKind = .anthropic
    @State private var apiKey: String = ""
    @State private var baseUrl: String = ""
    @State private var defaultModel: String = ""
    @State private var permissionMode: PermissionMode = .default

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            TextField("Name", text: $name).textFieldStyle(.roundedBorder)
            Picker("Provider", selection: $provider) {
                Text("Anthropic").tag(ProviderKind.anthropic)
                Text("Custom gateway").tag(ProviderKind.custom)
            }
            SecureField(provider == .anthropic ? "API key" : "Auth token", text: $apiKey)
                .textFieldStyle(.roundedBorder)
            if provider == .custom {
                TextField("Base URL (https://…)", text: $baseUrl).textFieldStyle(.roundedBorder)
            }
            TextField("Default model (optional)", text: $defaultModel).textFieldStyle(.roundedBorder)
            Picker("Permission mode", selection: $permissionMode) {
                Text("Default").tag(PermissionMode.default)
                Text("Accept edits").tag(PermissionMode.acceptEdits)
                Text("Plan").tag(PermissionMode.plan)
                Text("Bypass").tag(PermissionMode.bypassPermissions)
            }
            HStack {
                Spacer()
                Button("Save", action: save)
                    .buttonStyle(.borderedProminent)
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .onAppear {
            guard let initial else { return }
            name = initial.name
            provider = initial.provider
            apiKey = initial.apiKey
            baseUrl = initial.baseUrl
            defaultModel = initial.defaultModel
            permissionMode = initial.permissionMode
        }
    }

    private func save() {
        let id = initial?.id ?? ""
        onSave(Profile(
            id: id,
            name: name.trimmingCharacters(in: .whitespaces),
            provider: provider,
            apiKey: apiKey,
            baseUrl: baseUrl,
            defaultModel: defaultModel.trimmingCharacters(in: .whitespaces),
            permissionMode: permissionMode
        ))
    }
}

// MARK: - Workspace

private struct WorkspaceTab: View {
    @Environment(AppModel.self) private var appModel

    var body: some View {
        Form {
            Section("Workspace") {
                Text("New sessions run inside this folder (the agent's cwd).")
                    .foregroundStyle(.secondary)
                HStack {
                    Text(appModel.workspacePath ?? "Not set")
                        .font(.callout.monospaced())
                        .lineLimit(1)
                        .truncationMode(.middle)
                    Spacer()
                    Button("Choose…") { choose() }
                }
            }
        }
        .formStyle(.grouped)
        .padding()
    }

    private func choose() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.prompt = "Use folder"
        if panel.runModal() == .OK {
            appModel.workspacePath = panel.url?.path
        }
    }
}

// MARK: - Core launch mode

private struct CoreTab: View {
    @Environment(AppModel.self) private var appModel

    var body: some View {
        Form {
            Section("Launch") {
                Picker("Mode", selection: bindMode) {
                    Text("Bundled binary (release)").tag(AppModel.CoreMode.bundled)
                    Text("Run from source (dev)").tag(AppModel.CoreMode.denoRun)
                }

                if appModel.coreMode == .denoRun {
                    TextField("Repo root", text: bindRepoRoot).textFieldStyle(.roundedBorder)
                    Text("Path to the mineco checkout containing packages/core. The app runs `deno run -A packages/core/bin/main.ts`.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                stateRow

                Button("Reconnect") { Task { await appModel.reconnect() } }
            }
        }
        .formStyle(.grouped)
        .padding()
    }

    private var stateRow: some View {
        LabeledContent("State") {
            Text(stateText).foregroundStyle(.secondary)
        }
    }

    private var stateText: String {
        switch appModel.connectionState {
        case .disconnected: return "Disconnected"
        case .connecting: return "Connecting…"
        case .connected(let v): return "Connected (\(v))"
        case .failed(let m): return "Failed: \(m)"
        }
    }

    private var bindMode: Binding<AppModel.CoreMode> {
        Binding(get: { appModel.coreMode }, set: { appModel.coreMode = $0 })
    }
    private var bindRepoRoot: Binding<String> {
        Binding(get: { appModel.devRepoRoot }, set: { appModel.devRepoRoot = $0 })
    }
}
