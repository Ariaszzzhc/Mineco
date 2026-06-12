// SPDX-License-Identifier: MIT
//
// Mineco wire protocol — Swift Codable mirror of packages/protocol (TS↔Swift
// contract, see docs/technical-design.md §4). Hand-maintained in v1 (§12):
// change packages/protocol/schema.ts first, then update this file in lockstep.
//
// JSON keys are snake_case on the wire; CodingKeys pin each field so we never
// rely on a global decoding strategy (the envelope and payloads are mixed).

import Foundation

// MARK: - AnyJSON (type-erased JSON value)

/// A type-erased JSON value that round-trips through `JSONSerialization`.
///
/// Used for payloads the transport must forward but not interpret: SDK messages,
/// `initializationResult`, tool-call inputs. Avoids declaring Codable types for
/// the entire SDK surface on day one. Backed by a value-typed enum so it is
/// genuinely `Sendable` under Swift 6 strict concurrency.
public struct AnyJSON: Codable, Hashable, Sendable {
    public enum Storage: Hashable, Sendable {
        case null
        case bool(Bool)
        case number(Double)
        case string(String)
        case array([AnyJSON])
        case object([String: AnyJSON])
    }

    public let storage: Storage

    public init(_ storage: Storage) { self.storage = storage }

    /// Best-effort construction from an arbitrary value (e.g. a JSONSerialization
    /// result). Unknown shapes collapse to `.null`.
    public init(_ any: Any) {
        switch any {
        case is NSNull: self = .init(.null)
        case let b as Bool: self = .init(b ? .bool(true) : .bool(false))
        case let n as NSNumber:
            // NSNumber bridges Bool/Int/Double; prefer integer when whole.
            if CFGetTypeID(n) == CFBooleanGetTypeID() {
                self = .init(.bool(n.boolValue))
            } else {
                self = .init(.number(n.doubleValue))
            }
        case let i as Int: self = .init(.number(Double(i)))
        case let d as Double: self = .init(.number(d))
        case let s as String: self = .init(.string(s))
        case let a as [Any]: self = .init(.array(a.map(AnyJSON.init)))
        case let o as [String: Any]: self = .init(.object(o.mapValues(AnyJSON.init)))
        default: self = .init(.null)
        }
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { storage = .null }
        else if let b = try? c.decode(Bool.self) { storage = .bool(b) }
        else if let d = try? c.decode(Double.self) { storage = .number(d) }
        else if let s = try? c.decode(String.self) { storage = .string(s) }
        else if let a = try? c.decode([AnyJSON].self) { storage = .array(a) }
        else if let o = try? c.decode([String: AnyJSON].self) { storage = .object(o) }
        else { storage = .null }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch storage {
        case .null: try c.encodeNil()
        case .bool(let b): try c.encode(b)
        case .number(let d): try c.encode(d)
        case .string(let s): try c.encode(s)
        case .array(let a): try c.encode(a)
        case .object(let o): try c.encode(o)
        }
    }

    /// Reconstruct a Foundation object suitable for `JSONSerialization`.
    public var nsValue: Any {
        switch storage {
        case .null: return NSNull()
        case .bool(let b): return b
        case .number(let d): return d
        case .string(let s): return s
        case .array(let a): return a.map(\.nsValue)
        case .object(let o): return o.mapValues(\.nsValue)
        }
    }
}



// MARK: - JSON-RPC 2.0 envelope

/// Wire id: an integer or a string. The client only ever *issues* integer ids,
/// but it must tolerate either when matching responses / echoes.
public enum MessageID: Hashable, Codable, Sendable {
    case number(Int)
    case string(String)

    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let i = try? c.decode(Int.self) { self = .number(i) }
        else if let s = try? c.decode(String.self) { self = .string(s) }
        else { throw DecodingError.dataCorruptedError(in: c, debugDescription: "bad id") }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .number(let i): try c.encode(i)
        case .string(let s): try c.encode(s)
        }
    }
}

/// A request frame the client sends to core. Params are encoded inline.
public struct RPCRequest: Encodable {
    public let jsonrpc = "2.0"
    public let id: MessageID
    public let method: String
    public let params: AnyJSON?

    public init(id: MessageID, method: String, params: AnyJSON? = nil) {
        self.id = id
        self.method = method
        self.params = params
    }
}

/// Inbound frame from core. Discriminated by which keys are present.
public enum RPCInbound: Sendable {
    case responseOk(id: MessageID, result: AnyJSON)
    case responseError(id: MessageID, error: RPCError)
    case notification(method: String, params: AnyJSON?)
}

public struct RPCError: Decodable, Error, Sendable {
    public let code: Int
    public let message: String
    public let data: AnyJSON?
}

/// Standard + Mineco error codes (mirror ErrorCode in schema.ts).
public enum RPCErrorCode {
    public static let parseError = -32700
    public static let invalidRequest = -32600
    public static let methodNotFound = -32601
    public static let invalidParams = -32602
    public static let internalError = -32603
    public static let sessionNotFound = -32001
    public static let sessionNotIdle = -32002
    public static let profileNotFound = -32003
    public static let permissionTimeout = -32004
}

// MARK: - Method names (§4.1 requests, §4.2 notifications)

public enum RPCRequestMethod {
    // config
    public static let configListProfiles = "config/listProfiles"
    public static let configSaveProfile = "config/saveProfile"
    public static let configDeleteProfile = "config/deleteProfile"
    public static let configSetActiveProfile = "config/setActiveProfile"
    // usage
    public static let usageGet = "usage/get"
    // session lifecycle
    public static let sessionList = "session/list"
    public static let sessionCreate = "session/create"
    public static let sessionResume = "session/resume"
    public static let sessionSend = "session/send"
    public static let sessionInterrupt = "session/interrupt"
    public static let sessionClose = "session/close"
    public static let sessionMessages = "session/messages"
    // session runtime knobs
    public static let sessionSetModel = "session/setModel"
    public static let sessionSetPermissionMode = "session/setPermissionMode"
    public static let sessionSetMcpServers = "session/setMcpServers"
    public static let sessionApplyFlagSettings = "session/applyFlagSettings"
    public static let sessionSetProfile = "session/setProfile"
    // permission round-trip
    public static let sessionRespondPermission = "session/respondPermission"
}

public enum RPCNotificationMethod {
    public static let sessionMessage = "session/message"
    public static let sessionPermissionRequest = "session/permissionRequest"
    public static let ready = "ready"
    public static let stderr = "stderr"
    public static let error = "error"
}

// MARK: - Domain types

/// Provider kinds (§6). v1 ships `anthropic` and `custom`.
public enum ProviderKind: String, Codable, Sendable {
    case anthropic
    case custom
}

/// Coarse permission modes forwarded to the SDK (§5.5).
public enum PermissionMode: String, Codable, Sendable {
    case `default` = "default"
    case acceptEdits = "acceptEdits"
    case plan = "plan"
    case bypassPermissions = "bypassPermissions"
}

/// User's decision in a permission prompt (§4.3).
public enum PermissionBehavior: String, Codable, Sendable {
    case allow
    case allowAlways = "allowAlways"
    case deny
}

/// A connection profile (§5.4 / §6). Wire shape mirrors the TS `Profile`.
public struct Profile: Codable, Identifiable, Hashable, Sendable {
    public var id: String
    public var name: String
    public var provider: ProviderKind
    public var apiKey: String
    public var baseUrl: String
    public var defaultModel: String
    public var permissionMode: PermissionMode

    public init(
        id: String,
        name: String,
        provider: ProviderKind,
        apiKey: String = "",
        baseUrl: String = "",
        defaultModel: String = "",
        permissionMode: PermissionMode = .default
    ) {
        self.id = id
        self.name = name
        self.provider = provider
        self.apiKey = apiKey
        self.baseUrl = baseUrl
        self.defaultModel = defaultModel
        self.permissionMode = permissionMode
    }

    enum CodingKeys: String, CodingKey {
        case id, name, provider
        case apiKey = "api_key"
        case baseUrl = "base_url"
        case defaultModel = "default_model"
        case permissionMode = "permission_mode"
    }
}

/// `session/create` params (§4.1). UI sends no secrets — core resolves the profile.
public struct SessionCreateParams: Encodable {
    public let cwd: String
    public let profileId: String?
    public let title: String?

    public init(cwd: String, profileId: String? = nil, title: String? = nil) {
        self.cwd = cwd
        self.profileId = profileId
        self.title = title
    }
}

/// `session/create` result.
public struct SessionCreateResult: Decodable, Sendable {
    public let sessionId: String
    /// SDK `initializationResult()`, opaque to the transport layer.
    public let initPayload: AnyJSON

    enum CodingKeys: String, CodingKey {
        case sessionId = "sessionId"
        case initPayload = "init"
    }
}

/// `session/send` params (§4.1). A Request (returns null result) — core only
/// dispatches frames carrying an `id`, so this MUST be sent as a request, never
/// a notification.
public struct SessionSendParams: Encodable {
    public let sessionId: String
    public let text: String

    public init(sessionId: String, text: String) {
        self.sessionId = sessionId
        self.text = text
    }
}

/// `session/interrupt` params.
public struct SessionIDParams: Encodable {
    public let sessionId: String

    public init(sessionId: String) { self.sessionId = sessionId }
}

/// `session/respondPermission` params (§4.3).
public struct SessionRespondPermissionParams: Encodable {
    public let sessionId: String
    public let requestId: String
    public let behavior: PermissionBehavior

    public init(sessionId: String, requestId: String, behavior: PermissionBehavior) {
        self.sessionId = sessionId
        self.requestId = requestId
        self.behavior = behavior
    }
}

/// Generic `{ id }` params (delete/setActive profile).
public struct IDParam: Encodable {
    public let id: String
    public init(_ id: String) { self.id = id }
}

/// `session/message` notification payload (§4.2).
public struct SessionMessageNotification: Decodable {
    public let sessionId: String
    public let message: AnyJSON
}

/// `session/permissionRequest` notification payload (§4.3).
public struct PermissionRequestNotification: Decodable, Identifiable, Sendable {
    public let sessionId: String
    public let requestId: String
    public let toolName: String
    public let input: AnyJSON?

    /// Identifies the sheet item by the SDK toolUseID (unique per request).
    public var id: String { requestId }
}
