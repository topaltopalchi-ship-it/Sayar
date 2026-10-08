import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import type { Order, Party, Product } from "./domain";
import { addOrder, deleteOrder, listOrders, updateOrder } from "./db";

const REMINDER_CHANNEL = "saisai-orders";

function localDateInputValue(timestamp: number): string {
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function jalaliLabel(timestamp: number): string {
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date(timestamp));
}

function notificationId(orderId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < orderId.length; i++) {
    hash ^= orderId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 2000000000 + 1000;
}

async function ensureNotificationPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    await LocalNotifications.createChannel({
      id: REMINDER_CHANNEL,
      name: "یادآوری سفارشات",
      description: "یادآوری سفارش‌های در انتظار تحویل",
      importance: 4,
      vibration: true,
    });
  } catch {}
  const current = await LocalNotifications.checkPermissions();
  if (current.display === "granted") return true;
  const requested = await LocalNotifications.requestPermissions();
  return requested.display === "granted";
}

export async function cancelOrderReminder(orderId: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try { await LocalNotifications.cancel({ notifications: [{ id: notificationId(orderId) }] }); } catch {}
}

export async function scheduleOrderReminder(order: Order, party: Party, product: Product): Promise<boolean> {
  await cancelOrderReminder(order.id);
  if (!Capacitor.isNativePlatform() || order.status !== "pending") return false;
  const delivery = new Date(order.deliveryDate);
  const reminder = new Date(delivery);
  reminder.setDate(reminder.getDate() - 1);
  reminder.setHours(9, 0, 0, 0);
  if (reminder.getTime() <= Date.now()) return false;
  const permitted = await ensureNotificationPermission();
  if (!permitted) return false;
  await LocalNotifications.schedule({
    notifications: [{
      id: notificationId(order.id),
      title: "یادآوری سفارش سای‌سای",
      body: `فردا سفارش «${product.name}» برای ${party.name} تحویل دارد.`,
      channelId: REMINDER_CHANNEL,
      schedule: { at: reminder, allowWhileIdle: true },
      autoCancel: true,
    }],
  });
  return true;
}

function statusLabel(status: Order["status"]): string {
  if (status === "completed") return "تحویل شد";
  if (status === "cancelled") return "لغو شد";
  return "در انتظار";
}

function orderModal(order: Order | undefined, products: Product[], parties: Party[], rial: (n: number) => string): string {
  const customers = parties.filter(p => p.type === "customer" || p.type === "both");
  const defaultProduct = order?.productId || products[0]?.id || "";
  const defaultCustomer = order?.partyId || customers[0]?.id || "";
  return `<div class="modal-backdrop" id="order-modal"><section class="modal" role="dialog" aria-modal="true">
    <button class="modal-close" id="order-close">×</button>
    <span class="eyebrow">ثبت سفارش</span>
    <h2>${order ? "ویرایش سفارش" : "سفارش جدید"}</h2>
    <label class="field"><span>مشتری</span><select id="order-party">${customers.map(p => `<option value="${p.id}" ${p.id === defaultCustomer ? "selected" : ""}>${p.name}${p.phone ? " · " + p.phone : ""}</option>`).join("")}</select></label>
    <label class="field"><span>کالا</span><select id="order-product">${products.map(p => `<option value="${p.id}" ${p.id === defaultProduct ? "selected" : ""}>${p.name} · ${rial(p.salePrice)} / ${p.unit}</option>`).join("")}</select></label>
    <div class="form-grid">
      <label class="field"><span>تعداد</span><input id="order-qty" type="text" inputmode="decimal" value="${order?.quantity ?? 1}"></label>
      <label class="field"><span>قیمت واحد</span><input id="order-price" type="text" inputmode="numeric" value="${order?.unitPrice ?? products.find(p => p.id === defaultProduct)?.salePrice ?? 0}"></label>
    </div>
    <label class="field"><span>تاریخ تحویل</span><input id="order-delivery" type="date" value="${order ? localDateInputValue(order.deliveryDate) : localDateInputValue(Date.now() + 86400000)}"></label>
    <label class="field"><span>توضیحات</span><input id="order-note" value="${order?.note || ""}" placeholder="مثلاً تحویل عصر"></label>
    <div class="sale-summary"><span>مبلغ سفارش</span><strong id="order-total">${rial((order?.quantity ?? 1) * (order?.unitPrice ?? products.find(p => p.id === defaultProduct)?.salePrice ?? 0))}</strong></div>
    <button class="primary-button wide" id="order-submit">${order ? "ذخیره سفارش" : "ثبت سفارش و یادآوری"}</button>
  </section></div>`;
}

export async function ordersView(orders: Order[], products: Product[], parties: Party[], rial: (n: number) => string): Promise<string> {
  const productMap = new Map(products.map(p => [p.id, p]));
  const partyMap = new Map(parties.map(p => [p.id, p]));
  const rows = orders.map(order => {
    const party = partyMap.get(order.partyId);
    const product = productMap.get(order.productId);
    return `<article class="order-card ${order.status}">
      <div class="order-card-head"><div><strong>${party?.name || "مشتری حذف‌شده"}</strong><small>${product?.name || "کالای حذف‌شده"} · ${order.quantity} ${product?.unit || ""}</small></div><span class="order-status ${order.status}">${statusLabel(order.status)}</span></div>
      <div class="order-card-meta"><span>تحویل: <b>${jalaliLabel(order.deliveryDate)}</b></span><span>${rial(Math.round(order.quantity * order.unitPrice))}</span></div>
      ${order.note ? `<p class="order-note">${order.note}</p>` : ""}
      <div class="order-actions">
        ${order.status === "pending" ? `<button class="primary-button" data-order-complete="${order.id}">تحویل شد</button><button class="secondary-button" data-order-cancel="${order.id}">لغو</button>` : ""}
        <button class="secondary-button" data-order-edit="${order.id}">ویرایش</button>
        <button class="secondary-button" data-order-delete="${order.id}">حذف</button>
      </div>
    </article>`;
  }).join("");
  return `<section class="page-head"><span class="eyebrow">فروش و پیگیری</span><div class="page-head-row"><div><h2>سفارشات</h2><p class="muted">سفارش مشتری را ثبت کن؛ یک روز قبل از تحویل به تو یادآوری می‌شود.</p></div><button class="primary-button" id="new-order">＋ سفارش جدید</button></div></section>
    <section class="panel order-summary"><span>در انتظار تحویل</span><strong>${orders.filter(o => o.status === "pending").length}</strong></section>
    <section class="orders-list">${rows || `<div class="panel empty-inline"><span>◷</span><p>هنوز سفارشی ثبت نشده است.</p></div>`}</section>`;
}

export function bindOrderControls(products: Product[], parties: Party[], rial: (n: number) => string, onChanged: () => Promise<void>, showToast: (message: string) => void): void {
  document.querySelector("#new-order")?.addEventListener("click", () => {
    if (!parties.some(p => p.type === "customer" || p.type === "both")) { showToast("ابتدا یک مشتری ثبت کنید"); return; }
    if (!products.length) { showToast("ابتدا یک کالا ثبت کنید"); return; }
    document.body.insertAdjacentHTML("beforeend", orderModal(undefined, products, parties, rial));
    bindOrderModal(products, parties, rial, onChanged, showToast);
  });
  document.querySelectorAll<HTMLElement>("[data-order-edit]").forEach(button => button.addEventListener("click", async () => {
    const id = button.dataset.orderEdit;
    const order = (await listOrders()).find(o => o.id === id);
    if (!order) return;
    document.body.insertAdjacentHTML("beforeend", orderModal(order, products, parties, rial));
    bindOrderModal(products, parties, rial, onChanged, showToast, order);
  }));
  document.querySelectorAll<HTMLElement>("[data-order-complete]").forEach(button => button.addEventListener("click", async () => {
    const id = button.dataset.orderComplete;
    const order = (await listOrders()).find(o => o.id === id);
    if (!order) return;
    order.status = "completed";
    await updateOrder(order);
    await cancelOrderReminder(order.id);
    await onChanged();
    showToast("سفارش تحویل‌شده ثبت شد");
  }));
  document.querySelectorAll<HTMLElement>("[data-order-cancel]").forEach(button => button.addEventListener("click", async () => {
    const id = button.dataset.orderCancel;
    const order = (await listOrders()).find(o => o.id === id);
    if (!order) return;
    order.status = "cancelled";
    await updateOrder(order);
    await cancelOrderReminder(order.id);
    await onChanged();
    showToast("سفارش لغو شد");
  }));
  document.querySelectorAll<HTMLElement>("[data-order-delete]").forEach(button => button.addEventListener("click", async () => {
    const id = button.dataset.orderDelete;
    if (!id || !window.confirm("این سفارش حذف شود؟")) return;
    await cancelOrderReminder(id);
    await deleteOrder(id);
    await onChanged();
    showToast("سفارش حذف شد");
  }));
}

function bindOrderModal(products: Product[], parties: Party[], rial: (n: number) => string, onChanged: () => Promise<void>, showToast: (message: string) => void, existing?: Order): void {
  const modal = document.querySelector<HTMLDivElement>("#order-modal");
  if (!modal) return;
  const product = modal.querySelector<HTMLSelectElement>("#order-product")!;
  const qty = modal.querySelector<HTMLInputElement>("#order-qty")!;
  const price = modal.querySelector<HTMLInputElement>("#order-price")!;
  const total = modal.querySelector<HTMLElement>("#order-total")!;
  const updateTotal = () => {
    const q = Number(qty.value.replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[^0-9.]/g, "")) || 0;
    const p = Number(price.value.replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[^0-9.]/g, "")) || 0;
    total.textContent = rial(Math.round(q * p));
  };
  product.addEventListener("change", () => {
    if (!existing) price.value = String(products.find(p => p.id === product.value)?.salePrice ?? 0);
    updateTotal();
  });
  qty.addEventListener("input", updateTotal);
  price.addEventListener("input", updateTotal);
  modal.querySelector("#order-close")?.addEventListener("click", () => modal.remove());
  modal.querySelector("#order-submit")?.addEventListener("click", async () => {
    try {
      const partyId = modal.querySelector<HTMLSelectElement>("#order-party")!.value;
      const productId = product.value;
      const quantity = Number(qty.value.replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[^0-9.]/g, ""));
      const unitPrice = Number(price.value.replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[^0-9.]/g, ""));
      const dateValue = modal.querySelector<HTMLInputElement>("#order-delivery")!.value;
      const deliveryDate = dateValue ? new Date(`${dateValue}T12:00:00`).getTime() : 0;
      if (!partyId || !productId || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0 || !deliveryDate) throw new Error("اطلاعات سفارش را کامل کنید");
      const note = modal.querySelector<HTMLInputElement>("#order-note")!.value.trim();
      const saved = existing
        ? { ...existing, partyId, productId, quantity, unitPrice, deliveryDate, note }
        : await addOrder({ partyId, productId, quantity, unitPrice, deliveryDate, note, orderDate: Date.now() });
      if (existing) await updateOrder(saved);
      const party = parties.find(p => p.id === partyId)!;
      const selectedProduct = products.find(p => p.id === productId)!;
      let reminderScheduled = false;
      try { reminderScheduled = await scheduleOrderReminder(saved, party, selectedProduct); } catch { reminderScheduled = false; }
      modal.remove();
      await onChanged();
      showToast(reminderScheduled ? "سفارش ثبت شد؛ یادآوری یک روز قبل فعال شد" : "سفارش ثبت شد");
    } catch (e) { showToast(e instanceof Error ? e.message : "ثبت سفارش ناموفق بود"); }
  });
  updateTotal();
}
