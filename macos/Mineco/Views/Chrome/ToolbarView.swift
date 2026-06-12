// SPDX-License-Identifier: MIT
//
// ToolbarView — the floating top toolbar (`.lqg-toolbar`). A transparent
// horizontal bar laid over the window: traffic lights + "repoShort — mineco"
// title on the left, a glass capsule pill cluster (branch + replay) on the
// right. It floats over scrolling content; only its buttons capture hits.

import SwiftUI

/// The window's top chrome: title on the leading edge, a glass pill cluster
/// (branch name + replay) on the trailing edge. Derives branch/repoShort from
/// the selected session via `AppModel`.
struct ToolbarView: View {
    @Environment(AppModel.self) private var appModel

    /// Optional replay handler; nil hides the replay affordance's action.
    var onReplay: (() -> Void)? = nil

    private var selectedSession: Session? {
        if let id = appModel.selectedSessionID,
           let s = appModel.sessions.first(where: { $0.id == id }) {
            return s
        }
        return appModel.sessions.first
    }

    private var branch: String {
        selectedSession?.branch ?? "main"
    }

    private var repoShort: String {
        guard let repo = selectedSession?.repo, !repo.isEmpty else {
            return "web-client"
        }
        return (repo as NSString).lastPathComponent
    }

    var body: some View {
        HStack(spacing: 12) {
            TrafficLights()

            HStack(spacing: 0) {
                Text(repoShort)
                    .minecoFont(13, weight: .semibold)
                    .foregroundStyle(.mInk)
                Text(" — mineco")
                    .minecoFont(13, weight: .regular)
                    .foregroundStyle(.mInk2)
            }
            .lineLimit(1)

            Spacer(minLength: 0)

            pillCluster
        }
        .padding(.horizontal, 18)
        .frame(height: 58)
        .frame(maxWidth: .infinity, alignment: .leading)
        // Toolbar floats; empty space passes clicks through naturally.
    }

    /// The glass capsule holding the branch + replay buttons.
    private var pillCluster: some View {
        HStack(spacing: 2) {
            Button {
                // branch is informational in v1; no action.
            } label: {
                HStack(spacing: 6) {
                    GitBranchIcon(size: 13, color: .mInk2)
                    Text(branch)
                        .minecoFont(11.5, weight: .medium, mono: true)
                        .foregroundStyle(.mInk2)
                }
                .padding(.vertical, 5)
                .padding(.horizontal, 10)
            }
            .buttonStyle(ToolbarPillButtonStyle())

            Button {
                onReplay?()
            } label: {
                Image(systemName: "arrow.clockwise")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(.mInk2)
                    .frame(width: 30, height: 26)
            }
            .buttonStyle(HoverPillButtonStyle())
            .disabled(onReplay == nil)
        }
        .padding(3)
        .glassCapsule()
    }
}

// MARK: - Button style

/// Pill button inside the toolbar cluster: transparent at rest, white .55 on
/// hover, white .70 on press. Capsule corners, no border, ease-out 0.15s.
///
/// SwiftUI `ButtonStyle.makeBody` is non-view and cannot own `@State`, so the
/// hover state lives in `HoverCapsuleFill`, a tiny view the style attaches as
/// a background over the label.
struct ToolbarPillButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(HoverCapsuleFill(pressed: configuration.isPressed))
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}

/// Reusable hover-aware pill button style (alias of the toolbar style).
struct HoverPillButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        ToolbarPillButtonStyle().makeBody(configuration: configuration)
    }
}

/// A capsule background that tracks hover and exposes a white .55 hover wash
/// (white .70 when pressed). Kept as a view so it can hold `@State`.
private struct HoverCapsuleFill: View {
    let pressed: Bool
    @State private var hovered = false

    var body: some View {
        Capsule()
            .fill(Color.white.opacity(pressed ? 0.70 : (hovered ? 0.55 : 0.0)))
            .onHover { hovered = $0 }
            .animation(.easeOut(duration: 0.15), value: hovered)
            .animation(.easeOut(duration: 0.15), value: pressed)
    }
}

// MARK: - Glass capsule modifier

/// A capsule-shaped glass surface: ultra-thin material + top-down white tint +
/// 0.5px white hairline + the standard outer shadow. The capsule analog of
/// `.glass(radius:)` (which uses rounded rectangles).
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
            .overlay(alignment: .top) {
                Capsule()
                    .strokeBorder(
                        LinearGradient(
                            colors: [.white.opacity(0.55), .clear],
                            startPoint: .top, endPoint: .center
                        ),
                        lineWidth: 0.5
                    )
            }
            .shadow(color: Color(white: 0.10, opacity: 0.18), radius: 22, x: 0, y: 14)
            .shadow(color: Color(white: 0.10, opacity: 0.07), radius: 3, x: 0, y: 1)
    }
}

private extension View {
    /// Apply the capsule-shaped glass material (pill clusters, toggles).
    func glassCapsule() -> some View { modifier(GlassCapsule()) }
}
