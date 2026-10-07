import { addAccount, addAccountEntry, getAccountBalances, getAccountLedger, listAccounts, listAccountEntries, transferBetweenAccounts } from "./db";
import { formatMoney } from "./settings";
import type { Account, AccountType } from "./domain";

const money = new Intl.NumberFormat("fa-IR");
const dateTime = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
const rial = (v: number) => formatMoney(v);\nconst entryLabel = (type: Account["type"] | "deposit" | "withdraw" | "transfer") => ({ deposit: "واریز / دریافت", withdraw: "برداشت / پرداخت", transfer: "انتقال بین حساب‌ها" } as Record<string,string>)[type] || "گردش";

export async function accountsView(): Promise<string> {
  const [accounts, balances] = await Promise.all([listAccounts(), getAccountBalances()]);
  const total = accounts.reduce((s, a) => s + (balances[a.id] ?? 0), 0);
  const cards = accounts.map(a => `<button class="account-card" data-account-ledger="${a.id}"><div class="account-icon">${a.type === "bank" ? "▣" : "▤"}</div><div><strong>${a.name}</strong><small>${a.type === "bank" ? "حساب بانکی" : "صندوق نقدی"} · مشاهده گردش</small></div><b>${rial(balances[a.id] ?? 0)}</b></button>`).join("");
  return `<section class="hero"><div><p class="hero-kicker">خزانه‌داری</p><h2>صندوق و بانک</h2><p class="muted">پول نقد و موجودی حساب‌های بانکی را یکجا مدیریت کنید.</p></div><div class="hero-mark">▣</div></section>
  <section class="stats-grid"><article class="stat-card primary"><span>موجودی کل</span><strong>${rial(total)}</strong></article><article class="stat-card success"><span>تعداد حساب‌ها</span><strong>${money.format(accounts.length)}</strong></article></section>
  <section class="section"><div class="section-head"><h3>حساب‌ها</h3><div><button class="secondary-button" id="new-account">＋ حساب جدید</button> <button class="secondary-button" id="new-transfer">↔ انتقال</button></div></div>
  <section class="panel account-list">${cards || '<div class="empty-inline"><span>◌</span><p>هنوز صندوق یا حساب بانکی ثبت نشده است.</p></div>'}</section></section>`;
}

export function accountModal(): string {
  return `<div class="modal-backdrop" id="account-modal"><section class="modal"><button class="modal-close" id="account-close">×</button><span class="eyebrow">خزانه‌داری</span><h2>حساب جدید</h2>
  <label class="field"><span>نام حساب</span><input id="account-name" placeholder="مثلاً صندوق فروشگاه یا بانک ملی"></label>
  <label class="field"><span>نوع حساب</span><select id="account-type"><option value="cash">صندوق نقدی</option><option value="bank">حساب بانکی</option></select></label>
  <label class="field"><span>موجودی اولیه</span><input id="account-opening" type="number" min="0" value="0"></label>
  <button class="primary-button wide" id="account-submit">ثبت حساب</button></section></div>`;
}

export function transferModal(accounts: Account[], balances: Record<string, number>): string {
  const options = accounts.map(a => `<option value="${a.id}">${a.name} · ${rial(balances[a.id] ?? 0)}</option>`).join("");
  return `<div class="modal-backdrop" id="transfer-modal"><section class="modal"><button class="modal-close" id="transfer-close">×</button><span class="eyebrow">خزانه‌داری</span><h2>انتقال بین حساب‌ها</h2>
  <label class="field"><span>از حساب</span><select id="transfer-from">${options}</select></label><label class="field"><span>به حساب</span><select id="transfer-to">${options}</select></label>
  <label class="field"><span>مبلغ</span><input id="transfer-amount" type="number" min="1" value="0"></label><label class="field"><span>شرح</span><input id="transfer-description" placeholder="مثلاً واریز از صندوق به بانک"></label>
  <button class="primary-button wide" id="transfer-submit">ثبت انتقال</button></section></div>`;
}

export async function bindAccountModal(modal: HTMLElement, done: (message: string) => void): Promise<void> {
  modal.querySelector("#account-close")?.addEventListener("click", () => modal.remove());
  modal.querySelector("#account-submit")?.addEventListener("click", async () => {
    try {
      const name = (modal.querySelector<HTMLInputElement>("#account-name")?.value || "").trim();
      const type = (modal.querySelector<HTMLSelectElement>("#account-type")?.value || "cash") as AccountType;
      const openingBalance = Math.max(0, Number(modal.querySelector<HTMLInputElement>("#account-opening")?.value || 0));
      if (!name) throw new Error("نام حساب الزامی است");
      await addAccount({ name, type, openingBalance });
      modal.remove(); done("حساب با موفقیت ثبت شد");
    } catch (e) { done(e instanceof Error ? e.message : "ثبت حساب ناموفق بود"); }
  });
}

export async function bindTransferModal(modal: HTMLElement, done: (message: string) => void): Promise<void> {
  modal.querySelector("#transfer-close")?.addEventListener("click", () => modal.remove());
  modal.querySelector("#transfer-submit")?.addEventListener("click", async () => {
    try {
      const from = modal.querySelector<HTMLSelectElement>("#transfer-from")?.value || "";
      const to = modal.querySelector<HTMLSelectElement>("#transfer-to")?.value || "";
      const amount = Math.max(0, Number(modal.querySelector<HTMLInputElement>("#transfer-amount")?.value || 0));
      const description = (modal.querySelector<HTMLInputElement>("#transfer-description")?.value || "").trim() || "انتقال بین حساب‌ها";
      const balances = await getAccountBalances();
      if (!from || !to || amount <= 0) throw new Error("حساب‌ها و مبلغ را بررسی کنید");
      if (from === to) throw new Error("حساب مبدأ و مقصد باید متفاوت باشند");
      if ((balances[from] ?? 0) < amount) throw new Error("موجودی حساب مبدأ کافی نیست");
      await transferBetweenAccounts(from, to, amount, description);
      modal.remove(); done("انتقال با موفقیت ثبت شد");
    } catch (e) { done(e instanceof Error ? e.message : "ثبت انتقال ناموفق بود"); }
  });
}

export async function accountLedgerModal(accountId: string): Promise<string> {
  const [accounts, allEntries] = await Promise.all([listAccounts(), listAccountEntries()]);
  const account = accounts.find(a => a.id === accountId);
  if (!account) throw new Error("حساب پیدا نشد");
  const entries = allEntries.filter(e => e.accountId === accountId).sort((a,b)=>a.date-b.date);
  const balance = account.openingBalance + entries.reduce((s,e)=>s+e.amount,0);
  const deposits = entries.filter(e=>e.amount>0).reduce((s,e)=>s+e.amount,0);
  const withdrawals = entries.filter(e=>e.amount<0).reduce((s,e)=>s+Math.abs(e.amount),0);
  const rows = [...entries].reverse().map(e => `<div class="transaction-row"><div class="transaction-icon">${e.amount >= 0 ? "↓" : "↑"}</div><div class="transaction-main"><strong>${entryLabel(e.type)}</strong><small>${e.description || "بدون شرح"} · ${dateTime.format(new Date(e.date))}</small></div><b>${e.amount >= 0 ? "+" : ""}${rial(e.amount)}</b></div>`).join("");
  return `<div class="modal-backdrop" id="account-ledger-modal"><section class="modal ledger-modal"><button class="modal-close" id="account-ledger-close">×</button><span class="eyebrow">گردش حساب</span><h2>${account.name}</h2><p class="muted">${account.type === "bank" ? "حساب بانکی" : "صندوق نقدی"}</p>
    <section class="stats-grid"><article class="stat-card primary"><span>موجودی اول دوره</span><strong>${rial(account.openingBalance)}</strong></article><article class="stat-card success"><span>ورودی</span><strong>${rial(deposits)}</strong></article><article class="stat-card danger"><span>خروجی</span><strong>${rial(withdrawals)}</strong></article><article class="stat-card warning"><span>مانده فعلی</span><strong>${rial(balance)}</strong></article></section>
    <section class="panel"><div class="section-head"><h3>ریز گردش</h3><span class="muted">${money.format(entries.length)} ثبت</span></div>${rows || '<div class="empty-inline"><span>◌</span><p>هنوز گردش مالی ثبت نشده است.</p></div>'}</section>
  </section></div>`;
}

export async function bindAccountLedger(modal: HTMLElement): Promise<void> {
  modal.querySelector("#account-ledger-close")?.addEventListener("click", () => modal.remove());
}
