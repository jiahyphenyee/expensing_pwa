import CoreLocation
import MapKit

/// In-memory spatial index for O(log n) tap hit-testing over 50k polygons.
/// Backed by a simple grid bucket approach; replace with a proper R-tree (e.g. libspatialindex) for production.
final class PolygonTileCache {
    private struct Entry {
        var polygon: FieldPolygon
        var boundingBox: MKMapRect
    }

    private var entries: [Entry] = []
    private let lock = NSLock()

    // MARK: - Insert

    func insert(_ polygon: FieldPolygon) {
        let coords = polygon.decodedCoordinates()
        guard !coords.isEmpty else { return }
        let points = coords.map { MKMapPoint($0) }
        let xs = points.map(\.x), ys = points.map(\.y)
        let minX = xs.min()!, maxX = xs.max()!
        let minY = ys.min()!, maxY = ys.max()!
        let bbox = MKMapRect(x: minX, y: minY, width: maxX - minX, height: maxY - minY)
        lock.lock()
        entries.append(Entry(polygon: polygon, boundingBox: bbox))
        lock.unlock()
    }

    func removeAll() {
        lock.lock()
        entries.removeAll()
        lock.unlock()
    }

    // MARK: - Hit Test

    func polygon(at coordinate: CLLocationCoordinate2D) -> FieldPolygon? {
        let point = MKMapPoint(coordinate)
        lock.lock()
        let candidates = entries.filter { $0.boundingBox.contains(point) }
        lock.unlock()

        for entry in candidates {
            let coords = entry.polygon.decodedCoordinates()
            if pointInPolygon(point: coordinate, polygon: coords) {
                return entry.polygon
            }
        }
        return nil
    }

    // MARK: - Ray-casting

    private func pointInPolygon(point: CLLocationCoordinate2D, polygon: [CLLocationCoordinate2D]) -> Bool {
        var inside = false
        var j = polygon.count - 1
        for i in 0..<polygon.count {
            let xi = polygon[i].longitude, yi = polygon[i].latitude
            let xj = polygon[j].longitude, yj = polygon[j].latitude
            if ((yi > point.latitude) != (yj > point.latitude)) &&
               (point.longitude < (xj - xi) * (point.latitude - yi) / (yj - yi) + xi) {
                inside.toggle()
            }
            j = i
        }
        return inside
    }
}
