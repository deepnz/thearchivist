import SwiftUI

// Film-strip divider: ◆ ◆ ◆ between muted dashes.
// Ports .film-strip-divider from archive.html (lines 112-128).
struct FilmStripDivider: View {
    var body: some View {
        HStack(spacing: 8) {
            Text("◆ ◆ ◆")
                .font(ArchiveTheme.monoFont(size: 10))
                .foregroundColor(ArchiveTheme.border)
                .kerning(3)
                .frame(maxWidth: .infinity)
            Text("◆ ◆ ◆")
                .font(ArchiveTheme.monoFont(size: 10))
                .foregroundColor(ArchiveTheme.border)
                .kerning(3)
                .frame(maxWidth: .infinity)
        }
        .padding(.vertical, 6)
    }
}

// Barbershop-stripe bar used atop the modal slate header.
// Ports .modal-slate::before from archive.html (lines 1103-1117).
struct BarbershopStripe: View {
    var body: some View {
        GeometryReader { geo in
            let stripe: CGFloat = 20
            let gap: CGFloat = 10
            let period = stripe + gap
            let count = Int(geo.size.width / period) + 2
            HStack(spacing: 0) {
                ForEach(0..<count, id: \.self) { _ in
                    Rectangle().fill(ArchiveTheme.accent2).frame(width: stripe)
                    Rectangle().fill(Color.clear).frame(width: gap)
                }
            }
        }
        .frame(height: 4)
    }
}

// Film-perforation strip for divider bars.
// Ports .modal-poster-strip from archive.html (lines 1236-1246).
struct PerforationStrip: View {
    var body: some View {
        GeometryReader { geo in
            let stripe: CGFloat = 14
            let gap: CGFloat = 4
            let period = stripe + gap
            let count = Int(geo.size.width / period) + 2
            HStack(spacing: 0) {
                ForEach(0..<count, id: \.self) { _ in
                    Rectangle().fill(ArchiveTheme.border).frame(width: stripe)
                    Rectangle().fill(Color.clear).frame(width: gap)
                }
            }
        }
        .frame(height: 6)
    }
}

// Section title with gold underline accent, like archive.html .topbar-view-title + .topbar-underline.
struct SectionTitle: View {
    let title: String
    let meta: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(ArchiveTheme.titleFont(size: 44))
                .foregroundColor(ArchiveTheme.textPrimary)
            Rectangle()
                .fill(ArchiveTheme.accent)
                .frame(width: 64, height: 2)
            if let meta {
                Text(meta)
                    .font(ArchiveTheme.monoFont(size: 12))
                    .foregroundColor(ArchiveTheme.textMuted)
                    .kerning(2)
                    .padding(.top, 2)
            }
        }
    }
}

// Full-screen grain overlay (ports body::after from archive.html, lines 42-54).
// Uses a deterministic CG noise image so we avoid bundling an asset.
struct GrainOverlay: View {
    var body: some View {
        Canvas { ctx, size in
            let step: CGFloat = 2
            var rng = SplitMix64(seed: 0xA1C9E2)
            var y: CGFloat = 0
            while y < size.height {
                var x: CGFloat = 0
                while x < size.width {
                    let v = Double(rng.nextUnitFloat())
                    if v > 0.55 {
                        let opacity = 0.10 + (v - 0.55) * 0.6
                        ctx.fill(
                            Path(CGRect(x: x, y: y, width: step, height: step)),
                            with: .color(Color.white.opacity(opacity))
                        )
                    }
                    x += step
                }
                y += step
            }
        }
        .opacity(0.04)
        .blendMode(.overlay)
        .allowsHitTesting(false)
    }
}

// Small deterministic RNG so grain pattern is stable per launch without bundling.
private struct SplitMix64 {
    var state: UInt64
    init(seed: UInt64) { self.state = seed }
    mutating func next() -> UInt64 {
        state &+= 0x9E3779B97F4A7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58476D1CE4E5B9
        z = (z ^ (z >> 27)) &* 0x94D049BB133111EB
        return z ^ (z >> 31)
    }
    mutating func nextUnitFloat() -> Float {
        Float(next() >> 40) / Float(1 << 24)
    }
}

// Focus treatment for tvOS buttons in the archival palette.
//
// The default tvOS focus effect paints a bright system-yellow rounded box over
// the control, which reads as a rendering error against the sepia and gold
// theme. This replaces it with a gold border and a subtle lift, so focus is
// still obvious from across a room without breaking the palette.
struct ArchiveFocusButtonStyle: ButtonStyle {
    @Environment(\.isFocused) private var isFocused

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .overlay(
                RoundedRectangle(cornerRadius: 4)
                    .stroke(ArchiveTheme.accent, lineWidth: isFocused ? 3 : 0)
            )
            .scaleEffect(isFocused ? 1.06 : 1.0)
            .animation(.easeOut(duration: 0.15), value: isFocused)
    }
}

// Focus treatment for full-width rows, such as the watchlist sidebar.
//
// Unlike ArchiveFocusButtonStyle this does not scale the row: a full-width row
// that grows on focus pushes against its container and makes the selection
// fill and the focus ring drift apart. The ring is drawn on the same rounded
// shape and inset as the row's own fill, so the two sit exactly together.
struct ArchiveRowFocusStyle: ButtonStyle {
    @Environment(\.isFocused) private var isFocused

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .overlay(
                RoundedRectangle(cornerRadius: 6)
                    .strokeBorder(ArchiveTheme.accent, lineWidth: isFocused ? 3 : 0)
            )
            .animation(.easeOut(duration: 0.12), value: isFocused)
    }
}

// App wordmark: "The Archivist" in Playfair italic gold over a letterspaced
// Courier tagline. Recovered from the sign-in screen, which was removed along
// with Sign in with Apple, taking the app's only branding with it.
struct ArchiveWordmark: View {
    var titleSize: CGFloat = 48
    var taglineSize: CGFloat = 16
    var alignment: HorizontalAlignment = .trailing

    var body: some View {
        VStack(alignment: alignment, spacing: 4) {
            Text("The Archivist")
                .font(ArchiveTheme.titleFont(size: titleSize))
                .foregroundColor(ArchiveTheme.accent)
            Text("YOUR PERSONAL COLLECTION")
                .font(ArchiveTheme.monoFont(size: taglineSize))
                .foregroundColor(ArchiveTheme.textMuted)
                .kerning(3)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("The Archivist, your personal collection")
    }
}
