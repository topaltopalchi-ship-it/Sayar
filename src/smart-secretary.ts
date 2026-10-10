import { SpeechRecognition } from "@capacitor-community/speech-recognition";
import { TextToSpeech } from "@capacitor-community/text-to-speech";
import { Capacitor } from "@capacitor/core";

type ChatMessage = { role: "user" | "assistant"; text: string };
let messages: ChatMessage[] = [];
let listening = false;

function safe(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function addMessage(role: ChatMessage["role"], text: string): void {
  messages.push({ role, text });
  const list = document.querySelector<HTMLElement>("#secretary-messages");
  if (list) {
    const item = document.createElement("div");
    item.className = `secretary-message ${role}`;
    item.textContent = text;
    list.appendChild(item);
    list.scrollTop = list.scrollHeight;
  }
}

function localReply(text: string): string {
  const q = text.trim();
  if (/^(سلام|درود|صبح بخیر|عصر بخیر)/.test(q)) return "سلام! منشی سای‌سای آماده‌ام. چه کاری برایتان انجام بدهم؟";
  if (/ساعت|تاریخ|امروز/.test(q)) return `امروز ${new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "full" }).format(new Date()) است. برای ساعت دقیق، ساعت گوشی را بررسی کنید.`;
  if (/یادآور|یادم بنداز|یادآوری/.test(q)) return "بخش گفت‌وگو آماده است؛ برای یادآوری واقعی باید زمان و اجازه اعلان‌ها مشخص شود. اتصال یادآورها در مرحله بعد اضافه می‌شود.";
  return "پیامتان را دریافت کردم. گفت‌وگوی فعلی هنوز به مدل هوش مصنوعی متصل نیست؛ برای پاسخ هوشمند واقعی باید یک بک‌اند امن وصل کنیم تا کلید API داخل برنامه اندروید قرار نگیرد.";
}

async function speak(text: string): Promise<void> {
  try {
    await TextToSpeech.speak({ text, lang: "fa-IR", rate: 0.92, pitch: 1.0, volume: 1.0 });
  } catch {
    if ("speechSynthesis" in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }
}

async function send(text: string): Promise<void> {
  const value = text.trim();
  if (!value) return;
  addMessage("user", value);
  const reply = localReply(value);
  addMessage("assistant", reply);
  await speak(reply);
}

function close(): void {
  document.querySelector("#secretary-modal")?.remove();
  if (listening && Capacitor.isNativePlatform()) void SpeechRecognition.stop().catch(() => undefined);
  listening = false;
}

export function openSmartSecretary(): void {
  if (document.querySelector("#secretary-modal")) return;
  messages = [];
  document.body.insertAdjacentHTML("beforeend", `
    <div class="modal-backdrop" id="secretary-modal">
      <section class="modal secretary-modal" role="dialog" aria-modal="true" aria-labelledby="secretary-title">
        <button class="modal-close" id="secretary-close" aria-label="بستن">×</button>
        <span class="eyebrow">دستیار صوتی و متنی</span>
        <h2 id="secretary-title">منشی هوشمند سای‌سای</h2>
        <p class="muted">فارسی صحبت کنید یا پیام بنویسید.</p>
        <div id="secretary-messages" class="secretary-messages" aria-live="polite"></div>
        <form id="secretary-form" class="secretary-form">
          <input id="secretary-input" type="text" autocomplete="off" placeholder="پیام خود را بنویسید…" aria-label="پیام" />
          <button class="primary-button" type="submit">ارسال</button>
        </form>
        <button class="secondary-button wide" id="secretary-mic" type="button">🎙 صحبت کردن</button>
        <small class="muted">نسخه اولیه: برای پاسخ هوش مصنوعی آنلاین، اتصال امن سرور لازم است.</small>
      </section>
    </div>`);
  document.querySelector("#secretary-close")?.addEventListener("click", close);
  document.querySelector("#secretary-modal")?.addEventListener("click", event => {
    if (event.target === event.currentTarget) close();
  });
  document.querySelector("#secretary-form")?.addEventListener("submit", event => {
    event.preventDefault();
    const input = document.querySelector<HTMLInputElement>("#secretary-input");
    if (input) { const value = input.value; input.value = ""; void send(value); }
  });
  document.querySelector("#secretary-mic")?.addEventListener("click", async () => {
    const button = document.querySelector<HTMLButtonElement>("#secretary-mic");
    if (!button) return;
    try {
      if (!Capacitor.isNativePlatform() && !("SpeechRecognition" in window || "webkitSpeechRecognition" in window)) {
        addMessage("assistant", "تشخیص گفتار در این مرورگر در دسترس نیست. لطفاً پیام را تایپ کنید.");
        return;
      }
      const permission = await SpeechRecognition.requestPermissions();
      if (permission.speechRecognition !== "granted") {
        addMessage("assistant", "برای استفاده از میکروفون، اجازه تشخیص گفتار را فعال کنید.");
        return;
      }
      listening = true;
      button.disabled = true;
      button.textContent = "در حال شنیدن…";
      await SpeechRecognition.start({ language: "fa-IR", maxResults: 1, partialResults: false, popup: false });
      const result = await SpeechRecognition.addListener("listeningState", state => {
        if (!state.status || state.status === "stopped") {
          listening = false;
          button.disabled = false;
          button.textContent = "🎙 صحبت کردن";
        }
      });
      void result;
      // Result events are handled by the plugin listener below.
    } catch {
      listening = false;
      button.disabled = false;
      button.textContent = "🎙 صحبت کردن";
      addMessage("assistant", "تشخیص صدا شروع نشد. اجازه میکروفون و سرویس گفتار گوشی را بررسی کنید.");
    }
  });
  void SpeechRecognition.addListener("partialResults", event => {
    const transcript = event.matches?.[0]?.trim();
    if (!transcript || !document.querySelector("#secretary-modal")) return;
    const input = document.querySelector<HTMLInputElement>("#secretary-input");
    if (input) input.value = transcript;
  });
  void SpeechRecognition.addListener("listeningState", event => {
    if (event.status === "stopped") {
      listening = false;
      const button = document.querySelector<HTMLButtonElement>("#secretary-mic");
      if (button) { button.disabled = false; button.textContent = "🎙 صحبت کردن"; }
      const input = document.querySelector<HTMLInputElement>("#secretary-input");
      if (input?.value.trim()) { const value = input.value; input.value = ""; void send(value); }
    }
  });
  addMessage("assistant", "سلام! منشی سای‌سای آماده است. می‌توانید تایپ کنید یا دکمه میکروفون را بزنید.");
}
