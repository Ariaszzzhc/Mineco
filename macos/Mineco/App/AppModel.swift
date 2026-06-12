// SPDX-License-Identifier: MIT
//
// AppModel — the app's observable root state and the one owner of the
// JSONRPCClient (§2.2: the UI holds the channel; core holds the logic).
//
// Owns the session list + the live conversation of the selected session.
// Routes inbound `session/message` notifications into the conversation as
// typed blocks (heuristic mapping in v1; deepened in design step 7). Seeds a
// demo scenario so the Liquid Glass UI is visible before a real core connects.

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

    var profiles: [Profile] = []

    /// How to locate core. Overridable for dev/test (e.g. a locally built binary).
    var coreExecutable: CoreExecutable = .bundled

    enum ConnectionState: Equatable {
        case disconnected
        case connecting
        case connected(String) // version
        case failed(String)
    }

    init() {
        seedDemo()
    }

    /// The currently selected session, if any.
    var currentSession: Session? {
        guard let id = selectedSessionID else { return nil }
        return sessions.first(where: { $0.id == id })
    }

    // MARK: - Demo seed

    /// Seed the canonical scenario so the UI renders immediately, independent
    /// of whether a real core is bundled. Replaced when live sessions arrive.
    func seedDemo() {
        let main = Scenario.session()
        sessions = [main] + Scenario.recentThreads()
        selectedSessionID = main.id
    }

    // MARK: - Connection

    func connect() async {
        guard connectionState != .connected("") else { return }
        connectionState = .connecting
        let c = JSONRPCClient(executable: coreExecutable)
        await c.onNotification { [weak self] note in
            Task { @MainActor in self?.handle(note) }
        }
        client = c
        do {
            try await c.start()
            profiles = (try? await c.send(RPCRequestMethod.configListProfiles, as: [Profile].self)) ?? []
            connectionState = .connected("ready")
        } catch {
            // Demo remains visible; surface the failure in the sidebar foot.
            connectionState = .failed(error.localizedDescription)
        }
    }

    // MARK: - Actions

    /// Create + select a fresh, empty session (folder/profile flow lands later).
    func newSession() {
        let s = Session(
            id: UUID().uuidString,
            title: "New task",
            branch: "main",
            repo: currentSession?.repo ?? "acme/web-client",
            updatedAt: "now"
        )
        sessions.insert(s, at: 0)
        selectedSessionID = s.id
    }

    /// Optimistically append the user's message and forward it to core.
    func send(_ text: String) {
        let content = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty,
              let id = selectedSessionID,
              let idx = sessions.firstIndex(where: { $0.id == id })
        else { return }

        sessions[idx].conversation.append(.user(text: content, time: nowLabel()))

        Task { [client] in
            try? await client?.notify(
                RPCRequestMethod.sessionSend,
                params: AnyJSON(["sessionId": id, "text": content])
            )
        }
    }

    /// Ask core to stop the current turn.
    func interrupt() {
        agentBusy = false
        workLabel = nil
        guard let id = selectedSessionID else { return }
        Task { [client] in
            try? await client?.notify(
                RPCRequestMethod.sessionInterrupt,
                params: AnyJSON(["sessionId": id])
            )
        }
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
            // Permission sheet wiring lands in step 7; acknowledge busy for now.
            if let tool = params?["toolName"]?.stringValue {
                agentBusy = true
                workLabel = "Awaiting approval: \(tool)"
            }
        default:
            break
        }
    }

    /// Heuristic mapping of an SDK message into conversation blocks (v1).
    /// Reads `message.content[]`: text → prose; tool_use → a trace step.
    private func appendSDKMessage(sessionID: String, message: AnyJSON?) {
        guard let msg = message,
              let idx = sessions.firstIndex(where: { $0.id == sessionID })
        else { return }

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
