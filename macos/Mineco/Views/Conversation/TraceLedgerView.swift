// SPDX-License-Identifier: MIT
//
// `.p-card` + `.p-trace` — the trace ledger (numbered agent execution steps).

import SwiftUI

/// Trace ledger card: header with "Working" + meta label, body of numbered
/// rows each showing kind icon, title, detail, optional result, duration.
/// Running steps get a subtle sheen sweep clipped to the row.
struct TraceLedgerView: View {
    let steps: [TraceStep]
    var meta: String = "finished"

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
            Image(systemName: "sparkles")
                .font(.system(size: 13))
                .foregroundColor(.mAccent)
            Text("Working")
                .minecoFont(12, weight: .semibold)
                .foregroundColor(.mInk)
            Spacer(minLength: 0)
            Text(meta)
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
            ForEach(Array(steps.enumerated()), id: \.element.id) { index, step in
                row(index: index, step: step)
            }
        }
    }

    private func row(index: Int, step: TraceStep) -> some View {
        HStack(alignment: .center, spacing: 11) {
            Text(String(format: "%02d", index + 1))
                .minecoFont(10.5, mono: true)
                .foregroundColor(.mInk3)
                .frame(width: 18, alignment: .leading)

            iconCircle(for: step)

            Text(step.title)
                .minecoFont(13, weight: .semibold)
                .foregroundColor(.mInk)
                .lineLimit(1)

            Text(step.detail)
                .minecoFont(11.5, mono: true)
                .foregroundColor(.mInk3)
                .lineLimit(1)
                .truncationMode(.tail)
                .frame(maxWidth: .infinity, alignment: .leading)

            if step.state == .done, let result = step.result {
                Text(result)
                    .minecoFont(11, mono: true)
                    .foregroundColor(step.ok ? .mOk : .mInk2)
            }

            Text(step.duration ?? "")
                .minecoFont(10.5, mono: true)
                .foregroundColor(.mInk3)
                .frame(width: 38, alignment: .trailing)
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 14)
        .overlay(alignment: .top) {
            if index > 0 {
                Rectangle()
                    .fill(Color.mLine)
                    .frame(height: 0.5)
            }
        }
        .overlay {
            if step.state == .run {
                SheenOverlay(radius: 0)
            }
        }
    }

    @ViewBuilder
    private func iconCircle(for step: TraceStep) -> some View {
        let size: CGFloat = 26
        switch step.state {
        case .run:
            ZStack {
                Circle().fill(Color.mAccent).frame(width: size, height: size)
                Circle().strokeBorder(Color.mAccent, lineWidth: 1)
                    .frame(width: size, height: size)
                Image(systemName: step.kind.symbol)
                    .font(.system(size: 13))
                    .foregroundColor(.white)
            }
            .frame(width: size, height: size)
        case .done:
            ZStack {
                Circle().fill(Color.mFieldBg).frame(width: size, height: size)
                Circle().strokeBorder(Color.mLine, lineWidth: 1)
                    .frame(width: size, height: size)
                Image(systemName: step.kind.symbol)
                    .font(.system(size: 13))
                    .foregroundColor(.mInk)
            }
            .frame(width: size, height: size)
        case .todo:
            ZStack {
                Circle().fill(Color.mFieldBg).frame(width: size, height: size)
                Circle().strokeBorder(Color.mLine, lineWidth: 1)
                    .frame(width: size, height: size)
                Image(systemName: step.kind.symbol)
                    .font(.system(size: 13))
                    .foregroundColor(.mInk2)
            }
            .frame(width: size, height: size)
        }
    }
}
