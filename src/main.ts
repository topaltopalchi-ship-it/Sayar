import "./style.css";
import {
  addParty, addProduct, addSale, addSettlement, getDashboard, getStock,
  listParties, listProducts, listTransactions
} from "./db";
import { createMonthlyCheckout, getSubscription, type Subscription } from "./billing";
import type { Party, Product, Transaction, TransactionLine } from "./domain";
import { openPurchaseModal } from "./purchase-ui";

type Tab = "dashboard" | "sales" | "purchases" | "inventory" | "people" | "reports" | "more";

const app = document.querySelector<HTMLDivElement>("#app")!;
const navItems: Array<[Tab, string, string]> = [
  ["dashboard", "داشبورد", "⌂"], ["sales", "فروش", "↗"], ["purchases", "خرید", "↙"],
  ["inventory", "موجودی", "▤"], ["people", "اشخاص", "♙"], ["reports", "گزارش‌ها", "◫"], ["more", "بیشتر", "⋯"],
];
const money = new Intl.NumberFormat("fa-IR");
const dateTime = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
});
let activeTab: Tab = "dashboard";
let products: Product[] = [];
let parties: Party[] = [];

const rial = (value: number) => `${money.format(Math.round(value))} ریال`;
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
        <div><span class="eyebrow">مدیریت مالی و فروش</span><h1>سایار</h1></div>
        <div class="header-actions">
          <span class="plan-pill ${subscription.status}">${subscription.status === "active" ? "اشتراک فعال" : "نسخه آزمایشی"}</span>
          <button class="icon-button" id="settings" aria-label="اشتراک">⚙</button>
        </div>
      </header>
      <div id="view">${content}</div>
      <nav class="bottom-nav" aria-label="ناوبری اصلی">
        ${navItems.map(([id,label,icon]) => `<button class="nav-item ${activeTab === id ? "active" : ""}" data-nav="${id}"><span>${icon}</span><small>${label}</small></button>`).join("")}
      </nav>
      <div id="toast" class="toast" role="status" aria-live="polite"></div>
    </main>`;
  document.querySelectorAll<HTMLButtonElement>("[data-nav]").forEach(b =>
    b.addEventListener("click", async () => { activeTab = b.dataset.nav as Tab; await render(); })
  );
  document.querySelector<HTMLButtonElement>("#settings")?.addEventListener("click", () => showSubscription(subscription));
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
    ${subscription.status !== "active" ? `<section class="subscription-card"><div><span class="eyebrow">اشتراک سایار</span><h3>برای استفاده از نسخه کامل، اشتراک ماهانه فعال کنید.</h3><p class="muted">بعد از تأیید موفق پرداخت، دسترسی از سمت سرور فعال می‌شود.</p></div><button class="primary-button" data-subscribe>خرید اشتراک ماهانه</button></section>` : ""}
    <section class="stats-grid">
      ${stat("فروش امروز", rial(d.salesToday), "primary")}${stat("دریافت امروز", rial(d.receiptsToday), "success")}
      ${stat("مطالبات", rial(d.receivables), "warning")}${stat("موجودی کم", `${money.format(d.lowStock)} کالا`, "danger")}
    </section>
    <section class="section"><div class="section-head"><h3>عملیات سریع</h3><span class="muted">ثبت سریع</span></div>
      <div class="quick-grid">
        <button class="quick-card" data-action="sale"><b>＋</b><span>ثبت فروش</span></button>
        <button class="quick-card" data-action="purchase"><b>⇩</b><span>ثبت خرید</span></button>
        <button class="quick-card" data-action="receipt"><b>↙</b><span>دریافت وجه</span></button>
        <button class="quick-card" data-action="expense"><b>−</b><span>ثبت هزینه</span></button>
      </div>
    </section>
    <section class="section panel"><div class="section-head"><h3>آخرین تراکنش‌ها</h3><span class="muted">۵ مورد اخیر</span></div>${recent}</section>`;
}

function transactionRow(t: Transaction): string {
  const labels: Record<Transaction["type"], string> = {
    sale: "فروش", purchase: "خرید", receipt: "دریافت", payment: "پرداخت", expense: "هزینه", stockAdjustment: "اصلاح موجودی"
  };
  const icons: Record<Transaction["type"], string> = { sale: "↗", purchase: "↙", receipt: "↓", payment: "↑", expense: "−", stockAdjustment: "±" };
  return `<div class="transaction-row"><div class="transaction-icon">${icons[t.type]}</div><div class="transaction-main"><strong>${labels[t.type]}</strong><small>${t.description || dateLabel(t.date)}</small></div><b>${rial(t.amount)}</b></div>`;
}

function saleModal(): string {
  const productOptions = products.map(p => `<option value="${p.id}">${p.name} — ${rial(p.salePrice)} / ${p.unit}</option>`).join("");
  const partyOptions = parties.filter(p => p.type === "customer" || p.type === "both").map(p => `<option value="${p.id}">${p.name}</option>`).join("");
  return `
    <div class="modal-backdrop" id="sale-modal"><section class="modal" role="dialog" aria-modal="true">
      <button class="modal-close" id="sale-close">×</button><span class="eyebrow">فاکتور فروش</span><h2>ثبت فروش</h2>
      <label class="field"><span>کالا</span><select id="sale-product">${productOptions}</select></label>
      <div class="form-grid"><label class="field"><span>مقدار</span><input id="sale-quantity" type="number" min="0.001" step="0.001" value="1"></label>
      <label class="field"><span>تخفیف</span><input id="sale-discount" type="number" min="0" value="0"></label></div>
      <label class="field"><span>مشتری</span><select id="sale-party"><option value="">بدون انتخاب</option>${partyOptions}</select></label>
      <label class="field"><span>مبلغ پرداختی</span><input id="sale-paid" type="number" min="0" value="0"></label>
      <div class="sale-summary"><span>مبلغ فاکتور</span><strong id="sale-total">۰ ریال</strong></div>
      <button class="primary-button wide" id="sale-submit">ثبت فاکتور و کاهش موجودی</button>
    </section></div>`;
}

async function openSaleModal(): Promise<void> {
  products = await listProducts(); parties = await listParties();
  if (!products.length) { showToast("ابتدا یک کالا در موجودی ثبت کنید"); return; }
  document.body.insertAdjacentHTML("beforeend", saleModal());
  const modal = document.querySelector<HTMLDivElement>("#sale-modal")!;
  const product = modal.querySelector<HTMLSelectElement>("#sale-product")!;
  const quantity = modal.querySelector<HTMLInputElement>("#sale-quantity")!;
  const discount = modal.querySelector<HTMLInputElement>("#sale-discount")!;
  const paid = modal.querySelector<HTMLInputElement>("#sale-paid")!;
  const total = modal.querySelector<HTMLElement>("#sale-total")!;
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
      await addSale({ date: Date.now(), partyId: modal.querySelector<HTMLSelectElement>("#sale-party")!.value || undefined, description: `فروش ${p.name}`, lines: [line], paid: paidValue });
      modal.remove(); showToast(`فروش ثبت شد؛ مانده ${rial(amount - paidValue)}`); await render();
    } catch (e) { showToast(e instanceof Error ? e.message : "ثبت فروش ناموفق بود"); }
  });
  update();
}

async function inventoryView(): Promise<string> {
  products = await listProducts();
  const rows = await Promise.all(products.map(async p => {
    const stock = await getStock(p.id);
    return `<div class="product-row"><div><strong>${p.name}</strong><small>${p.sku || "بدون کد"} · ${p.unit}</small></div><div class="stock-number ${stock <= p.lowStock ? "low" : ""}">${money.format(stock)}<small>موجودی</small></div><b>${rial(p.salePrice)}</b></div>`;
  }));
  return pageHead("انبار", "موجودی کالا", "موجودی از روی گردش‌های ثبت‌شده محاسبه می‌شود.", `<button class="primary-button" id="new-product">＋ کالای جدید</button>`) +
    `<section class="panel">${rows.length ? rows.join("") : `<div class="empty-inline"><span>▤</span><p>هنوز کالایی ثبت نشده است.</p></div>`}</section>`;
}

function productModal(): string {
  return `<div class="modal-backdrop" id="product-modal"><section class="modal"><button class="modal-close" id="product-close">×</button><span class="eyebrow">کاتالوگ کالا</span><h2>افزودن کالا</h2>
    <label class="field"><span>نام کالا</span><input id="p-name" placeholder="مثلاً برنج ایرانی"></label>
    <div class="form-grid"><label class="field"><span>کد کالا</span><input id="p-sku" placeholder="اختیاری"></label><label class="field"><span>واحد</span><select id="p-unit"><option>عدد</option><option>کیلوگرم</option><option>گرم</option><option>لیتر</option><option>متر</option><option>بسته</option></select></label></div>
    <div class="form-grid"><label class="field"><span>قیمت خرید</span><input id="p-buy" type="number" min="0"></label><label class="field"><span>قیمت فروش</span><input id="p-sale" type="number" min="0"></label></div>
    <label class="field"><span>حداقل موجودی</span><input id="p-low" type="number" min="0" step="0.001" value="5"></label>
    <button class="primary-button wide" id="product-submit">ذخیره کالا</button></section></div>`;
}

function bindProductModal(): void {
  const modal = document.querySelector<HTMLDivElement>("#product-modal")!;
  modal.querySelector("#product-close")?.addEventListener("click", () => modal.remove());
  modal.querySelector("#product-submit")?.addEventListener("click", async () => {
    try {
      const name = (modal.querySelector<HTMLInputElement>("#p-name")!.value).trim();
      const unit = modal.querySelector<HTMLSelectElement>("#p-unit")!.value as Product["unit"];
      if (!name) throw new Error("نام کالا الزامی است");
      await addProduct({ name, sku: modal.querySelector<HTMLInputElement>("#p-sku")!.value.trim(), unit,
        purchasePrice: Math.max(0, Number(modal.querySelector<HTMLInputElement>("#p-buy")!.value) || 0),
        salePrice: Math.max(0, Number(modal.querySelector<HTMLInputElement>("#p-sale")!.value) || 0),
        lowStock: Math.max(0, Number(modal.querySelector<HTMLInputElement>("#p-low")!.value) || 0) });
      modal.remove(); showToast("کالا با موفقیت ثبت شد"); await render();
    } catch (e) { showToast(e instanceof Error ? e.message : "ذخیره کالا ناموفق بود"); }
  });
}

function peopleView(): string {
  const customerCount = parties.filter(p => p.type === "customer" || p.type === "both").length;
  const supplierCount = parties.filter(p => p.type === "supplier" || p.type === "both").length;
  return pageHead("دفتر اشخاص", "مشتریان و تأمین‌کنندگان", `${money.format(customerCount)} مشتری · ${money.format(supplierCount)} تأمین‌کننده`, `<button class="primary-button" id="new-party">＋ افزودن شخص</button>`) +
    `<section class="panel">${parties.length ? parties.map(p => `<div class="person-row"><div class="person-avatar">${p.name.slice(0,1)}</div><div><strong>${p.name}</strong><small>${p.phone || "بدون شماره"} · ${p.type === "customer" ? "مشتری" : p.type === "supplier" ? "تأمین‌کننده" : "مشتری و تأمین‌کننده"}</small></div></div>`).join("") : `<div class="empty-inline"><span>♙</span><p>هنوز شخصی ثبت نشده است.</p></div>`}</section>`;
}

function reportsView(transactions: Transaction[]): string {
  const sales = transactions.filter(t => t.type === "sale").reduce((s,t)=>s+t.amount,0);
  const purchases = transactions.filter(t => t.type === "purchase").reduce((s,t)=>s+t.amount,0);
  const receipts = transactions.filter(t => t.type === "receipt").reduce((s,t)=>s+t.paid,0);
  const payments = transactions.filter(t => t.type === "payment").reduce((s,t)=>s+t.paid,0);
  const expenses = transactions.filter(t => t.type === "expense").reduce((s,t)=>s+t.amount,0);
  return pageHead("تحلیل مالی", "گزارش عملکرد", "خلاصه‌ی تمام اسناد ثبت‌شده در دفتر سایار.") +
    `<section class="stats-grid">${stat("کل فروش",rial(sales),"primary")}${stat("کل خرید",rial(purchases),"warning")}${stat("دریافت",rial(receipts),"success")}${stat("پرداخت",rial(payments + expenses),"danger")}</section>
    <section class="panel report-list"><div><span>تعداد اسناد</span><b>${money.format(transactions.length)}</b></div><div><span>خالص فروش منهای خرید</span><b>${rial(sales - purchases)}</b></div><div><span>آخرین ثبت</span><b>${transactions[0] ? dateLabel(transactions[0].date) : "—"}</b></div></section>`;
}

function settlementModal(type: "receipt" | "payment"): string {
  const title = type === "receipt" ? "ثبت دریافت" : "ثبت پرداخت";
  const options = parties.map(p => `<option value="${p.id}">${p.name}</option>`).join("");
  return `<div class="modal-backdrop" id="settlement-modal"><section class="modal"><button class="modal-close" id="settlement-close">×</button><span class="eyebrow">حساب طرف‌حساب</span><h2>${title}</h2>
    <label class="field"><span>شخص</span><select id="settlement-party"><option value="">انتخاب کنید</option>${options}</select></label>
    <label class="field"><span>مبلغ</span><input id="settlement-amount" type="number" min="1" value="0"></label>
    <label class="field"><span>شرح</span><input id="settlement-description" placeholder="${title} بابت حساب"></label>
    <button class="primary-button wide" id="settlement-submit">ثبت ${type === "receipt" ? "دریافت" : "پرداخت"}</button></section></div>`;
}

async function openSettlement(type: "receipt" | "payment"): Promise<void> {
  parties = await listParties();
  if (!parties.length) { showToast("ابتدا یک شخص ثبت کنید"); return; }
  document.body.insertAdjacentHTML("beforeend", settlementModal(type));
  const modal = document.querySelector<HTMLDivElement>("#settlement-modal")!;
  modal.querySelector("#settlement-close")?.addEventListener("click", () => modal.remove());
  modal.querySelector("#settlement-submit")?.addEventListener("click", async () => {
    try {
      const partyId = modal.querySelector<HTMLSelectElement>("#settlement-party")!.value;
      const amount = Number(modal.querySelector<HTMLInputElement>("#settlement-amount")!.value);
      if (!partyId || amount <= 0) throw new Error("شخص و مبلغ را وارد کنید");
      await addSettlement({ type, date: Date.now(), partyId, amount, description: modal.querySelector<HTMLInputElement>("#settlement-description")!.value.trim() || (type === "receipt" ? "دریافت وجه" : "پرداخت وجه") });
      modal.remove(); showToast("ثبت شد"); await render();
    } catch (e) { showToast(e instanceof Error ? e.message : "ثبت ناموفق بود"); }
  });
}

function partyModal(): string {
  return `<div class="modal-backdrop" id="party-modal"><section class="modal"><button class="modal-close" id="party-close">×</button><span class="eyebrow">دفتر اشخاص</span><h2>افزودن شخص</h2>
    <label class="field"><span>نام</span><input id="party-name" placeholder="نام مشتری یا تأمین‌کننده"></label>
    <label class="field"><span>شماره تماس</span><input id="party-phone" inputmode="tel" placeholder="اختیاری"></label>
    <label class="field"><span>نوع</span><select id="party-type"><option value="customer">مشتری</option><option value="supplier">تأمین‌کننده</option><option value="both">هر دو</option></select></label>
    <button class="primary-button wide" id="party-submit">ذخیره شخص</button></section></div>`;
}

function bindPartyModal(): void {
  const modal = document.querySelector<HTMLDivElement>("#party-modal")!;
  modal.querySelector("#party-close")?.addEventListener("click", () => modal.remove());
  modal.querySelector("#party-submit")?.addEventListener("click", async () => {
    try {
      const name = modal.querySelector<HTMLInputElement>("#party-name")!.value.trim();
      if (!name) throw new Error("نام شخص الزامی است");
      await addParty({ name, phone: modal.querySelector<HTMLInputElement>("#party-phone")!.value.trim(), type: modal.querySelector<HTMLSelectElement>("#party-type")!.value as Party["type"] });
      modal.remove(); showToast("شخص با موفقیت ثبت شد"); await render();
    } catch (e) { showToast(e instanceof Error ? e.message : "ذخیره شخص ناموفق بود"); }
  });
}

function paywall(subscription: Subscription): string {
  const expiry = subscription.expiresAt ? `تا ${dateLabel(subscription.expiresAt)}` : "هنوز اشتراکی فعال نیست";
  return `<section class="paywall"><div class="paywall-logo">س</div><span class="eyebrow">نسخه کامل سایار</span><h2>مدیریت فروش، انبار و حساب‌ها در یکجا</h2><p class="muted">برای استفاده از نسخه کامل، اشتراک ماهانه را فعال کنید. تأیید خرید در سرور انجام می‌شود.</p>
    <div class="paywall-features"><span>✓ فروش و خرید</span><span>✓ موجودی و کالا</span><span>✓ مشتری و تأمین‌کننده</span><span>✓ گزارش‌های مدیریتی</span></div>
    <p class="subscription-expiry">${expiry}</p><button class="primary-button paywall-button" data-subscribe>خرید اشتراک ماهانه</button></section>`;
}

function showSubscription(subscription: Subscription): void {
  document.body.insertAdjacentHTML("beforeend", `<div class="modal-backdrop" id="sub-modal"><section class="modal"><button class="modal-close" id="sub-close">×</button><span class="eyebrow">اشتراک سایار</span><h2>اشتراک ماهانه</h2><div class="price-card"><div><strong>پلن حرفه‌ای</strong><span>دسترسی کامل</span></div><b>ماهانه</b></div><button class="primary-button wide" id="sub-buy">ادامه پرداخت</button></section></div>`);
  document.querySelector("#sub-close")?.addEventListener("click", () => document.querySelector("#sub-modal")?.remove());
  document.querySelector("#sub-buy")?.addEventListener("click", subscribe);
}

async function subscribe(): Promise<void> {
  try { window.location.href = await createMonthlyCheckout(); }
  catch (e) { showToast(e instanceof Error ? e.message : "پرداخت در دسترس نیست"); }
}

async function bindActions(): Promise<void> {
  document.querySelectorAll<HTMLButtonElement>("[data-action]").forEach(b => b.addEventListener("click", async () => {
    const action = b.dataset.action;
    if (action === "sale") await openSaleModal();
    else if (action === "purchase") {
      products = await listProducts(); parties = await listParties();
      openPurchaseModal(products, parties, rial, async m => { showToast(m); await render(); });
    } else if (action === "receipt") await openSettlement("receipt");
    else showToast("ثبت هزینه در مرحله بعد به دفتر هزینه‌ها متصل می‌شود");
  }));
}

async function render(): Promise<void> {
  const subscription = await getSubscription().catch(() => ({ status: "none", plan: "none", expiresAt: null } as Subscription));
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
      `<section class="panel">${tx.length ? tx.map(transactionRow).join("") : `<div class="empty-inline"><span>↗</span><p>هنوز فاکتور فروشی ثبت نشده است.</p></div>`}</section>`;
  } else if (activeTab === "purchases") {
    const tx = (await listTransactions()).filter(t => t.type === "purchase");
    content = pageHead("خرید", "دفتر خرید", "خریدها و افزایش خودکار موجودی.", `<button class="primary-button" id="new-purchase">＋ ثبت خرید</button>`) +
      `<section class="panel">${tx.length ? tx.map(transactionRow).join("") : `<div class="empty-inline"><span>↙</span><p>هنوز خریدی ثبت نشده است.</p></div>`}</section>`;
  } else if (activeTab === "inventory") content = await inventoryView();
  else if (activeTab === "people") { parties = await listParties(); content = peopleView(); }
  else if (activeTab === "reports") content = reportsView(await listTransactions());
  else content = placeholder("بیشتر", "تنظیمات، پشتیبان‌گیری، حساب کاربری و مدیریت اشتراک.");
  layout(content, subscription);

  document.querySelector("#new-sale")?.addEventListener("click", openSaleModal);
  document.querySelector("#new-purchase")?.addEventListener("click", async () => {
    products = await listProducts(); parties = await listParties();
    openPurchaseModal(products, parties, rial, async m => { showToast(m); await render(); });
  });
  document.querySelector("#new-product")?.addEventListener("click", () => { document.body.insertAdjacentHTML("beforeend", productModal()); bindProductModal(); });
  document.querySelector("#new-party")?.addEventListener("click", () => { document.body.insertAdjacentHTML("beforeend", partyModal()); bindPartyModal(); });
  await bindActions();
}

function placeholder(title: string, text: string): string {
  return pageHead("سایار", title, text) + `<section class="panel locked-panel"><div>◈</div><h3>این بخش در حال تکمیل است</h3><p class="muted">زیرساخت اصلی آماده است و قابلیت‌های تکمیلی در نسخه‌های بعدی اضافه می‌شوند.</p></section>`;
}

render();
