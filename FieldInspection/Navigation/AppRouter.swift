import SwiftUI

enum AppRoute: Hashable {
    case inspection(fieldId: String, inspectionId: String?)
}

@MainActor
final class AppRouter: ObservableObject {
    @Published var path = NavigationPath()
    @Published var presentedSheet: AppSheet?
    @Published var presentedFullscreen: AppFullscreen?

    enum AppSheet: Identifiable {
        case fieldDetail(FieldPolygon)
        case aiAssist(String)
        case relogin

        var id: String {
            switch self {
            case .fieldDetail(let p): return "fieldDetail-\(p.id)"
            case .aiAssist(let id): return "aiAssist-\(id)"
            case .relogin: return "relogin"
            }
        }
    }

    enum AppFullscreen: Identifiable {
        case polygonDownload

        var id: String {
            switch self {
            case .polygonDownload: return "polygonDownload"
            }
        }
    }

    func navigate(to route: AppRoute) {
        path.append(route)
    }

    func showSheet(_ sheet: AppSheet) {
        presentedSheet = sheet
    }

    func showFullscreen(_ screen: AppFullscreen) {
        presentedFullscreen = screen
    }

    func dismiss() {
        if presentedSheet != nil {
            presentedSheet = nil
        } else if presentedFullscreen != nil {
            presentedFullscreen = nil
        } else if !path.isEmpty {
            path.removeLast()
        }
    }

    func popToRoot() {
        path = NavigationPath()
    }
}
