import "./style.css";
import {
  addParty, addProduct, updateProduct, deleteProduct, addSale, addSettlement, addExpense, addStockAdjustment, getDashboard, getStock, updateTransaction, deleteTransaction, updateExpense, deleteExpense,
  listParties, updateParty, deleteParty, listProducts, listTransactions, listExpenses, listMovements, calculateHistoricalCOGS
} from "./db";
import { createMonthlyCheckout, getSubscription, type Subscription } from "./billing";
import { lineTotal, type Party, type Product, type Transaction, type TransactionLine } from "./domain";
import { formatMoney, getCurrencyUnit, setCurrencyUnit } from "./settings";
import { openPurchaseModal } from "./purchase-ui";
import { accountModal, accountLedgerModal, accountsView, bindAccountLedger, bindAccountModal, bindTransferModal, transferModal } from "./accounts-ui";
import { getAccountBalances, listAccounts } from "./db";
import { checksView, checkModal, bindCheckModal, bindCheckStatuses, bindCheckActions } from "./checks-ui";
import { jalaliToGregorianDate, todayJalaliInput, formatJalaliInput, toPersianDigits } from "./calendar";

type Tab = "dashboard" | "sales" | "purchases" | "inventory" | "people" | "reports" | "more" | "checks";

const app = document.querySelector<HTMLDivElement>("#app")!;
const navItems: Array<[Tab, string, string]> = [
  ["dashboard", "داشبورد", "⌂"], ["sales", "فروش", "↗"], ["purchases", "خرید", "↙"],
  ["inventory", "موجودی", "▤"], ["people", "اشخاص", "♙"], ["reports", "گزارش‌ها", "◫"], ["more", "خزانه", "▣"], ["checks", "چک‌ها", "✓"],
];
const money = new Intl.NumberFormat("fa-IR");
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
  document.querySelector<HTMLButtonElement>("#settings")?.addEventListener("click", () => { document.body.insertAdjacentHTML("beforeend", uiModeModal()); bindUiModeModal(); });
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
    return `<tr><td>${money.format(i + 1)}</td><td>${p?.name || "کالای حذف‌شده"}</td><td>${money.format(line.quantity)} ${p?.unit || ""}</td><td>${rial(line.unitPrice)}</td><td>${rial(line.discount)}</td><td>${rial(lineTotal(line))}</td></tr>`;
  }).join("");
  const title = t.type === "purchase" ? "فاکتور خرید" : "فاکتور فروش";
  return `<div class="modal-backdrop invoice-backdrop" id="invoice-modal"><section class="modal invoice-modal">
    <button class="modal-close no-print" id="invoice-close">×</button>
    <div class="invoice-head"><div><span class="eyebrow">سای‌سای</span><h2>${title}</h2><p>${t.invoiceNumber || "بدون شماره"} · ${dateLabel(t.date)}</p></div><div class="invoice-brand">س</div></div>
    ${t.type === "sale" && t.amount > t.paid ? '<div class="invoice-unsettled">تسویه نشده</div>' : ''}
    <div class="invoice-party"><span>طرف حساب</span><strong>${party?.name || "ثبت نشده"}</strong><small>${party?.phone || "بدون شماره تماس"}</small></div>
    <div class="invoice-table-wrap"><table class="invoice-table"><thead><tr><th>#</th><th>کالا</th><th>مقدار</th><th>قیمت</th><th>تخفیف</th><th>جمع</th></tr></thead><tbody>${rows || '<tr><td colspan="6">بدون ردیف</td></tr>'}</tbody></table></div>
    <div class="invoice-summary"><div><span>جمع فاکتور</span><b>${rial(t.amount)}</b></div><div><span>پرداخت‌شده</span><b>${rial(t.paid)}</b></div><div class="invoice-balance"><span>مانده</span><b>${rial(Math.max(0, t.amount - t.paid))}</b></div></div>
    <div class="invoice-signatures">
      ${getInvoiceBranding().showSlogan && getInvoiceBranding().slogan ? '<img class="invoice-slogan" src="' + getInvoiceBranding().slogan + '" alt="شعار">' : ''}
      ${getInvoiceBranding().showStamp && getInvoiceBranding().stamp ? '<img class="invoice-stamp" src="' + getInvoiceBranding().stamp + '" alt="مهر">' : ''}
      ${getInvoiceBranding().showSignature && getInvoiceBranding().signature ? '<img class="invoice-signature" src="' + getInvoiceBranding().signature + '" alt="امضا">' : ''}
    </div>
    <div class="invoice-branding no-print"><button class="secondary-button" id="invoice-branding-settings">⚙ امضا، مهر و شعار</button></div>
    <div class="invoice-actions no-print"><button class="secondary-button" id="invoice-share">اشتراک‌گذاری فاکتور</button><button class="primary-button" id="invoice-print">چاپ / ذخیره PDF</button></div>
  </section></div>`;
}

async function openInvoice(t: Transaction): Promise<void> {
  const [productList, partyList] = await Promise.all([listProducts(), listParties()]);
  document.body.insertAdjacentHTML("beforeend", invoiceModal(t, new Map(productList.map(p => [p.id, p])), new Map(partyList.map(p => [p.id, p]))));
  document.querySelector("#invoice-close")?.addEventListener("click", () => document.querySelector("#invoice-modal")?.remove());
  document.querySelector("#invoice-print")?.addEventListener("click", () => window.print());
  document.querySelector("#invoice-share")?.addEventListener("click", async () => {
    const party = t.partyId ? partyList.find(p => p.id === t.partyId) : undefined;
    const title = t.type === "purchase" ? "فاکتور خرید" : "فاکتور فروش";
    const balance = Math.max(0, t.amount - t.paid);
    const text = [
      "سای‌سای | " + title,
      "شماره: " + (t.invoiceNumber || "بدون شماره"),
      "تاریخ: " + dateLabel(t.date),
      "طرف حساب: " + (party?.name || "ثبت نشده"),
      "مبلغ: " + rial(t.amount),
      "پرداخت‌شده: " + rial(t.paid),
      "مانده: " + rial(balance)
    ].join("\n");
    try {
      if (navigator.share) {
        await navigator.share({ title: title + " سای‌سای", text });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        showToast("اطلاعات فاکتور کپی شد");
      } else {
        showToast("اشتراک‌گذاری در این دستگاه در دسترس نیست");
      }
    } catch {
      // لغو اشتراک‌گذاری توسط کاربر، خطا محسوب نمی‌شود.
    }
  });
  document.querySelector("#invoice-branding-settings")?.addEventListener("click", () => { document.body.insertAdjacentHTML("beforeend", invoiceBrandingModal()); bindInvoiceBrandingModal(); });
}

function saleModal(existing?: Transaction): string {
  const productOptions = products.map(p => `<option value="${p.id}">${p.name} — ${rial(p.salePrice)} / ${p.unit}</option>`).join("");
  const partyOptions = parties.filter(p => p.type === "customer" || p.type === "both").map(p => `<option value="${p.id}">${p.name}</option>`).join("");
  const accountOptions = (window as typeof window & { __saiAccounts?: {id:string;name:string;type:string}[] }).__saiAccounts?.map(a => `<option value="${a.id}">${a.name}</option>`).join("") || "";
  return `
    <div class="modal-backdrop" id="sale-modal"><section class="modal" role="dialog" aria-modal="true">
      <button class="modal-close" id="sale-close">×</button><span class="eyebrow">فاکتور فروش</span><h2>${existing ? "ویرایش فروش" : "ثبت فروش"}</h2>
      <label class="field"><span>کالا</span><select id="sale-product">${productOptions}</select></label>
      <div class="form-grid"><label class="field"><span>مقدار</span><input id="sale-quantity" type="number" min="0.001" step="0.001" value="${existing?.lines[0]?.quantity ?? 1}"></label>
      <label class="field"><span>تخفیف</span><input id="sale-discount" type="number" min="0" value="${existing?.lines[0]?.discount ?? 0}"></label></div>
      <label class="field"><span>مشتری</span><select id="sale-party"><option value="">بدون انتخاب</option>${partyOptions}</select></label>
      <label class="field"><span>مبلغ پرداختی</span><input id="sale-paid" type="number" min="0" value="${existing?.paid ?? 0}"></label><label class="field"><span>دریافت به</span><select id="sale-account"><option value="">بدون انتخاب حساب</option>${accountOptions}</select></label>
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
    total.textContent = rial(Math.max(0, (Number(quantity.value) || 0) * (p?.salePrice ?? 0) - (Number(discount.value) || 0)));
  };
  [product, quantity, discount].forEach(el => el.addEventListener("input", update));
  product.addEventListener("change", update);
  modal.querySelector("#sale-close")?.addEventListener("click", () => modal.remove());
  modal.querySelector("#sale-submit")?.addEventListener("click", async () => {
    try {
      const p = products.find(x => x.id === product.value); const qty = Number(quantity.value);
      if (!p || qty <= 0) throw new Error("کالا و مقدار فروش را بررسی کنید");
      const disc = Math.max(0, Number(discount.value) || 0);
      const amount = Math.max(0, qty * p.salePrice - disc);
      const paidValue = Math.min(amount, Math.max(0, Number(paid.value) || 0));
      const line: TransactionLine = { productId: p.id, quantity: qty, unitPrice: p.salePrice, discount: disc };
      const savedSale = existing
        ? await updateTransaction(existing.id, { date: Date.now(), partyId: modal.querySelector<HTMLSelectElement>("#sale-party")!.value || undefined, accountId: modal.querySelector<HTMLSelectElement>("#sale-account")!.value || undefined, description: `فروش ${p.name}`, lines: [line], paid: paidValue })
        : await addSale({ date: Date.now(), partyId: modal.querySelector<HTMLSelectElement>("#sale-party")!.value || undefined, accountId: modal.querySelector<HTMLSelectElement>("#sale-account")!.value || undefined, description: `فروش ${p.name}`, lines: [line], paid: paidValue });
      modal.remove();
      try {
        await openInvoice(savedSale);
      } catch {
        showToast("فاکتور ثبت شد، اما نمایش فاکتور ناموفق بود");
      }
      showToast(`${existing ? "فاکتور ویرایش شد" : "فروش ثبت شد"}؛ مانده ${rial(amount - paidValue)}`);
      await render();
    } catch (e) { showToast(e instanceof Error ? e.message : "ثبت فروش ناموفق بود"); }
  });
  update();
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
    <label class="field"><span>مقدار تغییر</span><input id="adjust-qty" type="number" step="0.001" placeholder="مثبت برای افزایش، منفی برای کاهش"></label>
    <label class="field"><span>شرح</span><input id="adjust-desc" placeholder="مثلاً شمارش دوره‌ای انبار"></label>
    <button class="primary-button wide" id="adjust-submit">ثبت اصلاح موجودی</button></section></div>`;
}

function bindAdjustmentModal(): void {
  const modal = document.querySelector<HTMLDivElement>("#adjust-modal")!;
  modal.querySelector("#adjust-close")?.addEventListener("click", () => modal.remove());
  modal.querySelector("#adjust-submit")?.addEventListener("click", async () => {
    try {
      const productId = modal.querySelector<HTMLSelectElement>("#adjust-product")!.value;
      const quantity = Number(modal.querySelector<HTMLInputElement>("#adjust-qty")!.value);
      await addStockAdjustment({ date: Date.now(), productId, quantity, description: modal.querySelector<HTMLInputElement>("#adjust-desc")!.value.trim() || "اصلاح موجودی" });
      modal.remove(); showToast("اصلاح موجودی ثبت شد"); await render();
    } catch (e) { showToast(e instanceof Error ? e.message : "اصلاح موجودی ناموفق بود"); }
  });
}

function productModal(product?: Product): string {
  return `<div class="modal-backdrop" id="product-modal"><section class="modal"><button class="modal-close" id="product-close">×</button><span class="eyebrow">کاتالوگ کالا</span><h2>${product ? "ویرایش کالا" : "افزودن کالا"}</h2>
    <label class="field"><span>نام کالا</span><input id="p-name" placeholder="مثلاً برنج ایرانی" value="${product?.name || ""}"></label>
    <div class="form-grid"><label class="field"><span>کد کالا</span><input id="p-sku" placeholder="اختیاری" value="${product?.sku || ""}"></label><label class="field"><span>واحد</span><select id="p-unit">${["عدد","کیلوگرم","گرم","لیتر","متر","بسته"].map(u => `<option ${product?.unit === u ? "selected" : ""}>${u}</option>`).join("")}</select></label></div>
    <div class="form-grid"><label class="field"><span>قیمت خرید</span><input id="p-buy" type="number" min="0" value="${product?.purchasePrice ?? 0}"></label><label class="field"><span>قیمت فروش</span><input id="p-sale" type="number" min="0" value="${product?.salePrice ?? 0}"></label></div>
    <label class="field"><span>حداقل موجودی (هشدار)</span><input id="p-low" type="number" min="0" step="0.001" value="${product?.lowStock ?? 5}"></label>
    ${product ? "" : '<label class="field"><span>موجودی اولیه</span><input id="p-initial-stock" type="number" min="0" step="0.001" value="0" placeholder="مثلاً 20"></label>'}
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
        purchasePrice: Math.max(0, Number(modal.querySelector<HTMLInputElement>("#p-buy")!.value) || 0),
        salePrice: Math.max(0, Number(modal.querySelector<HTMLInputElement>("#p-sale")!.value) || 0),
        lowStock: Math.max(0, Number(modal.querySelector<HTMLInputElement>("#p-low")!.value) || 0),
      };
      const editId = modal.dataset.editId;
      if (editId) {
        const existing = (await listProducts()).find(p => p.id === editId);
        if (!existing) throw new Error("کالا پیدا نشد");
        await updateProduct({ ...existing, ...values });
      } else {
        const created = await addProduct(values);
        const initialStock = Math.max(0, Number(modal.querySelector<HTMLInputElement>("#p-initial-stock")?.value) || 0);
        if (initialStock > 0) {
          await addStockAdjustment({ date: Date.now(), productId: created.id, quantity: initialStock, description: "موجودی اولیه کالا" });
        }
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
  const defaultFrom = formatJalaliInput(localStorage.getItem("sai-sai-report-from") || todayJalaliInput());
  const defaultTo = formatJalaliInput(localStorage.getItem("sai-sai-report-to") || todayJalaliInput());
  const summary = `<section class="panel report-list"><div class="report-range" role="group" aria-label="بازه گزارش"><div class="report-range-item" role="button" tabindex="0" data-report-range="today">امروز</div><div class="report-range-item" role="button" tabindex="0" data-report-range="week">۷ روز</div><div class="report-range-item" role="button" tabindex="0" data-report-range="month">ماه جاری</div><div class="report-range-item" role="button" tabindex="0" data-report-range="all">همه</div></div><div class="report-custom-range">
  <label class="field"><span>از تاریخ شمسی</span><div class="report-date-input"><input id="report-from-date" data-jalali-input type="text" inputmode="numeric" dir="ltr" autocomplete="off" maxlength="10" placeholder="۱۴۰۵/۰۸/۰۷" value="${defaultFrom}" style="color:#111827!important;background:#ffffff!important;text-align:center!important;font-size:17px!important;font-weight:700!important;"><button type="button" class="report-slash" data-date-slash="report-from-date" style="color:#ffffff!important;background:#2b4266!important;">/</button></div></label>
  <label class="field"><span>تا تاریخ شمسی</span><div class="report-date-input"><input id="report-to-date" data-jalali-input type="text" inputmode="numeric" dir="ltr" autocomplete="off" maxlength="10" placeholder="۱۴۰۵/۰۸/۰۷" value="${defaultTo}" style="color:#111827!important;background:#ffffff!important;text-align:center!important;font-size:17px!important;font-weight:700!important;"><button type="button" class="report-slash" data-date-slash="report-to-date" style="color:#ffffff!important;background:#2b4266!important;">/</button></div></label>
  <button class="primary-button wide" id="report-apply-range">اعمال بازه</button>
</div><p class="muted">بازه فعال: ${label}</p></section>`;
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
function reportExcelCsv(transactions: Transaction[]): void {
  const rows = [["نوع","تاریخ","مبلغ","پرداخت","شرح"]];
  for (const t of transactions) rows.push([t.type, dateLabel(t.date), String(t.amount), String(t.paid), t.description || ""]);
  const csv = "\uFEFF" + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join(String.fromCharCode(10));
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href=url; a.download=`sai-sai-report-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
}

function reportExportButtons(): string {
  return `<section class="panel"><div class="page-head-row"><div><strong>خروجی گزارش</strong><p class="muted">گزارش فعلی را برای چاپ یا ذخیره PDF آماده کنید.</p></div><button class="secondary-button" id="report-csv">Excel / CSV</button><button class="secondary-button" id="report-print">چاپ / PDF</button></div></section>`;
}

function expenseModal(existing?: import("./domain").Expense): string {
  return `<div class="modal-backdrop" id="expense-modal"><section class="modal"><button class="modal-close" id="expense-close">×</button><span class="eyebrow">هزینه‌های جاری</span><h2>${existing ? "ویرایش هزینه" : "ثبت هزینه"}</h2>
    <label class="field"><span>عنوان هزینه</span><input id="expense-title" placeholder="مثلاً حمل‌ونقل، اجاره، حقوق" value="${existing?.title || ""}"></label>
    <label class="field"><span>مبلغ</span><input id="expense-amount" type="number" min="1" value="${existing?.amount ?? 0}"></label><label class="field"><span>پرداخت از</span><select id="expense-account"><option value="">بدون انتخاب حساب</option>${(window as typeof window & { __saiAccounts?: {id:string;name:string}[] }).__saiAccounts?.map(a => `<option value="${a.id}">${a.name}</option>`).join("") || ""}</select>
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
      const amount = Number(modal.querySelector<HTMLInputElement>("#expense-amount")!.value);
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
    <label class="field"><span>مبلغ</span><input id="settlement-amount" type="number" min="1" value="${existing?.amount ?? 0}"></label><label class="field"><span>${type === "receipt" ? "دریافت به" : "پرداخت از"}</span><select id="settlement-account"><option value="">بدون انتخاب حساب</option>${(window as typeof window & { __saiAccounts?: {id:string;name:string}[] }).__saiAccounts?.map(a => `<option value="${a.id}">${a.name}</option>`).join("") || ""}</select></label>
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
      const amount = Number(modal.querySelector<HTMLInputElement>("#settlement-amount")!.value);
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


function formatReportDateInput(input: HTMLInputElement): void {
  const raw = input.value
    .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[^0-9]/g, "")
    .slice(0, 8);

  let formatted = raw;
  if (raw.length > 4) formatted = `${raw.slice(0, 4)}/${raw.slice(4, 6)}`;
  if (raw.length > 6) formatted = `${raw.slice(0, 4)}/${raw.slice(4, 6)}/${raw.slice(6, 8)}`;

  if (input.value !== formatted) input.value = formatted;
}

async function applyReportRange(): Promise<void> {
  const fromInput = document.querySelector<HTMLInputElement>("#report-from-date");
  const toInput = document.querySelector<HTMLInputElement>("#report-to-date");
  if (!fromInput || !toInput) return;
  formatReportDateInput(fromInput);
  formatReportDateInput(toInput);
  const from = jalaliToGregorianDate(fromInput.value);
  const to = jalaliToGregorianDate(toInput.value);
  if (!from || !to) {
    showToast("تاریخ را کامل و به شکل ۱۴۰۵/۰۷/۱۶ وارد کنید");
    return;
  }
  if (from.getTime() > to.getTime()) {
    showToast("تاریخ شروع نباید بعد از تاریخ پایان باشد");
    return;
  }
  localStorage.setItem("sai-sai-report-from", fromInput.value);
  localStorage.setItem("sai-sai-report-to", toInput.value);
  localStorage.setItem("sai-sai-report-range", "custom");
  await render();
}

async function bindActions(): Promise<void> {
  const root = document.querySelector<HTMLDivElement>("#app");
  if (!root || root.dataset.actionsBound === "1") return;
  root.dataset.actionsBound = "1";

  root.addEventListener("input", event => {
    const target = event.target as HTMLInputElement;
    if (target.matches("[data-jalali-input]")) formatReportDateInput(target);
  });

  root.addEventListener("change", event => {
    const target = event.target as HTMLInputElement;
    if (target.matches("[data-jalali-input]")) formatReportDateInput(target);
  });

  root.addEventListener("click", async event => {
    const target = event.target as HTMLElement;
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

    const reportRange = target.closest<HTMLElement>("[data-report-range]");
    if (reportRange) {
      localStorage.setItem("sai-sai-report-range", reportRange.dataset.reportRange || "month");
      await render();
      return;
    }

    const reportApply = target.closest<HTMLButtonElement>("#report-apply-range");
    if (reportApply) {
      await applyReportRange();
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
document.querySelectorAll<HTMLInputElement>("[data-jalali-input]").forEach(input => {
  input.addEventListener("input", () => {
    formatReportDateInput(input);
  });

  input.addEventListener("change", () => {
    formatReportDateInput(input);
  });

  input.addEventListener("blur", () => formatReportDateInput(input));
  input.addEventListener("keyup", () => formatReportDateInput(input));
  input.addEventListener("compositionend", () => formatReportDateInput(input));
  input.addEventListener("paste", () => window.setTimeout(() => formatReportDateInput(input), 0));

  formatReportDateInput(input);
});

  document.querySelectorAll<HTMLElement>("[data-report-range]").forEach(button => {
    button.setAttribute("aria-pressed", (button.dataset.reportRange || "month") === (localStorage.getItem("sai-sai-report-range") || "month") ? "true" : "false");
    button.addEventListener("click", async () => {
      localStorage.setItem("sai-sai-report-range", button.dataset.reportRange || "month");
      await render();
    });
    button.addEventListener("keydown", async event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      localStorage.setItem("sai-sai-report-range", button.dataset.reportRange || "month");
      await render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-date-slash]").forEach(button => {
    button.addEventListener("click", () => {
      const input = document.querySelector<HTMLInputElement>("#" + button.dataset.dateSlash);
      if (!input) return;
      input.focus();
      const start = input.selectionStart ?? input.value.length;
      const before = input.value.slice(0, start);
      const after = input.value.slice(start);
      input.value = formatJalaliInput(before + "/" + after);
      const next = Math.min(input.value.length, start + 1);
      try { input.setSelectionRange(next, next); } catch {}
    });
  });
  document.querySelector("#report-apply-range")?.addEventListener("click", () => void applyReportRange());
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

  document.querySelectorAll<HTMLButtonElement>("[data-invoice-id]").forEach(b => b.addEventListener("click", async () => {
    const tx = (await listTransactions()).find(t => t.id === b.dataset.invoiceId);
    if (tx) await openInvoice(tx);
  }));
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
  document.querySelector("#report-print")?.addEventListener("click", () => window.print());
  document.querySelectorAll<HTMLElement>("[data-settlement-edit]").forEach(b => b.addEventListener("click", async () => { const t=(await listTransactions()).find(x=>x.id===b.dataset.settlementEdit); if(t && (t.type==="receipt"||t.type==="payment")) await openSettlement(t.type,t); }));
  document.querySelectorAll<HTMLElement>("[data-settlement-delete]").forEach(b => b.addEventListener("click", async () => { const id=b.dataset.settlementDelete||""; if(!id||!confirm("این دریافت/پرداخت حذف شود؟")) return; try { await deleteTransaction(id); showToast("ثبت حذف شد"); await render(); } catch(e){ showToast(e instanceof Error?e.message:"حذف ناموفق بود"); } }));
  document.querySelector("#report-csv")?.addEventListener("click", async () => reportExcelCsv(await listTransactions()));
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

if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => undefined));
render();
