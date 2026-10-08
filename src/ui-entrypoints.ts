import { Capacitor } from "@capacitor/core";

function openNewProduct(): void {
  const nav = document.querySelector<HTMLElement>('[data-nav="inventory"]');
  if (nav) nav.click();
  let tries = 0;
  const timer = window.setInterval(() => {
    const button = document.querySelector<HTMLButtonElement>("#new-product");
    if (button) {
      window.clearInterval(timer);
      button.click();
    } else if (++tries > 20) {
      window.clearInterval(timer);
    }
  }, 100);
}

function addDashboardEntryPoint(): void {
  if (!document.querySelector(".quick-grid") || document.querySelector("#quick-new-product")) return;
  const card = document.createElement("button");
  card.type = "button";
  card.id = "quick-new-product";
  card.className = "quick-card";
  card.innerHTML = "<b>＋</b><span>افزودن کالا</span><small>ثبت نام، قیمت و موجودی</small>";
  card.addEventListener("click", openNewProduct);
  document.querySelector(".quick-grid")?.appendChild(card);
}

function addInventoryShortcut(): void {
  const head = document.querySelector("#view .head-actions");
  if (!head || document.querySelector("#inventory-new-product-shortcut")) return;
  const button = document.createElement("button");
  button.id = "inventory-new-product-shortcut";
  button.className = "primary-button";
  button.type = "button";
  button.textContent = "＋ افزودن کالا";
  button.addEventListener("click", () => document.querySelector<HTMLButtonElement>("#new-product")?.click());
  head.prepend(button);
}

function addVoiceStatus(): void {
  if (!Capacitor.isNativePlatform() || document.querySelector("#voice-service-status")) return;
  const voiceButtons = document.querySelectorAll("#voice-sale,#voice-query,#voice-product");
  if (!voiceButtons.length) return;
  const host = voiceButtons[0].parentElement;
  if (!host || document.querySelector("#voice-service-status")) return;
  const note = document.createElement("small");
  note.id = "voice-service-status";
  note.className = "muted";
  note.textContent = "🎙 تشخیص صدا آماده است؛ با لمس دکمه، اجازه میکروفون را بدهید.";
  host.parentElement?.insertBefore(note, host);
}

function refreshEntryPoints(): void {
  addDashboardEntryPoint();
  addInventoryShortcut();
  addVoiceStatus();
}

const observer = new MutationObserver(refreshEntryPoints);
observer.observe(document.body, { childList: true, subtree: true });
window.setTimeout(refreshEntryPoints, 250);
