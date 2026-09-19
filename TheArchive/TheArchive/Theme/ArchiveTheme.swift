import SwiftUI

enum ArchiveTheme {
    // MARK: - Colors
    static let background    = Color(hex: "#0a0806")
    static let surface       = Color(hex: "#110e0b")
    static let accent        = Color(hex: "#c8973a") // gold
    static let accent2       = Color(hex: "#8b2635") // crimson
    static let textPrimary   = Color(hex: "#e8dcc8")
    static let textMuted     = Color(hex: "#6b5d4a")
    static let border        = Color(hex: "#2a2218")

    // MARK: - Typography
    // Uses available font variants: PlayfairDisplay-Regular, PlayfairDisplay-Italic
    // CourierPrime-Regular, CourierPrime-Bold, CourierPrime-Italic
    static func titleFont(size: CGFloat = 32) -> Font {
        .custom("PlayfairDisplay-Italic", size: size)
    }
    static func bodyFont(size: CGFloat = 18) -> Font {
        .custom("CourierPrime-Regular", size: size)
    }
    static func monoFont(size: CGFloat = 14) -> Font {
        .custom("CourierPrime-Regular", size: size)
    }

    // MARK: - Card background (from archive.html --card-bg)
    static let cardBg = Color(hex: "#1a1510")

    // MARK: - Poster gradient fallback
    // Deterministic gradient from title hash — matches archive.html system
    static func posterGradient(for title: String) -> LinearGradient {
        let gradients: [(Color, Color)] = [
            (Color(hex: "#1a2a3a"), Color(hex: "#0d1a2a")),
            (Color(hex: "#2a1a1a"), Color(hex: "#1a0d0d")),
            (Color(hex: "#1a2a1a"), Color(hex: "#0d1a0d")),
            (Color(hex: "#2a1a2a"), Color(hex: "#1a0d1a")),
            (Color(hex: "#2a2a1a"), Color(hex: "#1a1a0d")),
            (Color(hex: "#1a2a2a"), Color(hex: "#0d1a1a")),
            (Color(hex: "#231a2a"), Color(hex: "#130d1a")),
            (Color(hex: "#2a221a"), Color(hex: "#1a150d")),
        ]
        let index = abs(title.hashValue) % gradients.count
        return LinearGradient(
            colors: [gradients[index].0, gradients[index].1],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}

// MARK: - Color hex init
extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let r = Double((int >> 16) & 0xFF) / 255
        let g = Double((int >> 8) & 0xFF) / 255
        let b = Double(int & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
    }
}
