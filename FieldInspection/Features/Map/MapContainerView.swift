import SwiftUI
import MapKit

struct MapContainerView: View {
    @StateObject private var vm = MapViewModel()
    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var syncEngine: SyncEngine

    var body: some View {
        ZStack {
            MKMapRepresentable(
                polygons: vm.polygons,
                severityMap: vm.severityMap,
                onTap: { polygon in
                    vm.select(polygon)
                    router.showSheet(.fieldDetail(polygon))
                }
            )
            .ignoresSafeArea()

            VStack {
                Spacer()
                HStack {
                    Spacer()
                    syncStatusButton
                        .padding()
                }
            }
        }
        .navigationTitle("Fields")
        .navigationBarTitleDisplayMode(.inline)
        .fullScreenCover(isPresented: $vm.isDownloadRequired) {
            PolygonDownloadView(viewModel: vm)
        }
        .onAppear { vm.onAppear() }
        .onDisappear { vm.onDisappear() }
    }

    private var syncStatusButton: some View {
        Button {
            Task { await syncEngine.syncNow() }
        } label: {
            SyncStatusBadge(state: syncEngine.state, pendingCount: syncEngine.pendingCount)
        }
        .buttonStyle(.bordered)
        .background(.ultraThinMaterial, in: Capsule())
    }
}

// MARK: - UIViewRepresentable

struct MKMapRepresentable: UIViewRepresentable {
    var polygons: [FieldPolygon]
    var severityMap: [String: IssueSeverity]
    var onTap: (FieldPolygon) -> Void

    func makeUIView(context: Context) -> MKMapView {
        let map = MKMapView()
        map.delegate = context.coordinator
        map.showsUserLocation = true
        let tap = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.handleTap(_:)))
        map.addGestureRecognizer(tap)
        return map
    }

    func updateUIView(_ map: MKMapView, context: Context) {
        context.coordinator.update(map: map, polygons: polygons, severityMap: severityMap)
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(onTap: onTap)
    }

    final class Coordinator: NSObject, MKMapViewDelegate {
        let tileCache = PolygonTileCache()
        var onTap: (FieldPolygon) -> Void
        private var renderedIds: Set<String> = []

        init(onTap: @escaping (FieldPolygon) -> Void) { self.onTap = onTap }

        func update(map: MKMapView, polygons: [FieldPolygon], severityMap: [String: IssueSeverity]) {
            let incoming = Set(polygons.map(\.id))
            let toRemove = renderedIds.subtracting(incoming)
            if !toRemove.isEmpty {
                let overlaysToRemove = map.overlays.filter { ($0 as? PolygonOverlay)?.fieldId != nil
                    && toRemove.contains(($0 as! PolygonOverlay).fieldId) }
                map.removeOverlays(overlaysToRemove)
            }
            let toAdd = polygons.filter { !renderedIds.contains($0.id) }
            let overlays = toAdd.map { polygon -> PolygonOverlay in
                let coords = polygon.decodedCoordinates()
                let overlay = PolygonOverlay(coordinates: coords, count: coords.count)
                overlay.fieldId = polygon.id
                overlay.severity = severityMap[polygon.id] ?? .none
                tileCache.insert(polygon)
                return overlay
            }
            map.addOverlays(overlays, level: .aboveRoads)
            renderedIds = incoming
        }

        func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
            guard let poly = overlay as? PolygonOverlay else {
                return MKOverlayRenderer(overlay: overlay)
            }
            return PolygonOverlayRenderer(overlay: poly, severity: poly.severity)
        }

        @objc func handleTap(_ gesture: UITapGestureRecognizer) {
            guard let map = gesture.view as? MKMapView else { return }
            let point = gesture.location(in: map)
            let coord = map.convert(point, toCoordinateFrom: map)
            if let polygon = tileCache.polygon(at: coord) {
                onTap(polygon)
            }
        }
    }
}

// MARK: - Supporting Types

final class PolygonOverlay: MKPolygon {
    var fieldId: String = ""
    var severity: IssueSeverity = .none
}

struct PolygonDownloadView: View {
    @ObservedObject var viewModel: MapViewModel

    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: "arrow.down.circle")
                .font(.system(size: 64))
            Text("Download Required")
                .font(.title2.bold())
            Text("Field polygons must be downloaded before you can use the map.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
            if viewModel.isDownloading {
                ProgressView(value: viewModel.downloadProgress)
                    .padding(.horizontal)
                Text("Downloading…")
                    .foregroundStyle(.secondary)
            } else {
                Button("Download Fields") {
                    Task { await viewModel.downloadPolygons() }
                }
                .buttonStyle(.borderedProminent)
            }
        }
        .padding()
    }
}
