export async function scanBarcode(): Promise<string | null> {
  const Detector = (window as unknown as {
    BarcodeDetector?: new (options?: { formats?: string[] }) => {
      detect(video: HTMLVideoElement): Promise<Array<{ rawValue?: string }>>;
    };
  }).BarcodeDetector;

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("دسترسی دوربین در دسترس نیست؛ مجوز دوربین را بررسی کنید");
  }

  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;z-index:20000;background:#111e;display:flex;align-items:center;justify-content:center;padding:18px";
  overlay.innerHTML = '<section style="background:white;color:#222;border-radius:16px;padding:16px;width:min(100%,480px)"><h3>اسکن بارکد کالا</h3><p style="font-size:13px;color:#555">بارکد را روبه‌روی دوربین نگه دارید.</p><video playsinline autoplay style="width:100%;min-height:220px;background:#222;border-radius:12px"></video><p class="barcode-scan-status" style="font-size:13px;color:#555">در حال آماده‌سازی دوربین…</p><button type="button" class="secondary-button wide">بستن</button></section>';
  document.body.appendChild(overlay);

  const video = overlay.querySelector("video")!;
  const status = overlay.querySelector<HTMLElement>(".barcode-scan-status")!;
  let stream: MediaStream | undefined;
  let stopZXing: (() => void) | undefined;
  let resolveResult!: (value: string | null) => void;
  const result = new Promise<string | null>(resolve => { resolveResult = resolve; });
  let active = true;

  const close = (value: string | null) => {
    if (!active) return;
    active = false;
    stopZXing?.();
    stream?.getTracks().forEach(track => track.stop());
    overlay.remove();
    resolveResult(value);
  };

  overlay.querySelector("button")?.addEventListener("click", () => close(null));

  try {
    if (Detector) {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false
      });
      video.srcObject = stream;
      await video.play();
      const detector = new Detector({
        formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code", "itf"]
      });
      status.textContent = "دوربین فعال است؛ بارکد را داخل کادر نگه دارید.";
      const poll = async () => {
        if (!active) return;
        try {
          const found = (await detector.detect(video)).find(item => item.rawValue?.trim());
          if (found?.rawValue) {
            close(found.rawValue.trim());
            return;
          }
        } catch {
          // A single blurry frame should not stop scanning.
        }
        if (active) window.setTimeout(() => void poll(), 200);
      };
      void poll();
    } else {
      status.textContent = "در حال راه‌اندازی اسکنر سازگار…";
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      if (!active) return result;
      const reader = new BrowserMultiFormatReader();
      await reader.decodeFromVideoDevice(undefined, video, (decoded, _error, controls) => {
        stopZXing = () => controls.stop();
        if (decoded && active) close(decoded.getText().trim());
      });
      status.textContent = "دوربین فعال است؛ بارکد را داخل کادر نگه دارید.";
    }
  } catch (error) {
    close(null);
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Barcode") || message.includes("ZXing")) {
      throw new Error("اسکنر بارکد راه‌اندازی نشد. برنامه را به‌روز کنید و دوباره تلاش کنید.");
    }
    throw error;
  }

  return result;
}
