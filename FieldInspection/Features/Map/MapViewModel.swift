import MapKit
import Combine
import GRDB

@MainActor
final class MapViewModel: ObservableObject {
    @Published private(set) var polygons: [FieldPolygon] = []
    @Published private(set) var severityMap: [String: IssueSeverity] = [:]   // fieldId -> severity
    @Published private(set) var selectedPolygon: FieldPolygon?
    @Published var isDownloadRequired: Bool = false
    @Published var downloadProgress: Double = 0
    @Published var isDownloading: Bool = false

    private var observationTask: Task<Void, Never>?

    func onAppear() {
        checkPolygonsAvailable()
        startObserving()
    }

    func onDisappear() {
        observationTask?.cancel()
    }

    func select(_ polygon: FieldPolygon) {
        selectedPolygon = polygon
    }

    func clearSelection() {
        selectedPolygon = nil
    }

    // MARK: - Download

    func downloadPolygons() async {
        isDownloading = true
        defer { isDownloading = false }
        do {
            let pull = PullEngine()
            try await pull.downloadPolygons()
            isDownloadRequired = false
        } catch {
            // Propagate to UI via state
        }
    }

    // MARK: - Private

    private func checkPolygonsAvailable() {
        Task {
            let count = (try? await AppDatabase.shared.read { db in
                try FieldPolygon.fetchCount(db)
            }) ?? 0
            isDownloadRequired = count == 0
        }
    }

    private func startObserving() {
        observationTask = Task {
            do {
                let observation = ValueObservation.tracking { db -> [FieldPolygon] in
                    try FieldPolygon.all().fetchAll(db)
                }
                let stream = try AppDatabase.shared.pool!.values(observation)
                for try await rows in stream {
                    polygons = rows
                    await loadSeverities(for: rows)
                }
            } catch {}
        }
    }

    private func loadSeverities(for polygons: [FieldPolygon]) async {
        guard let pool = try? AppDatabase.shared.pool else { return }
        let ids = polygons.map(\.id)
        let map = try? await pool.read { db -> [String: IssueSeverity] in
            var result = [String: IssueSeverity]()
            for fieldId in ids {
                if let inspection = try Inspection.active(for: fieldId).fetchOne(db) {
                    result[fieldId] = inspection.severity
                }
            }
            return result
        }
        severityMap = map ?? [:]
    }
}
