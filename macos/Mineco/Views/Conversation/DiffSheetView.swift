// SPDX-License-Identifier: MIT
//
// `.p-diff` — unified diff sheet (path header + colored add/del/ctx rows).

import SwiftUI

/// Unified diff card. Mono throughout; header with path + add/del stats, body
/// of guttered rows colored by kind with tinted backgrounds.
struct DiffSheetView: View {
    let path: String
    let add: Int
    let del: Int
    let rows: [DiffRow]

    var body: some View {
        VStack(spacing: 0) {
            header
            rowsView
        }
        .background(
            RoundedRectangle(cornerRadius: MRadius.field, style: .continuous)
                .fill(Color.mCardBg)
        )
        .overlay(
            RoundedRectangle(cornerRadius: MRadius.field, style: .continuous)
                .strokeBorder(Color.mLine, lineWidth: 0.5)
        )
    }

    private var header: some View {
        HStack(spacing: 8) {
            Image(systemName: "doc")
                .font(.system(size: 12))
                .foregroundColor(.mInk2)
            Text(path)
                .minecoFont(11, weight: .semibold)
                .foregroundColor(.mInk)
                .lineLimit(1)
                .truncationMode(.middle)
            Spacer(minLength: 0)
            HStack(spacing: 8) {
                Text("+\(add)")
                    .foregroundColor(.mOk)
                    .minecoFont(11, weight: .semibold, mono: true)
                Text("−\(del)")
                    .foregroundColor(.mDel)
                    .minecoFont(11, weight: .semibold, mono: true)
            }
        }
        .padding(.vertical, 7)
        .padding(.horizontal, 12)
        .background(Color.mFieldBg)
        .clipShape(UnevenRoundedRectangle(cornerRadii: .init(topLeading: 12, bottomLeading: 0, bottomTrailing: 0, topTrailing: 12), style: .continuous))
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(Color.mLine)
                .frame(height: 0.5)
        }
    }

    private var rowsView: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                diffRow(row)
            }
        }
    }

    private func diffRow(_ row: DiffRow) -> some View {
        HStack(alignment: .top, spacing: 0) {
            Text(row.number)
                .minecoFont(10.5, mono: true)
                .foregroundColor(gutterColor(for: row.kind))
                .frame(width: 36, alignment: .trailing)
                .padding(.leading, 0)
                .padding(.trailing, 8)
                .overlay(alignment: .trailing) {
                    Rectangle()
                        .fill(Color.mLine)
                        .frame(width: 0.5)
                }

            Text(row.code)
                .minecoFont(11.5, mono: true)
                .foregroundColor(textColor(for: row.kind))
                .strikethrough(row.kind == .del, color: .mDel.opacity(0.6))
                .textSelection(.enabled)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.leading, 10)
                .padding(.trailing, 10)
        }
        .background(rowBackground(for: row.kind))
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func gutterColor(for kind: DiffRow.Kind) -> Color {
        switch kind {
        case .ctx: return .mInk3
        case .add: return .mOk
        case .del: return .mDel
        }
    }

    private func textColor(for kind: DiffRow.Kind) -> Color {
        switch kind {
        case .ctx: return .mInk2
        case .add: return .mDiffAddText
        case .del: return .mDiffDelText
        }
    }

    @ViewBuilder
    private func rowBackground(for kind: DiffRow.Kind) -> some View {
        switch kind {
        case .ctx: Color.clear
        case .add: Color.mOkBg
        case .del: Color.mDelBg
        }
    }
}
