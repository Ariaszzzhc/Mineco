// SPDX-License-Identifier: MIT
//
// `.p-queued` — small mono "queued" notice line.

import SwiftUI

/// A compact mono notice with a list glyph, used to flag queued work.
struct QueuedNoticeView: View {
    let text: String

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "list.bullet")
            Text(text)
        }
        .minecoFont(10.5, mono: true)
        .foregroundColor(.mInk3)
    }
}
