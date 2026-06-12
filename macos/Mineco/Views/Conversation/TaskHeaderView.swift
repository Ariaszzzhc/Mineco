// SPDX-License-Identifier: MIT
//
// `.lqg-task` — task header (eyebrow + title) at the top of a turn.

import SwiftUI

/// Renders the task eyebrow ("Task · <branch>") with the leading word in accent
/// and the remainder in ink3, followed by a bold title.
struct TaskHeaderView: View {
    let eyebrow: String
    let title: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            eyebrowBase
                .minecoFont(10.5, weight: .heavy)
                .textCase(.uppercase)
                .tracking(1.2)
                .lineLimit(1)
            Text(title)
                .minecoFont(26, weight: .bold)
                .foregroundColor(.mInk)
                .lineSpacing(0)
                .lineLimit(3)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Builds the eyebrow as a concatenated `Text`, splitting on the first "·"
    /// so the leading word renders in accent and the rest in ink3.
    private var eyebrowBase: Text {
        let parts = eyebrow.split(separator: "·", maxSplits: 1, omittingEmptySubsequences: false)
        if parts.count >= 2 {
            let lead = parts[0].trimmingCharacters(in: .whitespaces)
            let rest = parts[1].trimmingCharacters(in: .whitespaces)
            return Text(lead).foregroundColor(.mAccent)
                + Text(" · ").foregroundColor(.mInk3)
                + Text(rest).foregroundColor(.mInk3)
        } else {
            return Text(eyebrow.trimmingCharacters(in: .whitespaces))
                .foregroundColor(.mInk3)
        }
    }
}
