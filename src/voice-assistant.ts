import { SpeechRecognition } from "@capacitor-community/speech-recognition";
import { Capacitor } from "@capacitor/core";
import { TextToSpeech } from "@capacitor-community/text-to-speech";

async function prepareSpeechRecognition(): Promise<void> {
  try {
    const listening = await SpeechRecognition.isListening();
    if (listening.listening) {
      await SpeechRecognition.stop().catch(() => undefined);
      await new Promise(resolve => setTimeout(resolve, 180));
    }
  } catch { /* recognizer may already be idle */ }
}

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
  const units: Record<string, number> = { هزار: 1_000, هزارتا: 1_000, میلیون: 1_000_000, میلیونی: 1_000_000, میلیارد: 1_000_000_000, میلیاردی: 1_000_000_000 };
  const parts = raw.split(" ");
  let total = 0;
  let current = 0;
  let sawUnit = false;
  for (const part of parts) {
    if (/^\d+(?:\.\d+)?$/.test(part)) current = Number(part);
    else if (units[part]) { total += (current || 1) * units[part]; current = 0; sawUnit = true; }
  }
  if (sawUnit) return total + current;
  const direct = raw.match(/\d+(?:\.\d+)?/);
  return direct ? Number(direct[0]) : 0;
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

export type VoiceProductDraft = {
  transcript: string;
  name: string;
  sku: string;
  unit: "عدد" | "کیلوگرم" | "گرم" | "لیتر" | "متر" | "بسته";
  purchasePrice: number;
  salePrice: number;
  initialStock: number;
  lowStock: number;
};

function escapeHtml(value: string): string { return value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

function spokenMoney(text: string): number {
  const direct = moneyNumber(text);
  if (direct) return direct;
  const small: Record<string, number> = { صفر:0, یک:1, یکی:1, دو:2, سه:3, چهار:4, پنج:5, شش:6, هفت:7, هشت:8, نه:9, ده:10, یازده:11, دوازده:12, سیزده:13, چهارده:14, پانزده:15, شانزده:16, هفده:17, هجده:18, نوزده:19, بیست:20, سی:30, چهل:40, پنجاه:50, شصت:60, هفتاد:70, هشتاد:80, نود:90, صد:100, دویست:200, سیصد:300, چهارصد:400, پانصد:500, ششصد:600, هفتصد:700, هشتصد:800, نهصد:900 };
  const words = text.replace(/،/g, " ").split(/\s+/).filter(Boolean);
  let total=0, current=0;
  for (const w of words) {
    if (small[w] !== undefined) current += small[w];
    else if (w === "هزار" || w === "هزارتا") { total += (current || 1) * 1000; current=0; }
    else if (w === "میلیون" || w === "میلیونی") { total += (current || 1) * 1_000_000; current=0; }
    else if (w === "میلیارد" || w === "میلیاردی") { total += (current || 1) * 1_000_000_000; current=0; }
  }
  return total + current;
}

export function parseVoiceProduct(transcript: string): VoiceProductDraft {
  const text = transcript.trim();
  const nameMatch = text.match(/(?:کالا(?:ی)?|جنس)\s+(.+?)(?=\s+(?:کد|شماره|موجودی|تعداد|قیمت|خرید|فروش|واحد|حداقل)|[،,.]|$)/i);
  const name = (nameMatch?.[1] || text.split(/[،,.]/)[0] || "").replace(/^(یک|یه|این|اون)\s+/i, "").trim();
  const sku = text.match(/(?:کد|شماره(?:\s+کالا)?)\s*([A-Za-z0-9۰-۹_-]+)/i)?.[1] || "";
  const stockText = text.match(/(?:موجودی|تعداد)\s*(?:اولیه)?\s*(?:[=:]\s*)?([^،,.]+?)(?=\s+(?:عدد|تا|قیمت|کد|واحد|حداقل)|[،,.]|$)/i)?.[1] || "";
  const initialStock = firstNumber(stockText) || 0;
  const buyText = text.match(/(?:قیمت\s*خرید|خرید)\s*(?:[=:]\s*)?([^،,.]+?)(?=\s+(?:قیمت\s*فروش|فروش|موجودی|کد|واحد|حداقل)|[،,.]|$)/i)?.[1] || "";
  const saleText = text.match(/(?:قیمت\s*فروش|فروش)\s*(?:[=:]\s*)?([^،,.]+?)(?=\s+(?:قیمت\s*خرید|خرید|موجودی|کد|واحد|حداقل)|[،,.]|$)/i)?.[1] || "";
  const purchasePrice = spokenMoney(buyText);
  const salePrice = spokenMoney(saleText);
  const unitText = text.match(/(?:واحد)\s*(?:[=:]\s*)?(عدد|کیلو(?:گرم)?|گرم|لیتر|متر|بسته)/i)?.[1] || "عدد";
  const unit = unitText === "کیلو" || unitText === "کیلوگرم" ? "کیلوگرم" : unitText as VoiceProductDraft["unit"];
  const lowText = text.match(/(?:حداقل\s+موجودی|هشدار\s+موجودی)\s*(?:[=:]\s*)?([^،,.]+?)(?=\s+(?:عدد|تا)|[،,.]|$)/i)?.[1] || "";
  const lowStock = firstNumber(lowText) || 0;
  return { transcript:text, name, sku, unit, purchasePrice, salePrice, initialStock, lowStock };
}

export function parseVoiceProducts(transcript: string): VoiceProductDraft[] {
  const chunks = transcript.split(/(?:بعدی|و همچنین|همچنین|؛|\n)/).map(x => x.trim()).filter(Boolean);
  const drafts = chunks.map(parseVoiceProduct).filter(x => x.name || x.purchasePrice || x.salePrice || x.initialStock);
  return drafts.length ? drafts : [parseVoiceProduct(transcript)];
}

export function bindVoiceProductFieldAssistant(
  button: HTMLButtonElement,
  notify: (message: string) => void,
  onDraft: (draft: VoiceProductDraft) => Promise<void> | void,
  beforeListen?: () => Promise<boolean> | boolean
): void {
  button.addEventListener("click", async () => {
    if (beforeListen) {
      const shouldContinue = await beforeListen();
      if (!shouldContinue) return;
    }
    const available = await SpeechRecognition.available().catch(() => ({ available: false }));
    if (!available.available) { notify("تشخیص صدا در این دستگاه در دسترس نیست"); return; }
    const permission = await SpeechRecognition.requestPermissions().catch(() => null);
    if (permission && permission.speechRecognition !== "granted") {
      notify("اجازه دسترسی به میکروفون و تشخیص صدا لازم است");
      return;
    }
    button.disabled = true;
    button.textContent = "🎙 در حال شنیدن…";
    try {
      await prepareSpeechRecognition();
      const result = await SpeechRecognition.start({
        language: "fa-IR",
        maxResults: 3,
        partialResults: false,
        popup: false,
        prompt: "موجودی، قیمت خرید، قیمت فروش و حداقل موجودی کالا را بگویید",
      });
      const transcript = result.matches?.[0]?.trim() || "";
      if (!transcript) throw new Error("اطلاعات صوتی کالا تشخیص داده نشد");
      await onDraft(parseVoiceProduct(transcript));
      speakSaiSai("اطلاعات صوتی کالا اضافه شد. قبل از ثبت بررسی کنید.");
    } catch (error) {
      if (!/cancel|abort/i.test(error instanceof Error ? error.name + error.message : String(error))) {
        notify(error instanceof Error ? error.message : "تشخیص صدا ناموفق بود");
      }
    } finally {
      button.disabled = false;
      button.textContent = "🎙 تکمیل با صدا";
    }
  });
}

export function bindVoiceProductAssistant(onConfirm: (draft: VoiceProductDraft) => Promise<void>, notify: (message: string) => void, onConfirmMany?: (drafts: VoiceProductDraft[]) => Promise<void>): void {
  const button = document.querySelector<HTMLButtonElement>("#voice-product");
  if (!button) return;
  button.addEventListener("click", async () => {
    const available = await SpeechRecognition.available().catch(() => ({ available:false }));
    if (!available.available) { notify("تشخیص صدا در این دستگاه در دسترس نیست"); return; }
    const permission = await SpeechRecognition.requestPermissions().catch(() => null);
    if (permission && permission.speechRecognition !== "granted") { notify("اجازه دسترسی به میکروفون و تشخیص صدا لازم است"); return; }
    button.disabled=true; button.textContent="🎙 در حال شنیدن…";
    try {
      await prepareSpeechRecognition();
      const result=await SpeechRecognition.start({ language:"fa-IR", maxResults:3, partialResults:false, popup: false, prompt:"مشخصات کالا را به فارسی بگویید" });
      const transcript=result.matches?.[0]?.trim() || "";
      if (!transcript) throw new Error("مشخصات کالا تشخیص داده نشد");
      const drafts=parseVoiceProducts(transcript);
      const draft=drafts[0];
      speakSaiSai(drafts.length > 1 ? (String(drafts.length) + " کالا را تشخیص دادم. قبل از ثبت بررسی کنید.") : "مشخصات کالا را شنیدم. قبل از ثبت بررسی کنید.");
      const modal=document.createElement("div"); modal.className="modal-backdrop"; modal.id="voice-product-modal";
      if (drafts.length > 1) {
        modal.innerHTML='<section class="modal" role="dialog" aria-modal="true"><button class="modal-close" id="voice-product-close">×</button><span class="eyebrow">ورود گروهی کالا</span><h2>بررسی کالاها</h2><p class="muted">همه کالاهای تشخیص‌داده‌شده را قبل از ثبت بررسی کنید.</p><div id="vp-many"></div><div class="form-actions"><button class="secondary-button" id="vp-cancel">لغو</button><button class="primary-button" id="vp-confirm">تأیید و ثبت همه</button></div></section>';
        document.body.appendChild(modal);
        const list=modal.querySelector("#vp-many")!;
        list.innerHTML=drafts.map((d,i)=>'<div class="voice-product-item"><div class="form-grid"><label class="field"><span>نام کالا '+String(i+1)+'</span><input data-vp-field="name" data-vp-index="'+i+'" value="'+escapeHtml(d.name)+'"></label><label class="field"><span>کد کالا</span><input data-vp-field="sku" data-vp-index="'+i+'" value="'+escapeHtml(d.sku)+'"></label><label class="field"><span>موجودی اولیه</span><input type="number" data-vp-field="initialStock" data-vp-index="'+i+'" value="'+d.initialStock+'"></label><label class="field"><span>قیمت خرید</span><input type="number" data-vp-field="purchasePrice" data-vp-index="'+i+'" value="'+d.purchasePrice+'"></label><label class="field"><span>قیمت فروش</span><input type="number" data-vp-field="salePrice" data-vp-index="'+i+'" value="'+d.salePrice+'"></label><label class="field"><span>حداقل موجودی</span><input type="number" data-vp-field="lowStock" data-vp-index="'+i+'" value="'+d.lowStock+'"></label></div><small>واحد: '+d.unit+'</small></div>').join("");
        modal.querySelector("#voice-product-close")?.addEventListener("click",()=>modal.remove()); modal.querySelector("#vp-cancel")?.addEventListener("click",()=>modal.remove()); modal.querySelector("#vp-confirm")?.addEventListener("click",async()=>{
          modal.querySelectorAll<HTMLInputElement>("[data-vp-field]").forEach(input=>{ const i=Number(input.dataset.vpIndex); const field=input.dataset.vpField as keyof VoiceProductDraft; if(field==="name"||field==="sku") (drafts[i] as any)[field]=input.value.trim(); else (drafts[i] as any)[field]=Number(input.value)||0; });
          const invalid=drafts.find(d=>!d.name); if(invalid){ notify("نام یکی از کالاها خالی است"); return; }
          modal.remove(); if(onConfirmMany) await onConfirmMany(drafts); else for(const d of drafts) await onConfirm(d);
        });
        return;
      }
      modal.innerHTML='<section class="modal" role="dialog" aria-modal="true"><button class="modal-close" id="voice-product-close">×</button><span class="eyebrow">ثبت کالا با صدا</span><h2>بررسی اطلاعات کالا</h2><p class="muted">اطلاعات تشخیص‌داده‌شده را قبل از ثبت بررسی کنید.</p><div class="voice-transcript"><span>متن تشخیص‌داده‌شده</span><b id="vp-transcript"></b></div><div class="voice-draft-grid"><div><small>نام کالا</small><strong id="vp-name"></strong></div><div><small>کد کالا</small><strong id="vp-sku"></strong></div><div><small>واحد</small><strong id="vp-unit"></strong></div><div><small>موجودی اولیه</small><strong id="vp-stock"></strong></div><div><small>قیمت خرید</small><strong id="vp-buy"></strong></div><div><small>قیمت فروش</small><strong id="vp-sale"></strong></div><div><small>حداقل موجودی</small><strong id="vp-low"></strong></div></div><div class="form-actions"><button class="secondary-button" id="vp-cancel">لغو</button><button class="primary-button" id="vp-confirm">ثبت کالا</button></div></section>';
      document.body.appendChild(modal);
      const set=(id:string,v:string)=>{ const el=modal.querySelector<HTMLElement>(id); if(el) el.textContent=v; };
      set("#vp-transcript",draft.transcript); set("#vp-name",draft.name||"تشخیص داده نشد"); set("#vp-sku",draft.sku||"—"); set("#vp-unit",draft.unit); set("#vp-stock",String(draft.initialStock)); set("#vp-buy",draft.purchasePrice?draft.purchasePrice.toLocaleString("fa-IR"):"—"); set("#vp-sale",draft.salePrice?draft.salePrice.toLocaleString("fa-IR"):"—"); set("#vp-low",String(draft.lowStock));
      modal.querySelector("#voice-product-close")?.addEventListener("click",()=>modal.remove()); modal.querySelector("#vp-cancel")?.addEventListener("click",()=>modal.remove()); modal.querySelector("#vp-confirm")?.addEventListener("click",async()=>{ modal.remove(); await onConfirm(draft); });
    } catch(error) { if(!/cancel|abort/i.test(error instanceof Error?error.name+error.message:String(error))) notify(error instanceof Error?error.message:"تشخیص صدا ناموفق بود"); }
    finally { button.disabled=false; button.textContent="🎙 ثبت کالای جدید با صدا"; }
  });
}

export async function speakSaiSai(message: string): Promise<boolean> {
  const text = message.trim();
  if (!text) return false;

  // Try Android's native speech engine with both common Persian locale tags.
  if (Capacitor.isNativePlatform()) {
    for (const lang of ["fa-IR", "fa"]) {
      try {
        await TextToSpeech.stop().catch(() => undefined);
        await TextToSpeech.speak({
          text,
          lang,
          rate: 0.88,
          pitch: 1,
          volume: 1,
          queueStrategy: 0
        });
        return true;
      } catch {
        // Try another locale, then the WebView speech engine.
      }
    }
  }

  if (!("speechSynthesis" in window)) return false;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "fa-IR";
    utterance.rate = 0.88;
    utterance.pitch = 1;
    const voice = window.speechSynthesis.getVoices().find(item => /^fa(-|$)/i.test(item.lang));
    if (voice) utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
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
      await prepareSpeechRecognition();
      const result = await SpeechRecognition.start({
        language: "fa-IR",
        maxResults: 3,
        partialResults: false,
        popup: false,
        prompt: "فروش را به فارسی بگویید",
      });
      const transcript = result.matches?.[0]?.trim() || "";
      if (!transcript) throw new Error("صدایی تشخیص داده نشد");
      const draft = parseVoiceSale(transcript);
      speakSaiSai("صدایتان را شنیدم. اطلاعات فروش آماده بررسی است.");
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

export function bindVoiceQuestionAssistant(onAnswer: (question: string) => Promise<string>, notify: (message: string) => void): void {
  const button = document.querySelector<HTMLButtonElement>("#voice-query");
  if (!button) return;
  let isListening = false;
  let isProcessing = false;
  const originalLabel = button.textContent || "🔊 از سای‌سای بپرس";
  const resetVoiceButton = () => {
    isListening = false;
    button.disabled = false;
    button.textContent = originalLabel;
    button.removeAttribute("aria-pressed");
  };
  button.addEventListener("click", async () => {
    if (isListening) {
      // A second tap cancels listening and restores the button immediately.
      isListening = false;
      button.textContent = originalLabel;
      button.removeAttribute("aria-pressed");
      await SpeechRecognition.stop().catch(() => undefined);
      notify("شنیدن صدا لغو شد");
      return;
    }
    if (isProcessing) return;
    const available = await SpeechRecognition.available().catch(() => ({ available: false }));
    if (!available.available) {
      notify("تشخیص صدا در این دستگاه در دسترس نیست");
      return;
    }
    const permission = await SpeechRecognition.requestPermissions().catch(() => null);
    if (permission && permission.speechRecognition !== "granted") {
      notify("اجازه دسترسی به میکروفون و تشخیص صدا لازم است");
      return;
    }
    isProcessing = true;
    isListening = true;
    button.disabled = false;
    button.setAttribute("aria-pressed", "true");
    button.textContent = "✕ لغو شنیدن";
    try {
      await prepareSpeechRecognition();
      if (!isListening) return;
      let question = "";
      let lastError: unknown = null;
      // Android's recognizer can intermittently return ERROR_NO_MATCH for Persian.
      // Retry once after resetting the recognizer instead of immediately showing its English error.
      for (let attempt = 0; attempt < 2 && !question; attempt++) {
        try {
          if (attempt > 0) {
            await SpeechRecognition.stop().catch(() => undefined);
            await new Promise(resolve => setTimeout(resolve, 350));
          }
          const result = await SpeechRecognition.start({
            language: "fa-IR",
            maxResults: 3,
            partialResults: false,
            popup: false,
            prompt: attempt === 0 ? "سؤال خود را واضح و به فارسی از سای‌سای بپرسید" : "دوباره گوش می‌دهم؛ سؤال را کوتاه و واضح بگویید"
          });
          if (!isListening) return;
          question = result.matches?.find(item => item.trim().length > 0)?.trim() || "";
          if (!question) lastError = new Error("NO_MATCH");
        } catch (error) {
          lastError = error;
          const message = error instanceof Error ? error.name + " " + error.message : String(error);
          if (!/no.?match|didn.t understand|try again|speech|recognition|error.?7/i.test(message) || attempt === 1) throw error;
        }
      }
      await SpeechRecognition.stop().catch(() => undefined);
      if (!isListening) return;
      isListening = false;
      button.textContent = originalLabel;
      button.removeAttribute("aria-pressed");
      if (!question) {
        const message = lastError instanceof Error ? lastError.name + " " + lastError.message : String(lastError || "");
        if (/didn.t understand|try again|no.?match|error.?7/i.test(message) || message === "NO_MATCH") {
          throw new Error("صدایتان واضح تشخیص داده نشد. یک‌بار دیگر نزدیک میکروفون و در محیط آرام سؤال کنید.");
        }
        throw new Error("سؤالی تشخیص داده نشد؛ لطفاً دوباره تلاش کنید.");
      }
      const answer = await onAnswer(question);
      const spoken = await speakSaiSai(answer);
      notify(spoken ? answer : answer + "\n\nبرای شنیدن پاسخ، موتور تبدیل متن به گفتار فارسی را در تنظیمات گوشی فعال کنید.");
    } catch (error) {
      if (!/cancel|abort/i.test(error instanceof Error ? error.name + error.message : String(error))) {
        notify(error instanceof Error ? error.message : "پاسخ‌گویی ناموفق بود");
      }
    } finally {
      isProcessing = false;
      resetVoiceButton();
    }
  });
}
