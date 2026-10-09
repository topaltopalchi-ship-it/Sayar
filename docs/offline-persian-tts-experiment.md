# Offline Persian TTS experiment

This branch is reserved for integrating an offline Persian text-to-speech engine without changing the stable `main` branch.

## Candidate engine and verified repository facts

- Reference implementation: https://github.com/gyroing/Persian-Piper-TTS-WebAssembly
- The reference code repository contains an MIT license. Preserve its copyright/license notice if redistributing its code.
- Model reference: https://huggingface.co/gyroing/Persian-Piper-Model-gyro
- The reference repository currently lists a data bundle of 81,115,924 bytes (~77.4 MiB) and a WASM binary of 11,450,878 bytes (~10.9 MiB), plus JavaScript and model assets. This is a substantial increase to download/package size.
- The demo initializes a global Emscripten `Module`, loads Sherpa-ONNX JavaScript/WASM/data assets, calls `initSherpaOnnxOfflineTts()`, then generates samples with `tts.generate({ text, sid: 0, speed: 1 })`. Its sample page relies on globals `textP` and `playTTS`, so it cannot simply be dropped into SaySay as-is.

## Integration requirements and release gates

1. Verify the model repository's current license and redistribution/commercial-use terms separately from the demo's MIT code license. Do not ship the model until this is confirmed.
2. Pin upstream assets to an immutable commit or checksum; do not download mutable `master` assets without integrity checks in a release build.
3. Bundle all required JS, WASM, data, and model files into the Android app at build time. Runtime network access must not be required for speech.
4. Replace the demo's page-specific globals with a promise-based adapter callable from `speakSaiSai(message)`.
5. Initialize once, queue speech requests, handle long text and audio playback cleanup, and preserve the existing native/browser TTS fallback.
6. Check Android WebView/WASM compatibility, APK/AAB size, and memory use. Run the Android release build and test speech with airplane mode enabled on a physical Android device before merging to `main`.

## Current status

Research/prototype branch only. No TTS adapter has been integrated, no model redistribution approval has been confirmed, and no APK has been verified. Do not describe Persian speech as implemented until all release gates pass.
