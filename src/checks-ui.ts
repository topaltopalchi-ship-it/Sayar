import { addCheck, listChecks, updateCheck, clearCheck, listAccounts, listParties } from "./db";
import { formatMoney } from "./settings";
import type { Check, CheckDirection, CheckStatus } from "./domain";

const rial = (v: number) => formatMoney(v);
const dateLabel = (v: number) => new Intl.DateTimeFormat("fa-IR-u-ca-persian", { year:"numeric", month:"2-digit", day:"2-digit" }).format(new Date(v));
const statusLabel: Record<CheckStatus,string> = { pending:"در انتظار", cleared:"وصول شد", bounced:"برگشت خورد", spent:"خرج شد", cancelled:"باطل شد" };

export async function checksView(): Promise<string> {
  const checks = await listChecks();
  const received = checks.filter(c => c.direction === "received");
  const issued = checks.filter(c => c.direction === "issued");
  const pending = checks.filter(c => c.status === "pending");
  const overdue = pending.filter(c => c.dueDate < Date.now());
  const rows = checks.map(c => `<div class="check-row"><div class="check-icon">${c.direction === "received" ? "↓" : "↑"}</div><div><strong>${c.number || "بدون شماره"} · ${c.issuerName || c.bank}</strong><small>${c.direction === "received" ? "دریافتی" : "پرداختی"} · سررسید ${dateLabel(c.dueDate)} · ${statusLabel[c.status]}</small></div><b>${rial(c.amount)}</b><select class="check-status" data-check-id="${c.id}">${Object.entries(statusLabel).map(([k,v]) => `<option value="${k}" ${c.status===k?"selected":""}>${v}</option>`).join("")}</select></div>`).join("");
  return `<section class="hero"><div><p class="hero-kicker">اسناد دریافتنی و پرداختنی</p><h2>چک‌ها و سررسیدها</h2><p class="muted">چک‌های دریافتی و پرداختی را پیگیری کنید.</p></div><div class="hero-mark">✓</div></section>
  <section class="stats-grid"><article class="stat-card primary"><span>چک‌های در انتظار</span><strong>${rial(pending.reduce((s,c)=>s+c.amount,0))}</strong></article><article class="stat-card warning"><span>سررسید گذشته</span><strong>${moneyFormat(overdue.length)}</strong></article></section>
  <section class="section"><div class="section-head"><h3>عملیات</h3><div><button class="secondary-button" id="new-received-check">＋ چک دریافتی</button> <button class="secondary-button" id="new-issued-check">＋ چک پرداختی</button></div></div></section>
  <section class="section"><div class="section-head"><h3>لیست چک‌ها</h3><span class="muted">${moneyFormat(checks.length)} فقره</span></div><div class="panel check-list">${rows || '<div class="empty-inline"><span>◌</span><p>هنوز چکی ثبت نشده است.</p></div>'}</div></section>`;
}
const moneyFormat = (v:number) => new Intl.NumberFormat("fa-IR").format(v);

export function checkModal(direction: CheckDirection, parties: Array<{id:string;name:string}> = [], accounts: Array<{id:string;name:string}> = []): string {
  const title = direction === "received" ? "ثبت چک دریافتی" : "ثبت چک پرداختی";
  return `<div class="modal-backdrop" id="check-modal"><section class="modal"><button class="modal-close" id="check-close">×</button><span class="eyebrow">چک و سررسید</span><h2>${title}</h2>
  <label class="field"><span>شماره چک</span><input id="check-number" inputmode="numeric" placeholder="مثلاً ۱۲۳۴۵۶"></label>
  <label class="field"><span>بانک</span><input id="check-bank" placeholder="مثلاً بانک ملی"></label>
  <label class="field"><span>نام صادرکننده / صاحب چک</span><input id="check-issuer"></label><label class="field"><span>طرف حساب</span><select id="check-party"><option value="">بدون انتخاب</option>${parties.map(p => `<option value="${p.id}">${p.name}</option>`).join("")}</select><label class="field"><span>حساب مالی</span><select id="check-account"><option value="">بدون انتخاب</option>${accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join("")}</select></label>
  <label class="field"><span>مبلغ</span><input id="check-amount" type="number" min="1"></label>
  <label class="field"><span>تاریخ صدور شمسی</span><input id="check-issue" placeholder="۱۴۰۵/۰۱/۰۱"></label>
  <label class="field"><span>تاریخ سررسید شمسی</span><input id="check-due" placeholder="۱۴۰۵/۰۲/۰۱"></label>
  <label class="field"><span>شرح</span><input id="check-description" placeholder="توضیحات اختیاری"></label>
  <button class="primary-button wide" id="check-submit">ثبت چک</button></section></div>`;
}

function jalaliDate(value: string): number | null {
  const m=value.trim().match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/); if(!m) return null;
  const jy=+m[1], jm=+m[2], jd=+m[3]; if(jm<1||jm>12||jd<1||jd>31)return null;
  let j=jy+1597, days=-355668+365*j+Math.floor(j/33)*8+Math.floor(((j%33)+3)/4)+jd+(jm<7?(jm-1)*31:(jm-7)*30+186);
  let gy=400*Math.floor(days/146097); days%=146097; if(days>36524){gy+=100*Math.floor(--days/36524);days%=36524;if(days>=365)days++} gy+=4*Math.floor(days/1461);days%=1461;if(days>365){gy+=Math.floor((days-1)/365);days=(days-1)%365}
  const gd=days+1, leap=(gy%4===0&&gy%100!==0)||gy%400===0, md=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];let gm=0,r=gd;while(gm<12&&r>md[gm])r-=md[gm++];
  return new Date(gy,gm,r).getTime();
}
export async function bindCheckModal(modal: HTMLElement, direction: CheckDirection, done:(m:string)=>void) {
  modal.querySelector("#check-close")?.addEventListener("click",()=>modal.remove());
  modal.querySelector("#check-submit")?.addEventListener("click",async()=>{
    try {
      const issue=jalaliDate((modal.querySelector<HTMLInputElement>("#check-issue")?.value||"").trim());
      const due=jalaliDate((modal.querySelector<HTMLInputElement>("#check-due")?.value||"").trim());
      const amount=Math.round(Number(modal.querySelector<HTMLInputElement>("#check-amount")?.value||0));
      if(!issue||!due||due<issue||amount<=0) throw new Error("مبلغ و تاریخ‌های چک را بررسی کنید");
      await addCheck({direction,number:(modal.querySelector<HTMLInputElement>("#check-number")?.value||"").trim(),bank:(modal.querySelector<HTMLInputElement>("#check-bank")?.value||"").trim(),issuerName:(modal.querySelector<HTMLInputElement>("#check-issuer")?.value||"").trim(),amount,issueDate:issue,dueDate:due,status:"pending",partyId:(modal.querySelector<HTMLSelectElement>("#check-party")?.value||undefined),accountId:(modal.querySelector<HTMLSelectElement>("#check-account")?.value||undefined),description:(modal.querySelector<HTMLInputElement>("#check-description")?.value||"").trim()});
      modal.remove();done("چک ثبت شد");
    } catch(e){done(e instanceof Error?e.message:"ثبت چک ناموفق بود");}
  });
}
export async function bindCheckStatuses(done:(m:string)=>void) {
  document.querySelectorAll<HTMLSelectElement>(".check-status").forEach(s=>s.addEventListener("change",async()=>{const id=s.dataset.checkId||""; if(s.value==="cleared"){ const accounts=await listAccounts(); const check=(await listChecks()).find(x=>x.id===id); if(!check){done("چک پیدا نشد");return;} const accountId=check.accountId||accounts[0]?.id||""; await clearCheck(id,accountId); } else { await updateCheck(id,{status:s.value as CheckStatus}); } done("وضعیت چک به‌روزرسانی شد");}));
}
