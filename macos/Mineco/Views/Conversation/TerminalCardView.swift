// SPDX-License-Identifier: MIT
//
// `.p-term` — dark terminal card (cmd header + mono output lines).

import SwiftUI

/// Dark terminal card. Monospaced output with prompt glyphs, style-tinted text,
/// an OK badge when finished, and a blinking caret when still running.
struct TerminalCardView: View {
    let cmd: String
    let lines: [TermLine]
    let okLabel: String?
    let running: Bool

    var body: some View {
        VStack(spacing: 0) {
            header
            output
        }
        .background(
            RoundedRectangle(cornerRadius: MRadius.field, style: .continuous)
                .fill(Color.mTerm)
        )
        .overlay(
            RoundedRectangle(cornerRadius: MRadius.field, style: .continuous)
                .strokeBorder(Color.black.opacity(0.4), lineWidth: 0.5)
        )
    }

    private var header: some View {
        HStack(spacing: 8) {
            Image(systemName: "terminal")
                .foregroundColor(.mTermDim)
            Text(cmd)
                .minecoFont(11)
                .foregroundColor(.mTermDim)
                .lineLimit(1)
                .truncationMode(.middle)
            Spacer(minLength: 0)
            if !running, let label = okLabel {
                HStack(spacing: 6) {
                    Image(systemName: "checkmark")
                    Text(label)
                }
                .foregroundColor(.mTermOk)
                .minecoFont(11, weight: .semibold)
            }
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 13)
        .background(Color.mTerm2)
        .clipShape(UnevenRoundedRectangle(cornerRadii: .init(topLeading: 12, bottomLeading: 0, bottomTrailing: 0, topTrailing: 12), style: .continuous))
    }

    private var output: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                lineView(line)
            }
            if running {
                HStack(spacing: 0) {
                    BlinkingCaret(color: .mTermOk, width: 8)
                    Spacer(minLength: 0)
                }
            }
        }
        .padding(.vertical, 11)
        .padding(.horizontal, 14)
        .padding(.bottom, 2)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func lineView(_ line: TermLine) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 0) {
            if !line.prompt.isEmpty {
                Text(line.prompt)
                    .minecoFont(12, mono: true)
                    .foregroundColor(.mTermOk)
                Spacer().frame(width: 8)
            }
            Text(line.text)
                .minecoFont(12, mono: true)
                .foregroundColor(textColor(for: line.style))
                .textSelection(.enabled)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func textColor(for style: TermLine.Style) -> Color {
        switch style {
        case .plain: return .mTermTx
        case .ok: return .mTermOk
        case .dim: return .mTermDim
        }
    }
}
