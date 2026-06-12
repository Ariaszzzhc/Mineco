// SPDX-License-Identifier: MIT
//
// `.p-workpill` — the floating glass status pill shown above the composer while
// the agent is working. Two states: running (spinner + label… + stop) and
// paused ("Paused — label" + resume). Capsule-shaped glass, one locked fill.

import SwiftUI

/// The two visual states of `WorkPillView`.
enum WorkPillState: Hashable {
    /// Agent is actively running: spinner + "label…" + a Stop button.
    case running(label: String)
    /// Agent is paused: "Paused — label" + a Resume button.
    case paused(label: String)
}

/// Floating glass pill that reports agent progress and offers Stop / Resume.
///
/// Rendered above the composer by the stage; this view owns only its own
/// chrome and forwards taps via `onStop` / `onResume`.
struct WorkPillView: View {
    let state: WorkPillState
    let onStop: () -> Void
    let onResume: () -> Void

    init(
        state: WorkPillState,
        onStop: @escaping () -> Void = {},
        onResume: @escaping () -> Void = {}
    ) {
        self.state = state
        self.onStop = onStop
        self.onResume = onResume
    }

    var body: some View {
        HStack(spacing: 8) {
            switch state {
            case .running(let label):
                Spinner(size: 12)
                Text("\(label)…")
                    .minecoFont(12, weight: .semibold)
                    .foregroundColor(.mInk)
                    .lineLimit(1)
                stopButton
            case .paused(let label):
                Text("Paused — \(label.lowercased())")
                    .minecoFont(12, weight: .semibold)
                    .foregroundColor(.mInk)
                    .lineLimit(1)
                resumeButton
            }
        }
        .padding(.leading, 15)
        .padding(.trailing, 8)
        .padding(.vertical, 7)
        .glassCapsule()
    }

    // MARK: - Controls

    /// The stop affordance: a 24pt accent-tinted circle holding a filled 9×9
    /// rounded square (the stop glyph). Hover deepens the tint.
    private var stopButton: some View {
        Button(action: onStop) {
            RoundedRectangle(cornerRadius: 2, style: .continuous)
                .fill(Color.mAccentDk)
                .frame(width: 9, height: 9)
                .frame(width: 24, height: 24)
                .background(
                    Circle().fill(Color.mAccentBg)
                )
        }
        .buttonStyle(StopButtonStyle())
        .accessibilityLabel("Stop")
    }

    /// The resume affordance: a borderless accent label.
    private var resumeButton: some View {
        Button(action: onResume) {
            Text("Resume")
                .minecoFont(12, weight: .bold)
                .foregroundColor(.mAccentDk)
                .padding(.vertical, 2)
                .padding(.horizontal, 6)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Resume")
    }
}

// MARK: - Glass capsule modifier

/// Capsule-shaped glass surface: ultra-thin material + top-down white tint +
/// 0.5px white hairline + a soft shadow. The pill analog of `.glass(radius:)`.
private struct GlassCapsule: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background {
                ZStack {
                    Capsule()
                        .fill(.ultraThinMaterial)
                    Capsule()
                        .fill(
                            LinearGradient(
                                stops: [
                                    .init(color: .white.opacity(0.30), location: 0),
                                    .init(color: .white.opacity(0.14), location: 1),
                                ],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                        )
                }
            }
            .overlay {
                Capsule()
                    .strokeBorder(.white.opacity(0.45), lineWidth: 0.5)
            }
            .shadow(color: .black.opacity(0.18), radius: 14, x: 0, y: 8)
    }
}

private extension View {
    /// Apply the capsule-shaped glass material to this pill.
    func glassCapsule() -> some View { modifier(GlassCapsule()) }
}

// MARK: - Stop button style (hover-aware)

/// Hover-aware circle button: transparent at rest, accent .22 tint on hover.
/// The stop glyph's own `.mAccentBg` disc shows through at rest; hover adds the
/// deeper ring.
struct StopButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        StopHover(configuration: configuration)
    }
}

/// Wraps the button label to own hover state (ButtonStyle itself can't).
private struct StopHover: View {
    let configuration: ButtonStyle.Configuration
    @State private var hovered = false

    var body: some View {
        configuration.label
            .background(
                Circle().fill(hovered ? Color.mAccent.opacity(0.22) : .clear)
            )
            .onHover { hovered = $0 }
            .animation(.easeOut(duration: 0.15), value: hovered)
    }
}
