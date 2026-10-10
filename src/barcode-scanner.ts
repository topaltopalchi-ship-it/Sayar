import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

export async function scanBarcode(): Promise<string | null> {
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;z-index:20000;background:#111e;display:flex;align-items:center;justify-content:center;padding:12px;overflow:auto";
  overlay.innerHTML = '<section style="background:white;color:#222;border-radius:16px;padding:16px;width:min(100%,480px);max-height:calc(100dvh - 24px);overflow:auto"><h3>اسکن بارکد کالا</h3><p style="font-size:13px;color:#555">بارکد را واضح و نزدیک دوربین نگه دارید؛ نور کافی باشد.</p><video playsinline autoplay muted style="display:block;width:100%;height:auto;min-height:180px;max-height:55dvh;object-fit:contain;background:#222;border-radius:12px"></video><p class="barcode-scan-status" role="status" style="font-size:13px;color:#555">در حال راه‌اندازی اسکنر…</p><button type="button" class="secondary-button wide">بستن</button></section>';
  document.body.appendChild(overlay);

  const video = overlay.querySelector("video")!;
  const status = overlay.querySelector<HTMLElement>(".barcode-scan-status")!;
  let stopScanner: (() => void) | undefined;
  let resolveResult!: (value: string | null) => void;
  const result = new Promise<string | null>(resolve => { resolveResult = resolve; });
  let active = true;

  const close = (value: string | null) => {
    if (!active) return;
    active = false;
    try { stopScanner?.(); } catch { /* Scanner may already have stopped. */ }
    const stream = video.srcObject;
    if (stream instanceof MediaStream) stream.getTracks().forEach(track => track.stop());
    video.srcObject = null;
    overlay.remove();
    resolveResult(value);
  };

  overlay.querySelector("button")?.addEventListener("click", () => close(null));

  try {
    // Use ZXing consistently: Android WebView's native BarcodeDetector may exist
    // but fail silently for common EAN/UPC product labels.
    const hints = new Map();
    hints.set(DecodeHintType.TRY_HARDER, true);
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.ITF,
      BarcodeFormat.QR_CODE,
      BarcodeFormat.CODABAR,
    ]);
    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 180, delayBetweenScanSuccess: 250 });
    status.textContent = "دوربین را روی بارکد نگه دارید؛ کمی فاصله بدهید تا خطوط واضح شوند.";
    await reader.decodeFromVideoDevice(
      undefined,
      video,
      (decoded, _error, controls) => {
        stopScanner = () => controls.stop();
        if (decoded && active) {
          const value = decoded.getText().trim();
          if (value) close(value);
        }
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    close(null);
    if (message.includes("NotAllowedError") || message.includes("Permission denied")) {
      throw new Error("اجازه دوربین داده نشد. از تنظیمات گوشی، دسترسی دوربین برنامه سای‌سای را فعال کنید.");
    }
    if (message.includes("NotFoundError")) throw new Error("دوربین پیدا نشد یا در دسترس نیست.");
    throw new Error(message || "اسکنر شروع نشد. برنامه را ببندید و دوباره امتحان کنید.");
  }

  return result;
}
