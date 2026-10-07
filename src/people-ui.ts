import { addParty, addSettlement } from "./db";
import type { Party, PartyType } from "./domain";

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
