import {
  backupToCloud, downloadCloudBackup, getCloudAccount, requestCloudSmsCode,
  restoreCloudBackup, signOutCloud, verifyCloudSmsCode,
} from "./cloud-backup";

const css = `
#saysay-cloud-open{position:fixed;right:12px;bottom:12px;z-index:1000;border:0;border-radius:999px;padding:11px 15px;background:#2563eb;color:#fff;font:600 13px system-ui;box-shadow:0 5px 20px #0004}
#saysay-cloud-panel{position:fixed;inset:0;z-index:1001;background:#020617b8;display:flex;align-items:center;justify-content:center;padding:16px;font-family:system-ui,sans-serif;direction:rtl}
#saysay-cloud-card{width:min(420px,100%);max-height:90vh;overflow:auto;background:#111827;color:#f8fafc;border:1px solid #334155;border-radius:18px;padding:18px;box-shadow:0 20px 60px #0008}
#saysay-cloud-card h2{margin:0 0 8px;font-size:20px}
#saysay-cloud-card p{color:#cbd5e1;font-size:13px;line-height:1.8}
#saysay-cloud-card label{display:block;margin:12px 0 5px;font-size:13px}
#saysay-cloud-card input{box-sizing:border-box;width:100%;border:1px solid #475569;border-radius:9px;padding:11px;background:#0f172a;color:#fff;font:inherit}
#saysay-cloud-card button{border:0;border-radius:9px;padding:10px 12px;font:600 13px system-ui;cursor:pointer}
#saysay-cloud-card .primary{background:#2563eb;color:#fff}
#saysay-cloud-card .secondary{background:#334155;color:#fff}
#saysay-cloud-card .danger{background:#7f1d1d;color:#fff}
#saysay-cloud-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}
#saysay-cloud-status{margin-top:12px;padding:10px;border-radius:9px;background:#1e293b;font-size:13px;line-height:1.7;white-space:pre-wrap}
`;
function injectStyles(): void {
  if (document.getElementById("saysay-cloud-styles")) return;
  const style = document.createElement("style");
  style.id = "saysay-cloud-styles";
  style.textContent = css;
  document.head.appendChild(style);
}
function openPanel(): void {
  if (document.getElementById("saysay-cloud-panel")) return;
  const overlay = document.createElement("div");
  overlay.id = "saysay-cloud-panel";
  overlay.innerHTML = `<section id="saysay-cloud-card" role="dialog" aria-modal="true" aria-labelledby="saysay-cloud-title">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
      <h2 id="saysay-cloud-title">پشتیبان ابری سایسای</h2>
      <button type="button" class="secondary" id="saysay-cloud-close" aria-label="بستن">×</button>
    </div>
    <p>اطلاعات اصلی روی همین دستگاه ذخیره می‌شود. برای نگهداری نسخه‌ای در فضای ابری، ابتدا با شماره موبایل و کد پیامکی وارد شوید. تا زمانی که سرویس ابری پیکربندی نشده، این بخش فعال نخواهد شد.</p>
    <label for="saysay-cloud-phone">شماره موبایل با کد کشور</label>
    <input id="saysay-cloud-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+989121234567" />
    <div style="display:flex;gap:8px;margin-top:8px">
      <button type="button" class="secondary" id="saysay-cloud-send">ارسال کد پیامکی</button>
    </div>
    <label for="saysay-cloud-code">کد پیامک</label>
    <input id="saysay-cloud-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="کد تأیید" />
    <button type="button" class="primary" id="saysay-cloud-verify" style="width:100%;margin-top:8px">تأیید کد و ورود</button>
    <div id="saysay-cloud-actions" hidden>
      <button type="button" class="primary" id="saysay-cloud-backup">پشتیبان‌گیری اکنون</button>
      <button type="button" class="secondary" id="saysay-cloud-check">بررسی نسخه ابری</button>
      <button type="button" class="danger" id="saysay-cloud-restore">بازیابی روی این دستگاه</button>
      <button type="button" class="secondary" id="saysay-cloud-logout">خروج از حساب ابری</button>
    </div>
    <div id="saysay-cloud-status" role="status" aria-live="polite">وضعیت: بررسی تنظیمات…</div>
  </section>`;
  document.body.appendChild(overlay);
  const status = overlay.querySelector<HTMLElement>("#saysay-cloud-status")!;
  const actions = overlay.querySelector<HTMLElement>("#saysay-cloud-actions")!;
  const phone = overlay.querySelector<HTMLInputElement>("#saysay-cloud-phone")!;
  const code = overlay.querySelector<HTMLInputElement>("#saysay-cloud-code")!;
  const say = (message: string) => { status.textContent = message; };
  const showAccount = () => {
    const account = getCloudAccount();
    actions.hidden = !account;
    if (account) say("وارد حساب ابری هستید" + (account.phone ? ": " + account.phone : "") + ". پشتیبان‌گیری دستی در دسترس است.");
  };
  const run = async (task: () => Promise<void>) => {
    const buttons = Array.from(overlay.querySelectorAll<HTMLButtonElement>("button"));
    buttons.forEach(button => button.disabled = true);
    try { await task(); }
    catch (error) { say(error instanceof Error ? error.message : "عملیات ناموفق بود"); }
    finally { buttons.forEach(button => button.disabled = false); }
  };
  overlay.querySelector("#saysay-cloud-close")!.addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", event => { if (event.target === overlay) overlay.remove(); });
  overlay.querySelector("#saysay-cloud-send")!.addEventListener("click", () => void run(async () => {
    await requestCloudSmsCode(phone.value);
    say("اگر شماره و تنظیمات پیامک معتبر باشند، کد تأیید ارسال می‌شود. کد را وارد کنید.");
  }));
  overlay.querySelector("#saysay-cloud-verify")!.addEventListener("click", () => void run(async () => {
    await verifyCloudSmsCode(phone.value, code.value);
    showAccount();
  }));
  overlay.querySelector("#saysay-cloud-backup")!.addEventListener("click", () => void run(async () => {
    const result = await backupToCloud();
    say("پشتیبان ابری ذخیره شد. تعداد رکوردها: " + result.recordCount + "\nزمان: " + new Date(result.savedAt).toLocaleString("fa-IR"));
  }));
  overlay.querySelector("#saysay-cloud-check")!.addEventListener("click", () => void run(async () => {
    const result = await downloadCloudBackup();
    const count = Object.values(result.snapshot.data).reduce((sum, rows) => sum + rows.length, 0);
    say("نسخه پشتیبان موجود است. تعداد رکوردها: " + count + "\nآخرین ذخیره: " + new Date(result.updatedAt).toLocaleString("fa-IR") + "\nاطلاعات دستگاه هنوز تغییر نکرده است.");
  }));
  overlay.querySelector("#saysay-cloud-restore")!.addEventListener("click", () => void run(async () => {
    const result = await downloadCloudBackup();
    const count = Object.values(result.snapshot.data).reduce((sum, rows) => sum + rows.length, 0);
    if (!window.confirm("هشدار: بازیابی، اطلاعات فعلی این دستگاه را جایگزین می‌کند. قبل از ادامه مطمئن شوید که اطلاعات فعلی را پشتیبان گرفته‌اید. تعداد رکوردهای ابری: " + count + ". ادامه می‌دهید؟")) {
      say("بازیابی لغو شد؛ اطلاعات دستگاه تغییری نکرد.");
      return;
    }
    const restored = await restoreCloudBackup();
    say("بازیابی انجام شد. تعداد رکوردها: " + restored.recordCount + ". برای نمایش همه تغییرات، برنامه را بازخوانی کنید.");
  }));
  overlay.querySelector("#saysay-cloud-logout")!.addEventListener("click", () => {
    signOutCloud();
    actions.hidden = true;
    say("از حساب ابری خارج شدید. اطلاعات محلی این دستگاه حذف نشده است.");
  });
  showAccount();
}
function mount(): void {
  if (!document.body || document.getElementById("saysay-cloud-open")) return;
  injectStyles();
  const button = document.createElement("button");
  button.id = "saysay-cloud-open";
  button.type = "button";
  button.textContent = "☁ پشتیبان ابری";
  button.addEventListener("click", openPanel);
  document.body.appendChild(button);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
else mount();
