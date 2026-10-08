import "./style.css";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { Printer } from "@gingersnapsoftware/capacitor-plugin-printer";
import { LocalNotifications } from "@capacitor/local-notifications";
import * as XLSX from "xlsx";
import html2canvas from "html2canvas";
import {
  addParty, addProduct, updateProduct, deleteProduct, addSale, addSettlement, addExpense, addStockAdjustment, getDashboard, getStock, updateTransaction, deleteTransaction, updateExpense, deleteExpense,
  listParties, updateParty, deleteParty, listProducts, listTransactions, listExpenses, listMovements, listOrders, calculateHistoricalCOGS, repairDataIntegrity
} from "./db";
import { createMonthlyCheckout, getSubscription, type Subscription } from "./billing";
import { lineTotal, type Order, type Party, type Product, type Transaction, type TransactionLine } from "./domain";
import { formatMoney, getCurrencyUnit, setCurrencyUnit, getCurrencyLabel, parseMoneyInput, moneyInputValue } from "./settings";
import { openPurchaseModal } from "./purchase-ui";
import { accountModal, accountLedgerModal, accountsView, bindAccountLedger, bindAccountModal, bindTransferModal, transferModal } from "./accounts-ui";
import { getAccountBalances, listAccounts } from "./db";
import { checksView, checkModal, bindCheckModal, bindCheckStatuses, bindCheckActions } from "./checks-ui";
import { jalaliToGregorianDate, todayJalaliInput, formatJalaliInput, toPersianDigits } from "./calendar";

type Tab = "dashboard" | "sales" | "purchases" | "orders" | "inventory" | "people" | "reports" | "more" | "checks";

const app = document.querySelector<HTMLDivElement>("#app")!;
const navItems: Array<[Tab, string, string]> = [
  ["dashboard", "داشبورد", "⌂"], ["sales", "فروش", "↗"], ["purchases", "خرید", "↙"],
  ["orders", "سفارشات", "▣"], ["inventory", "موجودی", "▤"], ["people", "اشخاص", "♙"], ["reports", "گزارش‌ها", "◫"], ["more", "خزانه", "▣"], ["checks", "چک‌ها", "✓"],
];
const money = new Intl.NumberFormat("fa-IR");

function numericValue(value: string | number | undefined | null): number {
  const normalized = String(value ?? "")
    .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[٬,]/g, "")
    .trim();
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function signedNumericValue(value: string | number | undefined | null): number {
  const normalized = String(value ?? "")
    .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[٬,]/g, "")
    .trim()
    .replace(/(?!^)-/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}
const dateTime = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
});
let activeTab: Tab = "dashboard";
const UI_MODE_KEY = "sai-sai-ui-mode";
function isProfessionalMode(): boolean { return localStorage.getItem(UI_MODE_KEY) === "professional"; }
function setProfessionalMode(value: boolean): void { localStorage.setItem(UI_MODE_KEY, value ? "professional" : "simple"); }
function settingsModal(): string {
  const unit = getCurrencyUnit();
  const professional = isProfessionalMode();
  return `<div class="modal-backdrop" id="settings-modal"><section class="modal ui-mode-modal"><button class="modal-close" id="settings-close">×</button><span class="eyebrow">تنظیمات سای‌سای</span><h2>تنظیمات پایه</h2><label class="field"><span>واحد نمایش مبلغ</span><select id="currency-unit"><option value="toman" ${unit === "toman" ? "selected" : ""}>تومان</option><option value="rial" ${unit === "rial" ? "selected" : ""}>ریال</option></select></label><label class="professional-toggle"><input id="professional-mode" type="checkbox" ${professional ? "checked" : ""}><span><b>نسخه حرفه‌ای</b><small>گزارش‌ها و ابزارهای مدیریتی پیشرفته نمایش داده شوند.</small></span></label><button class="secondary-button wide" id="subscription-settings">مدیریت اشتراک</button><button class="primary-button wide" id="settings-save">ذخیره و اعمال</button></section></div>`;
}
function bindSettingsModal(): void {
  const modal = document.querySelector<HTMLDivElement>("#settings-modal");
  if (!modal) return;
  modal.querySelector("#settings-close")?.addEventListener("click", () => modal.remove());
  modal.querySelector("#subscription-settings")?.addEventListener("click", async () => { modal.remove(); const subscription = await getSubscription().catch(() => ({ status: "none", plan: "none", expiresAt: null } as Subscription)); showSubscription(subscription); });
  modal.querySelector("#settings-save")?.addEventListener("click", async () => {
    const unit = modal.querySelector<HTMLSelectElement>("#currency-unit")?.value === "toman" ? "toman" : "rial";
    setCurrencyUnit(unit);
    setProfessionalMode(modal.querySelector<HTMLInputElement>("#professional-mode")?.checked ?? false);
    modal.remove();
    await render();
    showToast("واحد مبلغ ذخیره شد");
  });
}
function uiModeModal(): string {
  const professional = isProfessionalMode();
  return `<div class="modal-backdrop" id="ui-mode-modal"><section class="modal ui-mode-modal"><button class="modal-close" id="ui-mode-close">×</button><span class="eyebrow">شخصی‌سازی سای‌سای</span><h2>حالت کاربری</h2><p class="muted">اگر حسابدار نیستید، حالت ساده منوها و گزینه‌های ضروری را خلوت نگه می‌دارد.</p><label class="professional-toggle"><input id="professional-mode" type="checkbox" ${professional ? "checked" : ""}><span><b>نسخه حرفه‌ای</b><small>گزارش‌های پیشرفته، تنظیمات بیشتر و ابزارهای مدیریتی نمایش داده شوند.</small></span></label><button class="secondary-button wide" id="subscription-settings">مدیریت اشتراک</button><div class="mode-hint">${professional ? "حالت حرفه‌ای فعال است." : "حالت ساده برای استفاده روزمره فعال است."}</div><button class="primary-button wide" id="ui-mode-save">ذخیره و اعمال</button></section></div>`;
}
function bindUiModeModal(): void {
  const modal = document.querySelector<HTMLDivElement>("#ui-mode-modal");
  if (!modal) return;
  modal.querySelector("#ui-mode-close")?.addEventListener("click", () => modal.remove());
  modal.querySelector("#subscription-settings")?.addEventListener("click", async () => { modal.remove(); const subscription = await getSubscription().catch(() => ({ status: "none", plan: "none", expiresAt: null } as Subscription)); showSubscription(subscription); });
  modal.querySelector("#ui-mode-save")?.addEventListener("click", async () => {
    const enabled = modal.querySelector<HTMLInputElement>("#professional-mode")?.checked ?? false;
    setProfessionalMode(enabled);
    if (!enabled && (activeTab === "reports" || activeTab === "more" || activeTab === "checks")) activeTab = "dashboard";
    modal.remove();
    await render();
    showToast(enabled ? "حالت حرفه‌ای فعال شد" : "حالت ساده فعال شد");
  });
}

let products: Product[] = [];
let parties: Party[] = [];

const rial = (value: number) => formatMoney(value);
const dateLabel = (value: number) => dateTime.format(new Date(value));

function showToast(message: string): void {
  const toast = document.querySelector<HTMLDivElement>("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2400);
}

function layout(content: string, subscription: Subscription): void {
  app.innerHTML = `
    <main class="shell">
      <header class="topbar">
        <div class="brand-block"><img class="brand-logo" src="/icon-192.svg" alt="لوگوی سای‌سای"><div><span class="eyebrow">مدیریت مالی و فروش</span><h1>سای‌سای</h1></div></div>
        <div class="header-actions">
          <span class="plan-pill ${subscription.status}">${subscription.status === "active" ? (subscription.isTrial ? "دوره رایگان ۳۰ روزه" : "اشتراک فعال") : "اشتراک لازم است"}</span>
          <button class="icon-button" id="settings" aria-label="حالت کاربری">⚙</button>
        </div>
      </header>
      <div id="view">${content}</div>
      <nav class="bottom-nav" aria-label="ناوبری اصلی">
        ${navItems.filter(([id]) => isProfessionalMode() || (id !== "reports" && id !== "more" && id !== "checks")).map(([id,label,icon]) => `<button class="nav-item ${activeTab === id ? "active" : ""}" data-nav="${id}"><span>${icon}</span><small>${label}</small></button>`).join("")}
      </nav>
      <div id="toast" class="toast" role="status" aria-live="polite"></div>
    </main>`;
  document.querySelector<HTMLButtonElement>("#settings")?.addEventListener("click", () => { document.body.insertAdjacentHTML("beforeend", settingsModal()); bindSettingsModal(); });
  document.querySelectorAll<HTMLButtonElement>("[data-subscribe]").forEach(b => b.addEventListener("click", subscribe));
}

function stat(label: string, value: string, tone: string): string {
  return `<article class="stat-card ${tone}"><span>${label}</span><strong>${value}</strong></article>`;
}

function pageHead(eyebrow: string, title: string, text: string, action = ""): string {
  return `<section class="page-head"><span class="eyebrow">${eyebrow}</span><div class="page-head-row"><div><h2>${title}</h2><p class="muted">${text}</p></div>${action}</div></section>`;
}

async function dashboardView(subscription: Subscription): Promise<string> {
  const d = await getDashboard();
  const recent = d.recent.length ? d.recent.map(t => transactionRow(t)).join("") :
    `<div class="empty-inline"><span>◌</span><p>هنوز تراکنشی ثبت نشده است.</p></div>`;

  return `
    <section class="hero"><div><p class="hero-kicker">داشبورد مدیریت</p><h2>وضعیت کسب‌وکار شما</h2><p class="muted">فروش، دریافت، مطالبات و موجودی را از یکجا کنترل کنید.</p></div><div class="hero-mark">س</div></section>
    ${subscription.status !== "active" ? `<section class="subscription-card"><div><span class="eyebrow">اشتراک سای‌سای</span><h3>برای استفاده از نسخه کامل، اشتراک ماهانه فعال کنید.</h3><p class="muted">بعد از تأیید موفق پرداخت، دسترسی از سمت سرور فعال می‌شود.</p></div><button class="primary-button" data-subscribe>خرید اشتراک ماهانه</button></section>` : ""}
    <section class="stats-grid">
      ${stat("فروش امروز", rial(d.salesToday), "primary")}${stat("دریافت امروز", rial(d.receiptsToday), "success")}
      ${isProfessionalMode() ? stat("مطالبات", rial(d.receivables), "warning") + stat("موجودی کم", `${money.format(d.lowStock)} کالا`, "danger") : ""}
    </section>
    <section class="section"><div class="section-head"><h3>${isProfessionalMode() ? "عملیات سریع" : "امروز چه کاری دارید؟"}</h3><span class="muted">${isProfessionalMode() ? "ثبت سریع" : "ساده و سریع"}</span></div>
      <div class="quick-grid">
        <button class="quick-card" data-action="sale"><b>＋</b><span>${isProfessionalMode() ? "ثبت فروش" : "فروش جدید"}</span><small>${isProfessionalMode() ? "صدور فاکتور فروش" : "یک فاکتور در چند مرحله"}</small></button>
        <button class="quick-card" data-action="purchase"><b>⇩</b><span>${isProfessionalMode() ? "ثبت خرید" : "خرید کالا"}</span><small>${isProfessionalMode() ? "ثبت خرید و افزایش موجودی" : "موجودی را بیشتر کنید"}</small></button>
        <button class="quick-card" data-action="receipt"><b>↙</b><span>دریافت وجه</span><small>ثبت پول دریافتی از مشتری</small></button>
        ${isProfessionalMode() ? `<button class="quick-card" data-action="expense"><b>−</b><span>ثبت هزینه</span><small>هزینه‌های کسب‌وکار</small></button>` : `<button class="quick-card" data-nav-shortcut="inventory"><b>▤</b><span>کالاها</span><small>مشاهده و مدیریت موجودی</small></button>`}
      </div>
    </section>
    <section class="section panel"><div class="section-head"><h3>آخرین تراکنش‌ها</h3><span class="muted">۵ مورد اخیر</span></div>${recent}</section>`;
}

function transactionRow(t: Transaction): string {
  const labels: Record<Transaction["type"], string> = {
    sale: "فروش", purchase: "خرید", receipt: "دریافت", payment: "پرداخت", expense: "هزینه", stockAdjustment: "اصلاح موجودی"
  };
  const icons: Record<Transaction["type"], string> = { sale: "↗", purchase: "↙", receipt: "↓", payment: "↑", expense: "−", stockAdjustment: "±" };
  return `<div class="transaction-row"><div class="transaction-icon">${icons[t.type]}</div><div class="transaction-main"><strong>${labels[t.type]}${t.invoiceNumber ? ` · ${t.invoiceNumber}` : ""}</strong><small>${t.description || dateLabel(t.date)} · ${dateLabel(t.date)}</small></div><b>${rial(t.amount)}</b></div>`;
}

const INVOICE_BRANDING_KEY = "sai-sai-invoice-branding";

type InvoiceBranding = { signature?: string; stamp?: string; slogan?: string; showSignature: boolean; showStamp: boolean; showSlogan: boolean };

function getInvoiceBranding(): InvoiceBranding {
  try {
    const value = JSON.parse(localStorage.getItem(INVOICE_BRANDING_KEY) || "{}") as Partial<InvoiceBranding>;
    return { signature: value.signature, stamp: value.stamp, slogan: value.slogan, showSignature: value.showSignature !== false, showStamp: value.showStamp !== false, showSlogan: value.showSlogan !== false };
  } catch { return { showSignature: true, showStamp: true, showSlogan: true }; }
}
function saveInvoiceBranding(value: InvoiceBranding): void { localStorage.setItem(INVOICE_BRANDING_KEY, JSON.stringify(value)); }
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("خواندن فایل ناموفق بود")); reader.readAsDataURL(file); });
}
function invoiceBrandingModal(): string {
  const b = getInvoiceBranding();
  return '<div class="modal-backdrop" id="invoice-branding-modal"><section class="modal">' +
    '<button class="modal-close" id="branding-close">×</button><span class="eyebrow">تنظیمات فاکتور</span><h2>امضا، مهر و شعار</h2><p class="muted">یک‌بار ذخیره کن تا در همه فاکتورها قابل استفاده باشد.</p>' +
    '<label class="field"><span>امضای آماده</span><input id="branding-signature" type="file" accept="image/png,image/jpeg,image/webp"></label>' +
    (b.signature ? '<div class="branding-preview"><img src="' + b.signature + '" alt="امضای ذخیره‌شده"><button type="button" id="remove-signature">حذف امضا</button></div>' : '') +
    '<label class="field"><span>مهر آماده</span><input id="branding-stamp" type="file" accept="image/png,image/jpeg,image/webp"></label>' +
    (b.stamp ? '<div class="branding-preview"><img src="' + b.stamp + '" alt="مهر ذخیره‌شده"><button type="button" id="remove-stamp">حذف مهر</button></div>' : '') +
    '<label class="field"><span>شعار آماده</span><input id="branding-slogan" type="file" accept="image/png,image/jpeg,image/webp"></label>' +
    (b.slogan ? '<div class="branding-preview"><img src="' + b.slogan + '" alt="شعار ذخیره‌شده"><button type="button" id="remove-slogan">حذف شعار</button></div>' : '') +
    '<label class="check-field"><input id="show-signature" type="checkbox" ' + (b.showSignature ? 'checked' : '') + '><span>نمایش امضا روی فاکتورها</span></label>' +
    '<label class="check-field"><input id="show-stamp" type="checkbox" ' + (b.showStamp ? 'checked' : '') + '><span>نمایش مهر روی فاکتورها</span></label>' +
    '<label class="check-field"><input id="show-slogan" type="checkbox" ' + (b.showSlogan ? 'checked' : '') + '><span>نمایش شعار روی فاکتورها</span></label>' +
    '<button class="primary-button wide" id="branding-save">ذخیره تنظیمات</button></section></div>';
}
function bindInvoiceBrandingModal(): void {
  const modal = document.querySelector<HTMLDivElement>("#invoice-branding-modal")!;
  let b = getInvoiceBranding();
  const handle = async (id: string, key: "signature" | "stamp" | "slogan") => {
    const input = modal.querySelector<HTMLInputElement>("#" + id);
    if (input?.files?.[0]) b = { ...b, [key]: await fileToDataUrl(input.files[0]) };
  };
  modal.querySelector("#branding-close")?.addEventListener("click", () => modal.remove());
  modal.querySelector("#branding-save")?.addEventListener("click", async () => {
    try {
      await handle("branding-signature", "signature"); await handle("branding-stamp", "stamp"); await handle("branding-slogan", "slogan");
      b = { ...b, showSignature: modal.querySelector<HTMLInputElement>("#show-signature")!.checked, showStamp: modal.querySelector<HTMLInputElement>("#show-stamp")!.checked, showSlogan: modal.querySelector<HTMLInputElement>("#show-slogan")!.checked };
      saveInvoiceBranding(b); modal.remove(); showToast("تنظیمات فاکتور ذخیره شد");
    } catch (e) { showToast(e instanceof Error ? e.message : "ذخیره تنظیمات ناموفق بود"); }
  });
  [["remove-signature","signature"],["remove-stamp","stamp"],["remove-slogan","slogan"]].forEach(([id,key]) => modal.querySelector("#"+id)?.addEventListener("click", () => { saveInvoiceBranding({ ...b, [key]: undefined }); modal.remove(); }));
}
function invoiceModal(t: Transaction, productMap: Map<string, Product>, partyMap: Map<string, Party>): string {
  const party = t.partyId ? partyMap.get(t.partyId) : undefined;
  const rows = t.lines.map((line, i) => {
    const p = productMap.get(line.productId);
    return `<tr><td>${money.format(i + 1)}</td><td><strong>${p?.name || "کالای حذف‌شده"}</strong></td><td>${money.format(line.quantity)} ${p?.unit || ""}</td><td>${rial(line.unitPrice)}</td><td>${rial(line.discount)}</td><td><strong>${rial(lineTotal(line))}</strong></td></tr>`;
  }).join("");
  const title = t.type === "purchase" ? "فاکتور خرید" : "فاکتور فروش";
  const branding = getInvoiceBranding();
  return `<div class="modal-backdrop invoice-backdrop" id="invoice-modal">
    <section class="modal invoice-modal" role="dialog" aria-modal="true" aria-label="${title}">
      <button class="modal-close no-print" id="invoice-close" aria-label="بستن">×</button>
      <header class="invoice-head">
        <div>
          <span class="eyebrow">سای‌سای · مدیریت مالی و فروش</span>
          <h2>${title}</h2>
          <p>شماره: ${t.invoiceNumber || "بدون شماره"} · ${dateLabel(t.date)}</p>
        </div>
        <img class="invoice-brand-logo" src="/icon-192.svg" alt="سای‌سای">
      </header>
      ${t.type === "sale" && t.amount > t.paid ? '<div class="invoice-unsettled">تسویه نشده</div>' : ""}
      <div class="invoice-party">
        <div><span>مشتری / طرف حساب</span><strong class="invoice-customer-name">${party?.name || "ثبت نشده"}</strong><small>${party?.phone ? "تماس: " + party.phone : "شماره تماس ثبت نشده"}</small></div>
      </div>
      <div class="invoice-section-title">اقلام فاکتور</div>
      <div class="invoice-table-wrap">
        <table class="invoice-table" aria-label="اقلام فاکتور">
          <thead><tr><th>#</th><th>کالا</th><th>مقدار</th><th>قیمت واحد</th><th>تخفیف</th><th>جمع</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="6">بدون ردیف</td></tr>'}</tbody>
        </table>
      </div>
      <div class="invoice-summary">
        <div><span>جمع فاکتور</span><b>${rial(t.amount)}</b></div>
        <div><span>پرداخت‌شده</span><b>${rial(t.paid)}</b></div>
        <div class="invoice-balance"><span>مانده</span><b>${rial(Math.max(0, t.amount - t.paid))}</b></div>
      </div>
      <div class="invoice-signatures">
        ${branding.showSlogan && branding.slogan ? '<img class="invoice-slogan" src="' + branding.slogan + '" alt="شعار">' : ""}
        ${branding.showStamp && branding.stamp ? '<img class="invoice-stamp" src="' + branding.stamp + '" alt="مهر">' : ""}
        ${branding.showSignature && branding.signature ? '<img class="invoice-signature" src="' + branding.signature + '" alt="امضا">' : ""}
      </div>
      <div class="invoice-branding no-print">
        <button class="secondary-button" id="invoice-branding-settings">⚙ امضا، مهر و شعار</button>
      </div>
      <div class="invoice-actions no-print">
        <button class="secondary-button" id="invoice-share">ارسال فاکتور</button>
        <button class="primary-button" id="invoice-print">چاپ / ذخیره PDF</button>
      </div>
    </section>
  </div>`;
}

async function shareInvoiceAsImage(invoiceElement: HTMLElement, title: string, invoiceNumber?: string): Promise<void> {
  const images = Array.from(invoiceElement.querySelectorAll("img"));
  await Promise.all(images.map(img => img.complete ? Promise.resolve() : new Promise<void>(resolve => {
    img.addEventListener("load", () => resolve(), { once: true });
    img.addEventListener("error", () => resolve(), { once: true });
  })));

  const canvas = await html2canvas(invoiceElement, {
    backgroundColor: "#f7fbff",
    scale: Math.min(2, Math.max(1, window.devicePixelRatio || 1)),
    useCORS: true,
    logging: false,
    ignoreElements: element => element.classList.contains("no-print"),
  });
  const dataUrl = canvas.toDataURL("image/jpeg", 0.94);
  const base64 = dataUrl.split(",")[1];
  if (!base64) throw new Error("تصویر فاکتور ساخته نشد");

  const safeNumber = (invoiceNumber || String(Date.now())).replace(/[^a-zA-Z0-9_-]/g, "_");
  const filename = `sai-sai-invoice-${safeNumber}.jpg`;

  if (nativeApp()) {
    await shareBase64File(filename, base64, title);
    return;
  }

  const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
  const blob = new Blob([bytes], { type: "image/jpeg" });
  const file = new File([blob], filename, { type: "image/jpeg" });
  if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
    await navigator.share({ title, text: "فاکتور سای‌سای", files: [file] });
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("تصویر فاکتور آماده شد");
}

async function openInvoice(t: Transaction): Promise<void> {
  const [productList, partyList] = await Promise.all([listProducts(), listParties()]);

  document.querySelector("#invoice-modal")?.remove();

  // Build the node explicitly instead of relying on body.innerHTML. This is
  // more reliable in Android WebView immediately after saving a sale.
  const wrapper = document.createElement("div");
  wrapper.innerHTML = invoiceModal(
    t,
    new Map(productList.map(p => [p.id, p])),
    new Map(partyList.map(p => [p.id, p])),
  ).trim();

  const invoice = wrapper.firstElementChild as HTMLDivElement | null;
  if (!invoice || invoice.id !== "invoice-modal") {
    throw new Error("پنجره فاکتور ساخته نشد");
  }

  document.body.appendChild(invoice);
  invoice.style.zIndex = "1000";
  invoice.scrollTop = 0;

  invoice.querySelector("#invoice-close")?.addEventListener("click", () => {
    invoice.remove();
    void render();
  });
  invoice.querySelector("#invoice-print")?.addEventListener("click", async () => {
    try {
      await printHtml("فاکتور سای‌سای", invoice.querySelector(".invoice-modal")?.outerHTML || invoice.innerHTML);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "چاپ / PDF در دسترس نیست");
    }
  });
  invoice.querySelector("#invoice-share")?.addEventListener("click", async () => {
    const title = t.type === "purchase" ? "فاکتور خرید سای‌سای" : "فاکتور فروش سای‌سای";
    const invoiceElement = invoice.querySelector<HTMLElement>(".invoice-modal");
    if (!invoiceElement) {
      showToast("فاکتور برای ارسال آماده نیست");
      return;
    }
    const button = invoice.querySelector<HTMLButtonElement>("#invoice-share");
    if (button) { button.disabled = true; button.textContent = "در حال آماده‌سازی…"; }
    try {
      await shareInvoiceAsImage(invoiceElement, title, t.invoiceNumber);
    } catch (error) {
      if (error instanceof Error && /cancel|abort/i.test(error.name + error.message)) return;
      showToast("ارسال فاکتور ناموفق بود؛ دوباره تلاش کنید");
    } finally {
      if (button) { button.disabled = false; button.textContent = "ارسال فاکتور"; }
    }
  });
  invoice.querySelector("#invoice-branding-settings")?.addEventListener("click", () => { document.body.insertAdjacentHTML("beforeend", invoiceBrandingModal()); bindInvoiceBrandingModal(); });
}

function saleModal(existing?: Transaction): string {
  const productOptions = products.map(p => `<option value="${p.id}">${p.name} — ${rial(p.salePrice)} / ${p.unit}</option>`).join("");
  const partyOptions = parties.filter(p => p.type === "customer" || p.type === "both").map(p => `<option value="${p.id}">${p.name}</option>`).join("");
  const accountOptions = (window as typeof window & { __saiAccounts?: {id:string;name:string;type:string}[] }).__saiAccounts?.map(a => `<option value="${a.id}">${a.name}</option>`).join("") || "";
  return `
    <div class="modal-backdrop" id="sale-modal"><section class="modal" role="dialog" aria-modal="true">
      <button class="modal-close" id="sale-close">×</button><span class="eyebrow">فاکتور فروش</span><h2>${existing ? "ویرایش فروش" : "ثبت فروش"}</h2>
      <label class="field"><span>کالا</span><select id="sale-product">${productOptions}</select></label>
      <div class="form-grid"><label class="field"><span>مقدار</span><input id="sale-quantity" type="text" inputmode="decimal" autocomplete="off" value="${existing?.lines[0]?.quantity ?? 1}"></label>
      <label class="field"><span>تخفیف (${getCurrencyLabel()})</span><input id="sale-discount" type="text" inputmode="numeric" autocomplete="off" value="${moneyInputValue(existing?.lines[0]?.discount ?? 0)}"></label></div>
      <label class="field"><span>مشتری</span><select id="sale-party"><option value="">بدون انتخاب</option>${partyOptions}</select></label>
      <label class="field"><span>مبلغ پرداختی (${getCurrencyLabel()})</span><input id="sale-paid" type="text" inputmode="numeric" autocomplete="off" value="${moneyInputValue(existing?.paid ?? 0)}"></label><label class="field"><span>دریافت به</span><select id="sale-account"><option value="">بدون انتخاب حساب</option>${accountOptions}</select></label>
      <div class="sale-summary"><span>مبلغ فاکتور</span><strong id="sale-total">۰ ریال</strong></div>
      <button class="primary-button wide" id="sale-submit">${existing ? "ذخیره تغییرات فاکتور" : "ثبت فاکتور و کاهش موجودی"}</button>
    </section></div>`;
}

async function openSaleModal(existing?: Transaction): Promise<void> {
  products = await listProducts(); parties = await listParties();
  (window as typeof window & { __saiAccounts?: unknown[] }).__saiAccounts = await listAccounts();
  if (!products.length) { showToast("ابتدا یک کالا در موجودی ثبت کنید"); return; }
  document.body.insertAdjacentHTML("beforeend", saleModal(existing));
  const modal = document.querySelector<HTMLDivElement>("#sale-modal")!;
  const product = modal.querySelector<HTMLSelectElement>("#sale-product")!;
  const quantity = modal.querySelector<HTMLInputElement>("#sale-quantity")!;
  const discount = modal.querySelector<HTMLInputElement>("#sale-discount")!;
  const paid = modal.querySelector<HTMLInputElement>("#sale-paid")!;
  const total = modal.querySelector<HTMLElement>("#sale-total")!;
  if (existing) { if (existing.lines[0]) product.value = existing.lines[0].productId; modal.querySelector<HTMLSelectElement>("#sale-party")!.value = existing.partyId || ""; modal.querySelector<HTMLSelectElement>("#sale-account")!.value = existing.accountId || ""; }
  const update = () => {
    const p = products.find(x => x.id === product.value);
    total.textContent = rial(Math.max(0, numericValue(quantity.value) * (p?.salePrice ?? 0) - numericValue(discount.value)));
  };
  [product, quantity, discount].forEach(el => el.addEventListener("input", update));
  product.addEventListener("change", update);
  modal.querySelector("#sale-close")?.addEventListener("click", () => modal.remove());
  modal.querySelector("#sale-submit")?.addEventListener("click", async () => {
    try {
      const p = products.find(x => x.id === product.value); const qty = numericValue(quantity.value);
      if (!p || qty <= 0) throw new Error("کالا و مقدار فروش را بررسی کنید");
      const disc = parseMoneyInput(discount.value);
      const amount = Math.max(0, qty * p.salePrice - disc);
      const paidValue = Math.min(amount, parseMoneyInput(paid.value));
      const line: TransactionLine = { productId: p.id, quantity: qty, unitPrice: p.salePrice, discount: disc };
      const savedSale = existing
        ? await updateTransaction(existing.id, { date: Date.now(), partyId: modal.querySelector<HTMLSelectElement>("#sale-party")!.value || undefined, accountId: modal.querySelector<HTMLSelectElement>("#sale-account")!.value || undefined, description: `فروش ${p.name}`, lines: [line], paid: paidValue })
        : await addSale({ date: Date.now(), partyId: modal.querySelector<HTMLSelectElement>("#sale-party")!.value || undefined, accountId: modal.querySelector<HTMLSelectElement>("#sale-account")!.value || undefined, description: `فروش ${p.name}`, lines: [line], paid: paidValue });
      modal.remove();

      // Mount the invoice immediately after saving so the render cycle cannot hide it.
      try {
        await openInvoice(savedSale);
      } catch (error) {
        showToast(error instanceof Error ? `فاکتور ثبت شد، اما نمایش فاکتور ناموفق بود: ${error.message}` : "فاکتور ثبت شد، اما نمایش فاکتور ناموفق بود");
      }
      showToast(`${existing ? "فاکتور ویرایش شد" : "فروش ثبت شد"}؛ مانده ${rial(amount - paidValue)}`);
    } catch (e) { showToast(e instanceof Error ? e.message : "ثبت فروش ناموفق بود"); }
  });
  update();
}


function orderNotificationId(orderId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < orderId.length; i++) {
    hash ^= orderId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 2000000000 + 1000;
}

async function scheduleOrderReminder(order: Order): Promise<void> {
  if (order.status !== "pending" || !Capacitor.isNativePlatform()) return;
  const reminderAt = new Date(order.deliveryDate);
  reminderAt.setDate(reminderAt.getDate() - 1);
  reminderAt.setHours(10, 0, 0, 0);
  if (reminderAt.getTime() <= Date.now()) return;
  try {
    const permission = await LocalNotifications.checkPermissions();
    if (permission.display !== "granted") {
      const requested = await LocalNotifications.requestPermissions();
      if (requested.display !== "granted") return;
    }
    await LocalNotifications.createChannel({
      id: "saisai-orders",
      name: "یادآوری سفارشات",
      description: "یادآوری سفارش‌های در انتظار تحویل",
      importance: 4,
      vibration: true,
    }).catch(() => undefined);
    const id = orderNotificationId(order.id);
    await LocalNotifications.cancel({ notifications: [{ id }] });
    const [orderParties, orderProducts] = await Promise.all([listParties(), listProducts()]);
    const party = orderParties.find(p => p.id === order.partyId);
    const product = orderProducts.find(p => p.id === order.productId);
    await LocalNotifications.schedule({
      notifications: [{
        id,
        title: "یادآوری سفارش سای‌سای",
        body: `فردا سفارش ${product?.name || "کالا"} برای ${party?.name || "مشتری"} تحویل دارد.`,
        channelId: "saisai-orders",
        schedule: { at: reminderAt, allowWhileIdle: true },
        autoCancel: true,
      }],
    });
  } catch (error) {
    console.warn("Order reminder could not be scheduled", error);
  }
}

async function cancelOrderReminder(orderId: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try { await LocalNotifications.cancel({ notifications: [{ id: orderNotificationId(orderId) }] }); } catch {}
}

function orderModal(existing?: Order): string {
  const customerOptions = parties.filter(p => p.type === "customer" || p.type === "both")
    .map(p => `<option value="${p.id}" ${existing?.partyId === p.id ? "selected" : ""}>${p.name}</option>`).join("");
  const productOptions = products.map(p => `<option value="${p.id}" ${existing?.productId === p.id ? "selected" : ""}>${p.name} · ${rial(p.salePrice)}</option>`).join("");
  const delivery = new Date(existing?.deliveryDate ?? Date.now() + 86400000);
  const dateValue = `${delivery.getFullYear()}-${String(delivery.getMonth()+1).padStart(2,"0")}-${String(delivery.getDate()).padStart(2,"0")}`;
  return `<div class="modal-backdrop" id="order-modal"><section class="modal" role="dialog" aria-modal="true">
    <button class="modal-close" id="order-close">×</button><span class="eyebrow">مدیریت سفارش</span><h2>${existing ? "ویرایش سفارش" : "دریافت سفارش جدید"}</h2>
    <label class="field"><span>مشتری</span><select id="order-party"><option value="">انتخاب مشتری</option>${customerOptions}</select></label>
    <label class="field"><span>کالا</span><select id="order-product">${productOptions}</select></label>
    <div class="form-grid"><label class="field"><span>تعداد</span><input id="order-quantity" type="text" inputmode="decimal" value="${existing?.quantity ?? 1}"></label>
      <label class="field"><span>قیمت واحد</span><input id="order-price" type="text" inputmode="numeric" value="${existing?.unitPrice ?? products.find(p => p.id === (existing?.productId || products[0]?.id))?.salePrice ?? 0}"></label></div>
    <label class="field"><span>تاریخ تحویل</span><input id="order-delivery" type="date" value="${dateValue}"></label>
    <label class="field"><span>یادداشت</span><input id="order-note" placeholder="مثلاً تحویل درب مغازه" value="${existing?.note || ""}"></label>
    <button class="primary-button wide" id="order-submit">${existing ? "ذخیره تغییرات" : "ثبت سفارش و یادآوری"}</button>
  </section></div>`;
}

async function ordersView(): Promise<string> {
  const orders = await listOrders();
  const partyMap = new Map(parties.map(p => [p.id, p]));
  const productMap = new Map(products.map(p => [p.id, p]));
  const rows = orders.map(o => {
    const party = partyMap.get(o.partyId);
    const product = productMap.get(o.productId);
    const status = o.status === "completed" ? "تحویل شد" : o.status === "cancelled" ? "لغو شد" : "در انتظار";
    return `<article class="order-card ${o.status}">
      <div class="order-card-head"><div><span class="eyebrow">سفارش</span><h3>${party?.name || "مشتری حذف‌شده"}</h3></div><span class="order-status">${status}</span></div>
      <div class="order-details"><span>کالا: <b>${product?.name || "کالای حذف‌شده"}</b></span><span>تعداد: <b>${money.format(o.quantity)}</b></span><span>تحویل: <b>${dateLabel(o.deliveryDate)}</b></span></div>
      <p class="muted">${o.note || "بدون یادداشت"} · مبلغ تقریبی ${rial(Math.round(o.quantity * o.unitPrice))}</p>
      <div class="order-actions">
        ${o.status === "pending" ? `<button class="primary-button" data-order-complete="${o.id}">تحویل شد</button><button class="secondary-button" data-order-cancel="${o.id}">لغو</button>` : ""}
        <button class="secondary-button" data-order-edit="${o.id}">ویرایش</button><button class="secondary-button" data-order-delete="${o.id}">حذف</button>
      </div>
    </article>`;
  }).join("");
  return pageHead("سفارشات", "دریافت و پیگیری سفارش‌ها", "نام مشتری، کالا، تاریخ تحویل و یادآوری یک روز قبل.", `<button class="primary-button" id="new-order">＋ سفارش جدید</button>`) +
    `<section class="panel order-summary"><span>در انتظار تحویل</span><strong>${orders.filter(o => o.status === "pending").length}</strong></section><section class="orders-list">${rows || '<div class="panel empty-inline"><span>◷</span><p>هنوز سفارشی ثبت نشده است.</p></div>'}</section>`;
}

function bindOrderModal(existing?: Order): void {
  const modal = document.querySelector<HTMLDivElement>("#order-modal");
  if (!modal) return;
  const product = modal.querySelector<HTMLSelectElement>("#order-product")!;
  const price = modal.querySelector<HTMLInputElement>("#order-price")!;
  const syncPrice = () => {
    if (existing) return;
    const p = products.find(x => x.id === product.value);
    if (p) price.value = String(p.salePrice);
  };
  product.addEventListener("change", syncPrice);
  modal.querySelector("#order-close")?.addEventListener("click", () => modal.remove());
  modal.querySelector("#order-submit")?.addEventListener("click", async () => {
    try {
      const partyId = modal.querySelector<HTMLSelectElement>("#order-party")!.value;
      const productId = product.value;
      const quantity = numericValue(modal.querySelector<HTMLInputElement>("#order-quantity")!.value);
      const unitPrice = numericValue(price.value);
      const dateText = modal.querySelector<HTMLInputElement>("#order-delivery")!.value;
      const deliveryDate = dateText ? new Date(dateText + "T12:00:00").getTime() : 0;
      if (!partyId) throw new Error("انتخاب مشتری الزامی است");
      if (!productId || quantity <= 0 || unitPrice < 0) throw new Error("کالا، تعداد و قیمت سفارش را بررسی کنید");
      if (!deliveryDate || deliveryDate < Date.now() - 86400000) throw new Error("تاریخ تحویل را درست انتخاب کنید");
      let saved: Order;
      if (existing) {
        saved = { ...existing, partyId, productId, quantity, unitPrice, deliveryDate, note: modal.querySelector<HTMLInputElement>("#order-note")!.value.trim() };
        await dbUpdateOrder(saved);
      } else {
        saved = await dbAddOrder({ partyId, productId, quantity, unitPrice, orderDate: Date.now(), deliveryDate, note: modal.querySelector<HTMLInputElement>("#order-note")!.value.trim(), status: "pending" });
      }
      if (existing) await cancelOrderReminder(saved.id);
      await scheduleOrderReminder(saved);
      modal.remove();
      await render();
      showToast(existing ? "سفارش ویرایش شد" : "سفارش ثبت شد؛ یادآوری یک روز قبل تنظیم شد");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "ثبت سفارش ناموفق بود");
    }
  });
  syncPrice();
}

async function dbAddOrder(input: Omit<Order, "id" | "createdAt">): Promise<Order> {
  const { addOrder } = await import("./db");
  return addOrder(input);
}
async function dbUpdateOrder(order: Order): Promise<void> {
  const { updateOrder } = await import("./db");
  await updateOrder(order);
}
async function dbDeleteOrder(id: string): Promise<void> {
  const { deleteOrder } = await import("./db");
  await deleteOrder(id);
}

function bindOrderActions(): void {
  document.querySelector("#new-order")?.addEventListener("click", async () => {
    parties = await listParties(); products = await listProducts();
    if (!parties.some(p => p.type === "customer" || p.type === "both")) { showToast("ابتدا یک مشتری ثبت کنید"); return; }
    if (!products.length) { showToast("ابتدا یک کالا ثبت کنید"); return; }
    document.body.insertAdjacentHTML("beforeend", orderModal());
    bindOrderModal();
  });
  document.querySelectorAll<HTMLElement>("[data-order-edit]").forEach(b => b.addEventListener("click", async () => {
    const order = (await listOrders()).find(x => x.id === (b.dataset.orderEdit || ""));
    if (!order) return;
    parties = await listParties(); products = await listProducts();
    document.body.insertAdjacentHTML("beforeend", orderModal(order)); bindOrderModal(order);
  }));
  document.querySelectorAll<HTMLElement>("[data-order-delete]").forEach(b => b.addEventListener("click", async () => {
    const id = b.dataset.orderDelete || ""; if (!id || !confirm("این سفارش حذف شود؟")) return;
    try { await cancelOrderReminder(id); await dbDeleteOrder(id); showToast("سفارش حذف شد"); await render(); } catch(e) { showToast(e instanceof Error ? e.message : "حذف سفارش ناموفق بود"); }
  }));
  document.querySelectorAll<HTMLElement>("[data-order-complete],[data-order-cancel]").forEach(b => b.addEventListener("click", async () => {
    const id = b.dataset.orderComplete || b.dataset.orderCancel || "";
    const order = (await listOrders()).find(x => x.id === id);
    if (!order) return;
    const nextStatus: Order["status"] = b.dataset.orderComplete ? "completed" : "cancelled";
    await dbUpdateOrder({ ...order, status: nextStatus });
    await cancelOrderReminder(order.id);
    showToast(nextStatus === "completed" ? "سفارش تحویل شد" : "سفارش لغو شد");
    await render();
  }));
}

async function inventoryView(): Promise<string> {
  products = await listProducts();
  const rows = await Promise.all(products.map(async p => {
    const stock = await getStock(p.id);
    return `<div class="product-row" data-product-id="${p.id}"><div><strong>${p.name}</strong><small>${p.sku || "بدون کد"} · ${p.unit}</small></div><div class="stock-number ${stock <= p.lowStock ? "low" : ""}">${money.format(stock)}<small>موجودی</small></div><b>${rial(p.salePrice)}</b><span class="account-actions"><button type="button" class="secondary-button product-edit" data-product-edit="${p.id}">ویرایش</button><button type="button" class="secondary-button product-delete" data-product-delete="${p.id}">حذف</button></span></div>`;
  }));
  return pageHead("انبار", "موجودی کالا", "موجودی واقعی از روی گردش انبار محاسبه می‌شود؛ «حداقل موجودی» فقط آستانه هشدار است.", `<div class="head-actions"><button class="secondary-button" id="new-adjustment">＋ اصلاح موجودی</button><button class="primary-button" id="new-product">＋ کالای جدید</button></div>`) +
    `<section class="panel">${rows.length ? rows.join("") : `<div class="empty-inline"><span>▤</span><p>هنوز کالایی ثبت نشده است.</p></div>`}</section>`;
}

function adjustmentModal(): string {
  const options = products.map(p => `<option value="${p.id}">${p.name} · ${p.unit}</option>`).join("");
  return `<div class="modal-backdrop" id="adjust-modal"><section class="modal"><button class="modal-close" id="adjust-close">×</button><span class="eyebrow">کنترل انبار</span><h2>اصلاح موجودی</h2>
    <label class="field"><span>کالا</span><select id="adjust-product">${options}</select></label>
    <label class="field"><span>مقدار تغییر</span><input id="adjust-qty" type="text" inputmode="decimal" autocomplete="off" placeholder="مثبت برای افزایش، منفی برای کاهش"></label>
    <label class="field"><span>شرح</span><input id="adjust-desc" placeholder="مثلاً شمارش دوره‌ای انبار"></label>
    <button class="primary-button wide" id="adjust-submit">ثبت اصلاح موجودی</button></section></div>`;
}

function bindAdjustmentModal(): void {
  const modal = document.querySelector<HTMLDivElement>("#adjust-modal")!;
  modal.querySelector("#adjust-close")?.addEventListener("click", () => modal.remove());
  modal.querySelector("#adjust-submit")?.addEventListener("click", async () => {
    try {
      const productId = modal.querySelector<HTMLSelectElement>("#adjust-product")!.value;
      const quantity = signedNumericValue(modal.querySelector<HTMLInputElement>("#adjust-qty")!.value);
      await addStockAdjustment({ date: Date.now(), productId, quantity, description: modal.querySelector<HTMLInputElement>("#adjust-desc")!.value.trim() || "اصلاح موجودی" });
      modal.remove(); showToast("اصلاح موجودی ثبت شد"); await render();
    } catch (e) { showToast(e instanceof Error ? e.message : "اصلاح موجودی ناموفق بود"); }
  });
}

function productModal(product?: Product): string {
  return `<div class="modal-backdrop" id="product-modal"><section class="modal"><button class="modal-close" id="product-close">×</button><span class="eyebrow">کاتالوگ کالا</span><h2>${product ? "ویرایش کالا" : "افزودن کالا"}</h2>
    <label class="field"><span>نام کالا</span><input id="p-name" placeholder="مثلاً برنج ایرانی" value="${product?.name || ""}"></label>
    <div class="form-grid"><label class="field"><span>کد کالا</span><input id="p-sku" placeholder="اختیاری" value="${product?.sku || ""}"></label><label class="field"><span>واحد</span><select id="p-unit">${["عدد","کیلوگرم","گرم","لیتر","متر","بسته"].map(u => `<option ${product?.unit === u ? "selected" : ""}>${u}</option>`).join("")}</select></label></div>
    <div class="form-grid"><label class="field"><span>قیمت خرید (${getCurrencyLabel()})</span><input id="p-buy" type="number" min="0" value="${moneyInputValue(product?.purchasePrice ?? 0)}"></label><label class="field"><span>قیمت فروش (${getCurrencyLabel()})</span><input id="p-sale" type="number" min="0" value="${moneyInputValue(product?.salePrice ?? 0)}"></label></div>
    <label class="field"><span>حداقل موجودی (هشدار)</span><input id="p-low" type="number" min="0" step="0.001" value="${product?.lowStock ?? 5}"></label>
    ${product ? "" : '<label class="field"><span>موجودی اولیه</span><input id="p-initial-stock" type="text" inputmode="decimal" autocomplete="off" value="0" placeholder="مثلاً 20"></label>'}
    <button class="primary-button wide" id="product-submit">${product ? "ذخیره تغییرات" : "ذخیره کالا"}</button></section></div>`;
}

function bindProductModal(): void {
  const modal = document.querySelector<HTMLDivElement>("#product-modal")!;
  modal.querySelector("#product-close")?.addEventListener("click", () => modal.remove());
  modal.querySelector("#product-submit")?.addEventListener("click", async () => {
    try {
      const name = (modal.querySelector<HTMLInputElement>("#p-name")!.value).trim();
      const unit = modal.querySelector<HTMLSelectElement>("#p-unit")!.value as Product["unit"];
      if (!name) throw new Error("نام کالا الزامی است");
      const values = {
        name,
        sku: modal.querySelector<HTMLInputElement>("#p-sku")!.value.trim(),
        unit,
        purchasePrice: parseMoneyInput(modal.querySelector<HTMLInputElement>("#p-buy")!.value),
        salePrice: parseMoneyInput(modal.querySelector<HTMLInputElement>("#p-sale")!.value),
        lowStock: Math.max(0, Number(modal.querySelector<HTMLInputElement>("#p-low")!.value) || 0),
      };
      const editId = modal.dataset.editId;
      if (editId) {
        const existing = (await listProducts()).find(p => p.id === editId);
        if (!existing) throw new Error("کالا پیدا نشد");
        await updateProduct({ ...existing, ...values });
      } else {
        const initialStock = Math.max(0, numericValue(modal.querySelector<HTMLInputElement>("#p-initial-stock")?.value));
        await addProduct(values, initialStock);
      }
      modal.remove(); showToast(editId ? "تغییرات کالا ذخیره شد" : "کالا با موفقیت ثبت شد"); await render();
    } catch (e) { showToast(e instanceof Error ? e.message : "ذخیره کالا ناموفق بود"); }
  });
}

function peopleView(): string {
  const customerCount = parties.filter(p => p.type === "customer" || p.type === "both").length;
  const supplierCount = parties.filter(p => p.type === "supplier" || p.type === "both").length;
  return pageHead("دفتر اشخاص", "مشتریان و تأمین‌کنندگان", `${money.format(customerCount)} مشتری · ${money.format(supplierCount)} تأمین‌کننده`, `<button class="primary-button" id="new-party">＋ افزودن شخص</button>`) +
    `<section class="panel">${parties.length ? parties.map(p => `<div class="person-row"><div class="person-avatar">${p.name.slice(0,1)}</div><div><strong>${p.name}</strong><small>${p.phone || "بدون شماره"} · ${p.type === "customer" ? "مشتری" : p.type === "supplier" ? "تأمین‌کننده" : "مشتری و تأمین‌کننده"}</small></div><span class="account-actions"><button type="button" class="secondary-button" data-party-edit="${p.id}">ویرایش</button><button type="button" class="secondary-button" data-party-delete="${p.id}">حذف</button></span></div>`).join("") : `<div class="empty-inline"><span>♙</span><p>هنوز شخصی ثبت نشده است.</p></div>`}</section>`;
}

async function reportsView(transactions: Transaction[]): Promise<string> {
  const products = await listProducts();
  const expenses = await listExpenses();
  const parties = await listParties();
  const range = localStorage.getItem("sai-sai-report-range") || "month";
  const now = new Date(); now.setHours(23,59,59,999);
  const start = new Date(now); start.setHours(0,0,0,0);
  if (range === "week") start.setDate(start.getDate() - 6);
  else if (range === "all") start.setTime(0);
  else if (range === "month") start.setDate(1);
  let from = start.getTime(), to = now.getTime();
  if (range === "custom") {
    const fromDate = jalaliToGregorianDate(localStorage.getItem("sai-sai-report-from") || "");
    const toDate = jalaliToGregorianDate(localStorage.getItem("sai-sai-report-to") || "");
    if (fromDate && toDate) { fromDate.setHours(0,0,0,0); toDate.setHours(23,59,59,999); from = fromDate.getTime(); to = toDate.getTime(); }
  }
  const inRange = (d: number) => d >= from && d <= to;
  const salesTx = transactions.filter(t => t.type === "sale" && inRange(t.date));
  const purchaseTx = transactions.filter(t => t.type === "purchase" && inRange(t.date));
  const receiptTx = transactions.filter(t => t.type === "receipt" && inRange(t.date));
  const paymentTx = transactions.filter(t => t.type === "payment" && inRange(t.date));
  const expenseTx = expenses.filter(e => inRange(e.date));
  const cogs = calculateHistoricalCOGS(transactions, products);
  const sales = salesTx.reduce((s,t)=>s+t.amount,0);
  const purchases = purchaseTx.reduce((s,t)=>s+t.amount,0);
  const receipts = receiptTx.reduce((s,t)=>s+t.paid,0);
  const payments = paymentTx.reduce((s,t)=>s+t.paid,0);
  const expenseTotal = expenseTx.reduce((s,e)=>s+e.amount,0);
  const cost = salesTx.reduce((s,t)=>s+(cogs.get(t.id) ?? t.costOfGoods ?? 0),0);
  const gross = sales-cost, net=gross-expenseTotal;
  const label = range==="today"?"امروز":range==="week"?"۷ روز اخیر":range==="all"?"همه":range==="custom"?"بازه انتخابی":"ماه جاری";
  // Keep the visible value in yyyy/mm/dd form. The parser accepts both
  // formatted and compact values, but the UI should always show separators.
  const defaultFrom = formatJalaliInput(localStorage.getItem("sai-sai-report-from") || todayJalaliInput());
  const defaultTo = formatJalaliInput(localStorage.getItem("sai-sai-report-to") || todayJalaliInput());

  const dateParts = (prefix: "from" | "to", value: string) => {
    const digits = compactJalaliInput(value).padEnd(8, "0");
    return `
      <div class="field report-date">
        <span>${prefix === "from" ? "از تاریخ شمسی" : "تا تاریخ شمسی"}</span>
        <div class="report-date-parts" data-report-date="${prefix}">
          <input id="report-${prefix}-year" data-date-part="year" type="text" inputmode="numeric" maxlength="4" value="${digits.slice(0,4)}" placeholder="۱۴۰۵" aria-label="سال">
          <b class="report-date-separator" aria-hidden="true">/</b>
          <input id="report-${prefix}-month" data-date-part="month" type="text" inputmode="numeric" maxlength="2" value="${digits.slice(4,6)}" placeholder="۰۷" aria-label="ماه">
          <b class="report-date-separator" aria-hidden="true">/</b>
          <input id="report-${prefix}-day" data-date-part="day" type="text" inputmode="numeric" maxlength="2" value="${digits.slice(6,8)}" placeholder="۱۶" aria-label="روز">
        </div>
      </div>`;
  };
  const summary = `<section class="panel report-list"><div class="report-range" role="group" aria-label="بازه گزارش"><button type="button" class="report-range-item" data-report-range="today">امروز</button><button type="button" class="report-range-item" data-report-range="week">۷ روز</button><button type="button" class="report-range-item" data-report-range="month">ماه جاری</button><button type="button" class="report-range-item" data-report-range="all">همه</button></div><form id="report-range-form" class="report-custom-range">
  ${dateParts("from", defaultFrom)}
  ${dateParts("to", defaultTo)}
  <button type="submit" class="primary-button wide" id="report-apply-range">اعمال بازه</button>
</form><p class="muted">بازه فعال: ${label}</p></section>`;
  const stats = `<section class="stats-grid">${stat("فروش",rial(sales),"primary")}${stat("بهای تمام‌شده",rial(cost),"warning")}${stat("سود ناخالص",rial(gross),"success")}${stat("سود خالص",rial(net),"success")}</section>`;
  const cash = `<section class="panel report-list"><div><span>خرید</span><b>${rial(purchases)}</b></div><div><span>هزینه</span><b>${rial(expenseTotal)}</b></div><div><span>دریافت</span><b>${rial(receipts)}</b></div><div><span>پرداخت</span><b>${rial(payments)}</b></div><div><span>خالص جریان نقدی</span><b>${rial(receipts-payments-expenseTotal)}</b></div><div><span>تعداد فروش</span><b>${money.format(salesTx.length)}</b></div></section>`;
  const expenseRows = expenseTx.length
    ? expenseTx.map(e => `<div class="transaction-row"><div class="transaction-icon">−</div><div class="transaction-main"><strong>${e.title}</strong><small>${dateLabel(e.date)} · ${e.description || ""}</small></div><b>${rial(e.amount)}</b><button class="secondary-button" data-expense-edit="${e.id}">ویرایش</button><button class="secondary-button" data-expense-delete="${e.id}">حذف</button></div>`).join("")
    : `<div class="empty-inline"><p>هزینه‌ای ثبت نشده است.</p></div>`;
  const expenseSection = `<section class="panel"><div class="section-head"><h3>هزینه‌ها</h3><span class="muted">${money.format(expenseTx.length)} مورد</span></div>${expenseRows}</section>`;
  const settlements = [...receiptTx,...paymentTx].sort((a,b)=>b.date-a.date).map(t => `<div class="transaction-row"><div class="transaction-icon">${t.type==="receipt"?"↓":"↑"}</div><div class="transaction-main"><strong>${t.type==="receipt"?"دریافت":"پرداخت"}</strong><small>${dateLabel(t.date)} · ${t.description || ""}</small></div><b>${rial(t.amount)}</b><button class="secondary-button" data-settlement-edit="${t.id}">ویرایش</button><button class="secondary-button" data-settlement-delete="${t.id}">حذف</button></div>`).join("");
  const settlementSection = `<section class="panel"><div class="section-head"><h3>دریافت و پرداخت‌ها</h3><span class="muted">قابل ویرایش</span></div>${settlements}</section>`;
  const partyNames = new Map(parties.map(p => [p.id, p.name]));
  const debtorTotals = new Map<string, number>();
  for (const t of transactions) {
    if (t.type !== "sale" || !t.partyId) continue;
    const balance = Math.max(0, t.amount - t.paid);
    if (balance > 0) debtorTotals.set(t.partyId, (debtorTotals.get(t.partyId) || 0) + balance);
  }
  const debtorRows = [...debtorTotals.entries()]
    .sort((a,b) => b[1] - a[1])
    .map(([partyId, balance]) => {
      const partySales = transactions.filter(t => t.type === "sale" && t.partyId === partyId && Math.max(0, t.amount - t.paid) > 0);
      const invoiceButtons = partySales.map(t => `<button class="secondary-button debtor-invoice" data-invoice-id="${t.id}">${t.invoiceNumber || "فاکتور"}</button>`).join("");
      return `<div class="transaction-row debtor-row"><div class="transaction-icon debtor-icon">!</div><div class="transaction-main"><strong>${partyNames.get(partyId) || "طرف حساب حذف‌شده"}</strong><small>${partySales.length} فاکتور تسویه‌نشده</small></div><b class="debtor-amount">${rial(balance)}</b><div class="debtor-invoices">${invoiceButtons}</div></div>`;
    }).join("");
  const debtorSection = `<section class="panel"><div class="section-head"><h3>بدهکاران</h3><span class="muted">${money.format(debtorTotals.size)} نفر</span></div>${debtorRows || '<div class="empty-inline"><p>در حال حاضر فاکتور بدهکار و تسویه‌نشده‌ای وجود ندارد.</p></div>'}</section>`;
  return pageHead("تحلیل مالی", "گزارش سود و زیان", "گزارش بر اساس بازه انتخابی و بهای تمام‌شده FIFO.") + summary + stats + cash + debtorSection + expenseSection + settlementSection + reportExportButtons();
}
function reportExportButtons(): string {
  return `<section class="panel"><div class="page-head-row"><div><strong>خروجی گزارش</strong><p class="muted">خروجی واقعی Excel و چاپ/PDF روی گوشی.</p></div><button type="button" class="secondary-button" id="report-csv">خروجی Excel</button><button type="button" class="secondary-button" id="report-print">چاپ / PDF</button></div></section>`;
}

function expenseModal(existing?: import("./domain").Expense): string {
  return `<div class="modal-backdrop" id="expense-modal"><section class="modal"><button class="modal-close" id="expense-close">×</button><span class="eyebrow">هزینه‌های جاری</span><h2>${existing ? "ویرایش هزینه" : "ثبت هزینه"}</h2>
    <label class="field"><span>عنوان هزینه</span><input id="expense-title" placeholder="مثلاً حمل‌ونقل، اجاره، حقوق" value="${existing?.title || ""}"></label>
    <label class="field"><span>مبلغ (${getCurrencyLabel()})</span><input id="expense-amount" type="number" min="1" value="${moneyInputValue(existing?.amount ?? 0)}"></label><label class="field"><span>پرداخت از</span><select id="expense-account"><option value="">بدون انتخاب حساب</option>${(window as typeof window & { __saiAccounts?: {id:string;name:string}[] }).__saiAccounts?.map(a => `<option value="${a.id}">${a.name}</option>`).join("") || ""}</select>
    <label class="field"><span>شرح</span><input id="expense-desc" placeholder="اختیاری" value="${existing?.description || ""}"></label>
    <button class="primary-button wide" id="expense-submit">${existing ? "ذخیره تغییرات" : "ثبت هزینه"}</button></section></div>`;
}

async function openExpenseModal(): Promise<void> { (window as typeof window & { __saiAccounts?: {id:string;name:string}[] }).__saiAccounts = await listAccounts(); document.body.insertAdjacentHTML("beforeend", expenseModal()); bindExpenseModal(); }

function bindExpenseModal(): void {
  const modal = document.querySelector<HTMLDivElement>("#expense-modal")!;
  modal.querySelector("#expense-close")?.addEventListener("click", () => modal.remove());
  modal.querySelector("#expense-submit")?.addEventListener("click", async () => {
    try {
      const title = modal.querySelector<HTMLInputElement>("#expense-title")!.value.trim();
      const amount = parseMoneyInput(modal.querySelector<HTMLInputElement>("#expense-amount")!.value);
      if (!title || amount <= 0) throw new Error("عنوان و مبلغ هزینه را وارد کنید");
      const expenseValues = { date: Date.now(), title, amount, accountId: modal.querySelector<HTMLSelectElement>("#expense-account")?.value || undefined, description: modal.querySelector<HTMLInputElement>("#expense-desc")!.value.trim() };
      const editId = modal.dataset.editId;
      if (editId) {
        const existingExpense = (await listExpenses()).find(x => x.id === editId);
        if (!existingExpense) throw new Error("هزینه پیدا نشد");
        await updateExpense({ ...existingExpense, ...expenseValues });
      } else {
        await addExpense(expenseValues);
      }
      modal.remove(); showToast(modal.dataset.editId ? "هزینه ویرایش شد" : "هزینه ثبت شد"); await render();
    } catch (e) { showToast(e instanceof Error ? e.message : "ثبت هزینه ناموفق بود"); }
  });
}

function settlementModal(type: "receipt" | "payment", existing?: Transaction): string {
  const title = type === "receipt" ? "ثبت دریافت" : "ثبت پرداخت";
  const options = parties.map(p => `<option value="${p.id}">${p.name}</option>`).join("");
  return `<div class="modal-backdrop" id="settlement-modal"><section class="modal"><button class="modal-close" id="settlement-close">×</button><span class="eyebrow">حساب طرف‌حساب</span><h2>${title}</h2>
    <label class="field"><span>شخص</span><select id="settlement-party"><option value="">انتخاب کنید</option>${options}</select></label>
    <label class="field"><span>مبلغ (${getCurrencyLabel()})</span><input id="settlement-amount" type="number" min="1" value="${moneyInputValue(existing?.amount ?? 0)}"></label><label class="field"><span>${type === "receipt" ? "دریافت به" : "پرداخت از"}</span><select id="settlement-account"><option value="">بدون انتخاب حساب</option>${(window as typeof window & { __saiAccounts?: {id:string;name:string}[] }).__saiAccounts?.map(a => `<option value="${a.id}">${a.name}</option>`).join("") || ""}</select></label>
    <label class="field"><span>شرح</span><input id="settlement-description" placeholder="${title} بابت حساب" value="${existing?.description || ""}"></label>
    <button class="primary-button wide" id="settlement-submit">ثبت ${type === "receipt" ? "دریافت" : "پرداخت"}</button></section></div>`;
}

async function openSettlement(type: "receipt" | "payment", existing?: Transaction): Promise<void> {
  parties = await listParties();
  if (!parties.length) { showToast("ابتدا یک شخص ثبت کنید"); return; }
  (window as typeof window & { __saiAccounts?: unknown[] }).__saiAccounts = await listAccounts();
  document.body.insertAdjacentHTML("beforeend", settlementModal(type, existing));
  const modal = document.querySelector<HTMLDivElement>("#settlement-modal")!;
  if (existing) { modal.querySelector<HTMLSelectElement>("#settlement-party")!.value = existing.partyId || ""; modal.querySelector<HTMLSelectElement>("#settlement-account")!.value = existing.accountId || ""; modal.dataset.editId = existing.id; }
  modal.querySelector("#settlement-close")?.addEventListener("click", () => modal.remove());
  modal.querySelector("#settlement-submit")?.addEventListener("click", async () => {
    try {
      const partyId = modal.querySelector<HTMLSelectElement>("#settlement-party")!.value;
      const amount = parseMoneyInput(modal.querySelector<HTMLInputElement>("#settlement-amount")!.value);
      if (!partyId || amount <= 0) throw new Error("شخص و مبلغ را وارد کنید");
      const accountId = modal.querySelector<HTMLSelectElement>("#settlement-account")!.value || undefined;
      const description = modal.querySelector<HTMLInputElement>("#settlement-description")!.value.trim() || (type === "receipt" ? "دریافت وجه" : "پرداخت وجه"); if (modal.dataset.editId) await updateTransaction(modal.dataset.editId, { date: Date.now(), partyId, accountId, description, lines: [], paid: amount }); else await addSettlement({ type, date: Date.now(), partyId, accountId, amount, description });
      modal.remove(); showToast(existing ? "تغییرات ذخیره شد" : "ثبت شد"); await render();
    } catch (e) { showToast(e instanceof Error ? e.message : "ثبت ناموفق بود"); }
  });
}

function partyModal(party?: Party): string {
  return `<div class="modal-backdrop" id="party-modal"><section class="modal"><button class="modal-close" id="party-close">×</button><span class="eyebrow">دفتر اشخاص</span><h2>${party ? "ویرایش شخص" : "افزودن شخص"}</h2>
    <label class="field"><span>نام</span><input id="party-name" placeholder="نام مشتری یا تأمین‌کننده" value="${party?.name || ""}"></label>
    <label class="field"><span>شماره تماس</span><input id="party-phone" inputmode="tel" placeholder="اختیاری" value="${party?.phone || ""}"></label>
    <label class="field"><span>نوع</span><select id="party-type"><option value="customer" ${party?.type === "customer" ? "selected" : ""}>مشتری</option><option value="supplier" ${party?.type === "supplier" ? "selected" : ""}>تأمین‌کننده</option><option value="both" ${party?.type === "both" ? "selected" : ""}>هر دو</option></select></label>
    <button class="primary-button wide" id="party-submit">${party ? "ذخیره تغییرات" : "ذخیره شخص"}</button></section></div>`;
}

function bindPartyModal(): void {
  const modal = document.querySelector<HTMLDivElement>("#party-modal")!;
  modal.querySelector("#party-close")?.addEventListener("click", () => modal.remove());
  modal.querySelector("#party-submit")?.addEventListener("click", async () => {
    try {
      const name = modal.querySelector<HTMLInputElement>("#party-name")!.value.trim();
      if (!name) throw new Error("نام شخص الزامی است");
      const values = { name, phone: modal.querySelector<HTMLInputElement>("#party-phone")!.value.trim(), type: modal.querySelector<HTMLSelectElement>("#party-type")!.value as Party["type"] };
      const editId = modal.dataset.editId;
      if (editId) {
        const existing = (await listParties()).find(p => p.id === editId);
        if (!existing) throw new Error("شخص پیدا نشد");
        await updateParty({ ...existing, ...values });
      } else {
        await addParty(values);
      }
      modal.remove(); showToast(modal.dataset.editId ? "تغییرات شخص ذخیره شد" : "شخص با موفقیت ثبت شد"); await render();
    } catch (e) { showToast(e instanceof Error ? e.message : "ذخیره شخص ناموفق بود"); }
  });
}

function backupRestoreModal(): string {
  return `<div class="modal-backdrop" id="backup-restore-modal"><section class="modal"><button class="modal-close" id="backup-restore-close">×</button><span class="eyebrow">پشتیبان</span><h2>بازیابی اطلاعات</h2><p class="muted">فایل JSON پشتیبان سای‌سای را انتخاب کنید. داده‌های فعلی جایگزین می‌شوند.</p><input id="backup-file" type="file" accept=".json,application/json"><button class="primary-button wide" id="backup-restore-submit">بازیابی</button></section></div>`;
}

function paywall(subscription: Subscription): string {
  const expiry = subscription.expiresAt ? `تا ${dateLabel(subscription.expiresAt)}` : "هنوز اشتراکی فعال نیست";
  return `<section class="paywall"><div class="paywall-logo">س</div><span class="eyebrow">نسخه کامل سای‌سای</span><h2>مدیریت فروش، انبار و حساب‌ها در یکجا</h2><p class="muted">برای استفاده از نسخه کامل، اشتراک ماهانه را فعال کنید. تأیید خرید در سرور انجام می‌شود.</p>
    <div class="paywall-features"><span>✓ فروش و خرید</span><span>✓ موجودی و کالا</span><span>✓ مشتری و تأمین‌کننده</span><span>✓ گزارش‌های مدیریتی</span></div>
    <p class="subscription-expiry">${expiry}</p><button class="primary-button paywall-button" data-subscribe>خرید اشتراک ماهانه</button></section>`;
}

function showSubscription(subscription: Subscription): void {
  document.body.insertAdjacentHTML("beforeend", `<div class="modal-backdrop" id="sub-modal"><section class="modal"><button class="modal-close" id="sub-close">×</button><span class="eyebrow">اشتراک سای‌سای</span><h2>اشتراک ماهانه</h2><div class="price-card"><div><strong>پلن حرفه‌ای</strong><span>دسترسی کامل</span></div><b>ماهانه</b></div><button class="primary-button wide" id="sub-buy">ادامه پرداخت</button></section></div>`);
  document.querySelector("#sub-close")?.addEventListener("click", () => document.querySelector("#sub-modal")?.remove());
  document.querySelector("#sub-buy")?.addEventListener("click", subscribe);
}

async function subscribe(): Promise<void> {
  try { window.location.href = await createMonthlyCheckout(); }
  catch (e) { showToast(e instanceof Error ? e.message : "پرداخت در دسترس نیست"); }
}


function compactJalaliInput(value: string): string {
  return value
    .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[^0-9]/g, "")
    .slice(0, 8);
}

let nativeBackListenerRegistered = false;

async function setupNativeExitConfirmation(): Promise<void> {
  if (!nativeApp() || nativeBackListenerRegistered) return;
  nativeBackListenerRegistered = true;
  await App.addListener("backButton", ({ canGoBack }) => {
    const openModal = document.querySelector<HTMLElement>(".modal-backdrop");
    if (openModal) {
      openModal.remove();
      return;
    }
    if (canGoBack || activeTab !== "dashboard") {
      activeTab = "dashboard";
      void render();
      return;
    }
    if (window.confirm("آیا می‌خواهید از سای‌سای خارج شوید؟")) {
      void App.exitApp();
    }
  });
}

function nativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

async function shareBase64File(filename: string, base64: string, title: string): Promise<void> {
  if (!nativeApp()) {
    const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
    const blob = new Blob([bytes], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("فایل آماده شد");
    return;
  }
  const result = await Filesystem.writeFile({
    path: `sai-sai/${Date.now()}-${filename}`,
    data: base64,
    directory: Directory.Cache,
  });
  await Share.share({ title, files: [result.uri], dialogTitle: "ارسال یا ذخیره فایل" });
}

async function printHtml(title: string, bodyHtml: string, orientation: "portrait" | "landscape" = "portrait"): Promise<void> {
  if (!nativeApp()) {
    window.print();
    return;
  }
  const html = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{font-family:Tahoma,Arial,sans-serif;color:#111;background:#fff;padding:20px;direction:rtl}
    table{width:100%;border-collapse:collapse;margin:16px 0}th,td{border:1px solid #bbb;padding:7px;text-align:right}
    h1,h2,h3{margin:0 0 10px}.no-print{display:none!important}.invoice-summary{display:grid;gap:8px;margin-top:18px}
    .invoice-summary>div{display:flex;justify-content:space-between;padding:8px;border-bottom:1px solid #ddd}
    .invoice-party{margin:14px 0;padding:10px;border:1px solid #ccc}.report-list{margin:14px 0;padding:10px;border:1px solid #ddd}
  </style></head><body>${bodyHtml}</body></html>`;
  await Printer.print({ content: html, name: title, orientation });
}

function buildReportWorkbook(transactions: Transaction[], expenses: import("./domain").Expense[]): XLSX.WorkBook {
  const rows: (string | number)[][] = [["نوع","شماره فاکتور","تاریخ","مبلغ","پرداخت","شرح"]];
  for (const t of transactions) rows.push([t.type, t.invoiceNumber || "", dateLabel(t.date), t.amount, t.paid, t.description || ""]);
  const expenseRows: (string | number)[][] = [["تاریخ","عنوان","مبلغ","شرح"]];
  for (const e of expenses) expenseRows.push([dateLabel(e.date), e.title, e.amount, e.description || ""]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "تراکنش‌ها");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(expenseRows), "هزینه‌ها");
  return wb;
}

async function applyReportRange(): Promise<void> {
  const readDateValue = (prefix: "from" | "to"): string => {
    const input = document.querySelector<HTMLInputElement>(`#report-${prefix}-date`);
    if (!input) return "";
    return compactJalaliInput(input.value);
  };

  const fromValue = readDateValue("from");
  const toValue = readDateValue("to");
  const from = jalaliToGregorianDate(fromValue);
  const to = jalaliToGregorianDate(toValue);
  if (!from || !to) {
    showToast("تاریخ واردشده معتبر نیست؛ نمونه صحیح: ۱۴۰۵/۰۷/۱۶");
    return;
  }
  if (from.getTime() > to.getTime()) {
    showToast("تاریخ شروع نباید بعد از تاریخ پایان باشد");
    return;
  }
  localStorage.setItem("sai-sai-report-from", fromValue);
  localStorage.setItem("sai-sai-report-to", toValue);
  localStorage.setItem("sai-sai-report-range", "custom");
  await render();
}

async function bindActions(): Promise<void> {
  const root = document.querySelector<HTMLDivElement>("#app");
  if (!root || root.dataset.actionsBound === "1") return;
  root.dataset.actionsBound = "1";

  root.addEventListener("input", event => {
    const target = event.target as HTMLInputElement;
    if (target.matches("[data-jalali-input]")) target.value = formatJalaliInput(target.value);
  });

  root.addEventListener("change", event => {
    const target = event.target as HTMLInputElement;
    if (target.matches("[data-jalali-input]")) target.value = formatJalaliInput(target.value);
  });

  root.addEventListener("blur", event => {
    const target = event.target as HTMLInputElement;
    if (target.matches("[data-jalali-input]")) target.value = formatJalaliInput(target.value);
  }, true);

  root.addEventListener("click", async event => {
    const target = event.target as HTMLElement;
    const rangeButton = target.closest<HTMLButtonElement>("[data-report-range]");
    if (rangeButton) {
      localStorage.setItem("sai-sai-report-range", rangeButton.dataset.reportRange || "month");
      await render();
      return;
    }

    const invoiceButton = target.closest<HTMLElement>("[data-invoice-id]");
    if (invoiceButton) {
      const transactionList = await listTransactions();
      const transaction = transactionList.find(t => t.id === invoiceButton.dataset.invoiceId);
      if (transaction) await openInvoice(transaction);
      return;
    }

    const nav = target.closest<HTMLElement>("[data-nav], [data-nav-shortcut]");
    if (nav) {
      const next = nav.dataset.nav || nav.dataset.navShortcut;
      if (next) {
        activeTab = next as Tab;
        await render();
      }
      return;
    }

    const actionButton = target.closest<HTMLButtonElement>("[data-action]");
    if (!actionButton) return;
    const action = actionButton.dataset.action;
    try {
      if (action === "sale") await openSaleModal();
      else if (action === "purchase") {
        products = await listProducts();
        parties = await listParties();
        openPurchaseModal(products, parties, rial, async m => { showToast(m); await render(); });
      } else if (action === "receipt") {
        await openSettlement("receipt");
      } else if (action === "expense") {
        document.body.insertAdjacentHTML("beforeend", expenseModal());
        bindExpenseModal();
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "باز کردن این بخش ناموفق بود");
    }
  });


}

function bindReportControls(): void {
  if (activeTab !== "reports") return;
  const activeRange = localStorage.getItem("sai-sai-report-range") || "month";
  document.querySelectorAll<HTMLButtonElement>("[data-report-range]").forEach(button => {
    button.setAttribute("aria-pressed", (button.dataset.reportRange || "month") === activeRange ? "true" : "false");
  });
  const normalizePart = (input: HTMLInputElement, max: number) => {
    input.value = input.value
      .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
      .replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
      .replace(/[^0-9]/g, "")
      .slice(0, max);
  };
  document.querySelectorAll<HTMLElement>("[data-report-date]").forEach(group => {
    const year = group.querySelector<HTMLInputElement>("[data-date-part='year']")!;
    const month = group.querySelector<HTMLInputElement>("[data-date-part='month']")!;
    const day = group.querySelector<HTMLInputElement>("[data-date-part='day']")!;
    [year, month, day].forEach((input, index) => {
      input.addEventListener("input", () => {
        normalizePart(input, index === 0 ? 4 : 2);
        if ((index === 0 && input.value.length === 4) || (index > 0 && input.value.length === 2)) {
          const next = index === 0 ? month : day;
          next.focus();
          next.select();
        }
      });
    });
  });
  const applyReportRange = async (): Promise<void> => {
    const readDate = (prefix: "from" | "to"): string => {
      const group = document.querySelector<HTMLElement>(`[data-report-date="${prefix}"]`);
      if (!group) return "";
      const year = group.querySelector<HTMLInputElement>("[data-date-part='year']")?.value ?? "";
      const month = group.querySelector<HTMLInputElement>("[data-date-part='month']")?.value ?? "";
      const day = group.querySelector<HTMLInputElement>("[data-date-part='day']")?.value ?? "";
      return `${year.padStart(4, "0")}${month.padStart(2, "0")}${day.padStart(2, "0")}`;
    };

    const from = readDate("from");
    const to = readDate("to");
    const fromDate = jalaliToGregorianDate(from);
    const toDate = jalaliToGregorianDate(to);

    if (from.length !== 8 || to.length !== 8 || !fromDate || !toDate) {
      showToast("تاریخ را کامل وارد کنید");
      return;
    }
    if (fromDate.getTime() > toDate.getTime()) {
      showToast("تاریخ شروع نباید بعد از تاریخ پایان باشد");
      return;
    }

    localStorage.setItem("sai-sai-report-from", from);
    localStorage.setItem("sai-sai-report-to", to);
    localStorage.setItem("sai-sai-report-range", "custom");
    await render();
    showToast("بازه گزارش اعمال شد");
  };

  document.querySelector("#report-range-form")?.addEventListener("submit", event => {
    event.preventDefault();
    void applyReportRange();
  });
  document.querySelector("#report-apply-range")?.addEventListener("click", event => {
    event.preventDefault();
    void applyReportRange();
  });
}

async function render(): Promise<void> {
  const subscription = await getSubscription().catch(() => ({ status: "none", plan: "none", expiresAt: null } as Subscription));
  // Bind global navigation/actions before the subscription gate so buttons always have a click handler.
  await bindActions();
  if (subscription.status !== "active") {
    layout(paywall(subscription), subscription);
    document.querySelectorAll<HTMLButtonElement>("[data-subscribe]").forEach(b => b.addEventListener("click", subscribe));
    return;
  }

  let content = "";
  if (activeTab === "dashboard") content = await dashboardView(subscription);
  else if (activeTab === "sales") {
    const tx = (await listTransactions()).filter(t => t.type === "sale");
    content = pageHead("فروش", "دفتر فروش", "فاکتورهای فروش و مانده مشتریان.", `<button class="primary-button" id="new-sale">＋ ثبت فروش</button>`) +
      `<section class="panel">${tx.length ? tx.map(t => `<div class="transaction-actions-row"><button class="transaction-row transaction-button" data-invoice-id="${t.id}">${transactionRow(t)}</button><button class="secondary-button" data-sale-edit="${t.id}">ویرایش</button><button class="secondary-button" data-sale-delete="${t.id}">حذف</button></div>`).join("") : `<div class="empty-inline"><span>↗</span><p>هنوز فاکتور فروشی ثبت نشده است.</p></div>`}</section>`;
  } else if (activeTab === "purchases") {
    const tx = (await listTransactions()).filter(t => t.type === "purchase");
    content = pageHead("خرید", "دفتر خرید", "خریدها و افزایش خودکار موجودی.", `<button class="primary-button" id="new-purchase">＋ ثبت خرید</button>`) +
      `<section class="panel">${tx.length ? tx.map(t => `<div class="transaction-actions-row"><div class="transaction-row">${transactionRow(t)}</div><button class="secondary-button" data-purchase-edit="${t.id}">ویرایش</button><button class="secondary-button" data-purchase-delete="${t.id}">حذف</button></div>`).join("") : `<div class="empty-inline"><span>↙</span><p>هنوز خریدی ثبت نشده است.</p></div>`}</section>`;
  } else if (activeTab === "inventory") content = await inventoryView();
  else if (activeTab === "people") { parties = await listParties(); content = peopleView(); }
  else if (activeTab === "reports") content = await reportsView(await listTransactions());
  else if (activeTab === "more") content = await accountsView();
  else if (activeTab === "checks") content = await checksView();
  layout(content, subscription);
  bindReportControls();

  if (activeTab === "orders") bindOrderActions();
  document.querySelector("#new-sale")?.addEventListener("click", () => void openSaleModal());
  document.querySelectorAll<HTMLElement>("[data-sale-edit]").forEach(b => b.addEventListener("click", async () => { const t=(await listTransactions()).find(x=>x.id===b.dataset.saleEdit); if(t) await openSaleModal(t); }));
  document.querySelectorAll<HTMLElement>("[data-sale-delete]").forEach(b => b.addEventListener("click", async () => { const id=b.dataset.saleDelete||""; if(!id||!confirm("این فاکتور فروش حذف شود؟")) return; try { await deleteTransaction(id); showToast("فاکتور حذف شد"); await render(); } catch(e){ showToast(e instanceof Error?e.message:"حذف فاکتور ناموفق بود"); } }));
  document.querySelectorAll<HTMLElement>("[data-purchase-edit]").forEach(b => b.addEventListener("click", async () => { const t=(await listTransactions()).find(x=>x.id===b.dataset.purchaseEdit); if(!t) return; products=await listProducts(); parties=await listParties(); openPurchaseModal(products, parties, rial, async m=>{showToast(m);await render();}, t); }));
  document.querySelectorAll<HTMLElement>("[data-purchase-delete]").forEach(b => b.addEventListener("click", async () => { const id=b.dataset.purchaseDelete||""; if(!id||!confirm("این فاکتور خرید حذف شود؟")) return; try { await deleteTransaction(id); showToast("فاکتور خرید حذف شد"); await render(); } catch(e){ showToast(e instanceof Error?e.message:"حذف فاکتور خرید ناموفق بود"); } }));
  document.querySelector("#new-purchase")?.addEventListener("click", async () => {
    products = await listProducts(); parties = await listParties();
    openPurchaseModal(products, parties, rial, async m => { showToast(m); await render(); });
  });
  document.querySelector("#new-adjustment")?.addEventListener("click", async () => { products = await listProducts(); if (!products.length) { showToast("ابتدا یک کالا ثبت کنید"); return; } document.body.insertAdjacentHTML("beforeend", adjustmentModal()); bindAdjustmentModal(); });
  document.querySelector("#new-product")?.addEventListener("click", () => { document.body.insertAdjacentHTML("beforeend", productModal()); bindProductModal(); });
  document.querySelectorAll<HTMLElement>("[data-product-edit]").forEach(button => button.addEventListener("click", async event => {
    event.stopPropagation();
    const id = button.dataset.productEdit; const product = id ? (await listProducts()).find(p => p.id === id) : undefined;
    if (!product) return;
    document.body.insertAdjacentHTML("beforeend", productModal(product));
    const modal = document.querySelector<HTMLElement>("#product-modal"); if (modal) { modal.dataset.editId = product.id; bindProductModal(); }
  }));
  document.querySelectorAll<HTMLElement>("[data-product-delete]").forEach(button => button.addEventListener("click", async event => {
    event.stopPropagation();
    const id = button.dataset.productDelete; const product = id ? (await listProducts()).find(p => p.id === id) : undefined;
    if (!product || !confirm(`کالای «${product.name}» حذف شود؟`)) return;
    try { await deleteProduct(product.id); showToast("کالا حذف شد"); await render(); } catch (e) { showToast(e instanceof Error ? e.message : "حذف کالا ناموفق بود"); }
  }));
  document.querySelector("#new-party")?.addEventListener("click", () => { document.body.insertAdjacentHTML("beforeend", partyModal()); bindPartyModal(); });
  document.querySelectorAll<HTMLElement>("[data-party-edit]").forEach(button => button.addEventListener("click", async event => {
    event.stopPropagation();
    const id = button.dataset.partyEdit; const party = id ? (await listParties()).find(p => p.id === id) : undefined;
    if (!party) return;
    document.body.insertAdjacentHTML("beforeend", partyModal(party));
    const modal = document.querySelector<HTMLElement>("#party-modal"); if (modal) { modal.dataset.editId = party.id; bindPartyModal(); }
  }));
  document.querySelectorAll<HTMLElement>("[data-party-delete]").forEach(button => button.addEventListener("click", async event => {
    event.stopPropagation();
    const id = button.dataset.partyDelete; const party = id ? (await listParties()).find(p => p.id === id) : undefined;
    if (!party || !confirm(`شخص «${party.name}» حذف شود؟`)) return;
    try { await deleteParty(party.id); showToast("شخص حذف شد"); await render(); } catch (e) { showToast(e instanceof Error ? e.message : "حذف شخص ناموفق بود"); }
  }));
  document.querySelector("#new-received-check")?.addEventListener("click", async () => { const [parties,accounts]=await Promise.all([listParties(),listAccounts()]); document.body.insertAdjacentHTML("beforeend", checkModal("received",parties,accounts)); const modal=document.querySelector<HTMLElement>("#check-modal"); if(modal) void bindCheckModal(modal,"received",async m=>{showToast(m);await render();}); });
  document.querySelector("#new-issued-check")?.addEventListener("click", async () => { const [parties,accounts]=await Promise.all([listParties(),listAccounts()]); document.body.insertAdjacentHTML("beforeend", checkModal("issued",parties,accounts)); const modal=document.querySelector<HTMLElement>("#check-modal"); if(modal) void bindCheckModal(modal,"issued",async m=>{showToast(m);await render();}); });
  void bindCheckStatuses(m=>showToast(m)); void bindCheckActions(m=>{showToast(m); void render();});
  document.querySelectorAll<HTMLElement>("[data-check-edit]").forEach(b => b.addEventListener("click", async () => {
    const id=b.dataset.checkEdit||""; const check=(await (await import("./db")).listChecks()).find(x=>x.id===id); if(!check) return;
    if(check.clearedEntryId){ showToast("چک وصول‌شده قابل ویرایش نیست"); return; } const [ps,as]=await Promise.all([listParties(),listAccounts()]);
    document.body.insertAdjacentHTML("beforeend", checkModal(check.direction, ps, as, check));
    const m=document.querySelector<HTMLElement>("#check-modal"); if(m){m.dataset.editId=check.id; void bindCheckModal(m,check.direction,async msg=>{showToast(msg);await render();});}
  }));
  document.querySelector("#new-account")?.addEventListener("click", () => { document.body.insertAdjacentHTML("beforeend", accountModal()); const modal = document.querySelector<HTMLElement>("#account-modal"); if (modal) void bindAccountModal(modal, async m => { showToast(m); await render(); }); });
  document.querySelectorAll<HTMLElement>("[data-account-edit]").forEach(button => button.addEventListener("click", async event => {
    event.stopPropagation();
    const id = button.dataset.accountEdit; if (!id) return;
    const account = (await listAccounts()).find(a => a.id === id); if (!account) return;
    document.body.insertAdjacentHTML("beforeend", accountModal(account));
    const modal = document.querySelector<HTMLElement>("#account-modal");
    if (modal) { modal.dataset.editId = account.id; modal.dataset.createdAt = String(account.createdAt); void bindAccountModal(modal, async m => { showToast(m); await render(); }); }
  }));
  document.querySelectorAll<HTMLElement>("[data-account-delete]").forEach(button => button.addEventListener("click", async event => {
    event.stopPropagation();
    const id = button.dataset.accountDelete; if (!id) return;
    const account = (await listAccounts()).find(a => a.id === id); if (!account) return;
    if (!confirm(`حساب «${account.name}» حذف شود؟`)) return;
    try { const db = await import("./db"); await db.deleteAccount(id); showToast("حساب حذف شد"); await render(); }
    catch (e) { showToast(e instanceof Error ? e.message : "حذف حساب ناموفق بود"); }
  }));
  document.querySelector("#new-transfer")?.addEventListener("click", async () => { const accounts = await listAccounts(); if (accounts.length < 2) { showToast("برای انتقال حداقل دو حساب ثبت کنید"); return; } const balances = await getAccountBalances(); document.body.insertAdjacentHTML("beforeend", transferModal(accounts, balances)); const modal = document.querySelector<HTMLElement>("#transfer-modal"); if (modal) void bindTransferModal(modal, async m => { showToast(m); await render(); }); });
  document.querySelectorAll<HTMLElement>("[data-account-ledger]").forEach(b => b.addEventListener("click", async () => {
    try {
      const id = b.dataset.accountLedger; if (!id) return;
      document.body.insertAdjacentHTML("beforeend", await accountLedgerModal(id));
      const modal = document.querySelector<HTMLElement>("#account-ledger-modal");
      if (modal) await bindAccountLedger(modal);
    } catch (e) { showToast(e instanceof Error ? e.message : "نمایش گردش حساب ناموفق بود"); }
  }));
  document.querySelector("#more-refresh")?.addEventListener("click", () => render());
  window.addEventListener("sai-sai-refresh", () => { void render(); });
  document.querySelector("#report-print")?.addEventListener("click", async () => {
    try {
      await printHtml("گزارش سود و زیان سای‌سای", document.querySelector("#view")?.innerHTML || "", "portrait");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "چاپ / PDF در دسترس نیست");
    }
  });
  document.querySelector("#report-csv")?.addEventListener("click", async () => {
    try {
      const [transactions, expenses] = await Promise.all([listTransactions(), listExpenses()]);
      const workbook = buildReportWorkbook(transactions, expenses);
      const base64 = XLSX.write(workbook, { bookType: "xlsx", type: "base64" });
      await shareBase64File(`sai-sai-report-${new Date().toISOString().slice(0,10)}.xlsx`, base64, "گزارش Excel سای‌سای");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "خروجی Excel ناموفق بود");
    }
  });
  document.querySelectorAll<HTMLElement>("[data-settlement-edit]").forEach(b => b.addEventListener("click", async () => { const t=(await listTransactions()).find(x=>x.id===b.dataset.settlementEdit); if(t && (t.type==="receipt"||t.type==="payment")) await openSettlement(t.type,t); }));
  document.querySelectorAll<HTMLElement>("[data-settlement-delete]").forEach(b => b.addEventListener("click", async () => { const id=b.dataset.settlementDelete||""; if(!id||!confirm("این دریافت/پرداخت حذف شود؟")) return; try { await deleteTransaction(id); showToast("ثبت حذف شد"); await render(); } catch(e){ showToast(e instanceof Error?e.message:"حذف ناموفق بود"); } }));
  document.querySelectorAll<HTMLElement>("[data-expense-edit]").forEach(b => b.addEventListener("click", async () => {
    const e=(await listExpenses()).find(x=>x.id===b.dataset.expenseEdit); if(!e) return;
    (window as typeof window & { __saiAccounts?: unknown[] }).__saiAccounts=await listAccounts();
    document.body.insertAdjacentHTML("beforeend", expenseModal(e));
    const m=document.querySelector<HTMLElement>("#expense-modal"); if(m){ m.dataset.editId=e.id; bindExpenseModal(); m.querySelector<HTMLSelectElement>("#expense-account")!.value=e.accountId||""; }
  }));
  document.querySelectorAll<HTMLElement>("[data-expense-delete]").forEach(b => b.addEventListener("click", async () => {
    const id=b.dataset.expenseDelete||""; if(!id||!confirm("این هزینه حذف شود؟")) return;
    try { await deleteExpense(id); showToast("هزینه حذف شد"); await render(); } catch(e){ showToast(e instanceof Error?e.message:"حذف هزینه ناموفق بود"); }
  }));
  document.querySelector("#more-backup")?.addEventListener("click", async () => {
    const [products, parties, transactions, expenses, accounts, accountEntries, checks, movements] = await Promise.all([listProducts(), listParties(), listTransactions(), listExpenses(), listAccounts(), (await import("./db")).listAccountEntries(), (await import("./db")).listChecks(), listMovements()]);
    const payload = { version: 2, exportedAt: Date.now(), products, parties, transactions, expenses, accounts, accountEntries, checks, movements };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `sai-sai-backup-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url);
    showToast("فایل پشتیبان آماده شد");
  });
  document.querySelector("#more-restore")?.addEventListener("click", () => { document.body.insertAdjacentHTML("beforeend", backupRestoreModal()); const m=document.querySelector<HTMLElement>("#backup-restore-modal")!; m.querySelector("#backup-restore-close")?.addEventListener("click",()=>m.remove()); m.querySelector("#backup-restore-submit")?.addEventListener("click",async()=>{ try { const input=m.querySelector<HTMLInputElement>("#backup-file")!; const file=input.files?.[0]; if(!file) throw new Error("فایل پشتیبان را انتخاب کنید"); if(!confirm("اطلاعات فعلی با این پشتیبان جایگزین می‌شود. ادامه می‌دهید؟")) return; const data=JSON.parse(await file.text()); if(!Array.isArray(data.products)||!Array.isArray(data.parties)||!Array.isArray(data.transactions)) throw new Error("فایل پشتیبان معتبر نیست"); const db=await import("./db"); await db.restoreBackup(data); m.remove(); showToast("بازیابی با موفقیت انجام شد"); await render(); } catch(e){showToast(e instanceof Error?e.message:"بازیابی ناموفق بود");} }); });

}

function placeholder(title: string, text: string): string {
  return pageHead("سای‌سای", title, text) + `<section class="panel locked-panel"><div>◈</div><h3>این بخش در حال تکمیل است</h3><p class="muted">زیرساخت اصلی آماده است و قابلیت‌های تکمیلی در نسخه‌های بعدی اضافه می‌شوند.</p></section>`;
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const isCapacitorNative = location.hostname === "localhost";
    if (isCapacitorNative) {
      // Capacitor bundles hashed assets locally. A long-lived PWA cache can otherwise
      // keep an older JS bundle and make bug fixes appear to have no effect.
      void navigator.serviceWorker.getRegistrations()
        .then(registrations => Promise.all(registrations.map(registration => registration.unregister())))
        .then(() => "caches" in window ? caches.keys() : [])
        .then(keys => Promise.all((keys as string[]).filter(key => key.startsWith("sai-sai-")).map(key => caches.delete(key))))
        .catch(() => undefined);
    } else {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  });
}

void (async () => {
  try {
    await setupNativeExitConfirmation();
    // Repair legacy/missing sale-purchase stock movements before the first render.
    await repairDataIntegrity();
  } catch (error) {
    console.error("Sayar startup repair/setup failed", error);
  }
  await render();
})();
