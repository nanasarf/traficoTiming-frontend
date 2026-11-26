import AVFoundation
import Foundation
import Combine

private struct CaptureFailure: LocalizedError {
    var errorDescription: String?
    init(_ message: String) { errorDescription = message }
}

private struct FrameStamp: Codable {
    let localUs: Int64
    let ptsValue: Int64
    let ptsScale: Int32
}

private struct Receipt: Encodable {
    let version = 1
    let camera: String
    let clock = "AVCaptureSession sample PTS"
    let requestedFps: Int
    let droppedCallbacks: Int
    let skippedWhileBusy: Int
    let frames: [FrameStamp]
}

final class Recorder: NSObject, ObservableObject, AVCaptureVideoDataOutputSampleBufferDelegate {
    enum Phase { case preparing, ready, recording, saving, unavailable }
    @Published private(set) var phase = Phase.preparing
    @Published private(set) var message = "Preparing the camera…"
    let session = AVCaptureSession()
    private let queue = DispatchQueue(label: "org.trafico.finish.capture")
    private let output = AVCaptureVideoDataOutput()
    private var fps = 0
    private var side = ""
    private var directory: URL?
    private var writer: AVAssetWriter?
    private var input: AVAssetWriterInput?
    private var frames = [FrameStamp]()
    private var dropped = 0
    private var busy = 0
    private var saving = false

    private func display(_ phase: Phase, _ text: String) {
        DispatchQueue.main.async { self.phase = phase; self.message = text }
    }

    func prepare() {
        AVCaptureDevice.requestAccess(for: .video) { granted in
            self.queue.async {
                guard granted else {
                    self.display(.unavailable, "Allow camera access in Settings to record a finish.")
                    return
                }
                guard self.session.inputs.isEmpty else { return }
                do {
                    try self.configure()
                    self.session.startRunning()
                    self.display(.ready, "Ready · requested \(self.fps) fps")
                } catch { self.display(.unavailable, error.localizedDescription) }
            }
        }
    }

    private func configure() throws {
        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back)
        else { throw CaptureFailure("Rear camera unavailable.") }
        let camera = try AVCaptureDeviceInput(device: device)
        session.beginConfiguration()
        defer { session.commitConfiguration() }
        guard session.canAddInput(camera) else { throw CaptureFailure("Camera input unavailable.") }
        session.addInput(camera)
        guard session.canAddOutput(output) else { throw CaptureFailure("Video output unavailable.") }
        session.addOutput(output)
        if let connection = output.connection(with: .video), connection.isVideoOrientationSupported {
            connection.videoOrientation = .landscapeRight
        }
        output.alwaysDiscardsLateVideoFrames = true
        output.setSampleBufferDelegate(self, queue: queue)
        for rate in [240, 120, 60, 30] {
            let formats = device.formats.filter { format in
                let size = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
                return size.width <= 1920 && size.width >= 640 &&
                    format.videoSupportedFrameRateRanges.contains { $0.minFrameRate <= Double(rate) && $0.maxFrameRate >= Double(rate) }
            }
            guard let format = formats.max(by: {
                CMVideoFormatDescriptionGetDimensions($0.formatDescription).width <
                    CMVideoFormatDescriptionGetDimensions($1.formatDescription).width
            }) else { continue }
            try device.lockForConfiguration()
            defer { device.unlockForConfiguration() }
            device.activeFormat = format
            let interval = CMTime(value: 1, timescale: Int32(rate))
            device.activeVideoMinFrameDuration = interval
            device.activeVideoMaxFrameDuration = interval
            fps = rate
            return
        }
        throw CaptureFailure("No supported rear-camera format.")
    }

    func start(side: String) {
        queue.async {
            guard self.directory == nil, !self.saving, self.session.isRunning else { return }
            do {
                let documents = try FileManager.default.url(for: .documentDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
                let folder = documents.appendingPathComponent("Finish-\(side)-\(UUID().uuidString)")
                try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: false)
                self.directory = folder
                self.side = side
                self.frames.removeAll()
                self.busy = 0
                self.dropped = 0
                self.display(.recording, "Recording finish \(side) · keep the camera fixed")
            } catch { self.display(.ready, error.localizedDescription) }
        }
    }

    func captureOutput(_ output: AVCaptureOutput, didDrop sample: CMSampleBuffer, from connection: AVCaptureConnection) {
        if directory != nil && !saving { dropped += 1 }
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sample: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard let directory, !saving else { return }
        do {
            let pts = CMSampleBufferGetPresentationTimeStamp(sample)
            guard pts.isNumeric, pts.value >= 0 else { throw CaptureFailure("Invalid sample timestamp.") }
            let us = CMTimeConvertScale(pts, timescale: 1_000_000, method: .roundHalfAwayFromZero).value
            if let previous = frames.last, us <= previous.localUs { throw CaptureFailure("Camera timestamps stopped increasing.") }
            if writer == nil {
                guard let format = CMSampleBufferGetFormatDescription(sample) else { throw CaptureFailure("Missing video format.") }
                let size = CMVideoFormatDescriptionGetDimensions(format)
                let w = try AVAssetWriter(outputURL: directory.appendingPathComponent("finish.mov"), fileType: .mov)
                let settings: [String: Any] = [AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: Int(size.width), AVVideoHeightKey: Int(size.height), AVVideoCompressionPropertiesKey: [AVVideoAllowFrameReorderingKey: false]]
                let track = AVAssetWriterInput(mediaType: .video, outputSettings: settings, sourceFormatHint: format)
                track.expectsMediaDataInRealTime = true
                track.mediaTimeScale = pts.timescale
                guard w.canAdd(track) else { throw CaptureFailure("Unsupported encoder settings.") }
                w.add(track)
                guard w.startWriting() else { throw w.error ?? CaptureFailure("Encoder failed.") }
                w.startSession(atSourceTime: pts)
                writer = w
                input = track
            }
            guard let input, let writer, writer.status == .writing else { throw CaptureFailure("Video writer stopped.") }
            guard input.isReadyForMoreMediaData else { busy += 1; return }
            guard input.append(sample) else { throw writer.error ?? CaptureFailure("Failed to write sample.") }
            frames.append(FrameStamp(localUs: us, ptsValue: pts.value, ptsScale: pts.timescale))
        } catch {
            writer?.cancelWriting()
            reset()
            display(.ready, "Incomplete recording · " + error.localizedDescription)
        }
    }

    private func reset() { writer = nil; input = nil; directory = nil; saving = false }

    func stop() {
        queue.async {
            guard let folder = self.directory, !self.saving else { return }
            guard let writer = self.writer, self.frames.count >= 2 else {
                self.writer?.cancelWriting()
                self.reset()
                self.display(.ready, "Incomplete recording · fewer than two frames")
                return
            }
            self.saving = true
            self.display(.saving, "Saving recording…")
            let receipt = Receipt(camera: self.side, requestedFps: self.fps, droppedCallbacks: self.dropped,
                                  skippedWhileBusy: self.busy, frames: self.frames)
            self.input?.markAsFinished()
            writer.finishWriting {
                self.queue.async {
                    defer { self.reset() }
                    do {
                        guard writer.status == .completed else { throw writer.error ?? CaptureFailure("Movie incomplete.") }
                        try JSONEncoder().encode(receipt).write(to: folder.appendingPathComponent("capture.json"), options: .atomic)
                        self.display(.ready, "Saved \(receipt.frames.count) frames · Files → On My iPhone → TraficoFinish")
                    } catch { self.display(.ready, "Incomplete recording · " + error.localizedDescription) }
                }
            }
        }
    }
}
