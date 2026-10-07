import { addParty, addSettlement, getPartyBalances, listExpenses, listParties, listProducts, listTransactions } from "./db";
import type { Party, PartyType } from "./domain";
import { lineTotal } from "./domain";

const typeLabel: Record<PartyType,string> = {
  customer: "مشتری",
  supplier: "تأمین‌کننده",
  both: "مشتری و تأمین‌کننده",
};

export function partyModal(): string {
  return `
    <div class="modal-backdrop" id="party-modal">
      <section class="modal" role="dialog" aria-modal="true" aria-label="شخص جدید">
        <button class="modal-close" id="party-close">×</button>
        <span class="eyebrow">دفتر اشخاص</span>
        <h2>افزودن شخص</h2>
        <label class="field"><span>نام و نام خانوادگی / شرکت</span><input id="party-name" type="text" placeholder="مثلاً فروشگاه پارس"></label>
        <label class="field"><span>شماره تماس</span><input id="party-phone" type="tel" placeholder="09xxxxxxxxx"></label>
        <label class="field"><span>نوع حساب</span>
          <select id="party-type">
            <option value="customer">مشتری</option>
            <option value="supplier">تأمین‌کننده</option>
            <option value="both">مشتری و تأمین‌کننده</option>
          </select>
        </label>
        <button class="primary-button wide" id="party-submit">ثبت شخص</button>
      </section>
    </div>`;
}

export function settlementModal(party: Party, type: "receipt"|"payment"): string {
  const title = type === "receipt" ? "دریافت از مشتری" : "پرداخت به تأمین‌کننده";
  return `
    <div class="modal-backdrop" id="settlement-modal">
      <section class="modal" role="dialog" aria-modal="true" aria-label="${title}">
        <button class="modal-close" id="settlement-close">×</button>
        <span class="eyebrow">${type === "receipt" ? "دریافت" : "پرداخت"}</span>
        <h2>${title}</h2>
        <p class="muted">طرف حساب: <strong>${party.name}</strong></p>
        <label class="field"><span>مبلغ</span><input id="settlement-amount" type="number" min="1" value="0"></label>
        <label class="field"><span>شرح</span><input id="settlement-description" type="text" placeholder="${title}"></label>
        <button class="primary-button wide" id="settlement-submit">ثبت ${type === "receipt" ? "دریافت" : "پرداخت"}</button>
      </section>
    </div>`;
}

export async function saveNewParty(name: string, phone: string, type: PartyType): Promise<Party> {
  if (!name.trim()) throw new Error("نام شخص الزامی است");
  return addParty({ name: name.trim(), phone: phone.trim(), type });
}

export async function saveSettlement(partyId: string, type: "receipt"|"payment", amount: number, description: string): Promise<void> {
  await addSettlement({ partyId, type, amount, date: Date.now(), description: description.trim() || (type === "receipt" ? "دریافت از مشتری" : "پرداخت به تأمین‌کننده") });
}

export { typeLabel };

const money = new Intl.NumberFormat("fa-IR");
const rial = (v: number) => `${money.format(Math.round(v))} ریال`;
const dateLabel = (v: number) => new Intl.DateTimeFormat("fa-IR-u-ca-persian", {year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(v));

async function enhancePeople(): Promise<void> {
  const view = document.querySelector("#view");
  if (!view || !view.querySelector(".person-row") || view.dataset.balanceEnhanced === "1") return;
  view.dataset.balanceEnhanced = "1";
  const [parties, balances] = await Promise.all([listParties(), getPartyBalances()]);
  view.querySelectorAll<HTMLElement>(".person-row").forEach((row, index) => {
    const party = parties[index];
    if (!party) return;
    const balance = balances[party.id]?.balance ?? 0;
    const absolute = Math.abs(balance);
    let label = "تسویه";
    if (absolute) {
      if (party.type === "customer") label = balance > 0 ? "بدهکار" : "طلبکار";
      else if (party.type === "supplier") label = balance < 0 ? "بدهکار" : "طلبکار";
      else label = balance > 0 ? "خالص بدهکار" : "خالص طلبکار";
    }
    const badge = document.createElement("b");
    badge.className = "person-balance";
    badge.textContent = absolute ? `${label} · ${rial(absolute)}` : "تسویه";
    row.appendChild(badge);
  });
}

type RangeKey = "today" | "week" | "month" | "all";
let reportToken = 0;

function startOf(key: RangeKey): number {
  const d = new Date(); d.setHours(0,0,0,0);
  if (key === "week") { const day = d.getDay() || 7; d.setDate(d.getDate() - day + 1); }
  if (key === "month") d.setDate(1);
  if (key === "all") return 0;
  return d.getTime();
}

async function renderReport(from = 0, to = Date.now(), label = "همه دوره"): Promise<void> {
  const view = document.querySelector("#view");
  if (!view || !view.querySelector(".report-list")) return;
  const token = ++reportToken;
  const [transactions, expenses, products] = await Promise.all([listTransactions(), listExpenses(), listProducts()]);
  if (token !== reportToken) return;

  const tx = transactions.filter(t => t.date >= from && t.date <= to);
  const exp = expenses.filter(e => e.date >= from && e.date <= to);
  const costs = new Map(products.map(p => [p.id, p.purchasePrice]));
  const sales = tx.filter(t => t.type === "sale");
  const purchases = tx.filter(t => t.type === "purchase");
  const receipts = tx.filter(t => t.type === "receipt");
  const payments = tx.filter(t => t.type === "payment");
  const salesTotal = sales.reduce((s,t)=>s+t.amount,0);
  const purchasesTotal = purchases.reduce((s,t)=>s+t.amount,0);
  const receiptsTotal = receipts.reduce((s,t)=>s+t.amount,0);
  const paymentsTotal = payments.reduce((s,t)=>s+t.amount,0);
  const expensesTotal = exp.reduce((s,e)=>s+e.amount,0);
  const grossProfit = sales.reduce((sum,t)=>sum+t.lines.reduce((a,line)=>a+lineTotal(line)-line.quantity*(costs.get(line.productId)??0),0),0);
  const netProfit = grossProfit - expensesTotal;

  const anchor = view.querySelector(".report-list");
  const parent = anchor?.parentElement;
  if (!parent || !anchor) return;
  view.querySelector(".report-insights")?.remove();

  const box = document.createElement("section");
  box.className = "report-insights";
  box.innerHTML = `
    <div class="report-filters">
      <button class="report-filter" data-range="today">امروز</button>
      <button class="report-filter" data-range="week">این هفته</button>
      <button class="report-filter" data-range="month">این ماه</button>
      <button class="report-filter" data-range="all">همه</button>
      <label class="report-date"><span>از</span><input id="report-from" type="date"></label>
      <label class="report-date"><span>تا</span><input id="report-to" type="date"></label>
      <button class="primary-button report-apply" id="report-apply">اعمال بازه</button>
    </div>
    <div class="report-range-label">بازه: <b>${label}</b></div>
    <section class="stats-grid">
      <article class="stat-card primary"><span>فروش</span><strong>${rial(salesTotal)}</strong></article>
      <article class="stat-card warning"><span>خرید</span><strong>${rial(purchasesTotal)}</strong></article>
      <article class="stat-card success"><span>دریافت</span><strong>${rial(receiptsTotal)}</strong></article>
      <article class="stat-card danger"><span>هزینه</span><strong>${rial(expensesTotal)}</strong></article>
    </section>
    <section class="panel report-list">
      <div><span>سود ناخالص تقریبی</span><b>${rial(grossProfit)}</b></div>
      <div><span>سود خالص پس از هزینه‌ها</span><b>${rial(netProfit)}</b></div>
      <div><span>پرداخت به تأمین‌کنندگان</span><b>${rial(paymentsTotal)}</b></div>
      <div><span>تعداد اسناد و هزینه‌ها</span><b>${money.format(tx.length + exp.length)}</b></div>
      <div><span>آخرین ثبت در بازه</span><b>${tx[0] ? dateLabel(tx[0].date) : exp[0] ? dateLabel(exp[0].date) : "—"}</b></div>
    </section>
    <p class="report-note">* سود بر اساس قیمت خرید فعلی کالا محاسبه شده است؛ بهای تمام‌شده تاریخی در مرحله بعدی با لایه‌های خرید دقیق‌تر می‌شود.</p>
  `;
  parent.insertBefore(box, anchor);
  anchor.remove();

  box.querySelectorAll<HTMLButtonElement>("[data-range]").forEach(btn => btn.addEventListener("click", async () => {
    const key = btn.dataset.range as RangeKey;
    await renderReport(startOf(key), Date.now(), btn.textContent || key);
  }));
  box.querySelector("#report-apply")?.addEventListener("click", async () => {
    const a = (box.querySelector<HTMLInputElement>("#report-from")?.value || "");
    const b = (box.querySelector<HTMLInputElement>("#report-to")?.value || "");
    const fromTime = a ? new Date(`${a}T00:00:00`).getTime() : 0;
    const toTime = b ? new Date(`${b}T23:59:59.999`).getTime() : Date.now();
    if (fromTime <= toTime) await renderReport(fromTime, toTime, `${a || "ابتدا"} تا ${b || "امروز"}`);
  });
}

let lastView = "";
const observer = new MutationObserver(() => {
  const view = document.querySelector("#view");
  if (!view || view.innerHTML === lastView) return;
  lastView = view.innerHTML;
  if (view.querySelector(".person-row")) void enhancePeople();
  if (view.querySelector(".report-list") && !view.querySelector(".report-insights")) void renderReport();
});
observer.observe(document.querySelector("#app")!, {subtree:true, childList:true});
