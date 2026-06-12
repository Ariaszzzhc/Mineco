// SPDX-License-Identifier: MIT
//
// `.p-composer` — the floating glass input. Outer `.glass()` wrapper holds a
// `.glassPlate()` field: a multi-line textarea over a bottom bar with attach,
// context count, the ↩ hint, and a circular send button (disabled when empty).

import SwiftUI

/// Floating glass composer: a stabilized multi-line field with attach / context
/// affordances on the left and a circular accent send button on the right.
///
/// Pure component — owns only its `draft`; the stage positions it and supplies
/// `onSend`. ⌘↩ / ↩ (without shift) submits; shift-↩ inserts a newline.
struct ComposerBarView: View {
    /// Number of context files shown in the context pill (left of the spacer).
    var contextCount: Int

    let onSend: (String) -> Void

    @State private var draft: String = ""

    init(contextCount: Int = 4, onSend: @escaping (String) -> Void) {
        self.contextCount = contextCount
        self.onSend = onSend
    }

    /// Whitespace-trimmed draft; the empty check gates the send button.
    private var trimmed: String {
        draft.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var canSend: Bool { !trimmed.isEmpty }

    var body: some View {
        field
            .glassPlate(radius: MRadius.field)
            .padding(6)
            .glass(radius: MRadius.panel)
    }

    // MARK: - Field

    /// The stabilized inner column: textarea on top, bottom control bar below.
    private var field: some View {
        VStack(spacing: 0) {
            textarea
            bottomBar
        }
    }

    private var textarea: some View {
        TextField("Message the agent…", text: $draft, axis: .vertical)
            .textFieldStyle(.plain)
            .lineLimit(1...6)
            .minecoFont(14)
            .foregroundColor(.mInk)
            .onSubmit(submit)
            .padding(.top, 10)
            .padding(.leading, 13)
            .padding(.bottom, 2)
            .padding(.trailing, 13)
    }

    private var bottomBar: some View {
        HStack(spacing: 6) {
            attachButton
            contextPill
            Spacer(minLength: 0)
            hint
            sendButton
        }
        .padding(.top, 4)
        .padding(.bottom, 6)
        .padding(.horizontal, 6)
    }

    // MARK: - Controls

    /// Attach (paperclip) affordance — no-op in v1.
    private var attachButton: some View {
        Button {
            // no-op
        } label: {
            Image(systemName: "paperclip")
                .font(.system(size: 16, weight: .regular))
                .foregroundColor(.mInk2)
                .frame(width: 29, height: 29)
        }
        .buttonStyle(CircleIconButtonStyle(hoverBg: .black.opacity(0.06)))
        .accessibilityLabel("Attach")
    }

    /// Context-count pill: inline (not circular), monospaced "doc · N files".
    private var contextPill: some View {
        Button {
            // no-op
        } label: {
            HStack(spacing: 5) {
                Image(systemName: "doc")
                    .font(.system(size: 11, weight: .regular))
                Text("\(contextCount) files")
                    .minecoFont(11, mono: true)
            }
            .foregroundColor(.mInk2)
            .padding(.vertical, 0)
            .padding(.horizontal, 9)
            .frame(minHeight: 29)
        }
        .buttonStyle(CircleIconButtonStyle(hoverBg: .black.opacity(0.06)))
        .accessibilityLabel("\(contextCount) context files")
    }

    /// The ⌘↩ / ↩ hint, kept faint.
    private var hint: some View {
        Text("↩ send")
            .minecoFont(10.5, mono: true)
            .foregroundColor(.mInk3)
    }

    /// Circular accent send button; disabled (gray, no shadow) when empty.
    private var sendButton: some View {
        Button(action: submit) {
            Image(systemName: "arrow.up")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(.white)
                .frame(width: 32, height: 32)
        }
        .buttonStyle(SendButtonStyle(enabled: canSend))
        .disabled(!canSend)
        .accessibilityLabel(canSend ? "Send" : "Send (empty)")
    }

    // MARK: - Submit

    /// Forward the trimmed draft and clear the field.
    private func submit() {
        guard canSend else { return }
        let content = trimmed
        draft = ""
        onSend(content)
    }
}

// MARK: - CircleIconButtonStyle (attach / context)

/// Transparent icon button that gains a `hoverBg` rounded fill on hover. Used by
/// the attach and context affordances. Press does not scale (matches prototype).
struct CircleIconButtonStyle: ButtonStyle {
    var hoverBg: Color

    func makeBody(configuration: Configuration) -> some View {
        CircleIconHover(configuration: configuration, hoverBg: hoverBg)
    }
}

/// Wraps the label to own hover state (ButtonStyle itself can't).
private struct CircleIconHover: View {
    let configuration: ButtonStyle.Configuration
    let hoverBg: Color
    @State private var hovered = false

    var body: some View {
        configuration.label
            .background(
                RoundedRectangle(cornerRadius: MRadius.field, style: .continuous)
                    .fill(hovered ? hoverBg : .clear)
            )
            .onHover { hovered = $0 }
            .animation(.easeOut(duration: 0.15), value: hovered)
    }
}

// MARK: - SendButtonStyle

/// Circular send button: accent fill + glow when enabled, flat gray when
/// disabled. Press scales to .95 (enabled only).
struct SendButtonStyle: ButtonStyle {
    var enabled: Bool

    func makeBody(configuration: Configuration) -> some View {
        SendButtonBody(
            configuration: configuration,
            enabled: enabled,
            isPressed: configuration.isPressed
        )
    }
}

/// Hosts the send button's enabled/disabled look around the label content.
/// `isPressed` is forwarded from the configuration so the tap scale reacts live.
private struct SendButtonBody: View {
    let configuration: ButtonStyle.Configuration
    let enabled: Bool
    let isPressed: Bool

    var body: some View {
        configuration.label
            .frame(width: 32, height: 32)
            .background(background)
            .overlay(alignment: .top) { topHighlight }
            .shadow(color: enabled ? Color.mAccent.opacity(0.6) : .clear,
                    radius: enabled ? 5 : 0, x: 0, y: 3)
            .scaleEffect(enabled && isPressed ? 0.95 : 1)
            .animation(.easeOut(duration: 0.12), value: isPressed)
    }

    /// Accent disc when enabled; flat translucent gray when disabled.
    private var background: some View {
        Circle().fill(enabled ? Color.mAccent : Color.black.opacity(0.14))
    }

    /// Inset top white hairline (locked light from top); only when enabled.
    @ViewBuilder private var topHighlight: some View {
        if enabled {
            Circle()
                .strokeBorder(
                    LinearGradient(
                        colors: [.white.opacity(0.5), .clear],
                        startPoint: .top, endPoint: .center
                    ),
                    lineWidth: 0.5
                )
        }
    }
}
