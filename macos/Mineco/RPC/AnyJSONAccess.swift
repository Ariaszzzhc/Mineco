// SPDX-License-Identifier: MIT
//
// Convenience accessors for `AnyJSON`. These do NOT change the wire contract —
// they only make it ergonomic to read SDK message payloads on the Swift side.

extension AnyJSON {
    var stringValue: String? {
        if case .string(let s) = storage { return s }
        return nil
    }

    var boolValue: Bool? {
        if case .bool(let b) = storage { return b }
        return nil
    }

    var objectValue: [String: AnyJSON]? {
        if case .object(let o) = storage { return o }
        return nil
    }

    var arrayValue: [AnyJSON]? {
        if case .array(let a) = storage { return a }
        return nil
    }

    subscript(key: String) -> AnyJSON? {
        objectValue?[key]
    }
}
