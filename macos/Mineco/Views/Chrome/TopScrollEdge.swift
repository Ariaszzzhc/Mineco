// SPDX-License-Identifier: MIT
//
// TopScrollEdge — the `.lqg-edge.top` blur fade drawn under the toolbar.
// A ~78pt region that blurs and fades content scrolling beneath the toolbar.
// Purely decorative: ignores hit testing and extends under the safe area.

import SwiftUI

/// The top scroll edge fade: ultra-thin material + a top-down content-bg tint,
/// masked to fade from opaque (top) to transparent (bottom).
struct TopScrollEdge: View {
    var body: some View {
        Rectangle()
            .fill(.ultraThinMaterial)
            .overlay {
                Rectangle()
                    .fill(
                        LinearGradient(
                            colors: [.mContentBg.opacity(0.55), .clear],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
            }
            // Fade the whole region out toward the bottom so only the top
            // ~third reads as a hard blur, dissolving to nothing.
            .mask(
                LinearGradient(
                    colors: [
                        Color(white: 1, opacity: 1),
                        Color(white: 1, opacity: 1),
                        Color(white: 1, opacity: 0),
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
            .frame(height: 78)
            .allowsHitTesting(false)
            .ignoresSafeArea(edges: .top)
    }
}
