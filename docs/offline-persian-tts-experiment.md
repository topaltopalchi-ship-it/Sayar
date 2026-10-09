# Offline Persian TTS experiment

This branch is reserved for integrating an offline Persian text-to-speech engine without changing the stable `main` branch.

## Candidate engine

- Reference implementation: https://github.com/gyroing/Persian-Piper-TTS-WebAssembly
- The reference repository contains an MIT license. Preserve its copyright/license notice if redistributing its code.
- Model reference: https://huggingface.co/gyroing/Persian-Piper-Model-gyro
- The reference browser demo initializes a global Emscripten `Module`, loads Sherpa-ONNX JavaScript/WASM/data assets, calls `initSherpaOnnxOfflineTts()`, then generates samples with `tts.generate({ text, sid: 0, speed: 1 })`.

## Integration requirements

1. Verify the model repository's current license and redistribution terms separately from the demo's MIT code license.
2. Bundle all required JS, WASM, data, and model files into the Android app at build time. Runtime network access must not be required for speech.
3. Replace the demo's page-specific globals (`textP` and `playTTS`) with a small promise-based adapter that can be called from `speakSaiSai(message)`.
4. Ensure initialization happens once, queue speech requests, and report failures so the existing Android/browser TTS fallback remains available.
5. Run the Android release build and test offline on a physical Android device before merging to `main`.

## Current status

Research/prototype branch only. The engine has not yet been wired into the application and no APK has been verified. Do not describe offline Persian speech as implemented until the build and on-device checks pass.
