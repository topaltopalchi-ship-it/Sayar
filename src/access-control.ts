import {
  getCloudAccount, listCloudAccessUsers, requestCloudSmsCode, setCloudAccessUser,
  signOutCloud, verifyCloudSmsCode,
} from "./cloud-backup";

type Notify = (message: string) => void;

function accessModal(): string {
  const account = getCloudAccount();
  return `<div class="modal-backdrop" id="access-control-modal"><section class="modal access-control-modal">
    <button class="modal-close" id="access-close">×</button>
    <span class="eyebrow">امنیت سای‌سای</span><h2>مدیریت کاربران مجاز</h2>
    <p class="muted">فقط مدیر می‌تواند شماره‌ها را فعال یا غیرفعال کند. سقف کل حساب‌ها ۶ نفر است: شما و حداکثر پنج کاربر دیگر.</p>
    ${account ? `<div class="access-current"><b>واردشده</b><span dir="ltr">${escapeHtml(account.phone || "")}</span><button class="secondary-button" id="access-signout">خروج</button></div>` : `
    <div class="access-login-fields"><label class="field"><span>شماره موبایل مدیر یا کاربر مجاز</span><input id="access-phone" type="tel" inputmode="tel" placeholder="+989121234567" dir="ltr" autocomplete="tel"></label>
    <button class="primary-button wide" id="access-send-code">ارسال کد پیامکی</button>
    <label class="field"><span>کد پیامکی</span><input id="access-code" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="کد تأیید" dir="ltr"></label>
    <button class="primary-button wide" id="access-verify-code">تأیید و ورود</button></div>`}
    <div id="access-owner-panel"><p class="muted">برای مدیریت فهرست، ابتدا با شماره‌ای که مدیر تعیین کرده وارد شوید.</p></div>
  </section></div>`;
}
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}
function normalizedPhone(value: string): string {
  return value.trim().replace(/[\s()-]/g, "");
}

export function openAccessControlModal(notify: Notify): void {
  document.querySelector("#access-control-modal")?.remove();
  document.body.insertAdjacentHTML("beforeend", accessModal());
  const modal = document.querySelector<HTMLElement>("#access-control-modal");
  if (!modal) return;
  modal.querySelector("#access-close")?.addEventListener("click", () => modal.remove());
  modal.querySelector("#access-send-code")?.addEventListener("click", async () => {
    const phone = normalizedPhone(modal.querySelector<HTMLInputElement>("#access-phone")?.value || "");
    try {
      await requestCloudSmsCode(phone);
      notify("اگر شماره در فهرست مجاز باشد، کد پیامکی ارسال می‌شود.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "ارسال کد ناموفق بود");
    }
  });
  modal.querySelector("#access-verify-code")?.addEventListener("click", async () => {
    const phone = normalizedPhone(modal.querySelector<HTMLInputElement>("#access-phone")?.value || "");
    const code = modal.querySelector<HTMLInputElement>("#access-code")?.value || "";
    try {
      await verifyCloudSmsCode(phone, code);
      notify("ورود با موفقیت انجام شد");
      modal.querySelector(".access-login-fields")?.remove();
      const current = document.createElement("div");
      current.className = "access-current";
      current.innerHTML = `<b>واردشده</b><span dir="ltr">${escapeHtml(getCloudAccount()?.phone || "")}</span><button class="secondary-button" id="access-signout">خروج</button>`;
      modal.querySelector("#access-owner-panel")?.before(current);
      current.querySelector("#access-signout")?.addEventListener("click", () => { signOutCloud(); modal.remove(); notify("از حساب ابری خارج شدید"); });
      await renderOwnerPanel(modal, notify);
    } catch (error) {
      notify(error instanceof Error ? error.message : "ورود ناموفق بود");
    }
  });
  modal.querySelector("#access-signout")?.addEventListener("click", () => {
    signOutCloud();
    modal.remove();
    notify("از حساب ابری خارج شدید");
  });
  if (getCloudAccount()) void renderOwnerPanel(modal, notify);
}

async function renderOwnerPanel(modal: HTMLElement, notify: Notify): Promise<void> {
  const panel = modal.querySelector<HTMLElement>("#access-owner-panel");
  if (!panel) return;
  try {
    const users = await listCloudAccessUsers();
    panel.innerHTML = `
      <h3>فهرست کاربران مجاز (${users.filter(user => user.enabled).length}/۶)</h3>
      <div class="access-user-list">${users.map(user => `
        <div class="access-user-row">
          <div><b dir="ltr">${escapeHtml(user.phone)}</b><small>${user.role === "owner" ? "مدیر اصلی" : "کاربر"} · ${user.enabled ? "فعال" : "غیرفعال"}</small></div>
          ${user.role === "owner" ? '<span class="muted">مدیر</span>' : `<button class="secondary-button" data-access-toggle="${escapeHtml(user.phone)}" data-enabled="${user.enabled ? "true" : "false"}">${user.enabled ? "غیرفعال‌کردن" : "فعال‌کردن"}</button>`}
        </div>`).join("")}</div>
      <div class="access-add-user"><label class="field"><span>افزودن کاربر با شماره موبایل</span><input id="access-new-phone" type="tel" inputmode="tel" dir="ltr" placeholder="+989121234567"></label><button class="primary-button wide" id="access-add-user-button">فعال‌کردن شماره</button></div>
      <p class="muted">کاربر جدید باید شماره‌اش را با کد پیامکی تأیید کند. فقط مدیر می‌تواند این فهرست را تغییر دهد.</p>`;
    panel.querySelectorAll<HTMLButtonElement>("[data-access-toggle]").forEach(button => {
      button.addEventListener("click", async () => {
        const phone = button.dataset.accessToggle || "";
        const enabled = button.dataset.enabled !== "true";
        try {
          await setCloudAccessUser(phone, enabled);
          notify(enabled ? "کاربر فعال شد" : "دسترسی کاربر غیرفعال شد");
          await renderOwnerPanel(modal, notify);
        } catch (error) { notify(error instanceof Error ? error.message : "تغییر دسترسی ناموفق بود"); }
      });
    });
    panel.querySelector("#access-add-user-button")?.addEventListener("click", async () => {
      const input = panel.querySelector<HTMLInputElement>("#access-new-phone");
      try {
        if (!input) return;
        await setCloudAccessUser(input.value, true);
        notify("شماره به فهرست مجاز اضافه شد");
        await renderOwnerPanel(modal, notify);
      } catch (error) { notify(error instanceof Error ? error.message : "افزودن کاربر ناموفق بود"); }
    });
  } catch {
    panel.innerHTML = '<p class="muted">حساب شما کاربر مجاز است؛ مدیریت فهرست فقط برای مدیر اصلی فعال است.</p>';
  }
}
