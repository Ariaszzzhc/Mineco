// SPDX-License-Identifier: MIT
//
// `.p-msg-user` — right-aligned user turn bubble (accent fill, asymmetric tail).

import SwiftUI

/// Right-aligned user message bubble. Accent fill, white text, bottom-trailing
/// corner pulled in to suggest a chat tail.
struct UserBubbleView: View {
    let text: String
    let time: String

    var body: some View {
        HStack(alignment: .bottom, spacing: 6) {
            Text(time)
                .minecoFont(10.5, mono: true)
                .foregroundColor(.mInk3)
            Text(text)
                .minecoFont(14, weight: .regular)
                .foregroundColor(.white)
                .textSelection(.enabled)
                .multilineTextAlignment(.leading)
                .padding(.vertical, 11)
                .padding(.horizontal, 15)
                .background(
                    UnevenRoundedRectangle(
                        cornerRadii: .init(
                            topLeading: 18,
                            bottomLeading: 18,
                            bottomTrailing: 5,
                            topTrailing: 18
                        ),
                        style: .continuous
                    )
                    .fill(Color.mAccent)
                )
                .shadow(color: .mAccent.opacity(0.45), radius: 7, x: 0, y: 4)
        }
        .frame(maxWidth: 320, alignment: .trailing)
    }
}
