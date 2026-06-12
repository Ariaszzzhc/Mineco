// SPDX-License-Identifier: MIT
//
// `.p-prose` — streamed agent prose paragraph.

import SwiftUI

/// Renders agent prose text. Generous line spacing, selectable, full width.
struct ProseView: View {
    let text: String

    var body: some View {
        Text(text)
            .minecoFont(14.5)
            .foregroundColor(.mInk)
            .lineSpacing(1.6 * 14.5 - 14.5)
            .multilineTextAlignment(.leading)
            .textSelection(.enabled)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}
