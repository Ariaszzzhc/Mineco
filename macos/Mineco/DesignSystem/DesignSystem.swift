// SPDX-License-Identifier: MIT
//
// Liquid Glass design system — SwiftUI port of the v4 `glass.css` spec.
// All chrome (toolbar clusters, sidebar, composer) is glass; all conversation
// content (messages, plan, diff, terminal) stays opaque. Concentric radii,
// one locked light direction (top). Colors are literal mirrors of the CSS vars.
//
// Change here = change everywhere. Views must use these tokens, never inline
// magic colors/sizes, so the design stays tunable (and matches the prototype).

import SwiftUI

// MARK: - ShapeStyle projections (so `.foregroundStyle(.mInk)` resolves)

extension ShapeStyle where Self == Color {
    static var mInk: Color { .mInk }
    static var mInk2: Color { .mInk2 }
    static var mInk3: Color { .mInk3 }
    static var mLine: Color { .mLine }
    static var mAccent: Color { .mAccent }
    static var mAccentDk: Color { .mAccentDk }
    static var mAccentBg: Color { .mAccentBg }
    static var mAccentLn: Color { .mAccentLn }
    static var mOk: Color { .mOk }
    static var mOkBg: Color { .mOkBg }
    static var mDel: Color { .mDel }
    static var mDelBg: Color { .mDelBg }
    static var mDiffAddText: Color { .mDiffAddText }
    static var mDiffDelText: Color { .mDiffDelText }
    static var mTerm: Color { .mTerm }
    static var mTerm2: Color { .mTerm2 }
    static var mTermTx: Color { .mTermTx }
    static var mTermOk: Color { .mTermOk }
    static var mTermDim: Color { .mTermDim }
    static var mCardBg: Color { .mCardBg }
    static var mFieldBg: Color { .mFieldBg }
    static var mContentBg: Color { .mContentBg }
}

// MARK: - Color palette (mirror glass.css :root)

extension Color {
    // Ink scale
    static let mInk = Color(red: 0x1d/255, green: 0x1c/255, blue: 0x1a/255)          // #1d1c1a
    static let mInk2 = Color(red: 0x5f/255, green: 0x5c/255, blue: 0x55/255)         // #5f5c55
    static let mInk3 = Color(red: 0x91/255, green: 0x8d/255, blue: 0x83/255)         // #918d83

    /// Hairline rule: rgba(60,52,36,.10).
    static let mLine = Color(red: 0x3C/255, green: 0x34/255, blue: 0x24/255, opacity: 0.10)

    // Accent (default #3E9B4F — a fresh green; user-tunable later).
    static let mAccent = Color(red: 0x3E/255, green: 0x9B/255, blue: 0x4F/255)
    static var mAccentDk: Color { mix(mAccent, .black, 0.20) }      // accent 80% + black
    static var mAccentBg: Color { mix(mAccent, .white, 0.88) }      // accent 12% + white
    static var mAccentLn: Color { mix(mAccent, .white, 0.65) }      // accent 35% + white

    // Status / diff
    static let mOk = Color(red: 0x24/255, green: 0x8A/255, blue: 0x3D/255)            // #248A3D
    static let mOkBg = Color(red: 0xE8/255, green: 0xF3/255, blue: 0xE9/255)         // #E8F3E9
    static let mDel = Color(red: 0xC0/255, green: 0x39/255, blue: 0x2B/255)          // #C0392B
    static let mDelBg = Color(red: 0xFA/255, green: 0xEB/255, blue: 0xE7/255)        // #FAEBE7
    static let mDiffAddText = Color(red: 0x1d/255, green: 0x5e/255, blue: 0x2c/255)  // #1d5e2c
    static let mDiffDelText = Color(red: 0x8e/255, green: 0x2f/255, blue: 0x22/255)  // #8e2f22

    // Terminal card
    static let mTerm = Color(red: 0x1A/255, green: 0x1A/255, blue: 0x1C/255)         // #1A1A1C
    static let mTerm2 = Color(red: 0x25/255, green: 0x25/255, blue: 0x28/255)        // #252528
    static let mTermTx = Color(red: 0xD9/255, green: 0xD8/255, blue: 0xD4/255)       // #D9D8D4
    static let mTermOk = Color(red: 0x30/255, green: 0xD1/255, blue: 0x58/255)       // #30D158
    static let mTermDim = Color(red: 0x8B/255, green: 0x8A/255, blue: 0x85/255)      // #8B8A85

    // Card surfaces
    static let mCardBg = Color.white
    static let mFieldBg = Color(red: 0xF6/255, green: 0xF4/255, blue: 0xEF/255)      // #F6F4EF (step/diff head)
    static let mContentBg = Color(red: 0xF4/255, green: 0xF2/255, blue: 0xEC/255)    // #F4F2EC

    // Traffic lights
    static let mLightR = Color(red: 0xFF/255, green: 0x5F/255, blue: 0x57/255)
    static let mLightY = Color(red: 0xFE/255, green: 0xBC/255, blue: 0x2E/255)
    static let mLightG = Color(red: 0x28/255, green: 0xC8/255, blue: 0x40/255)

    /// OKLAB-ish mix fallback: linear sRGB interpolation in normalized space.
    /// Close enough to CSS `color-mix(in oklab, a P%, b)` for our tints.
    private static func mix(_ a: Color, _ b: Color, _ bWeight: Double) -> Color {
        let (ar, ag, ab) = components(a)
        let (br, bg, bb) = components(b)
        let w = bWeight
        return Color(
            red: ar * (1 - w) + br * w,
            green: ag * (1 - w) + bg * w,
            blue: ab * (1 - w) + bb * w
        )
    }

    private static func components(_ c: Color) -> (Double, Double, Double) {
        let ns = NSColor(c).usingColorSpace(.sRGB) ?? NSColor.black
        return (ns.redComponent, ns.greenComponent, ns.blueComponent)
    }
}

// MARK: - Radii (concentric: window 26 → panel 18 → card 14 → field 12)

enum MRadius {
    static let win: CGFloat = 26
    static let panel: CGFloat = 18
    static let card: CGFloat = 14
    static let field: CGFloat = 12
}

// MARK: - Font scale (--fs) via environment

private struct FontScaleKey: EnvironmentKey {
    static let defaultValue: CGFloat = 1
}

extension EnvironmentValues {
    /// Mirrors the prototype's `--fs`. 1 = default; accessibility can bump it.
    var fontScale: CGFloat {
        get { self[FontScaleKey.self] }
        set { self[FontScaleKey.self] = newValue }
    }
}

extension View {
    /// Apply a system font whose point size scales with `fontScale`.
    /// `mono = true` selects SF Mono (`.monospaced` design).
    func minecoFont(_ base: CGFloat, weight: Font.Weight = .regular, mono: Bool = false) -> some View {
        modifier(MinecoFontModifier(base: base, weight: weight, mono: mono))
    }
}

private struct MinecoFontModifier: ViewModifier {
    @Environment(\.fontScale) private var scale
    let base: CGFloat
    let weight: Font.Weight
    let mono: Bool
    func body(content: Content) -> some View {
        content
            .font(.system(size: base * scale, weight: weight,
                          design: mono ? .monospaced : .default))
            .environment(\.layoutDirection, .leftToRight)
    }
}

// MARK: - Glass material (.glass / .plate)

/// The floating functional layer: blur + saturation over the colorful stage,
/// a top-down white gradient (locked light from top), a 0.5px white hairline,
/// and a soft outer shadow with a faint inset highlight.
///
/// macOS 14 has no `.glass` material (that lands in Tahoe); `.ultraThinMaterial`
/// over the warm stage wash is the faithful stand-in.
struct GlassSurface: ViewModifier {
    var radius: CGFloat = MRadius.panel
    /// `.plate` = a denser stabilized patch (used inside the composer field).
    var plate: Bool = false

    func body(content: Content) -> some View {
        content
            .background {
                ZStack {
                    RoundedRectangle(cornerRadius: radius, style: .continuous)
                        .fill(.ultraThinMaterial)
                    RoundedRectangle(cornerRadius: radius, style: .continuous)
                        .fill(
                            LinearGradient(
                                stops: [
                                    .init(color: .white.opacity(plate ? 0.50 : 0.30), location: 0),
                                    .init(color: .white.opacity(plate ? 0.38 : 0.14), location: 1),
                                ],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                        )
                }
            }
            .overlay {
                // 0.5px white hairline (border). Kept faint so it reads as edge light.
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .strokeBorder(.white.opacity(0.45), lineWidth: 0.5)
            }
            .overlay(alignment: .top) {
                // inset top highlight (box-shadow inset 0 1px 1px white .85)
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .strokeBorder(
                        LinearGradient(
                            colors: [.white.opacity(0.55), .clear],
                            startPoint: .top, endPoint: .center
                        ),
                        lineWidth: 0.5
                    )
            }
            .shadow(color: Color(white: 0.10, opacity: 0.18), radius: 22, x: 0, y: 14)
            .shadow(color: Color(white: 0.10, opacity: 0.07), radius: 3, x: 0, y: 1)
    }
}

extension View {
    /// Apply the glass material with the given corner radius.
    func glass(radius: CGFloat = MRadius.panel) -> some View {
        modifier(GlassSurface(radius: radius, plate: false))
    }

    /// Apply the denser "plate" material (stabilized patch, e.g. composer field).
    func glassPlate(radius: CGFloat = MRadius.field) -> some View {
        modifier(GlassSurface(radius: radius, plate: true))
    }
}

// MARK: - Stage wash (lqg-win content background)

/// The window's content background: warm #F4F2EC with low-opacity radial color
/// washes (green top-left, yellow top-right, amber bottom-right). Content
/// scrolls beneath the floating glass; the glass blurs this wash.
struct StageWashBackground: View {
    var body: some View {
        ZStack {
            Color.mContentBg
            // top-left green wash
            RadialGradient(
                colors: [Color(red: 0.55, green: 0.78, blue: 0.43, opacity: 0.13), .clear],
                center: UnitPoint(x: 0.08, y: 0.04),
                startRadius: 0,
                endRadius: 360
            )
            // top-right yellow wash
            RadialGradient(
                colors: [Color(red: 1.0, green: 0.86, blue: 0.35, opacity: 0.15), .clear],
                center: UnitPoint(x: 0.96, y: 0.02),
                startRadius: 0,
                endRadius: 320
            )
            // bottom-right amber wash
            RadialGradient(
                colors: [Color(red: 1.0, green: 0.71, blue: 0.47, opacity: 0.11), .clear],
                center: UnitPoint(x: 0.88, y: 1.0),
                startRadius: 0,
                endRadius: 340
            )
        }
        .ignoresSafeArea()
    }
}

// MARK: - Motion primitives

/// Entrance: translate-up + slight fade (the prototype's `.p-rise` / `.lqg-mat`).
/// Use on freshly inserted content so it "rises" in. Honors reduce-motion.
struct RiseIn: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    func body(content: Content) -> some View {
        if reduceMotion {
            content
        } else {
            content
                .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }
}

extension View {
    /// Mark a view as a "rising" element (used inside animated containers).
    func riseIn() -> some View { modifier(RiseIn()) }
}

/// Indeterminate accent spinner (the `.p-spin`).
struct Spinner: View {
    var size: CGFloat = 12
    var color: Color = .mAccent
    @State private var rotation: Double = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Circle()
            .strokeBorder(
                AngularGradient(
                    colors: [color.opacity(0.22), color],
                    center: .center,
                    startAngle: .degrees(0),
                    endAngle: .degrees(330)
                ),
                lineWidth: max(2, size * 0.18)
            )
            .frame(width: size, height: size)
            .rotationEffect(.degrees(reduceMotion ? 0 : rotation))
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.linear(duration: 0.7).repeatForever(autoreverses: false)) {
                    rotation = 360
                }
            }
    }
}

/// Blinking caret (typed-text cursor + terminal caret). Honors reduce-motion.
struct BlinkingCaret: View {
    var color: Color = .mAccent
    var width: CGFloat = 7
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        RoundedRectangle(cornerRadius: 1)
            .fill(color)
            .frame(width: width, height: 12)
            .opacity(reduceMotion ? 1 : 1)
            .modifier(Blinking())
    }
}

private struct Blinking: ViewModifier {
    @State private var on = true
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    func body(content: Content) -> some View {
        content
            .opacity(reduceMotion ? 1 : (on ? 1 : 0))
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.easeInOut(duration: 0.5).repeatForever(autoreverses: true)) {
                    on = false
                }
            }
    }
}

/// A traveling sheen overlay used on "running" surfaces (trace step, work pill
/// label). Subtle diagonal highlight sweep.
struct SheenOverlay: View {
    var radius: CGFloat = 0
    @State private var x: CGFloat = -1
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            Rectangle()
                .fill(
                    LinearGradient(
                        stops: [
                            .init(color: .white.opacity(0.0), location: 0.30),
                            .init(color: .white.opacity(0.10), location: 0.50),
                            .init(color: .white.opacity(0.0), location: 0.70),
                        ],
                        startPoint: .leading, endPoint: .trailing
                    )
                )
                .offset(x: x * w)
                .onAppear {
                    guard !reduceMotion else { return }
                    withAnimation(.linear(duration: 1.8).repeatForever(autoreverses: false)) {
                        x = 1
                    }
                }
        }
        .allowsHitTesting(false)
        .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
    }
}

// MARK: - Traffic lights

struct TrafficLights: View {
    var body: some View {
        HStack(spacing: 8) {
            ForEach([Color.mLightR, .mLightY, .mLightG], id: \.self) { c in
                Circle()
                    .fill(c)
                    .frame(width: 12, height: 12)
                    .overlay(Circle().strokeBorder(.black.opacity(0.12), lineWidth: 0.5))
                    .overlay(
                        Circle().strokeBorder(.white.opacity(0.4), lineWidth: 0.5)
                            .blur(radius: 0.5)
                    )
            }
        }
    }
}

// MARK: - Git branch glyph (matches the prototype's custom SVG)

struct GitBranchShape: Shape {
    func path(in r: CGRect) -> Path {
        var p = Path()
        let top = CGPoint(x: r.minX + r.width * 0.25, y: r.minY + r.height * 0.25)
        let bot = CGPoint(x: r.minX + r.width * 0.25, y: r.minY + r.height * 0.75)
        let right = CGPoint(x: r.minX + r.width * 0.75, y: r.minY + r.height * 0.375)
        let n: CGFloat = max(r.width, r.height) * 0.10   // node radius
        // verticals
        p.move(to: CGPoint(x: top.x, y: top.y + n))
        p.addLine(to: CGPoint(x: bot.x, y: bot.y - n))
        // curve from top to right
        p.move(to: CGPoint(x: top.x, y: top.y + n))
        p.addQuadCurve(to: CGPoint(x: right.x - n, y: right.y),
                       control: CGPoint(x: top.x, y: right.y))
        // nodes
        for c in [top, bot, right] { p.addEllipse(in: CGRect(x: c.x - n, y: c.y - n, width: n*2, height: n*2)) }
        return p
    }
}

struct GitBranchIcon: View {
    var size: CGFloat = 13
    var color: Color = .mInk2
    var body: some View {
        GitBranchShape()
            .stroke(color, style: .init(lineWidth: max(1.4, size * 0.11), lineCap: .round, lineJoin: .round))
            .frame(width: size, height: size)
    }
}
