export async function scanBarcode(): Promise<string | null> {
  const Detector = (window as unknown as { BarcodeDetector?: new (options?: { formats?: string[] }) => { detect(video: HTMLVideoElement): Promise<Array<{ rawValue?: string }>> } }).BarcodeDetector;
  if (!Detector) throw new Error("اسکن بارکد در این نسخه مرورگر پشتیبانی نمی‌شود");
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("دسترسی دوربین در دسترس نیست");
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;z-index:20000;background:#111e;display:flex;align-items:center;justify-content:center;padding:18px";
  overlay.innerHTML = '<section style="background:white;color:#222;border-radius:16px;padding:16px;width:min(100%,480px)"><h3>اسکن بارکد کالا</h3><video playsinline autoplay style="width:100%;min-height:220px;background:#222;border-radius:12px"></video><button type="button" class="secondary-button wide">بستن</button></section>';
  document.body.appendChild(overlay);
  const video = overlay.querySelector("video")!;
  let stream: MediaStream | undefined;
  let resolveResult!: (value: string | null) => void;
  const result = new Promise<string | null>(resolve => { resolveResult = resolve; });
  let active = true;
  const close = (value: string | null) => { if (!active) return; active = false; stream?.getTracks().forEach(t => t.stop()); overlay.remove(); resolveResult(value); };
  overlay.querySelector("button")?.addEventListener("click", () => close(null));
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    video.srcObject = stream;
    await video.play();
    const detector = new Detector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code", "itf"] });
    const poll = async () => {
      if (!active) return;
      try {
        const found = (await detector.detect(video)).find(x => x.rawValue?.trim());
        if (found?.rawValue) { close(found.rawValue.trim()); return; }
      } catch { /* continue reading camera frames */ }
      if (active) window.setTimeout(() => void poll(), 200);
    };
    void poll();
  } catch (error) {
    close(null);
    throw error;
  }
  return result;
}
