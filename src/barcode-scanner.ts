export async function scanBarcode(): Promise<string | null> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("دسترسی دوربین در دسترس نیست؛ برنامه را به‌روز کنید و مجوز دوربین را فعال کنید.");
  }

  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;z-index:20000;background:#111e;display:flex;align-items:center;justify-content:center;padding:12px;overflow:auto";
  overlay.innerHTML = '<section style="background:white;color:#222;border-radius:16px;padding:16px;width:min(100%,480px);max-height:calc(100dvh - 24px);overflow:auto"><h3>اسکن بارکد کالا</h3><p style="font-size:13px;color:#555">بارکد را روبه‌روی دوربین نگه دارید.</p><video playsinline autoplay muted style="display:block;width:100%;height:auto;min-height:180px;max-height:55dvh;object-fit:cover;background:#222;border-radius:12px"></video><p class="barcode-scan-status" role="status" style="font-size:13px;color:#555">در حال آماده‌سازی دوربین…</p><button type="button" class="secondary-button wide">بستن</button></section>';
  document.body.appendChild(overlay);

  const video = overlay.querySelector("video")!;
  const status = overlay.querySelector<HTMLElement>(".barcode-scan-status")!;
  let stream: MediaStream | undefined;
  let stopZXing: (() => void) | undefined;
  let resolveResult!: (value: string | null) => void;
  const result = new Promise<string | null>(resolve => { resolveResult = resolve; });
  let active = true;
  let polling = false;

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
    status.textContent = "درخواست اجازه دوربین…";
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });
    if (!active) {
      stream.getTracks().forEach(track => track.stop());
      return result;
    }
    video.srcObject = stream;
    await video.play();
    status.textContent = "دوربین فعال است؛ بارکد را داخل کادر نگه دارید.";

    const Detector = (window as unknown as {
      BarcodeDetector?: new (options?: { formats?: string[] }) => {
        detect(video: HTMLVideoElement): Promise<Array<{ rawValue?: string }>>;
      };
    }).BarcodeDetector;

    if (Detector) {
      try {
        const detector = new Detector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code", "itf"] });
        const poll = async () => {
          if (!active || polling) return;
          polling = true;
          try {
            const found = (await detector.detect(video)).find(item => item.rawValue?.trim());
            if (found?.rawValue) {
              close(found.rawValue.trim());
              return;
            }
          } catch { /* Ignore transient blurry frames. */ }
          finally { polling = false; }
          if (active) window.setTimeout(() => void poll(), 220);
        };
        void poll();
      } catch {
        status.textContent = "در حال راه‌اندازی اسکنر سازگار…";
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        await reader.decodeFromVideoDevice(undefined, video, (decoded, _error, controls) => {
          stopZXing = () => controls.stop();
          if (decoded && active) close(decoded.getText().trim());
        });
      }
    } else {
      status.textContent = "در حال راه‌اندازی اسکنر سازگار…";
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      await reader.decodeFromVideoDevice(undefined, video, (decoded, _error, controls) => {
        stopZXing = () => controls.stop();
        if (decoded && active) close(decoded.getText().trim());
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    close(null);
    if (message.includes("NotAllowedError") || message.includes("Permission denied")) {
      throw new Error("اجازه دوربین داده نشد. از تنظیمات گوشی، دسترسی دوربین برنامه سای‌سای را فعال کنید و دوباره تلاش کنید.");
    }
    if (message.includes("NotFoundError")) {
      throw new Error("دوربین پیدا نشد یا در دسترس نیست.");
    }
    throw new Error(message || "دوربین باز نشد. مجوز دوربین را بررسی و دوباره تلاش کنید.");
  }

  return result;
}
