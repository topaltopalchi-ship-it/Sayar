import "./style.css";
import { getDashboard, listProducts, getStock, listParties, addSale, addPurchase } from "./db";
import { createMonthlyCheckout, getSubscription, type Subscription } from "./billing";
import type { Product, Party, TransactionLine } from "./domain";

type Tab = "dashboard" | "sales" | "purchases" | "inventory" | "people" | "reports" | "more";

const app = document.querySelector<HTMLDivElement>("#app")!;
const navItems: Array<[Tab, string, string]> = [
  ["dashboard", "داشبورد", "⌂"], ["sales", "فروش", "▣"], ["purchases", "خرید", "⇩"],
  ["inventory", "موجودی", "▤"], ["people", "اشخاص", "♙"], ["reports", "گزارش‌ها", "◫"], ["more", "بیشتر", "⋯"],
];
const money = new Intl.NumberFormat("fa-IR");
const dateTime = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" });
let activeTab: Tab = "dashboard";
let products: Product[] = [];
let parties: Party[] = [];

const rial = (value: number) => `${money.format(Math.round(value))} ریال`;
const dateLabel = (value: number) => dateTime.format(new Date(value));

function showToast(message: string): void {
  const toast = document.querySelector<HTMLDivElement>("#toast");
  if (!toast) return;
  toast.textContent = message; toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2400);
}

function layout(content: string, subscription: Subscription): void {
  app.innerHTML = `
    <main class="shell">
      <header class="topbar">
        <div><span class="eyebrow">مدیریت مالی و فروش</span><h1>سایار</h1></div>
        <div class="header-actions">
          <span class="plan-pill ${subscription.status}">${subscription.status === "active" ? "اشتراک فعال" : "نسخه آزمایشی"}</span>
          <button class="icon-button" id="settings" aria-label="تنظیمات">⚙</button>
        </div>
      </header>
      <div id="view">${content}</div>
      <nav class="bottom-nav" aria-label="ناوبری اصلی">
        ${navItems.map(([id,label,icon]) => `<button class="nav-item ${activeTab===id?"active":""}" data-nav="${id}"><span>${icon}</span><small>${label}</small></button>`).join("")}
      </nav>
      <div id="toast" class="toast" role="status" aria-live="polite"></div>
    </main>`;
  document.querySelectorAll<HTMLButtonElement>("[data-nav]").forEach(b => b.addEventListener("click", async () => { activeTab=b.dataset.nav as Tab; await render(); }));
  document.querySelector<HTMLButtonElement>("#settings")?.addEventListener("click", () => showSubscription(subscription));
  document.querySelectorAll<HTMLButtonElement>("[data-subscribe]").forEach(b => b.addEventListener("click", subscribe));
}

function stat(label:string,value:string,tone:string):string {
  return `<article class="stat-card ${tone}"><span>${label}</span><strong>${value}</strong></article>`;
}

async function dashboardView(subscription: Subscription): Promise<string> {
  const d = await getDashboard();
  const recent = d.recent.length ? d.recent.map(t => `
    <div class="transaction-row"><div class="transaction-icon">${t.type==="sale"?"↗":t.type==="purchase"?"↙":"•"}</div>
    <div class="transaction-main"><strong>${t.type==="sale"?"فروش":t.type==="purchase"?"خرید":"تراکنش"}</strong><small>${dateLabel(t.date)}</small></div><b>${rial(t.amount)}</b></div>`).join("")
    : `<div class="empty-inline"><span>◌</span><p>هنوز تراکنشی ثبت نشده است.</p></div>`;

  return `
    <section class="hero"><div><p class="hero-kicker">داشبورد مدیریت</p><h2>وضعیت کسب‌وکار شما</h2><p class="muted">فروش، دریافت، مطالبات و موجودی را از یکجا کنترل کنید.</p></div><div class="hero-mark">س</div></section>
    ${subscription.status !== "active" ? `<section class="subscription-card"><div><span class="eyebrow">اشتراک سایار</span><h3>برای استفاده از نسخه کامل، اشتراک ماهانه فعال کنید.</h3><p class="muted">بعد از تأیید موفق پرداخت، دسترسی از سمت سرور فعال می‌شود.</p></div><button class="primary-button" data-subscribe>خرید اشتراک ماهانه</button></section>` : ""}
    <section class="stats-grid">
      ${stat("فروش امروز",rial(d.salesToday),"primary")}${stat("دریافت امروز",rial(d.receiptsToday),"success")}
      ${stat("مطالبات",rial(d.receivables),"warning")}${stat("موجودی کم",`${money.format(d.lowStock)} کالا`,"danger")}
    </section>
    <section class="section"><div class="section-head"><h3>عملیات سریع</h3><span class="muted">ثبت سریع</span></div>
      <div class="quick-grid">
        <button class="quick-card" data-locked="sales"><b>＋</b><span>ثبت فروش</span></button>
        <button class="quick-card" data-locked="purchases"><b>⇩</b><span>ثبت خرید</span></button>
        <button class="quick-card" data-locked="receipt"><b>↙</b><span>دریافت وجه</span></button>
        <button class="quick-card" data-locked="expense"><b>−</b><span>ثبت هزینه</span></button>
      </div>
    </section>
    <section class="section panel"><div class="section-head"><h3>آخرین تراکنش‌ها</h3><span class="muted">۵ مورد اخیر</span></div>${recent}</section>`;
}

function saleModal(): string {
  const productOptions = products.map(p =>
    `<option value="${p.id}">${p.name} — ${rial(p.salePrice)} / ${p.unit}</option>`
  ).join("");

  const partyOptions = parties.filter(p => p.type === "customer" || p.type === "both")
    .map(p => `<option value="${p.id}">${p.name}</option>`).join("");

  return `
    <div class="modal-backdrop" id="sale-modal">
      <section class="modal" role="dialog" aria-modal="true" aria-label="ثبت فروش">
        <button class="modal-close" id="sale-close">×</button>
        <span class="eyebrow">فاکتور فروش</span>
        <h2>ثبت فروش</h2>
        <label class="field"><span>کالا</span><select id="sale-product">${productOptions}</select></label>
        <div class="form-grid">
          <label class="field"><span>مقدار</span><input id="sale-quantity" type="number" min="0.001" step="0.001" value="1"></label>
          <label class="field"><span>تخفیف</span><input id="sale-discount" type="number" min="0" value="0"></label>
        </div>
        <label class="field"><span>مشتری</span><select id="sale-party"><option value="">بدون انتخاب</option>${partyOptions}</select></label>
        <label class="field"><span>مبلغ پرداختی</span><input id="sale-paid" type="number" min="0" value="0"></label>
        <div class="sale-summary"><span>مبلغ فاکتور</span><strong id="sale-total">۰ ریال</strong></div>
        <button class="primary-button wide" id="sale-submit">ثبت فاکتور و کاهش موجودی</button>
      </section>
    </div>`;
}

function bindSaleModal(): void {
  const modal = document.querySelector<HTMLDivElement>("#sale-modal");
  if (!modal) return;
  const product = document.querySelector<HTMLSelectElement>("#sale-product")!;
  const quantity = document.querySelector<HTMLInputElement>("#sale-quantity")!;
  const discount = document.querySelector<HTMLInputElement>("#sale-discount")!;
  const paid = document.querySelector<HTMLInputElement>("#sale-paid")!;
  const total = document.querySelector<HTMLElement>("#sale-total")!;

  const updateTotal = () => {
    const p = products.find(x => x.id === product.value);
    const value = Math.max(0, (Number(quantity.value) || 0) * (p?.salePrice ?? 0) - (Number(discount.value) || 0));
    total.textContent = rial(value);
  };
  product.addEventListener("change", updateTotal);
  quantity.addEventListener("input", updateTotal);
  discount.addEventListener("input", updateTotal);
  document.querySelector<HTMLButtonElement>("#sale-close")?.addEventListener("click", () => modal.remove());
  document.querySelector<HTMLButtonElement>("#sale-submit")?.addEventListener("click", async () => {
    try {
      const p = products.find(x => x.id === product.value);
      const qty = Number(quantity.value);
      const disc = Math.max(0, Number(discount.value) || 0);
      const amount = Math.max(0, qty * (p?.salePrice ?? 0) - disc);
      if (!p || qty <= 0) throw new Error("کالا و مقدار فروش را بررسی کنید");
      const paidValue = Math.min(amount, Math.max(0, Number(paid.value) || 0));
      const party = document.querySelector<HTMLSelectElement>("#sale-party")?.value || undefined;

      const line: TransactionLine = { productId: p.id, quantity: qty, unitPrice: p.salePrice, discount: disc };
      await addSale({
        date: Date.now(),
        partyId: party,
        description: `فروش ${p.name}`,
        lines: [line],
        paid: paidValue,
      });
      modal.remove();
      showToast(`فروش ثبت شد؛ مانده: ${rial(amount - paidValue)}`);
      await render();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "ثبت فروش ناموفق بود");
    }
  });
  updateTotal();
}

async function openSaleModal(): Promise<void> {
  products = await listProducts();
  parties = await listParties();
  if (!products.length) {
    showToast("ابتدا حداقل یک کالا در انبار ثبت کنید");
    return;
  }
  document.body.insertAdjacentHTML("beforeend", saleModal());
  bindSaleModal();
}

async function inventoryView(): Promise<string> {
  products = await listProducts();
  const rows = await Promise.all(products.map(async p => {
    const stock = await getStock(p.id);
    return `<div class="product-row"><div><strong>${p.name}</strong><small>${p.sku} · ${p.unit}</small></div><div class="stock-number ${stock<=p.lowStock?"low":""}">${money.format(stock)}<small>موجودی</small></div><b>${rial(p.salePrice)}</b></div>`;
  }));
  return `<section class="page-head"><span class="eyebrow">انبار</span><h2>موجودی کالا</h2><p class="muted">موجودی از روی گردش‌های ثبت‌شده محاسبه می‌شود.</p></section><section class="panel">${rows.length?rows.join(""):`<div class="empty-inline"><span>▤</span><p>هنوز کالایی ثبت نشده است.</p></div>`}</section>`;
}

function placeholder(title:string, text:string): string {
  return `<section class="page-head"><span class="eyebrow">سایار</span><h2>${title}</h2><p class="muted">${text}</p></section><section class="panel locked-panel"><div>◈</div><h3>این بخش در حال ساخت است</h3><p class="muted">هسته اطلاعاتی آن در معماری سایار در نظر گرفته شده و رابط کامل مرحله‌ای اضافه می‌شود.</p></section>`;
}

function lockedView(subscription: Subscription): string {
  const expiry = subscription.expiresAt
    ? `تا ${dateLabel(subscription.expiresAt)}`
    : "هنوز اشتراکی فعال نیست";

  return `
    <section class="paywall">
      <div class="paywall-logo">س</div>
      <span class="eyebrow">نسخه کامل سایار</span>
      <h2>برای ورود به سیستم، اشتراک ماهانه را فعال کنید</h2>
      <p class="muted">دسترسی به فروش، خرید، موجودی، اشخاص و گزارش‌ها بعد از تأیید پرداخت از سمت سرور باز می‌شود.</p>
      <div class="paywall-features">
        <span>✓ حسابداری و ثبت اسناد</span><span>✓ مدیریت فروش و خرید</span>
        <span>✓ انبار و موجودی</span><span>✓ گزارش‌های مدیریتی</span>
      </div>
      <p class="subscription-expiry">${expiry}</p>
      <button class="primary-button paywall-button" data-subscribe>خرید اشتراک ماهانه</button>
      <small>پس از پرداخت موفق، به سایار برگردید؛ وضعیت اشتراک خودکار بررسی می‌شود.</small>
    </section>`;
}

async function render(): Promise<void> {
  const subscription = await getSubscription().catch(() => ({ status:"none", plan:"none", expiresAt:null } as Subscription));
  if (subscription.status !== "active") {
    layout(lockedView(subscription), subscription);
    document.querySelector<HTMLButtonElement>("[data-subscribe]")?.addEventListener("click", subscribe);
    return;
  }

  let content = "";
  if (activeTab==="dashboard") content=await dashboardView(subscription);
  else if (activeTab==="inventory") content=await inventoryView();
  else if (activeTab==="sales") content=placeholder("فروش","ثبت فاکتور فروش، مشتری، کالا، تخفیف، پرداخت و مانده حساب.");
  else if (activeTab==="purchases") content=placeholder("خرید","ثبت خرید، تأمین‌کننده، پرداخت و افزایش خودکار موجودی.");
  else if (activeTab==="people") content=placeholder("اشخاص","مشتریان، تأمین‌کنندگان و گردش حساب هر شخص.");
  else if (activeTab==="reports") content=placeholder("گزارش‌ها","گزارش فروش، سود، موجودی، بدهی و مطالبات در بازه زمانی.");
  else content=placeholder("بیشتر","تنظیمات، پشتیبان‌گیری، حساب کاربری و مدیریت اشتراک.");
  layout(content, subscription);
  document.querySelectorAll<HTMLButtonElement>("[data-locked]").forEach(b => b.addEventListener("click", async () => {
    if (b.dataset.locked === "sales") await openSaleModal();
    else showToast("این عملیات در مرحله بعد فعال می‌شود.");
  }));
}
