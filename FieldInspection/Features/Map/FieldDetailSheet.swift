import SwiftUI

struct FieldDetailSheet: View {
    let polygon: FieldPolygon
    @EnvironmentObject private var router: AppRouter
    @State private var lastInspection: Inspection?
    @State private var isLoading = true

    var body: some View {
        NavigationStack {
            List {
                Section("Field Info") {
                    LabeledContent("Label", value: polygon.label ?? "—")
                    LabeledContent("Crop", value: polygon.cropType ?? "—")
                    if let area = polygon.areaHectares {
                        LabeledContent("Area", value: String(format: "%.2f ha", area))
                    }
                }

                Section("Last Inspection") {
                    if isLoading {
                        ProgressView()
                    } else if let insp = lastInspection {
                        LabeledContent("Date", value: insp.updatedAt.formatted(date: .abbreviated, time: .omitted))
                        HStack {
                            Text("Severity")
                            Spacer()
                            SeverityChip(severity: insp.severity)
                        }
                        if insp.syncStatus == .pending {
                            Label("Pending sync", systemImage: "clock")
                                .foregroundStyle(.orange)
                                .font(.caption)
                        }
                    } else {
                        Text("No inspections yet")
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle(polygon.label ?? "Field")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { router.dismiss() }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button(lastInspection == nil ? "New Inspection" : "Edit Inspection") {
                        router.dismiss()
                        router.navigate(to: .inspection(fieldId: polygon.id, inspectionId: lastInspection?.id))
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
            .task { await loadInspection() }
        }
        .presentationDetents([.medium, .large])
    }

    private func loadInspection() async {
        lastInspection = try? await AppDatabase.shared.read { db in
            try Inspection.active(for: polygon.id).fetchOne(db)
        }
        isLoading = false
    }
}
