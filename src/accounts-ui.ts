import { addAccount, updateAccount, deleteAccount, addAccountEntry, getAccountBalances, getAccountLedger, listAccounts, listAccountEntries, transferBetweenAccounts } from "./db";
import { formatMoney } from "./settings";
import type { Account, AccountType } from "./domain";

const money = new Intl.NumberFormat("fa-IR");
const dateTime = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
const rial = (v: number) => formatMoney(v);
const entryLabel = (type: Account["type"] | "deposit" | "withdraw" | "transfer") => ({ deposit: "واریز / دریافت", withdraw: "برداشت / پرداخت", transfer: "انتقال بین حساب‌ها" } as Record<string,string>)[type] || "گردش";

export async function accountsView(): Promise<string> {
  const [accounts, balances] = await Promise.all([listAccounts(), getAccountBalances()]);
  const total = accounts.reduce((s, a) => s + (balances[a.id] ?? 0), 0);
  const cards = accounts.map(a => `<div class="account-card" data-account-ledger="${a.id}"><div class="account-icon">${a.type === "bank" ? "▣" : "▤"}</div><div><strong>${a.name}</strong><small>${a.type === "bank" ? "حساب بانکی" : "صندوق نقدی"} · مشاهده گردش</small></div><b>${rial(balances[a.id] ?? 0)}</b><span class="account-actions"><button type="button" class="secondary-button account-edit" data-account-edit="${a.id}">ویرایش</button><button type="button" class="secondary-button account-delete" data-account-delete="${a.id}">حذف</button></span></div>`).join("");
  return `<section class="hero"><div><p class="hero-kicker">خزانه‌داری</p><h2>صندوق و بانک</h2><p class="muted">پول نقد و موجودی حساب‌های بانکی را یکجا مدیریت کنید.</p></div><div class="hero-mark">▣</div></section>
  <section class="stats-grid"><article class="stat-card primary"><span>موجودی کل</span><strong>${rial(total)}</strong></article><article class="stat-card success"><span>تعداد حساب‌ها</span><strong>${money.format(accounts.length)}</strong></article></section>
  <section class="section"><div class="section-head"><h3>حساب‌ها</h3><div><button class="secondary-button" id="new-account">＋ حساب جدید</button> <button class="secondary-button" id="new-transfer">↔ انتقال</button></div></div>
  <section class="panel account-list">${cards || '<div class="empty-inline"><span>◌</span><p>هنوز صندوق یا حساب بانکی ثبت نشده است.</p></div>'}</section></section>`;
}

export function accountModal(account?: Account): string {
  return `<div class="modal-backdrop" id="account-modal"><section class="modal"><button class="modal-close" id="account-close">×</button><span class="eyebrow">خزانه‌داری</span><h2>${account ? "ویرایش حساب" : "حساب جدید"}</h2>
  <label class="field"><span>نام حساب</span><input id="account-name" placeholder="مثلاً صندوق فروشگاه یا بانک ملی" value="${account?.name || ""}"></label>
  <label class="field"><span>نوع حساب</span><select id="account-type"><option value="cash" ${account?.type === "cash" ? "selected" : ""}>صندوق نقدی</option><option value="bank" ${account?.type === "bank" ? "selected" : ""}>حساب بانکی</option></select></label>
  <label class="field"><span>موجودی اولیه</span><input id="account-opening" type="number" min="0" value="${account?.openingBalance ?? 0}"></label>
  <button class="primary-button wide" id="account-submit">${account ? "ذخیره تغییرات" : "ثبت حساب"}</button></section></div>`;
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
      const editId = modal.dataset.editId;
      if (editId) {
        await updateAccount({ id: editId, name, type, openingBalance, createdAt: Number(modal.dataset.createdAt || Date.now()) });
      } else {
        await addAccount({ name, type, openingBalance });
      }
      modal.remove(); done(editId ? "تغییرات حساب ذخیره شد" : "حساب با موفقیت ثبت شد");
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
  const rows = [...entries].reverse().map(e => {
    const sourceLocked = Boolean(e.referenceId);
    const transfer = Boolean(e.transferId);
    const actions = sourceLocked
      ? '<small class="muted">برای اصلاح، سند اصلی را ویرایش کنید</small>'
      : transfer
        ? `<span class="account-entry-actions"><button type="button" class="secondary-button" data-transfer-edit="${e.transferId}">ویرایش انتقال</button><button type="button" class="secondary-button" data-transfer-delete="${e.transferId}">حذف انتقال</button></span>`
        : `<span class="account-entry-actions"><button type="button" class="secondary-button" data-account-entry-edit="${e.id}">ویرایش</button><button type="button" class="secondary-button" data-account-entry-delete="${e.id}">حذف</button></span>`;
    return `<div class="transaction-row"><div class="transaction-icon">${e.amount >= 0 ? "↓" : "↑"}</div><div class="transaction-main"><strong>${entryLabel(e.type)}</strong><small>${e.description || "بدون شرح"} · ${dateTime.format(new Date(e.date))}</small>${actions}</div><b>${e.amount >= 0 ? "+" : ""}${rial(e.amount)}</b></div>`;
  }).join("");
  return `<div class="modal-backdrop" id="account-ledger-modal"><section class="modal ledger-modal"><button class="modal-close" id="account-ledger-close">×</button><span class="eyebrow">گردش حساب</span><h2>${account.name}</h2><p class="muted">${account.type === "bank" ? "حساب بانکی" : "صندوق نقدی"}</p>
    <section class="stats-grid"><article class="stat-card primary"><span>موجودی اول دوره</span><strong>${rial(account.openingBalance)}</strong></article><article class="stat-card success"><span>ورودی</span><strong>${rial(deposits)}</strong></article><article class="stat-card danger"><span>خروجی</span><strong>${rial(withdrawals)}</strong></article><article class="stat-card warning"><span>مانده فعلی</span><strong>${rial(balance)}</strong></article></section>
    <section class="panel"><div class="section-head"><h3>ریز گردش</h3><button type="button" class="primary-button" id="new-account-entry">＋ ثبت گردش دستی</button></div>${rows || '<div class="empty-inline"><span>◌</span><p>هنوز گردش مالی ثبت نشده است.</p></div>'}</section>
  </section></div>`;
}

export async function bindAccountLedger(modal: HTMLElement): Promise<void> {
  modal.querySelector("#account-ledger-close")?.addEventListener("click", () => modal.remove());
  modal.querySelector("#new-account-entry")?.addEventListener("click", async () => {
    const accounts = await listAccounts();
    document.body.insertAdjacentHTML("beforeend", accountEntryModal(accounts));
    const entryModal = document.querySelector<HTMLElement>("#account-entry-modal");
    if (entryModal) await bindAccountEntryModal(entryModal, message => {
      modal.remove();
      const toast = document.querySelector<HTMLDivElement>("#toast");
      if (toast) { toast.textContent = message; toast.classList.add("show"); window.setTimeout(() => toast.classList.remove("show"), 2400); }
      window.dispatchEvent(new Event("sai-sai-refresh"));
    });
  });
  modal.querySelectorAll<HTMLElement>("[data-account-entry-edit]").forEach(button => button.addEventListener("click", async event => {
    event.stopPropagation();
    const id = button.dataset.accountEntryEdit || "";
    const entry = (await (await import("./db")).listAccountEntries()).find(e => e.id === id);
    if (!entry) return;
    if (entry.referenceId || entry.transferId) { alert("این گردش باید از سند اصلی یا انتقال ویرایش شود."); return; }
    const accounts = await listAccounts();
    document.body.insertAdjacentHTML("beforeend", accountEntryModal(accounts, entry));
    const entryModal = document.querySelector<HTMLElement>("#account-entry-modal");
    if (entryModal) {
      entryModal.dataset.editId = entry.id;
      await bindAccountEntryModal(entryModal, message => {
        entryModal.remove();
        modal.remove();
        const toast = document.querySelector<HTMLDivElement>("#toast");
        if (toast) { toast.textContent = message; toast.classList.add("show"); window.setTimeout(() => toast.classList.remove("show"), 2400); }
        window.dispatchEvent(new Event("sai-sai-refresh"));
      });
    }
  }));
  modal.querySelectorAll<HTMLElement>("[data-account-entry-delete]").forEach(button => button.addEventListener("click", async event => {
    event.stopPropagation();
    const id = button.dataset.accountEntryDelete || "";
    if (!id || !confirm("این گردش حساب حذف شود؟")) return;
    try {
      await (await import("./db")).deleteAccountEntry(id);
      modal.remove();
      const toast = document.querySelector<HTMLDivElement>("#toast");
      if (toast) { toast.textContent = "گردش حساب حذف شد"; toast.classList.add("show"); window.setTimeout(() => toast.classList.remove("show"), 2400); }
      window.dispatchEvent(new Event("sai-sai-refresh"));
    } catch (e) { alert(e instanceof Error ? e.message : "حذف گردش ناموفق بود"); }
  }));
}


export function accountEntryModal(accounts: Account[], existing?: import("./domain").AccountEntry): string {
  const options = accounts.map(a => `<option value="${a.id}" ${a.id === (existing?.accountId || "") ? "selected" : ""}>${a.name}</option>`).join("");
  const type = existing?.type === "withdraw" ? "withdraw" : "deposit";
  return `<div class="modal-backdrop" id="account-entry-modal"><section class="modal"><button class="modal-close" id="account-entry-close">×</button><span class="eyebrow">گردش حساب</span><h2>${existing ? "ویرایش گردش دستی" : "ثبت گردش دستی"}</h2>
  <label class="field"><span>حساب</span><select id="entry-account">${options}</select></label>
  <label class="field"><span>نوع</span><select id="entry-type"><option value="deposit" ${type === "deposit" ? "selected" : ""}>واریز / دریافت</option><option value="withdraw" ${type === "withdraw" ? "selected" : ""}>برداشت / پرداخت</option></select></label>
  <label class="field"><span>مبلغ</span><input id="entry-amount" type="number" min="1" value="${Math.abs(existing?.amount || 0)}"></label>
  <label class="field"><span>شرح</span><input id="entry-description" value="${existing?.description || ""}" placeholder="مثلاً واریز نقدی"></label>
  <button class="primary-button wide" id="account-entry-submit">${existing ? "ذخیره تغییرات" : "ثبت گردش"}</button></section></div>`;
}

export async function bindAccountEntryModal(modal: HTMLElement, done: (message: string) => void): Promise<void> {
  modal.querySelector("#account-entry-close")?.addEventListener("click", () => modal.remove());
  modal.querySelector("#account-entry-submit")?.addEventListener("click", async () => {
    try {
      const accountId = modal.querySelector<HTMLSelectElement>("#entry-account")?.value || "";
      const type = (modal.querySelector<HTMLSelectElement>("#entry-type")?.value || "deposit") as "deposit" | "withdraw";
      const amount = Math.abs(Number(modal.querySelector<HTMLInputElement>("#entry-amount")?.value || 0));
      const description = (modal.querySelector<HTMLInputElement>("#entry-description")?.value || "").trim() || "گردش دستی";
      const editId = modal.dataset.editId;
      if (!accountId || amount <= 0) throw new Error("حساب و مبلغ را بررسی کنید");
      if (editId) {
        await (await import("./db")).updateAccountEntry(editId, { type, amount, description });
      } else {
        await addAccountEntry({ accountId, date: Date.now(), type, amount: type === "withdraw" ? -amount : amount, description });
      }
      modal.remove();
      done(editId ? "گردش حساب ویرایش شد" : "گردش حساب ثبت شد");
    } catch (e) { done(e instanceof Error ? e.message : "ثبت گردش ناموفق بود"); }
  });
}
