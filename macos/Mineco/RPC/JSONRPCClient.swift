// SPDX-License-Identifier: MIT
//
// JSONRPCClient — the SwiftUI thin client's only channel to core.
//
// Spawns the `mineco-core` Process, speaks newline-delimited JSON-RPC 2.0 over
// its stdin/stdout (§4, §8). Issues integer-id Requests and correlates their
// Responses; forwards Notifications to a handler. No handshake (§8): once the
// process is up the client can start sending immediately.
//
// This is the thin-client boundary (§2.2): nothing business-y happens here —
// it only encodes/decodes and shuttles frames. All logic lives in core.

import Foundation

/// A closure invoked for every inbound notification from core.
public typealias NotificationHandler = @Sendable (RPCInbound) -> Void

/// Failures local to the client (transport-level), distinct from RPC errors.
public enum RPCClientError: Error, Sendable, LocalizedError {
    case notConnected
    case coreNotFound(String)
    case spawnFailed(String)
    case encodeFailed(String)

    public var errorDescription: String? {
        switch self {
        case .notConnected: return "core connection not ready"
        case .coreNotFound(let m): return "core executable not found: \(m)"
        case .spawnFailed(let m): return "failed to spawn core: \(m)"
        case .encodeFailed(let m): return "failed to encode frame: \(m)"
        }
    }
}

/// How to locate the `mineco-core` executable to spawn.
public enum CoreExecutable: Sendable {
    /// Look up `mineco-core` copied into the app bundle's Resources.
    case bundled
    /// An explicit absolute path to a compiled binary (dev overrides, tests).
    case path(String)
    /// Dev mode: spawn `deno run -A <repoRoot>/packages/core/bin/main.ts`.
    /// Avoids needing a compiled/bundled binary while iterating.
    case denoRun(repoRoot: String)
}

public actor JSONRPCClient {
    private var process: Process?
    private var stdin: FileHandle?
    private var nextID: Int = 0
    private var pending: [MessageID: CheckedContinuation<AnyJSON, Error>] = [:]
    private var notifications: [NotificationHandler] = []
    private var readTask: Task<Void, Never>?
    private var ready = false

    private let executable: CoreExecutable

    public init(executable: CoreExecutable = .bundled) {
        self.executable = executable
    }

    // MARK: - Lifecycle

    /// Spawn the core process and begin reading its stdout.
    public func start() async throws {
        guard process == nil else { return }
        let launch = try resolveLaunch()

        let proc = Process()
        proc.executableURL = launch.url
        // macOS 26's `Process.arguments` setter rejects nil (NSInvalidArgument-
        // Exception "must provide array of arguments") — an Obj-C exception Swift
        // can't catch, so it aborts the app. Empty array when there are no args.
        proc.arguments = launch.arguments ?? []
        // Inherit env so core sees HOME etc. The compiled binary needs no flags;
        // dev runs pass a dev binary via CoreExecutable.path / .denoRun.
        proc.environment = ProcessInfo.processInfo.environment

        let inPipe = Pipe()
        let outPipe = Pipe()
        proc.standardInput = inPipe
        proc.standardOutput = outPipe
        let errPipe = Pipe()
        proc.standardError = errPipe

        do {
            try proc.run()
        } catch {
            throw RPCClientError.spawnFailed(error.localizedDescription)
        }

        self.process = proc
        self.stdin = inPipe.fileHandleForWriting
        self.ready = true

        // Drive the read loop on a detached task; it hops back to this actor
        // per line to route responses/notifications.
        //
        // NOT `FileHandle.bytes`: Foundation serializes all AsyncBytes reads
        // through one shared IO executor, so the (usually silent) stderr
        // iterator's blocking read() starves the stdout iterator forever — the
        // UI then sits on "Connecting…" while core's responses rot in the pipe.
        // `lineStream` is readabilityHandler-driven and never blocks a thread.
        let outLines = Self.lineStream(from: outPipe.fileHandleForReading)
        self.readTask = Task { [weak self] in
            for await line in outLines {
                if Task.isCancelled { return }
                guard let self else { return }
                await self.handleLine(line)
            }
            if let self { await self.handleDisconnect() }
        }

        startStderrDrain(errPipe)
    }

    /// Stop the core process.
    public func stop() async {
        readTask?.cancel()
        readTask = nil
        process?.terminate()
        process = nil
        stdin = nil
        ready = false
        for cont in pending.values { cont.resume(throwing: RPCClientError.notConnected) }
        pending.removeAll()
    }

    public func isReady() -> Bool { ready }

    public func onNotification(_ handler: @escaping NotificationHandler) {
        notifications.append(handler)
    }

    // MARK: - Requests

    /// Send a request with no params; decode the result as `T`.
    public func send<T: Decodable>(_ method: String, as type: T.Type) async throws -> T {
        let raw = try await sendRaw(method, params: nil)
        return try decode(raw)
    }

    /// Send a request with encodable params; decode the result as `T`.
    public func send<Params: Encodable, T: Decodable>(
        _ method: String,
        params: Params,
        as type: T.Type
    ) async throws -> T {
        let data = try JSONEncoder().encode(params)
        let json = try JSONSerialization.jsonObject(with: data)
        let raw = try await sendRaw(method, params: AnyJSON(json))
        return try decode(raw)
    }

    /// Fire a notification (no id, no response). e.g. `session/send`.
    public func notify(_ method: String, params: AnyJSON? = nil) async throws {
        try writeFrame(["jsonrpc": "2.0", "method": method, "params": params?.nsValue as Any])
    }

    // MARK: - Internals

    private func sendRaw(_ method: String, params: AnyJSON?) async throws -> AnyJSON {
        guard stdin != nil else { throw RPCClientError.notConnected }
        nextID &+= 1
        let id = MessageID.number(nextID)

        var frame: [String: Any] = [
            "jsonrpc": "2.0",
            "id": nextID,
            "method": method,
        ]
        if let params { frame["params"] = params.nsValue }
        try writeFrame(frame)

        return try await withCheckedThrowingContinuation { (cont: CheckedContinuation<AnyJSON, Error>) in
            pending[id] = cont
        }
    }

    private func writeFrame(_ object: [String: Any]) throws {
        guard let data = try? JSONSerialization.data(withJSONObject: object) else {
            throw RPCClientError.encodeFailed("\(object["method"] ?? "?")")
        }
        guard let stdin else { throw RPCClientError.notConnected }
        var line = data
        line.append(0x0A) // newline delimiter
        do {
            // The throwing API surfaces EPIPE as an error; the legacy
            // `write(_:)` would raise an uncatchable NSException instead.
            try stdin.write(contentsOf: line)
        } catch {
            throw RPCClientError.notConnected
        }
    }

    private func handleLine(_ line: String) {
        guard let data = line.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return }

        if let errObj = object["error"] as? [String: Any] {
            let errData = (try? JSONSerialization.data(withJSONObject: errObj)) ?? Data()
            let rpcErr = (try? JSONDecoder().decode(RPCError.self, from: errData))
                ?? RPCError(code: -32603, message: "malformed error", data: nil)
            resume(decodeID(object["id"]), throwing: rpcErr)
        } else if object["result"] != nil {
            resume(decodeID(object["id"]), returning: AnyJSON(object["result"] ?? NSNull()))
        } else if let method = object["method"] as? String {
            let params = object["params"].map(AnyJSON.init)
            dispatch(.notification(method: method, params: params))
        }
    }

    private func resume(_ id: MessageID, returning value: AnyJSON) {
        if let cont = pending.removeValue(forKey: id) { cont.resume(returning: value) }
    }

    private func resume(_ id: MessageID, throwing error: Error) {
        if let cont = pending.removeValue(forKey: id) { cont.resume(throwing: error) }
    }

    private func handleDisconnect() {
        ready = false
        for cont in pending.values { cont.resume(throwing: RPCClientError.notConnected) }
        pending.removeAll()
        // Inform registered handlers that core is gone. Fired after all pending
        // continuations are resolved so handlers observe a clean slate.
        dispatch(.notification(method: RPCNotificationMethod.coreDisconnected, params: nil))
    }

    private func startStderrDrain(_ pipe: Pipe) {
        let errLines = Self.lineStream(from: pipe.fileHandleForReading)
        Task { [weak self] in
            for await line in errLines {
                if Task.isCancelled { return }
                guard let self else { return }
                await self.dispatch(.notification(method: RPCNotificationMethod.stderr,
                                                  params: AnyJSON(["data": line])))
            }
        }
    }

    /// Newline-split text stream over a pipe, driven by `readabilityHandler`
    /// callbacks. Unlike `FileHandle.bytes` (whose blocking reads share one
    /// Foundation IO executor — see `start()`), each handle is independent, so
    /// stdout and stderr can be consumed concurrently. Finishes on EOF.
    private static func lineStream(from handle: FileHandle) -> AsyncStream<String> {
        AsyncStream { continuation in
            let buffer = LineBuffer()
            handle.readabilityHandler = { fh in
                let chunk = fh.availableData
                if chunk.isEmpty { // EOF
                    fh.readabilityHandler = nil
                    continuation.finish()
                    return
                }
                for line in buffer.split(appending: chunk) {
                    continuation.yield(line)
                }
            }
            continuation.onTermination = { _ in
                handle.readabilityHandler = nil
            }
        }
    }

    private func dispatch(_ note: RPCInbound) {
        for h in notifications { h(note) }
    }

    private func decode<T: Decodable>(_ raw: AnyJSON) throws -> T {
        let data: Data
        if JSONSerialization.isValidJSONObject(raw.nsValue) {
            data = try JSONSerialization.data(withJSONObject: raw.nsValue)
        } else {
            data = try JSONSerialization.data(withJSONObject: raw.nsValue, options: [.fragmentsAllowed])
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    // MARK: - Core executable resolution

    /// Resolve the executable URL + argv for the configured launch mode.
    private func resolveLaunch() throws -> (url: URL, arguments: [String]?) {
        switch executable {
        case .bundled:
            guard let url = Bundle.main.url(forResource: "mineco-core", withExtension: nil) else {
                throw RPCClientError.coreNotFound(
                    "mineco-core not in bundle Resources — run `deno task compile`, or switch to dev mode in Settings")
            }
            return (url, nil)
        case .path(let path):
            let url = URL(fileURLWithPath: path)
            guard FileManager.default.isExecutableFile(atPath: url.path) else {
                throw RPCClientError.coreNotFound("not executable: \(path)")
            }
            return (url, nil)
        case .denoRun(let repoRoot):
            // Resolve `deno` via /usr/bin/env so it works regardless of shell PATH.
            let entry = (repoRoot as NSString)
                .appendingPathComponent("packages/core/bin/main.ts")
            guard FileManager.default.fileExists(atPath: entry) else {
                throw RPCClientError.coreNotFound("core entry not found: \(entry)")
            }
            let url = URL(fileURLWithPath: "/usr/bin/env")
            return (url, ["deno", "run", "-A", entry])
        }
    }
}

/// Accumulates pipe chunks and emits complete `\n`-terminated lines. Locked
/// because `readabilityHandler` gives no isolation guarantee across reinstalls.
private final class LineBuffer: @unchecked Sendable {
    private var data = Data()
    private let lock = NSLock()

    func split(appending chunk: Data) -> [String] {
        lock.lock()
        defer { lock.unlock() }
        data.append(chunk)
        var lines: [String] = []
        while let nl = data.firstIndex(of: 0x0A) {
            let lineData = data[data.startIndex..<nl]
            data.removeSubrange(data.startIndex...nl)
            if let s = String(data: lineData, encoding: .utf8), !s.isEmpty {
                lines.append(s)
            }
        }
        return lines
    }
}

// MARK: - id helpers

private func decodeID(_ raw: Any?) -> MessageID {
    if let i = raw as? Int { return .number(i) }
    if let n = raw as? NSNumber { return .number(n.intValue) }
    if let s = raw as? String { return .string(s) }
    return .number(-1)
}
