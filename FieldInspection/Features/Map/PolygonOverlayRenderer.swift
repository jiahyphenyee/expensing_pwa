import MapKit
import UIKit

final class PolygonOverlayRenderer: MKPolygonRenderer {
    private let severity: IssueSeverity

    init(overlay: MKPolygon, severity: IssueSeverity) {
        self.severity = severity
        super.init(overlay: overlay)
        applyStyle()
    }

    private func applyStyle() {
        strokeColor = strokeUIColor.withAlphaComponent(0.8)
        fillColor = fillUIColor.withAlphaComponent(0.25)
        lineWidth = 1.5
    }

    private var fillUIColor: UIColor {
        switch severity {
        case .none:     return .systemGray
        case .low:      return .systemGreen
        case .medium:   return .systemYellow
        case .high:     return .systemOrange
        case .critical: return .systemRed
        }
    }

    private var strokeUIColor: UIColor {
        switch severity {
        case .none:     return .systemGray2
        case .low:      return .systemGreen
        case .medium:   return .systemYellow
        case .high:     return .systemOrange
        case .critical: return .systemRed
        }
    }
}
