import SwiftUI

struct SyncStatusBadge: View {
    let state: SyncEngine.SyncState
    let pendingCount: Int

    var body: some View {
        HStack(spacing: 4) {
            icon
            if pendingCount > 0 {
                Text("\(pendingCount)")
                    .font(.caption2.monospacedDigit())
            }
        }
        .foregroundStyle(foregroundColor)
        .font(.caption.weight(.medium))
    }

    @ViewBuilder private var icon: some View {
        switch state {
        case .idle where pendingCount == 0:
            Image(systemName: "checkmark.icloud")
        case .idle:
            Image(systemName: "clock.arrow.2.circlepath")
        case .syncing:
            ProgressView().controlSize(.mini)
        case .error:
            Image(systemName: "exclamationmark.icloud")
        }
    }

    private var foregroundColor: Color {
        switch state {
        case .idle where pendingCount == 0: return .green
        case .idle: return .orange
        case .syncing: return .blue
        case .error: return .red
        }
    }
}
