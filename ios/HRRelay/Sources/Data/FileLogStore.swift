import Foundation

actor FileLogStore {
    private let baseDirectory: URL
    private let logURL: URL

    init(baseDirectory: URL? = nil) {
        let root = baseDirectory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        self.baseDirectory = root.appendingPathComponent("HRRelay", isDirectory: true)
        self.logURL = self.baseDirectory.appendingPathComponent("relay.log")
    }

    func append(_ line: String) async {
        try? FileManager.default.createDirectory(at: baseDirectory, withIntermediateDirectories: true, attributes: nil)

        let formatted = "\(ISO8601DateFormatter().string(from: Date())) \(line)\n"
        guard let data = formatted.data(using: .utf8) else { return }

        if FileManager.default.fileExists(atPath: logURL.path) == false {
            try? data.write(to: logURL)
            return
        }

        guard let handle = try? FileHandle(forWritingTo: logURL) else { return }
        defer { try? handle.close() }
        _ = try? handle.seekToEnd()
        try? handle.write(contentsOf: data)
    }

    func exportLogs() -> URL? {
        FileManager.default.fileExists(atPath: logURL.path) ? logURL : nil
    }
}
