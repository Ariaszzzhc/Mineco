// SPDX-License-Identifier: MIT
//
// `.p-actions` — row of action buttons under an agent turn.

import SwiftUI

/// Row of capsule action buttons. Default style = white card with hairline;
/// primary style = accent fill with glow. Buttons are no-ops in v1.
struct ActionRowView: View {
    let actions: [ActionButton]

    var body: some View {
        HStack(spacing: 9) {
            ForEach(actions) { action in
                ActionButtonView(action: action) {}
            }
        }
    }
}

/// A single capsule action button with hover + press styling. Owns its own
/// hover state so the tint persists across renders.
private struct ActionButtonView: View {
    let action: ActionButton
    let perform: () -> Void

    @State private var hover = false

    var body: some View {
        Button(action: perform) {
            HStack(spacing: 6) {
                if let symbol = action.symbol {
                    Image(systemName: symbol)
                        .font(.system(size: 14))
                }
                Text(action.label)
                    .minecoFont(13, weight: .semibold)
            }
            .foregroundColor(action.primary ? .white : .mInk)
            .padding(.vertical, 8)
            .padding(.horizontal, 16)
            .background(background)
            .overlay(border)
            .shadow(
                color: action.primary ? .mAccent.opacity(0.5) : .black.opacity(0.07),
                radius: action.primary ? 6 : 1,
                x: 0,
                y: action.primary ? 4 : 3
            )
        }
        .buttonStyle(.plain)
        .onHover { hover = $0 }
    }

    @ViewBuilder
    private var background: some View {
        Capsule().fill(action.primary ? fillPrimary : Color.mCardBg)
    }

    private var fillPrimary: Color {
        hover ? Color.mAccent.opacity(0.92) : Color.mAccent
    }

    @ViewBuilder
    private var border: some View {
        if !action.primary {
            Capsule()
                .strokeBorder(Color.mLine, lineWidth: 0.5)
        }
    }
}
