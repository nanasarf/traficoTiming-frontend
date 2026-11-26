# iPhone finish-capture prototype

On a Mac with Xcode and XcodeGen, run `cd ios && xcodegen generate && open TraficoFinish.xcodeproj`. Select your signing team and a physical iPhone. Allow camera access and mount the phone in landscape before recording. Check the recorded orientation with a short trial. Select a finish side, record a short finish sequence, then tap Finish recording. Wait for the saved frame count. Retrieve its folder from the app's Documents using Files or Finder. Keep both finish.mov and capture.json. A missing receipt indicates incomplete evidence.

The recorder requests the fastest supported 240, 120, 60 or 30 fps rear-camera mode up to 1920 pixels wide. It indexes accepted samples by capture-session presentation time and counts late callbacks and encoder backpressure. Check actual timestamp gaps. The requested rate and the number of microsecond digits do not establish accuracy. The app does not yet measure sensor readout latency, synchronize devices, or detect a starter signal. Keep capture sessions short during bench testing.

## Replay two recordings

Install Python 3 and FFmpeg (including ffprobe). Supply a JSON config with title, startUs, roster (lane/name rows), and calibration containing A and B. For each camera provide first and last anchors, each with integer localUs and starterUs values. Use measured anchors covering the footage, with startUs on the same starter clock. A phone's wall-clock time cannot supply these values.

Run `python3 export_heat.py config.json Finish-A-folder Finish-B-folder review-output`. The exporter checks the movie frame count and relative presentation timestamps against the capture receipt, then exports one JPEG per frame and a heat.json. Select the JSON and its images together in the web review app. Keep the original movies for evidence. Long sessions can produce large image exports.
