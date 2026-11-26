# TRAFICO Timing · heat review

Use Node 22.18+ and run `npm ci`, then `npm run dev`. Run the companion traficoTiming-backend API using its http profile at localhost:5158. Vite proxies /api to that port. For production, route /api to the backend under the same origin. Run `npm test` and `npm run build` for validation.

The example is an illustrated eight-lane heat. In a camera view, select a lane, step to the last frame before the crossing and mark it, then select the first frame at or after and save. Calculate intervals asks the API to evaluate the heat. Overlapping bounds do not establish an ordering. All marked times are frame brackets conditional on the supplied clock calibration, not certified times.

To review your own heat, use public/example/heat.json as the schema. Provide two cameras with increasing clock anchors (local and starter monotonic microseconds), a shared start in starter microseconds, a roster, and timestamped image frames. Frame filenames must be distinct for different images across cameras. Import one JSON file and all referenced PNG/JPEG/WebP images together. Export review saves the updated JSON. Keep the original images alongside it for reopening. The browser holds edits until export; exporting before refreshing preserves your work. This version uses extracted frames; it does not acquire phone video, detect the start, or calibrate phones.

A native iPhone finish-recorder prototype and its replay exporter are available in [ios/README.md](ios/README.md).
