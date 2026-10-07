import { addParty, addSettlement, calculateHistoricalCOGS, getPartyBalances, listChecks, listExpenses, listParties, listProducts, listTransactions, listAccounts } from "./db";
import { lineTotal, type Party, type PartyType } from "./domain";
import { formatMoney } from "./settings";
import { jalaliToGregorianDate, todayJalaliInput } from "./calendar";

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

export function settlementModal(party: Party, type: "receipt"|"payment", accounts: Array<{id:string;name:string}> = []): string {
  const title = type === "receipt" ? "دریافت از مشتری" : "پرداخت به تأمین‌کننده";
  return `
    <div class="modal-backdrop" id="settlement-modal">
      <section class="modal" role="dialog" aria-modal="true" aria-label="${title}">
        <button class="modal-close" id="settlement-close">×</button>
        <span class="eyebrow">${type === "receipt" ? "دریافت" : "پرداخت"}</span>
        <h2>${title}</h2>
        <p class="muted">طرف حساب: <strong>${party.name}</strong></p>
        <label class="field"><span>مبلغ</span><input id="settlement-amount" type="number" min="1" value="0"></label>
        <label class="field"><span>${type === "receipt" ? "دریافت به" : "پرداخت از"}</span><select id="settlement-account"><option value="">بدون انتخاب حساب</option>${accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join("")}</select></label>\n        <label class="field"><span>شرح</span><input id="settlement-description" type="text" placeholder="${title}"></label>
        <button class="primary-button wide" id="settlement-submit">ثبت ${type === "receipt" ? "دریافت" : "پرداخت"}</button>
      </section>
    </div>`;
}

export async function saveNewParty(name: string, phone: string, type: PartyType): Promise<Party> {
  if (!name.trim()) throw new Error("نام شخص الزامی است");
  return addParty({ name: name.trim(), phone: phone.trim(), type });
}

export async function saveSettlement(partyId: string, type: "receipt"|"payment", amount: number, description: string, accountId?: string): Promise<void> {
  await addSettlement({ partyId, type, amount, date: Date.now(), accountId, description: description.trim() || (type === "receipt" ? "دریافت از مشتری" : "پرداخت به تأمین‌کننده") });
}

export { typeLabel };

const money = new Intl.NumberFormat("fa-IR");
const rial = (v: number) => formatMoney(v);
const dateLabel = (v: number) => new Intl.DateTimeFormat("fa-IR-u-ca-persian", {year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(v));

async function enhancePeople(): Promise<void> {
  const view = document.querySelector("#view");
  if (!view || !view.querySelector(".person-row") || view.dataset.balanceEnhanced === "1") return;
  view.dataset.balanceEnhanced = "1";
  const [parties, balances, checks] = await Promise.all([listParties(), getPartyBalances(), listChecks()]);
  view.querySelectorAll<HTMLElement>(".person-row").forEach((row, index) => {
    const party = parties[index];
    if (!party) return;
    row.style.cursor = "pointer";
    row.addEventListener("click", async () => {
      const transactions = await listTransactions();
      const balance = balances[party.id]?.balance ?? 0;
      const related = transactions.filter(t => t.partyId === party.id).sort((a,b)=>b.date-a.date);\n      const partyChecks = checks.filter(c => c.partyId === party.id);\n      const pendingReceived = balances[party.id]?.pendingReceivedChecks ?? 0;\n      const pendingIssued = balances[party.id]?.pendingIssuedChecks ?? 0;
      const labels: Record<string,string> = {sale:"فروش", purchase:"خرید", receipt:"دریافت", payment:"پرداخت"};
      const rows = related.length ? related.slice(0,30).map(t => `<div class="ledger-row"><span><b>${labels[t.type] || t.type}</b><small>${dateLabel(t.date)} · ${t.description || "بدون شرح"}</small></span><strong>${rial(t.amount)}</strong></div>`).join("") : '<div class="empty-inline"><span>◌</span><p>گردش حسابی ثبت نشده است.</p></div>';
      const customer = party.type === "customer" || party.type === "both";
      const supplier = party.type === "supplier" || party.type === "both";
      document.body.insertAdjacentHTML("beforeend", `
        <div class="modal-backdrop" id="party-ledger-modal"><section class="modal party-ledger-modal">
          <button class="modal-close" id="party-ledger-close">×</button>
          <span class="eyebrow">گردش حساب</span><h2>${party.name}</h2>
          <p class="muted">${party.phone || "بدون شماره"} · ${typeLabel[party.type]}</p>
          <div class="ledger-balance"><span>مانده حساب</span><strong>${rial(Math.abs(balance))}</strong><small>${balance === 0 ? "تسویه" : customer ? (balance > 0 ? "بدهکار" : "طلبکار") : (balance < 0 ? "بدهکار" : "طلبکار")}</small></div>
          <div class="ledger-checks"><span>چک دریافتی در انتظار: <b>${rial(pendingReceived)}</b></span><span>چک پرداختی در انتظار: <b>${rial(pendingIssued)}</b></span></div>\n          <div class="ledger-actions">
            ${customer ? '<button class="primary-button" data-ledger="receipt">↓ دریافت</button>' : ''}
            ${supplier ? '<button class="primary-button" data-ledger="payment">↑ پرداخت</button>' : ''}
          </div>
          <div class="ledger-list">${rows}${partyChecks.map(c => `<div class="ledger-row"><span><b>${c.direction === "received" ? "چک دریافتی" : "چک پرداختی"}</b><small>${c.number || "بدون شماره"} · سررسید ${dateLabel(c.dueDate)} · ${c.status}</small></span><strong>${rial(c.amount)}</strong></div>`).join("")}</div>
        </section></div>`);
      const modal = document.querySelector<HTMLDivElement>("#party-ledger-modal")!;
      modal.querySelector("#party-ledger-close")?.addEventListener("click",()=>modal.remove());
      modal.querySelectorAll<HTMLButtonElement>("[data-ledger]").forEach(btn => btn.addEventListener("click",()=>{
        const type = btn.dataset.ledger as "receipt"|"payment";
        modal.remove();
        document.body.insertAdjacentHTML("beforeend", settlementModal(party,type));
        const sm = document.querySelector<HTMLDivElement>("#settlement-modal")!;
        sm.querySelector("#settlement-close")?.addEventListener("click",()=>sm.remove());
        sm.querySelector("#settlement-submit")?.addEventListener("click",async()=>{
          try {
            const amount = Number(sm.querySelector<HTMLInputElement>("#settlement-amount")!.value);
            const description = sm.querySelector<HTMLInputElement>("#settlement-description")!.value;
            const accountId = sm.querySelector<HTMLSelectElement>("#settlement-account")?.value || undefined;\n            await saveSettlement(party.id,type,amount,description,accountId);
            sm.remove(); window.dispatchEvent(new Event("sai-sai-refresh"));
          } catch(e) { alert(e instanceof Error ? e.message : "ثبت ناموفق بود"); }
        });
      }));
    });
  });}

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
  const sales = tx.filter(t => t.type === "sale");
  const purchases = tx.filter(t => t.type === "purchase");
  const receipts = tx.filter(t => t.type === "receipt");
  const payments = tx.filter(t => t.type === "payment");
  const salesTotal = sales.reduce((s,t)=>s+t.amount,0);
  const purchasesTotal = purchases.reduce((s,t)=>s+t.amount,0);
  const receiptsTotal = receipts.reduce((s,t)=>s+t.amount,0);
  const paymentsTotal = payments.reduce((s,t)=>s+t.amount,0);
  const expensesTotal = exp.reduce((s,e)=>s+e.amount,0);
  const cogs = calculateHistoricalCOGS(transactions, products);
  const grossProfit = sales.reduce((sum,t)=>sum+t.amount-(cogs.get(t.id) ?? t.costOfGoods ?? 0),0);
  const netProfit = grossProfit - expensesTotal;
  const daily = new Map<string, { sales: number; profit: number }>();
  for (const sale of sales) {
    const d = new Date(sale.date);
    const key = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { month: "2-digit", day: "2-digit" }).format(d);
    const item = daily.get(key) ?? { sales: 0, profit: 0 };
    item.sales += sale.amount;
    item.profit += sale.amount - (cogs.get(sale.id) ?? sale.costOfGoods ?? 0);
    daily.set(key, item);
  }
  const chartData = [...daily.entries()].slice(-10);
  const maxChart = Math.max(1, ...chartData.map(([,v]) => Math.max(v.sales, Math.abs(v.profit))));
  const chartRows = chartData.map(([day,v]) => {
    const salesWidth = Math.round((v.sales / maxChart) * 100);
    const profitWidth = Math.round((Math.max(0,v.profit) / maxChart) * 100);
    return `<div class="trend-row"><span>${day}</span><div class="trend-bars"><i style="width:${salesWidth}%"></i><b style="width:${profitWidth}%"></b></div><strong>${rial(v.profit)}</strong></div>`;
  }).join("");
  const productMap = new Map(products.map(p => [p.id, p]));
  const productStats = new Map<string, { quantity: number; sales: number; cogs: number }>();
  for (const sale of sales) {
    const saleCogs = cogs.get(sale.id) ?? sale.costOfGoods ?? 0;
    const saleBase = sale.amount || 1;
    for (const line of sale.lines) {
      const item = productStats.get(line.productId) ?? { quantity: 0, sales: 0, cogs: 0 };
      const share = lineTotal(line) / saleBase;
      item.quantity += line.quantity;
      item.sales += lineTotal(line);
      item.cogs += saleCogs * share;
      productStats.set(line.productId, item);
    }
  }
  const productRows = [...productStats.entries()].sort((a,b) => (b[1].sales - b[1].cogs) - (a[1].sales - a[1].cogs)).map(([id,s]) => {
    const product = productMap.get(id);
    const profit = s.sales - s.cogs;
    return `<div class="product-profit-row"><span><b>${product?.name || "کالای حذف‌شده"}</b><small>${money.format(s.quantity)} ${product?.unit || "واحد"} · فروش ${rial(s.sales)}</small></span><strong>${rial(profit)}</strong></div>`;
  }).join("");

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
      <label class="report-date"><span>از تاریخ شمسی</span><input id="report-from" type="text" inputmode="numeric" placeholder="۱۴۰۵/۰۱/۰۱"></label>
      <label class="report-date"><span>تا تاریخ شمسی</span><input id="report-to" type="text" inputmode="numeric" placeholder="۱۴۰۵/۰۱/۰۱"></label>
      <button class="primary-button report-apply" id="report-apply">اعمال بازه</button>
    </div>
    <div class="report-range-label">بازه: <b>${label}</b></div>
    <section class="stats-grid">
      <article class="stat-card primary"><span>فروش</span><strong>${rial(salesTotal)}</strong></article>
      <article class="stat-card warning"><span>خرید</span><strong>${rial(purchasesTotal)}</strong></article>
      <article class="stat-card success"><span>دریافت</span><strong>${rial(receiptsTotal)}</strong></article>
      <article class="stat-card danger"><span>هزینه</span><strong>${rial(expensesTotal)}</strong></article>
    </section>
    <section class="panel trend-panel">
      <div class="product-profit-title"><span>روند فروش و سود</span><small>۱۰ روز اخیر در بازه</small></div>
      <div class="trend-legend"><span>فروش</span><span>سود</span></div>
      <div class="trend-list">${chartRows || '<div class="empty-inline"><span>◌</span><p>برای نمایش نمودار فروش ثبت کنید.</p></div>'}</div>
    </section>
    <section class="panel product-profit-panel">
      <div class="product-profit-title"><span>سود هر کالا</span><small>بر اساس بازه انتخاب‌شده</small></div>
      <div class="product-profit-list">${productRows || '<div class="empty-inline"><span>◌</span><p>در این بازه فروش کالایی ثبت نشده است.</p></div>'}</div>
    </section>
    <section class="panel report-list">
      <div><span>سود ناخالص تقریبی</span><b>${rial(grossProfit)}</b></div>
      <div><span>سود خالص پس از هزینه‌ها</span><b>${rial(netProfit)}</b></div>
      <div><span>پرداخت به تأمین‌کنندگان</span><b>${rial(paymentsTotal)}</b></div>
      <div><span>تعداد اسناد و هزینه‌ها</span><b>${money.format(tx.length + exp.length)}</b></div>
      <div><span>آخرین ثبت در بازه</span><b>${tx[0] ? dateLabel(tx[0].date) : exp[0] ? dateLabel(exp[0].date) : "—"}</b></div>
    </section>
    <p class="report-note">* سود بر اساس بهای تمام‌شده تاریخی و روش FIFO محاسبه می‌شود؛ برای موجودی بدون سابقه خرید، قیمت خرید فعلی به‌عنوان برآورد استفاده می‌شود.</p>
  `;
  parent.insertBefore(box, anchor);
  anchor.remove();

  box.querySelectorAll<HTMLButtonElement>("[data-range]").forEach(btn => btn.addEventListener("click", async () => {
    const key = btn.dataset.range as RangeKey;
    await renderReport(startOf(key), Date.now(), btn.textContent || key);
  }));
  const fromInput = box.querySelector<HTMLInputElement>("#report-from");
  const toInput = box.querySelector<HTMLInputElement>("#report-to");
  if (fromInput && toInput) {
    fromInput.value = "";
    toInput.value = todayJalaliInput();
  }
  box.querySelector("#report-apply")?.addEventListener("click", async () => {
    const a = fromInput?.value.trim() || "";
    const b = toInput?.value.trim() || "";
    const fromDate = a ? jalaliToGregorianDate(a) : null;
    const toDate = b ? jalaliToGregorianDate(b) : null;
    const fromTime = fromDate ? new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate()).getTime() : 0;
    const toTime = toDate ? new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate(), 23, 59, 59, 999).getTime() : Date.now();
    if ((!a || fromDate) && (!b || toDate) && fromTime <= toTime) {
      await renderReport(fromTime, toTime, `${a || "ابتدا"} تا ${b || "امروز"}`);
    }
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
