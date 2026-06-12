// SPDX-License-Identifier: MIT
//
// `.p-byline` — agent attribution line (leaf mark + "mineco" + time).

import SwiftUI

/// Agent byline: a small accent-gradient leaf mark, the "mineco" wordmark in
/// accent-dark, and a mono timestamp.
struct AgentBylineView: View {
    let time: String

    var body: some View {
        HStack(spacing: 8) {
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [.mAccent, .mAccentDk],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 17, height: 17)
                Image(systemName: "leaf.fill")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundColor(.white)
            }
            Text("mineco")
                .minecoFont(12, weight: .bold)
                .foregroundColor(.mAccentDk)
            Text(time)
                .minecoFont(10.5, mono: true)
                .foregroundColor(.mInk3)
        }
    }
}
