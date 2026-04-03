import SwiftUI

struct RootTabView: View {
    var body: some View {
        TabView {
            PairingView()
                .tabItem {
                    Label("Pairing", systemImage: "dot.radiowaves.left.and.right")
                }

            SessionView()
                .tabItem {
                    Label("Session", systemImage: "play.circle")
                }

            TelemetryView()
                .tabItem {
                    Label("Telemetry", systemImage: "heart.text.square")
                }

            DiagnosticsView()
                .tabItem {
                    Label("Diagnostics", systemImage: "wrench.and.screwdriver")
                }
        }
    }
}
