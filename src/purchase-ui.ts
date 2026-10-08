import { addPurchase, listAccounts, updateTransaction } from "./db";
import type { Party, Product, Transaction } from "./domain";
import { getCurrencyLabel, moneyInputValue, parseMoneyInput } from "./settings";

type MoneyFormat = (value: number) => string;
type Done = (message: string) => void;

export function openPurchaseModal(products: Product[], parties: Party[], rial: MoneyFormat, done: Done, existing?: Transaction, preselectedProductId?: string): void {
  if (!products.length) { done("ابتدا حداقل یک کالا ثبت کنید"); return; }

  const productOptions = products.map(p => '<option value="' + p.id + '">' + p.name + ' — ' + rial(p.purchasePrice) + ' / ' + p.unit + '</option>').join("");
  const partyOptions = parties.filter(p => p.type === "supplier" || p.type === "both")
    .map(p => '<option value="' + p.id + '">' + p.name + '</option>').join("");

  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.id = "purchase-modal";
  modal.innerHTML = `
    <section class="modal" role="dialog" aria-modal="true" aria-label="ثبت خرید">
      <button class="modal-close" id="purchase-close">×</button>
      <span class="eyebrow">فاکتور خرید</span>
      <h2>${existing ? "ویرایش خرید" : "ثبت خرید"}</h2>
      <label class="field"><span>کالا</span><select id="purchase-product">${productOptions}</select></label>
      <div class="form-grid">
        <label class="field"><span>مقدار</span><input id="purchase-quantity" type="number" min="0.001" step="0.001" value="${existing?.lines[0]?.quantity ?? 1}"></label>
        <label class="field"><span>قیمت خرید (${getCurrencyLabel()})</span><input id="purchase-price" type="number" min="0" value="${moneyInputValue(existing?.lines[0]?.unitPrice ?? products[0].purchasePrice)}"></label>
      </div>
      <div class="form-grid">
        <label class="field"><span>تخفیف (${getCurrencyLabel()})</span><input id="purchase-discount" type="number" min="0" value="${moneyInputValue(existing?.lines[0]?.discount ?? 0)}"></label>
        <label class="field"><span>مبلغ پرداختی (${getCurrencyLabel()})</span><input id="purchase-paid" type="number" min="0" value="${moneyInputValue(existing?.paid ?? 0)}"></label>
      </div>
      <label class="field"><span>تأمین‌کننده</span><select id="purchase-party"><option value="">بدون انتخاب</option>${partyOptions}</select></label>
      <label class="field"><span>پرداخت از</span><select id="purchase-account"><option value="">بدون انتخاب حساب</option></select></label>
      <div class="sale-summary"><span>مبلغ فاکتور</span><strong id="purchase-total">۰ ریال</strong></div>
      <button class="primary-button wide" id="purchase-submit">${existing ? "ذخیره تغییرات" : "ثبت خرید و افزایش موجودی"}</button>
    </section>`;
  document.body.appendChild(modal);

  const q = modal.querySelector<HTMLInputElement>("#purchase-quantity")!;
  const price = modal.querySelector<HTMLInputElement>("#purchase-price")!;
  const discount = modal.querySelector<HTMLInputElement>("#purchase-discount")!;
  const paid = modal.querySelector<HTMLInputElement>("#purchase-paid")!;
  const product = modal.querySelector<HTMLSelectElement>("#purchase-product")!;
  const total = modal.querySelector<HTMLElement>("#purchase-total")!;
  const party = modal.querySelector<HTMLSelectElement>("#purchase-party")!;
  const account = modal.querySelector<HTMLSelectElement>("#purchase-account")!;

  const updateTotal = () => {
    const amount = Math.max(0, (Number(q.value) || 0) * parseMoneyInput(price.value) - parseMoneyInput(discount.value));
    total.textContent = rial(amount);
    return amount;
  };

  void listAccounts().then(accounts => {
    account.innerHTML = '<option value="">بدون انتخاب حساب</option>' + accounts.map(a => '<option value="' + a.id + '">' + a.name + '</option>').join("");
    if (existing?.accountId) account.value = existing.accountId;
  });
  if (existing?.lines[0]) product.value = existing.lines[0].productId;
  else if (preselectedProductId && products.some(p => p.id === preselectedProductId)) {
    product.value = preselectedProductId;
    const selected = products.find(p => p.id === preselectedProductId);
    if (selected) price.value = moneyInputValue(selected.purchasePrice);
  }
  if (existing?.partyId) party.value = existing.partyId;

  product.addEventListener("change", () => {
    const p = products.find(item => item.id === product.value);
    if (p) price.value = moneyInputValue(p.purchasePrice);
    updateTotal();
  });
  [q, price, discount, paid].forEach(input => input.addEventListener("input", updateTotal));
  modal.querySelector<HTMLButtonElement>("#purchase-close")!.addEventListener("click", () => modal.remove());

  modal.querySelector<HTMLButtonElement>("#purchase-submit")!.addEventListener("click", async () => {
    try {
      const p = products.find(item => item.id === product.value);
      const quantity = Number(q.value);
      const unitPrice = parseMoneyInput(price.value);
      const disc = parseMoneyInput(discount.value);
      const amount = Math.max(0, quantity * unitPrice - disc);
      if (!p || quantity <= 0 || amount <= 0) throw new Error("کالا، مقدار و قیمت خرید را بررسی کنید");
      const paidValue = Math.min(amount, parseMoneyInput(paid.value));
      const partyId = party.value || undefined;
      const accountId = account.value || undefined;

      if (existing) {
        await updateTransaction(existing.id, {
          date: Date.now(),
          partyId,
          accountId,
          description: existing.description || ("خرید " + p.name),
          lines: [{ productId: p.id, quantity, unitPrice, discount: disc }],
          paid: paidValue
        });
      } else {
        await addPurchase({
          date: Date.now(),
          partyId,
          accountId,
          description: "خرید " + p.name,
          lines: [{ productId: p.id, quantity, unitPrice, discount: disc }],
          paid: paidValue
        });
      }

      modal.remove();
      done(existing ? "خرید ویرایش شد" : "خرید ثبت شد؛ موجودی " + quantity + " " + p.unit + " افزایش یافت");
    } catch (error) {
      done(error instanceof Error ? error.message : "ثبت ناموفق بود");
    }
  });
  updateTotal();
}
