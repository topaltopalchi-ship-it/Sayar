export type ProductVisionResult = {
  name: string;
  sku: string;
  unit: "عدد" | "کیلوگرم" | "گرم" | "لیتر" | "متر" | "بسته";
  confidence: number;
};

type OCRResult = { data?: { text?: string } };
type TesseractWorker = { recognize(file: File): Promise<OCRResult>; terminate(): Promise<void> };
type TesseractGlobal = { createWorker(langs: string): Promise<TesseractWorker> };
declare global { interface Window { Tesseract?: TesseractGlobal } }

let tesseractLoader: Promise<TesseractGlobal> | null = null;
function loadOCR(): Promise<TesseractGlobal> {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!tesseractLoader) tesseractLoader = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    script.async = true;
    script.onload = () => window.Tesseract ? resolve(window.Tesseract) : reject(new Error("موتور خواندن نوشته بارگذاری نشد؛ اتصال اینترنت را بررسی کنید."));
    script.onerror = () => { tesseractLoader = null; reject(new Error("بارگذاری خواندن نوشته ناموفق بود؛ اتصال اینترنت را بررسی کنید.")); };
    document.head.appendChild(script);
  });
  return tesseractLoader;
}

// Kept for compatibility with older settings UI; no key is required or stored.
export function getVisionApiKey(): string { return "local-ocr"; }
export function setVisionApiKey(_value: string): void {}

function extractSku(text: string): string {
  const lines = text.split(/\r?\n/).map(s => s.trim());
  const labeled = lines.find(s => /(?:sku|barcode|bar\s*code|کد\s*(?:کالا|محصول|بارکد)|بارکد)\s*[:：#-]?\s*[0-9۰-۹٠-٩-]{6,}/i.test(s));
  const candidate = (labeled || text).match(/(?:\d[\d\s-]{6,}\d)/);
  if (!candidate) return "";
  const digits = candidate[0].replace(/\D/g, "").replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  return digits.length >= 8 && digits.length <= 14 ? digits : "";
}

async function detectBarcode(file: File): Promise<string> {
  const BarcodeDetectorCtor = (window as unknown as { BarcodeDetector?: new (opts?: { formats?: string[] }) => { detect(source: ImageBitmap): Promise<Array<{ rawValue?: string }>> } }).BarcodeDetector;
  if (!BarcodeDetectorCtor || typeof createImageBitmap !== "function") return "";
  try {
    const bitmap = await createImageBitmap(file);
    try {
      const detector = new BarcodeDetectorCtor({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "qr_code"] });
      return (await detector.detect(bitmap)).map(x => x.rawValue || "").find(Boolean) || "";
    } finally { bitmap.close(); }
  } catch { return ""; }
}

export async function analyzeProductPhoto(file: File): Promise<ProductVisionResult> {
  if (!file.type.startsWith("image/")) throw new Error("لطفاً یک تصویر از کالا انتخاب کنید.");
  const tesseract = await loadOCR();
  const worker = await tesseract.createWorker("fas+eng");
  let text = "";
  try { text = String((await worker.recognize(file)).data?.text || "").trim(); }
  finally { await worker.terminate(); }

  const barcode = await detectBarcode(file);
  const sku = barcode || extractSku(text);
  const lines = text.split(/\r?\n/)
    .map(s => s.replace(/[|_~=*#]/g, " ").replace(/\s+/g, " ").trim())
    .filter(s => s.length >= 3 && /[\p{L}]/u.test(s))
    .filter(s => !/^(www\.|https?:|made in|best before|expiry|ingredients|nutrition|وزن خالص|تاریخ تولید|تاریخ انقضا|شماره پروانه)/i.test(s));
  const name = lines.sort((a, b) => scoreLine(b) - scoreLine(a))[0] || "";
  if (!name && !sku) throw new Error("نوشته یا بارکدی خوانا پیدا نشد. عکس واضح‌تر و نزدیک‌تری بگیرید.");
  return { name: name.slice(0, 100), sku, unit: "عدد", confidence: name ? Math.min(0.85, 0.35 + name.length / 100) : 0.25 };
}

function scoreLine(line: string): number {
  const letters = (line.match(/[\p{L}]/gu) || []).length;
  const digits = (line.match(/[0-9۰-۹٠-٩]/g) || []).length;
  return letters * 2 - digits + Math.min(line.length, 40) / 10;
}
