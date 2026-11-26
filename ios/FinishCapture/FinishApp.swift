import SwiftUI
import AVFoundation
import UIKit

@main
struct FinishApp: App {
    var body: some Scene { WindowGroup { CaptureView() } }
}

private final class PreviewSurface: UIView {
    override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
}

private struct Preview: UIViewRepresentable {
    let session: AVCaptureSession
    func makeUIView(context: Context) -> UIView {
        let view = PreviewSurface()
        let layer = view.layer as! AVCaptureVideoPreviewLayer
        layer.session = session
        if let connection = layer.connection, connection.isVideoOrientationSupported {
            connection.videoOrientation = .landscapeRight
        }
        layer.videoGravity = .resizeAspect
        return view
    }
    func updateUIView(_ view: UIView, context: Context) {}
}

private struct CaptureView: View {
    @StateObject private var camera = Recorder()
    @State private var side = "A"
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Finish capture").font(.largeTitle.bold())
            Picker("Finish camera", selection: $side) {
                Text("Finish A").tag("A")
                Text("Finish B").tag("B")
            }.pickerStyle(.segmented).disabled(camera.phase != .ready)
            Preview(session: camera.session).background(.black)
            Text(camera.message)
            if camera.phase == .recording {
                Button("Finish recording") { camera.stop() }
            } else {
                Button("Record finish") { camera.start(side: side) }
                    .disabled(camera.phase != .ready)
            }
        }.padding().buttonStyle(.borderedProminent)
        .onAppear { camera.prepare() }
        .onChange(of: scenePhase) { phase in
            if phase == .background { camera.stop() }
        }
    }
}
