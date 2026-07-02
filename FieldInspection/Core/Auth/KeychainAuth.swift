import Foundation
import Security

final class KeychainAuth {
    static let shared = KeychainAuth()

    private let service = AppConstants.bundleId
    private let accountKey = "authToken"
    private let technicianKey = "technicianId"

    private init() {}

    // MARK: - Token

    var token: String? {
        get { read(key: accountKey) }
        set {
            if let value = newValue { save(value, key: accountKey) }
            else { delete(key: accountKey) }
        }
    }

    var technicianId: String? {
        get { read(key: technicianKey) }
        set {
            if let value = newValue { save(value, key: technicianKey) }
            else { delete(key: technicianKey) }
        }
    }

    var hasToken: Bool { token != nil }

    func clear() {
        delete(key: accountKey)
        delete(key: technicianKey)
    }

    // MARK: - SecItem Helpers

    private func save(_ value: String, key: String) {
        let data = Data(value.utf8)
        var query = baseQuery(key: key)
        SecItemDelete(query as CFDictionary)
        query[kSecValueData as String] = data
        SecItemAdd(query as CFDictionary, nil)
    }

    private func read(key: String) -> String? {
        var query = baseQuery(key: key)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func delete(key: String) {
        SecItemDelete(baseQuery(key: key) as CFDictionary)
    }

    private func baseQuery(key: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
    }
}
