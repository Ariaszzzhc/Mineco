// SPDX-License-Identifier: MIT
//
// AppModel — the app's observable root state and the one owner of the
// JSONRPCClient (§2.2: the UI holds the channel; core holds the logic).
//
// Owns the session list + the live conversation of the selected session. Routes
// inbound `session/message` notifications into the conversation as typed blocks
// (heuristic mapping in v1; deepened in design step 7). No demo seed: the UI
// renders only real data streamed from a connected core.

import Foundation
import Observation

@MainActor
@Observable
final class AppModel {
    /// The thin-client channel to core. `nil` until first connect.
    private(set) var client: JSONRPCClient?

    /// Connection status surfaced to the UI.
    private(set) var connectionState: ConnectionState = .disconnected

    /// Sessions shown in the sidebar; the selected one renders in the stage.
    var sessions: [Session] = []
    var selectedSessionID: String?

    /// Whether the agent is mid-turn (drives the floating work pill).
    var agentBusy = false
    var workLabel: String?

    /// Connection profiles loaded from core (config/listProfiles).
    var profiles: [Profile] = []
    /// Locally-tracked active profile id (no getActive RPC in v1; we persist it
    /// and mirror to core via config/setActiveProfile).
    var activeProfileID: String? {
        didSet { UserDefaults.standard.set(activeProfileID, forKey: Keys.activeProfileID) }
    }

    /// Working directory for new sessions (cwd). Required by session/create.
    var workspacePath: String? {
        didSet { UserDefaults.standard.set(workspacePath, forKey: Keys.workspacePath) }
    }

    /// Dev-only: how core is launched. Persisted so a developer can point the
    /// running app at a source checkout without recompiling.
    var coreMode: CoreMode {
        didSet { UserDefaults.standard.set(coreMode.rawValue, forKey: Keys.coreMode) }
    }
    var devRepoRoot: String {
        didSet { UserDefaults.standard.set(devRepoRoot, forKey: Keys.devRepoRoot) }
    }

    /// A pending permission request awaiting the user's decision (§4.3).
    var pendingPermission: PermissionRequestNotification?

    /// True until at least one profile exists (drives the first-run setup sheet).
    var needsSetup: Bool = false
    var showSettings: Bool = false

    enum ConnectionState: Equatable {
        case disconnected
        case connecting
        case connected(String) // version
        case failed(String)
    }

    /// How the app launches core.
    enum CoreMode: String, Sendable {
        /// Use the `mineco-core` binary bundled in Resources (release).
        case bundled
        /// Spawn `deno run -A` against a source checkout (dev).
        case denoRun
    }

    private enum Keys {
        static let workspacePath = "mineco.workspacePath"
        static let coreMode = "mineco.coreMode"
        static let devRepoRoot = "mineco.devRepoRoot"
        static let activeProfileID = "mineco.activeProfileID"
    }

    init() {
        let defaults = UserDefaults.standard
        workspacePath = defaults.string(forKey: Keys.workspacePath)
        coreMode = CoreMode(rawValue: defaults.string(forKey: Keys.coreMode) ?? "") ?? .bundled
        devRepoRoot = defaults.string(forKey: Keys.devRepoRoot) ?? ""
        activeProfileID = defaults.string(forKey: Keys.activeProfileID)
    }

    /// The currently selected session, if any.
    var currentSession: Session? {
        guard let id = selectedSessionID else { return nil }
        return sessions.first(where: { $0.id == id })
    }

    var activeProfile: Profile? {
        guard let id = activeProfileID else { return profiles.first }
        return profiles.first(where: { $0.id == id }) ?? profiles.first
    }

    var canStartSession: Bool {
        activeProfile != nil && workspacePath != nil
    }

    // MARK: - Connection

    func resolveCoreExecutable() -> CoreExecutable {
        switch coreMode {
        case .bundled: return .bundled
        case .denoRun: return .denoRun(repoRoot: devRepoRoot)
        }
    }

    func connect() async {
        guard !connectionState.isConnectingOrConnected else { return }
        connectionState = .connecting
        let c = JSONRPCClient(executable: resolveCoreExecutable())
        await c.onNotification { [weak self] note in
            Task { @MainActor in self?.handle(note) }
        }
        client = c
        do {
            try await c.start()
            try await refreshProfiles()
            try await refreshSessions()
            connectionState = .connected("ready")
        } catch {
            connectionState = .failed(error.localizedDescription)
            // Open settings so the user can fix the launch config (e.g. switch to
            // dev mode) and reconnect — common on first run with no bundled binary.
            showSettings = true
        }
    }

    /// Reconnect after a config change (e.g. switching core mode).
    func reconnect() async {
        await client?.stop()
        client = nil
        connectionState = .disconnected
        await connect()
    }

    // MARK: - Data refresh

    func refreshProfiles() async throws {
        guard let client else { return }
        let loaded: [Profile] = (try? await client.send(
            RPCRequestMethod.configListProfiles, as: [Profile].self
        )) ?? []
        profiles = loaded
        needsSetup = profiles.isEmpty
        // If no explicit active is set but profiles exist, default to the first
        // and mirror that choice into core.
        if activeProfileID == nil, let first = profiles.first {
            activeProfileID = first.id
            _ = try? await client.send(
                RPCRequestMethod.configSetActiveProfile,
                params: IDParam(first.id), as: AnyJSON.self
            )
        }
    }

    func refreshSessions() async throws {
        guard let client else { return }
        let metas: [SessionMeta] = (try? await client.send(
            RPCRequestMethod.sessionList, as: [SessionMeta].self
        )) ?? []
        // Preserve the in-memory conversation of any live session we still hold.
        let liveConvos = Dictionary(sessions.map { ($0.id, $0.conversation) }) { a, _ in a }
        sessions = metas.map { meta in
            var s = meta.toSession()
            s.conversation = liveConvos[meta.id] ?? Conversation()
            return s
        }
        if selectedSessionID == nil { selectedSessionID = sessions.first?.id }
    }

    // MARK: - Session actions

    /// Create + select a fresh session against the active profile + workspace.
    func newSession() async {
        guard let cwd = workspacePath else { showSettings = true; return }
        let profileId = activeProfileID ?? activeProfile?.id
        guard let client else { return }

        do {
            let result: SessionCreateResult = try await client.send(
                RPCRequestMethod.sessionCreate,
                params: SessionCreateParams(cwd: cwd, profileId: profileId, title: "New task"),
                as: SessionCreateResult.self
            )
            var s = Session(
                id: result.sessionId,
                title: "New task",
                branch: "main",
                repo: (cwd as NSString).lastPathComponent,
                updatedAt: "now"
            )
            s.conversation.append(.task(eyebrow: "New task", title: "New task"))
            sessions.insert(s, at: 0)
            selectedSessionID = result.sessionId
        } catch {
            // Profile/workspace problems surface as setup; other errors as failed.
            if let rpc = error as? RPCError, rpc.code == RPCErrorCode.profileNotFound {
                needsSetup = true
                showSettings = true
            } else {
                connectionState = .failed(error.localizedDescription)
            }
        }
    }

    /// Optimistically append the user's message and forward it to core as a
    /// request (core only dispatches requests; notifications are ignored).
    func send(_ text: String) {
        let content = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty,
              let id = selectedSessionID,
              let idx = sessions.firstIndex(where: { $0.id == id })
        else { return }

        sessions[idx].conversation.append(.user(text: content, time: nowLabel()))
        agentBusy = true
        workLabel = "Thinking"

        Task { [client] in
            _ = try? await client?.send(
                RPCRequestMethod.sessionSend,
                params: SessionSendParams(sessionId: id, text: content),
                as: AnyJSON.self
            )
        }
    }

    /// Ask core to stop the current turn.
    func interrupt() {
        agentBusy = false
        workLabel = nil
        guard let id = selectedSessionID else { return }
        Task { [client] in
            _ = try? await client?.send(
                RPCRequestMethod.sessionInterrupt,
                params: SessionIDParams(sessionId: id),
                as: AnyJSON.self
            )
        }
    }

    /// Resolve a pending permission request with the user's decision.
    func respondPermission(_ behavior: PermissionBehavior) {
        guard let req = pendingPermission, let client else { return }
        let sessionId = req.sessionId
        let requestId = req.requestId
        pendingPermission = nil
        Task {
            _ = try? await client.send(
                RPCRequestMethod.sessionRespondPermission,
                params: SessionRespondPermissionParams(
                    sessionId: sessionId, requestId: requestId, behavior: behavior
                ),
                as: AnyJSON.self
            )
        }
    }

    // MARK: - Profile CRUD (driven by the settings sheet)

    func saveProfile(_ profile: Profile, makeActive: Bool) async {
        guard let client else { return }
        do {
            let saved: Profile = try await client.send(
                RPCRequestMethod.configSaveProfile,
                params: profile,
                as: Profile.self
            )
            if let idx = profiles.firstIndex(where: { $0.id == saved.id }) {
                profiles[idx] = saved
            } else {
                profiles.append(saved)
            }
            profiles.sort { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
            needsSetup = profiles.isEmpty
            if makeActive || activeProfileID == nil {
                activeProfileID = saved.id
                _ = try? await client.send(
                    RPCRequestMethod.configSetActiveProfile,
                    params: IDParam(saved.id), as: AnyJSON.self
                )
            }
        } catch {
            connectionState = .failed(error.localizedDescription)
        }
    }

    func deleteProfile(_ id: String) async {
        guard let client else { return }
        _ = try? await client.send(
            RPCRequestMethod.configDeleteProfile,
            params: IDParam(id), as: AnyJSON.self
        )
        profiles.removeAll { $0.id == id }
        if activeProfileID == id {
            activeProfileID = profiles.first?.id
            if let new = activeProfileID {
                _ = try? await client.send(
                    RPCRequestMethod.configSetActiveProfile,
                    params: IDParam(new), as: AnyJSON.self
                )
            }
        }
        needsSetup = profiles.isEmpty
    }

    // MARK: - Inbound routing

    /// Route an inbound notification to the right session's conversation.
    private func handle(_ note: RPCInbound) {
        guard case .notification(let method, let params) = note else { return }
        switch method {
        case RPCNotificationMethod.sessionMessage:
            guard let sid = params?["sessionId"]?.stringValue else { return }
            appendSDKMessage(sessionID: sid, message: params?["message"])
        case RPCNotificationMethod.sessionPermissionRequest:
            if let req = decodePermission(params) { pendingPermission = req }
        case RPCNotificationMethod.stderr:
            // Surface core's stderr to our own stderr so it's visible in the
            // Xcode console / Console.app — otherwise core boot failures are
            // invisible and the UI just sits on "connecting".
            if let line = params?["data"]?.stringValue {
                FileHandle.standardError.write(Data("[core] \(line)\n".utf8))
            }
        case RPCNotificationMethod.error:
            if let line = params?["message"]?.stringValue {
                FileHandle.standardError.write(Data("[core/error] \(line)\n".utf8))
            }
        case RPCNotificationMethod.coreDisconnected:
            // Core process exited or crashed. Surface the failure so the UI
            // reflects the broken connection. The user can reconnect via
            // reconnect() (e.g. from the existing Settings → Core affordance).
            agentBusy = false
            workLabel = nil
            connectionState = .failed("core exited unexpectedly")
        default:
            break
        }
    }

    private func decodePermission(_ params: AnyJSON?) -> PermissionRequestNotification? {
        guard let params,
              let data = try? JSONEncoder().encode(params),
              let req = try? JSONDecoder().decode(PermissionRequestNotification.self, from: data)
        else { return nil }
        return req
    }

    /// Heuristic mapping of an SDK message into conversation blocks (v1).
    /// Reads `message.content[]`: text → prose; tool_use → a trace step.
    /// A top-level `type == "result"` ends the turn (agent idle).
    private func appendSDKMessage(sessionID: String, message: AnyJSON?) {
        guard let msg = message,
              let idx = sessions.firstIndex(where: { $0.id == sessionID })
        else { return }

        // End-of-turn marker: the SDK emits a `result` message when the turn is done.
        if msg["type"]?.stringValue == "result" {
            agentBusy = false
            workLabel = nil
            return
        }

        // SDK wraps content under `message.content`; tolerate a bare `content`.
        let contentArr = msg["message"]?["content"]?.arrayValue ?? msg["content"]?.arrayValue ?? []

        var bylineAdded = false
        for block in contentArr {
            switch block["type"]?.stringValue {
            case "text":
                if let t = block["text"]?.stringValue, !t.isEmpty {
                    if !bylineAdded {
                        sessions[idx].conversation.append(.agentByline(time: nowLabel()))
                        bylineAdded = true
                    }
                    sessions[idx].conversation.append(.prose(text: t))
                }
            case "tool_use":
                if let step = traceStep(from: block) {
                    sessions[idx].conversation.append(.trace(steps: [step]))
                    agentBusy = true
                    workLabel = step.title
                }
            default:
                break
            }
        }
    }

    /// Map an SDK `tool_use` block to a trace step by tool name.
    private func traceStep(from block: AnyJSON) -> TraceStep? {
        guard let name = block["name"]?.stringValue else { return nil }
        let kind: StepKind
        switch name.lowercased() {
        case "read", "read_file": kind = .read
        case "edit", "write", "multiedit", "write_file": kind = .edit
        case "bash", "run": kind = .run
        case "grep", "glob", "search": kind = .search
        default: kind = .think
        }
        let detail = block["input"]?["file_path"]?.stringValue
            ?? block["input"]?["command"]?.stringValue
            ?? block["input"]?["pattern"]?.stringValue
            ?? name
        return TraceStep(
            id: block["id"]?.stringValue ?? UUID().uuidString,
            kind: kind, title: titleFor(kind: kind), detail: detail,
            result: nil, ok: false, duration: nil, state: .run
        )
    }

    private func titleFor(kind: StepKind) -> String {
        switch kind {
        case .search: return "Searched code"
        case .read: return "Read file"
        case .edit: return "Edited file"
        case .run: return "Run command"
        case .think: return "Reasoning"
        }
    }

    private func nowLabel() -> String {
        let f = DateFormatter()
        f.dateFormat = "HH:mm"
        return f.string(from: Date())
    }
}

private extension AppModel.ConnectionState {
    var isConnectingOrConnected: Bool {
        switch self {
        case .connecting, .connected: return true
        default: return false
        }
    }
}
