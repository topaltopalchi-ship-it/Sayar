import { SpeechRecognition } from "@capacitor-community/speech-recognition";

export type VoiceSaleItem = { productHint: string; quantity: number; unitPrice: number };
export type VoiceSaleDraft = {
  transcript: string;
  customerName: string;
  productHint: string;
  quantity: number;
  unitPrice: number;
  paid: number;
  items: VoiceSaleItem[];
};

function digits(value: string): string {
  return value
    .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

function numberWords(value: string): string {
  const words: Record<string, string> = {
    "صفر":"0","یک":"1","یکی":"1","دو":"2","سه":"3","چهار":"4","پنج":"5","شش":"6","هفت":"7","هشت":"8","نه":"9","ده":"10",
    "یازده":"11","دوازده":"12","سیزده":"13","چهارده":"14","پانزده":"15","شانزده":"16","هفده":"17","هجده":"18","نوزده":"19","بیست":"20"
  };
  return value.split(/\s+/).map(x => words[x] ?? x).join(" ");
}

function firstNumber(text: string): number {
  const normalized = digits(numberWords(text)).replace(/[٬,،]/g, "");
  const m = normalized.match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : 0;
}

function moneyNumber(text: string): number {
  const raw = digits(text).replace(/[٬,،]/g, " ").replace(/\s+/g, " ").trim();
  const direct = raw.match(/\d+(?:\.\d+)?/);
  if (direct) return Number(direct[0]);

  const units: Record<string, number> = { هزار: 1_000, هزارتا: 1_000, میلیون: 1_000_000, میلیونی: 1_000_000 };
  const parts = raw.split(" ");
  let total = 0;
  let current = 0;
  for (const part of parts) {
    if (/^\d+$/.test(part)) current = Number(part);
    else if (units[part]) { total += (current || 1) * units[part]; current = 0; }
  }
  return total + current;
}

function parseVoiceSale(transcript: string): VoiceSaleDraft {
  const text = transcript.trim();
  const customer = text.match(/(?:برای|به)\s+([^،,.]+?)(?=\s+(?:یک|دو|سه|چهار|پنج|\d|از|به|با|فروختم|خریده|برد|پرداخت|داد)|[،,.]|$)/i)?.[1]?.trim() || "";
  const product = text.match(/(?:تا|عدد|عددِ|یک|دو|سه|چهار|پنج)\s+([^،,.]+?)(?=\s*(?:فروختم|فروخت|خریدم|خرید|به|هر|دونه|دانه|یکی|با|داد|پرداخت)|[،,.]|$)/i)?.[1]?.trim() || "";
  const quantityMatch = text.match(/(?:^|\s)([۰-۹٠-٩\d]+|یک|دو|سه|چهار|پنج|شش|هفت|هشت|نه|ده)\s*(?:تا|عدد|عددِ)/i);
  const quantity = quantityMatch ? firstNumber(quantityMatch[1]) : 1;
  const priceMatch = text.match(/(?:هر\s*(?:کدوم|کدام|دونه|دانه)?\s*|قیمت(?:ش)?\s*|دونه‌ای\s*)([۰-۹٠-٩\d][۰-۹٠-٩\d٬,]*(?:\s*(?:هزار|میلیون|میلیونی|میلیارد|میلیاردی))?)/i);
  const unitPrice = priceMatch ? moneyNumber(priceMatch[1]) : 0;
  const paidMatch = text.match(/(?:پرداخت(?:\s*کرد)?|داد|داده|واریز(?:\s*کرد)?)\s*(?:مبلغ\s*)?([۰-۹٠-٩\d][۰-۹٠-٩\d٬,]*(?:\s*(?:هزار|میلیون|میلیونی|میلیارد|میلیاردی))?)/i);
  const paid = paidMatch ? moneyNumber(paidMatch[1]) : 0;
  const items: VoiceSaleItem[] = [];
  for (const chunk of text.split(/،|,/).map(x => x.trim()).filter(Boolean)) {
    const q = chunk.match(/(?:^|\s)([۰-۹٠-٩\d]+|یک|دو|سه|چهار|پنج|شش|هفت|هشت|نه|ده)\s*(?:تا|عدد|عددِ)\s+(.+?)(?=\s+(?:هر|دونه‌ای|دانه‌ای|قیمت)|$)/i);
    if (!q) continue;
    const price = chunk.match(/(?:هر\s*(?:کدوم|کدام|دونه|دانه)?\s*|قیمت(?:ش)?\s*|دونه‌ای\s*|دانه‌ای\s*)([۰-۹٠-٩\d][۰-۹٠-٩\d٬,]*(?:\s*(?:هزار|میلیون|میلیونی))?)/i);
    items.push({ productHint: q[2].trim(), quantity: firstNumber(q[1]) || 1, unitPrice: price ? moneyNumber(price[1]) : 0 });
  }
  if (!items.length && product) items.push({ productHint: product, quantity: quantity || 1, unitPrice });
  return { transcript: text, customerName: customer, productHint: product, quantity: quantity || 1, unitPrice, paid, items };
}

function showVoiceModal(html: string): HTMLElement {
  document.querySelector("#voice-sale-modal")?.remove();
  document.body.insertAdjacentHTML("beforeend", html);
  return document.querySelector<HTMLElement>("#voice-sale-modal")!;
}

export function bindVoiceAssistant(onConfirm: (draft: VoiceSaleDraft) => Promise<void>, notify: (message: string) => void): void {
  const button = document.querySelector<HTMLButtonElement>("#voice-sale");
  if (!button) return;

  button.addEventListener("click", async () => {
    const available = await SpeechRecognition.available().catch(() => ({ available: false }));
    if (!available.available) {
      const m = showVoiceModal('<div class="modal-backdrop" id="voice-sale-modal"><section class="modal"><button class="modal-close" id="voice-close">×</button><span class="eyebrow">ثبت صوتی</span><h2>تشخیص صدا در دسترس نیست</h2><p class="muted">برای این دستگاه، سرویس تشخیص گفتار فعال نیست.</p><button class="primary-button wide" id="voice-ok">باشه</button></section></div>');
      m.querySelector("#voice-close")?.addEventListener("click", () => m.remove());
      m.querySelector("#voice-ok")?.addEventListener("click", () => m.remove());
      return;
    }

    const permission = await SpeechRecognition.requestPermissions().catch(() => null);
    if (permission && permission.speechRecognition !== "granted") {
      notify("اجازه دسترسی به میکروفون و تشخیص صدا لازم است");
      return;
    }

    button.disabled = true;
    button.textContent = "🎙 در حال شنیدن…";
    try {
      const result = await SpeechRecognition.start({
        language: "fa-IR",
        maxResults: 3,
        partialResults: false,
        popup: true,
        prompt: "فروش را به فارسی بگویید",
      });
      const transcript = result.matches?.[0]?.trim() || "";
      if (!transcript) throw new Error("صدایی تشخیص داده نشد");
      const draft = parseVoiceSale(transcript);
      const m = showVoiceModal(
        '<div class="modal-backdrop" id="voice-sale-modal"><section class="modal" role="dialog" aria-modal="true">' +
        '<button class="modal-close" id="voice-close">×</button><span class="eyebrow">ثبت فروش با صدا</span><h2>اطلاعات فروش</h2>' +
        '<p class="muted">قبل از ثبت، اطلاعات استخراج‌شده را بررسی کنید.</p>' +
        '<div class="voice-transcript"><span>متن تشخیص‌داده‌شده</span><b id="voice-transcript"></b></div>' +
        '<div class="voice-draft-grid">' +
        '<div><small>مشتری</small><strong id="voice-customer"></strong></div><div><small>کالا</small><strong id="voice-product"></strong></div>' +
        '<div><small>تعداد</small><strong id="voice-quantity"></strong></div><div><small>قیمت واحد</small><strong id="voice-price"></strong></div>' +
        '<div><small>پرداختی</small><strong id="voice-paid"></strong></div><div><small>اقلام</small><strong id="voice-items"></strong></div></div>' +
        '<div class="form-actions"><button class="secondary-button" id="voice-cancel">لغو</button><button class="primary-button" id="voice-confirm">ادامه ثبت فروش</button></div>' +
        '</section></div>'
      );
      (m.querySelector("#voice-transcript") as HTMLElement).textContent = draft.transcript;
      (m.querySelector("#voice-customer") as HTMLElement).textContent = draft.customerName || "تشخیص داده نشد";
      (m.querySelector("#voice-product") as HTMLElement).textContent = draft.productHint || "تشخیص داده نشد";
      (m.querySelector("#voice-quantity") as HTMLElement).textContent = String(draft.quantity);
      (m.querySelector("#voice-price") as HTMLElement).textContent = draft.unitPrice ? draft.unitPrice.toLocaleString("fa-IR") : "تشخیص داده نشد";
      (m.querySelector("#voice-paid") as HTMLElement).textContent = draft.paid ? draft.paid.toLocaleString("fa-IR") : "۰";
      (m.querySelector("#voice-items") as HTMLElement).textContent = draft.items.length ? draft.items.map(x => `${x.quantity} × ${x.productHint}`).join("، ") : "۱ قلم";
      m.querySelector("#voice-close")?.addEventListener("click", () => m.remove());
      m.querySelector("#voice-cancel")?.addEventListener("click", () => m.remove());
      m.querySelector("#voice-confirm")?.addEventListener("click", async () => { m.remove(); await onConfirm(draft); });
    } catch (error) {
      if (!/cancel|abort/i.test(error instanceof Error ? error.name + error.message : String(error))) {
        notify(error instanceof Error ? error.message : "تشخیص صدا ناموفق بود");
      }
    } finally {
      button.disabled = false;
      button.textContent = "🎙 ثبت فروش با صدا";
    }
  });
}
