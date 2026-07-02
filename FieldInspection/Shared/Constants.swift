import Foundation

enum AppConstants {
    static let bundleId = "com.yourcompany.fieldinspection"
    static let maxPhotosPerInspection = 20
    static let storageWarningThresholdBytes: Int64 = 10 * 1024 * 1024 * 1024  // 10 GB

    static let cropTypes: [String] = [
        "Wheat", "Corn", "Soybeans", "Cotton", "Rice",
        "Barley", "Sorghum", "Canola", "Sunflower", "Other",
    ]

    enum BGTask {
        static let sync = "com.app.sync"
        static let refresh = "com.app.sync.refresh"
    }

    enum API {
        static let baseURL = "https://api.yourserver.com"  // replace with actual
        static let anthropicBaseURL = "https://api.anthropic.com"
        // Store actual key in .xcconfig / environment, never in source
        static let anthropicKey: String = {
            Bundle.main.infoDictionary?["ANTHROPIC_API_KEY"] as? String ?? ""
        }()
    }

    enum AI {
        static let model = "claude-sonnet-4-6"
        static let systemPrompt = """
            You are an agricultural field inspection assistant. Given rough technician notes \
            and optional field photos, produce a JSON object with exactly these keys:
            - summary: string (2–4 sentences, professional tone)
            - issue_classification: string (one of: Pest, Disease, Irrigation, Soil, Structural, None, Other)
            - recommended_actions: [string] (ordered list, max 5 items)
            Respond with JSON only. No markdown.
            """
    }
}
