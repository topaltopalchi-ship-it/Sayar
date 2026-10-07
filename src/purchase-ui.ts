import { addPurchase, listAccounts } from "./db";
import type { Party, Product } from "./domain";

type MoneyFormat = (value: number) => string;
type Done = (message: string) => void;

export function openPurchaseModal(products: Product[], parties: Party[], rial: MoneyFormat, done: Done): void {
  if (!products.length) { done("ابتدا حداقل یک کالا ثبت کنید"); return; }

  const productOptions = products.map(p => '<option value="' + p.id + '">' + p.name + ' — ' + rial(p.purchasePrice) + ' / ' + p.unit + '</option>').join("");
  const partyOptions = parties.filter(p => p.type === "supplier" || p.type === "both")
    .map(p => '<option value="' + p.id + '">' + p.name + '</option>').join("");

  const accountOptionsPromise = listAccounts();
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.id = "purchase-modal";
  modal.innerHTML =
    '<section class="modal" role="dialog" aria-modal="true" aria-label="ثبت خرید">' +
    '<button class="modal-close" id="purchase-close">×</button>' +
    '<span class="eyebrow">فاکتور خرید</span><h2>ثبت خرید</h2>' +
    '<label class="field"><span>کالا</span><select id="purchase-product">' + productOptions + '</select></label>' +
    '<div class="form-grid">' +
    '<label class="field"><span>مقدار</span><input id="purchase-quantity" type="number" min="0.001" step="0.001" value="1"></label>' +
    '<label class="field"><span>قیمت خرید</span><input id="purchase-price" type="number" min="0" value="' + products[0].purchasePrice + '"></label></div>' +
    '<div class="form-grid">' +
    '<label class="field"><span>تخفیف</span><input id="purchase-discount" type="number" min="0" value="0"></label>' +
    '<label class="field"><span>مبلغ پرداختی</span><input id="purchase-paid" type="number" min="0" value="0"></label></div>' +
    '<label class="field"><span>تأمین‌کننده</span><select id="purchase-party"><option value="">بدون انتخاب</option>' + partyOptions + '</select></label>' +
    '<label class="field"><span>پرداخت از</span><select id="purchase-account"><option value="">بدون انتخاب حساب</option></select></label>' +
    '<div class="sale-summary"><span>مبلغ فاکتور</span><strong id="purchase-total">۰ ریال</strong></div>' +
    '<button class="primary-button wide" id="purchase-submit">ثبت خرید و افزایش موجودی</button></section>';

  document.body.appendChild(modal);
  void accountOptionsPromise.then(accounts => { const select = modal.querySelector<HTMLSelectElement>("#purchase-account"); if (select) select.innerHTML = '<option value="">بدون انتخاب حساب</option>' + accounts.map(a => '<option value="' + a.id + '">' + a.name + '</option>').join(""); });
  const q = modal.querySelector<HTMLInputElement>("#purchase-quantity")!;
  const price = modal.querySelector<HTMLInputElement>("#purchase-price")!;
  const discount = modal.querySelector<HTMLInputElement>("#purchase-discount")!;
  const paid = modal.querySelector<HTMLInputElement>("#purchase-paid")!;
  const product = modal.querySelector<HTMLSelectElement>("#purchase-product")!;
  const total = modal.querySelector<HTMLElement>("#purchase-total")!;

  const updateTotal = () => {
    const amount = Math.max(0, (Number(q.value) || 0) * (Number(price.value) || 0) - (Number(discount.value) || 0));
    total.textContent = rial(amount);
    return amount;
  };
  product.addEventListener("change", () => {
    const p = products.find(item => item.id === product.value);
    if (p) price.value = String(p.purchasePrice);
    updateTotal();
  });
  [q, price, discount].forEach(input => input.addEventListener("input", updateTotal));
  modal.querySelector<HTMLButtonElement>("#purchase-close")!.addEventListener("click", () => modal.remove());

  modal.querySelector<HTMLButtonElement>("#purchase-submit")!.addEventListener("click", async () => {
    try {
      const p = products.find(item => item.id === product.value);
      const quantity = Number(q.value);
      const unitPrice = Math.max(0, Number(price.value) || 0);
      const disc = Math.max(0, Number(discount.value) || 0);
      const amount = Math.max(0, quantity * unitPrice - disc);
      if (!p || quantity <= 0) throw new Error("کالا و مقدار خرید را بررسی کنید");
      const paidValue = Math.min(amount, Math.max(0, Number(paid.value) || 0));
      const partyId = modal.querySelector<HTMLSelectElement>("#purchase-party")!.value || undefined;

      await addPurchase({
        date: Date.now(),
        partyId,
        accountId: modal.querySelector<HTMLSelectElement>("#purchase-account")!.value || undefined,
        description: "خرید " + p.name,
        lines: [{ productId: p.id, quantity, unitPrice, discount: disc }],
        paid: paidValue,
      });

      modal.remove();
      done("خرید ثبت شد؛ موجودی " + quantity + " " + p.unit + " افزایش یافت");
    } catch (error) {
      done(error instanceof Error ? error.message : "ثبت خرید ناموفق بود");
    }
  });
  updateTotal();
}