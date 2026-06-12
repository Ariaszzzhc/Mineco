// SPDX-License-Identifier: MIT
//
// SidebarView — the primary floating glass sheet (`.lqg-sidebar`). Width 232,
// glass material, holding: brand mark, a green "New task" pill, a "Recent"
// threads list (one row per session), and a two-line mono foot.

import SwiftUI

/// The floating sidebar panel. The stage positions it and supplies the frame;
/// this view renders the glass panel content filling whatever frame it gets.
struct SidebarView: View {
    @Environment(AppModel.self) private var appModel

    let onNewTask: () -> Void

    private var selectedSession: Session? {
        if let id = appModel.selectedSessionID,
           let s = appModel.sessions.first(where: { $0.id == id }) {
            return s
        }
        return appModel.sessions.first
    }

    private var footRepo: String {
        guard let repo = selectedSession?.repo, !repo.isEmpty else {
            return "—"
        }
        return (repo as NSString).lastPathComponent
    }

    var body: some View {
        VStack(spacing: 0) {
            brandRow
                .padding(.bottom, 12)

            newTaskButton
                .padding(.horizontal, 2)
                .padding(.bottom, 14)

            recentLabel

            threadsList

            foot
        }
        .padding(.vertical, 14)
        .padding(.horizontal, 10)
        .padding(.bottom, 12)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .glass(radius: MRadius.panel)
    }

    // MARK: Brand

    private var brandRow: some View {
        HStack(spacing: 9) {
            brandMark
            Text("mineco")
                .minecoFont(16, weight: .bold)
                .foregroundStyle(.mInk)
            Spacer(minLength: 0)
            Text("AGENT")
                .minecoFont(10, weight: .semibold)
                .foregroundStyle(.mInk3)
                .tracking(0.6)
                .textCase(.uppercase)
        }
    }

    private var brandMark: some View {
        ZStack {
            Circle()
                .fill(
                    LinearGradient(
                        colors: [.mAccent, .mAccentDk],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 24, height: 24)
                .shadow(color: .mAccent.opacity(0.45), radius: 6, x: 0, y: 3)
            Image(systemName: "leaf.fill")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.white)
        }
    }

    // MARK: New task

    private var newTaskButton: some View {
        Button(action: onNewTask) {
            HStack(spacing: 7) {
                Image(systemName: "plus")
                    .font(.system(size: 14, weight: .semibold))
                Text("New task")
                    .minecoFont(13, weight: .semibold)
                Spacer(minLength: 0)
            }
            .foregroundStyle(.white)
            .padding(.vertical, 9)
            .padding(.horizontal, 14)
            .frame(maxWidth: .infinity)
            .background(
                ZStack {
                    Capsule()
                        .fill(
                            LinearGradient(
                                colors: [.mAccent, .mAccentDk],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                    // faint top inset white highlight
                    Capsule()
                        .strokeBorder(
                            LinearGradient(
                                colors: [.white.opacity(0.55), .clear],
                                startPoint: .top, endPoint: .center
                            ),
                            lineWidth: 0.5
                        )
                }
            )
            .shadow(color: .mAccent.opacity(0.5), radius: 8, x: 0, y: 4)
        }
        .buttonStyle(NewTaskButtonStyle())
    }

    // MARK: Recent label

    private var recentLabel: some View {
        HStack {
            Text("RECENT")
                .minecoFont(10.5, weight: .heavy)
                .foregroundStyle(.mInk3)
                .tracking(0.8)
            Spacer(minLength: 0)
        }
        .padding(.top, 4)
        .padding(.bottom, 6)
        .padding(.horizontal, 10)
    }

    // MARK: Threads

    private var threadsList: some View {
        ScrollView {
            VStack(spacing: 2) {
                ForEach(appModel.sessions) { session in
                    Button {
                        appModel.selectedSessionID = session.id
                    } label: {
                        ThreadRow(session: session,
                                  active: session.id == appModel.selectedSessionID)
                    }
                    .buttonStyle(ThreadButtonStyle(active: session.id == appModel.selectedSessionID))
                }
            }
            .padding(.horizontal, 0)
        }
    }

    // MARK: Foot

    private var foot: some View {
        VStack(spacing: 4) {
            Divider()
                .background(Color.white.opacity(0.5))
                .opacity(0.9)
            VStack(spacing: 5) {
                HStack(spacing: 7) {
                    GitBranchIcon(size: 13, color: .mInk3)
                    Text(footRepo)
                        .minecoFont(10.5, mono: true)
                        .foregroundStyle(.mInk2)
                    Spacer(minLength: 0)
                }
                HStack(spacing: 7) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 12))
                        .foregroundStyle(.mInk3)
                    Text("sonnet · 4 files in context")
                        .minecoFont(10.5, mono: true)
                        .foregroundStyle(.mInk2)
                    Spacer(minLength: 0)
                }
            }
            .padding(.top, 10)
        }
        .padding(.top, 0)
    }
}

// MARK: - Thread row

private struct ThreadRow: View {
    let session: Session
    let active: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(session.title)
                .minecoFont(12.5, weight: .semibold)
                .foregroundStyle(active ? .mInk : .mInk2)
                .lineLimit(1)
            Text(session.updatedAt)
                .minecoFont(10.5)
                .foregroundStyle(.mInk3)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 7)
        .padding(.horizontal, 10)
    }
}

// MARK: - Button styles

/// Thread row: hover (non-active) → white .42; active → white .66 + inset
/// highlight + shadow. Rounded 10.
struct ThreadButtonStyle: ButtonStyle {
    let active: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(active ? Color.white.opacity(0.66)
                                 : (configuration.isPressed ? Color.white.opacity(0.55)
                                                             : Color.white.opacity(0.42)))
                    .opacity(active ? 1 : 1)
            )
            .overlay {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .strokeBorder(
                        LinearGradient(
                            colors: active ? [.white.opacity(0.7), .clear]
                                           : [.white.opacity(0.35), .clear],
                            startPoint: .top, endPoint: .center
                        ),
                        lineWidth: 0.5
                    )
            }
            .shadow(color: active ? Color(white: 0.10, opacity: 0.12) : .clear,
                    radius: 8, x: 0, y: 4)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
            .animation(.easeOut(duration: 0.15), value: active)
    }
}

/// New task pill: press scale .98.
struct NewTaskButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}
