import SwiftUI

struct SeverityChip: View {
    let severity: IssueSeverity

    var body: some View {
        Text(severity.displayName)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(chipColor.opacity(0.15))
            .foregroundStyle(chipColor)
            .clipShape(Capsule())
    }

    private var chipColor: Color {
        switch severity {
        case .none:     return .gray
        case .low:      return .green
        case .medium:   return .yellow
        case .high:     return .orange
        case .critical: return .red
        }
    }
}
