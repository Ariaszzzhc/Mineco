// SPDX-License-Identifier: MIT
//
// `.p-card` plan — checklist of plan items with run-state styling.

import SwiftUI

/// Plan checklist card: header with done/total count, body of rows whose
/// checkbox + label style follows each item's `RunState`.
struct PlanCardView: View {
    let items: [PlanItem]

    private var doneCount: Int { items.filter { $0.state == .done }.count }
    private var totalCount: Int { items.count }

    var body: some View {
        VStack(spacing: 0) {
            header
            rows
        }
        .background(
            RoundedRectangle(cornerRadius: MRadius.card, style: .continuous)
                .fill(Color.mCardBg)
        )
        .overlay(
            RoundedRectangle(cornerRadius: MRadius.card, style: .continuous)
                .strokeBorder(Color.mLine, lineWidth: 0.5)
        )
        .shadow(color: .black.opacity(0.06), radius: 6, x: 0, y: 2)
    }

    private var header: some View {
        HStack(spacing: 9) {
            Image(systemName: "list.bullet")
                .font(.system(size: 14))
                .foregroundColor(.mAccent)
            Text("Plan")
                .minecoFont(12, weight: .semibold)
                .foregroundColor(.mInk)
            Spacer(minLength: 0)
            Text("\(doneCount)/\(totalCount)")
                .minecoFont(11, mono: true)
                .foregroundColor(.mInk3)
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 14)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(Color.mLine)
                .frame(height: 0.5)
        }
    }

    private var rows: some View {
        VStack(spacing: 0) {
            ForEach(items) { item in
                row(for: item)
            }
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 12)
        .padding(.bottom, 2)
    }

    private func row(for item: PlanItem) -> some View {
        HStack(alignment: .top, spacing: 10) {
            checkbox(for: item.state)
            Text(item.label)
                .minecoFont(13.5)
                .foregroundColor(labelColor(for: item.state))
                .strikethrough(item.state == .done, color: .mInk3)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 5)
        .padding(.horizontal, 2)
    }

    @ViewBuilder
    private func checkbox(for state: RunState) -> some View {
        let size: CGFloat = 17
        switch state {
        case .done:
            ZStack {
                Circle().fill(Color.mAccent).frame(width: size, height: size)
                Image(systemName: "checkmark")
                    .font(.system(size: 10, weight: .heavy))
                    .foregroundColor(.white)
            }
            .frame(width: size, height: size)
        case .run:
            ZStack {
                Circle().fill(Color.mAccentBg).frame(width: size, height: size)
                Circle().fill(Color.mAccent).frame(width: 7, height: 7)
                    .modifier(BlinkingDot())
            }
            .frame(width: size, height: size)
        case .todo:
            Circle()
                .strokeBorder(Color.mInk3, lineWidth: 1.5)
                .frame(width: size, height: size)
        }
    }

    private func labelColor(for state: RunState) -> Color {
        switch state {
        case .done: return .mInk3
        case .run: return .mInk
        case .todo: return .mInk2
        }
    }
}

/// Subtle opacity blink for a running plan dot. Honors reduce-motion.
private struct BlinkingDot: ViewModifier {
    @State private var on = true
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    func body(content: Content) -> some View {
        content
            .opacity(reduceMotion ? 1 : (on ? 1 : 0.25))
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.easeInOut(duration: 0.7).repeatForever(autoreverses: true)) {
                    on = false
                }
            }
    }
}
