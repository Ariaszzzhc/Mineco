// SPDX-License-Identifier: MIT
//
// `.p-turnrule` — full-width divider with a centered mono timestamp.

import SwiftUI

/// Full-width turn divider: two hairlines with a centered mono time label.
struct TurnRuleView: View {
    let time: String

    var body: some View {
        HStack(spacing: 12) {
            Rectangle()
                .fill(Color.mLine)
                .frame(height: 0.5)
            Text(time)
                .minecoFont(10, mono: true)
                .foregroundColor(.mInk3)
                .tracking(0.8)
            Rectangle()
                .fill(Color.mLine)
                .frame(height: 0.5)
        }
        .frame(maxWidth: .infinity)
    }
}
