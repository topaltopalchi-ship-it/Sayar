export type ProductVisionResult = {
  name: string;
  sku: string;
  unit: "عدد" | "کیلوگرم" | "گرم" | "لیتر" | "متر" | "بسته";
  confidence: number;
};

const KEY = "sai-sai-openai-api-key";
const MODEL = "gpt-6-luna";

export function getVisionApiKey(): string {
  return localStorage.getItem(KEY) || "";
}

export function setVisionApiKey(value: string): void {
  const v = value.trim();
  if (v) localStorage.setItem(KEY, v);
  else localStorage.removeItem(KEY);
}

export async function analyzeProductPhoto(file: File): Promise<ProductVisionResult> {
  const apiKey = getVisionApiKey();
  if (!apiKey) throw new Error("ابتدا کلید OpenAI API را در تنظیمات سای‌سای وارد کنید.");
  if (!file.type.startsWith("image/")) throw new Error("لطفاً یک تصویر از کالا انتخاب کنید.");

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("خواندن تصویر ناموفق بود"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });

  const prompt = `این تصویر مربوط به یک کالای فروشگاهی است. نام کالا را برای ثبت در سیستم حسابداری به فارسی و کوتاه تشخیص بده.
اگر روی کالا نوشته، برند، مدل، رنگ یا نوع کالا قابل تشخیص است، آن را در نام بیاور. اگر بارکد یا کد کالا واضح است، همان را به عنوان sku بده؛ در غیر این صورت sku را خالی بگذار.
واحد را فقط یکی از این مقادیر انتخاب کن: عدد، کیلوگرم، گرم، لیتر، متر، بسته.
فقط JSON معتبر و بدون markdown برگردان:
{"name":"...","sku":"...","unit":"عدد","confidence":0.0}`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
    body: JSON.stringify({
      model: MODEL,
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: dataUrl, detail: "high" }
        ]
      }]
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail ? "تحلیل تصویر ناموفق بود: " + detail.slice(0, 180) : "تحلیل تصویر ناموفق بود");
  }

  const payload = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
  const raw = String(payload.output_text || payload.output?.flatMap(x => x.content || []).map(x => x.text || "").join("") || "").trim();
  if (!raw) throw new Error("از تصویر نتیجه‌ای دریافت نشد");

  let parsed: Partial<ProductVisionResult>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\\s\\S]*\}/);
    if (!match) throw new Error("پاسخ هوش تصویری قابل پردازش نبود");
    try { parsed = JSON.parse(match[0]); } catch { throw new Error("پاسخ هوش تصویری قابل پردازش نبود"); }
  }

  const units = new Set(["عدد","کیلوگرم","گرم","لیتر","متر","بسته"]);
  const unit = units.has(String(parsed.unit)) ? parsed.unit as ProductVisionResult["unit"] : "عدد";
  return {
    name: String(parsed.name || "").trim(),
    sku: String(parsed.sku || "").trim(),
    unit,
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0))
  };
}
