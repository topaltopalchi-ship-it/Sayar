import { createWorker } from "tesseract.js";

export type ProductVisionResult = {
  name: string;
  sku: string;
  unit: "عدد" | "کیلوگرم" | "گرم" | "لیتر" | "متر" | "بسته";
  confidence: number;
};

function proposeName(text: string): string {
  const lines = text.split(/[\r\n]+/)
    .map(line => line.replace(/[|_~]+/g, " ").replace(/\s+/g, " ").trim())
    .filter(line => line.length >= 3 && line.length <= 70)
    .filter(line => !/^\d[\d\s.,/-]*$/.test(line))
    .filter(line => !/^(www\.|https?:|\d+\s?(gr|g|kg|ml|l|٪|%))$/i.test(line));
  const ranked = lines.map((line, index) => ({
    line,
    score: (/[\u0600-\u06FF]/.test(line) ? 3 : 0) +
      (/[A-Za-z]/.test(line) ? 2 : 0) +
      (/[0-9]/.test(line) ? 1 : 0) -
      (line.length > 45 ? 1 : 0) - index * 0.08
  })).sort((a, b) => b.score - a.score);
  return ranked.slice(0, 2).map(x => x.line).join(" ").slice(0, 100).trim();
}

export async function analyzeProductPhoto(file: File): Promise<ProductVisionResult> {
  if (!file.type.startsWith("image/")) throw new Error("لطفاً یک تصویر از کالا انتخاب کنید.");
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  try {
    // OCR runs locally; language data downloads on first use, so first run needs internet.
    worker = await createWorker("fas+eng", 1, { logger: () => undefined });
    const { data } = await worker.recognize(file);
    const text = String(data.text || "").trim();
    // OCR is not visual object recognition; allow manual naming when no text is readable.
    const name = text ? proposeName(text) : "";
    const skuMatch = text.match(/(?:\b\d{8,14}\b|\b[A-Z0-9][A-Z0-9-]{4,}\b)/i);
    const lower = text.toLocaleLowerCase();
    let unit: ProductVisionResult["unit"] = "عدد";
    if (/\b(kg|کیلوگرم|کیلو)\b/i.test(lower)) unit = "کیلوگرم";
    else if (/\b(g|gr|گرم)\b/i.test(lower)) unit = "گرم";
    else if (/\b(ml|لیتر|liter|litre|\bl\b)\b/i.test(lower)) unit = "لیتر";
    else if (/\b(m|متر)\b/i.test(lower)) unit = "متر";
    else if (/\b(pack|بسته)\b/i.test(lower)) unit = "بسته";
    return { name: name || "کالای جدید", sku: skuMatch?.[0] || "", unit, confidence: text ? Math.max(0, Math.min(1, Number(data.confidence || 0) / 100)) : 0 };
  } finally {
    await worker?.terminate();
  }
}
