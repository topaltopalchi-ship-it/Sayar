import { SpeechRecognition } from "@capacitor-community/speech-recognition";
import { TextToSpeech } from "@capacitor-community/text-to-speech";
import { Capacitor } from "@capacitor/core";
import { getPartyBalances, getStock, listParties, listProducts, listTransactions } from "./db";
import type { Product } from "./domain";

type ChatMessage = { role: "user" | "assistant"; text: string };
let messages: ChatMessage[] = [];
let listening = false;
const money = (n: number) => Math.round(Math.abs(n)).toLocaleString("fa-IR") + " ریال";
const qty = (n: number) => Number(n).toLocaleString("fa-IR");
function addMessage(role: ChatMessage["role"], text: string): HTMLElement | undefined {
  messages.push({ role, text });
  const list = document.querySelector<HTMLElement>("#secretary-messages");
  if (!list) return;
  const item = document.createElement("div"); item.className = `secretary-message ${role}`; item.textContent = text;
  list.appendChild(item); list.scrollTop = list.scrollHeight; return item;
}
function norm(s: string): string {
  return s.toLocaleLowerCase("fa-IR").replace(/[يى]/g,"ی").replace(/ك/g,"ک")
    .replace(/[۰-۹]/g,d=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g,d=>String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[\u064B-\u065F\u0670]/g,"").trim();
}
function findProducts(q: string, products: Product[]): Product[] {
  const stop=/^(موجودی|کالا|کالای|چقدر|چنده|چند|است|رو|را|بگو|لطفا|لطفاً|انبار|قیمت|از|برای)$/;
  const words=q.split(/\s+/).filter(w=>w.length>1&&!stop.test(w));
  const found=products.map(p=>({p,score:words.filter(w=>norm(p.name).includes(w)||norm(p.sku||"").includes(w)).length,exact:q.includes(norm(p.name))&&!!norm(p.name)}))
    .filter(x=>x.score>0||x.exact).sort((a,b)=>Number(b.exact)-Number(a.exact)||b.score-a.score);
  return found.length&&words.length?found.filter(x=>x.exact||x.score===found[0].score).map(x=>x.p):[];
}
async function localReply(text: string): Promise<string> {
 const q=norm(text);
 if (/^(سلام|درود|صبح بخیر|عصر بخیر)/.test(q)) return "سلام! منشی آفلاین سای‌سای آماده است. درباره بدهکاران، بستانکاران، موجودی کالا و فروش سؤال کنید.";
 if (/راهنما|چه کار|کمک|نمونه سوال/.test(q)) return "می‌توانید بپرسید:\n• لیست بدهکاران\n• بستانکاران ما چه کسانی هستند؟\n• موجودی کالاها\n• موجودی [نام کالا] چقدر است؟\n• کالاهای کم‌موجودی\n• فروش امروز چقدر بوده؟";
 try {
  if (/بدهکار|مطالبات|از ما طلبکارن/.test(q)) {
   const [parties,balances]=await Promise.all([listParties(),getPartyBalances()]);
   const rows=parties.filter(p=>(p.type==="customer"||p.type==="both")&&(balances[p.id]?.balance??0)>0).map(p=>({name:p.name,b:balances[p.id].balance})).sort((a,b)=>b.b-a.b);
   return rows.length?"فهرست بدهکاران:\n"+rows.slice(0,30).map((x,i)=>`${i+1}. ${x.name} — ${money(x.b)}`).join("\n")+ "\n\nجمع بدهی: "+money(rows.reduce((s,x)=>s+x.b,0)):"در اطلاعات فعلی، بدهی باز برای مشتریان پیدا نکردم.";
  }
  if (/بستانکار|بدهی ما|به چه کسی بدهکار|طلبکاران/.test(q)) {
   const [parties,balances]=await Promise.all([listParties(),getPartyBalances()]);
   const rows=parties.filter(p=>(p.type==="supplier"||p.type==="both")&&(balances[p.id]?.balance??0)<0).map(p=>({name:p.name,b:Math.abs(balances[p.id].balance)})).sort((a,b)=>b.b-a.b);
   return rows.length?"بستانکاران (بدهی ما):\n"+rows.slice(0,30).map((x,i)=>`${i+1}. ${x.name} — ${money(x.b)}`).join("\n")+"\n\nجمع بدهی ما: "+money(rows.reduce((s,x)=>s+x.b,0)):"بدهی باز به تأمین‌کنندگان پیدا نکردم.";
  }
  if (/کم.?موجود|رو به اتمام|موجودی کم|کالاهای کم/.test(q)) {
   const ps=(await listProducts()).filter(p=>p.active);
   const rows=(await Promise.all(ps.map(async p=>({p,s:await getStock(p.id)})))).filter(x=>x.p.lowStock>0&&x.s<=x.p.lowStock).sort((a,b)=>a.s-b.s);
   return rows.length?"کالاهای کم‌موجودی:\n"+rows.slice(0,30).map(x=>`• ${x.p.name}: ${qty(x.s)} ${x.p.unit} (حد هشدار ${qty(x.p.lowStock)})`).join("\n"):"کالایی در حد هشدار موجودی پیدا نکردم.";
  }
  if (/موجودی|چند تا|چقدر کالا|انبار/.test(q)) {
   const ps=(await listProducts()).filter(p=>p.active), matched=findProducts(q,ps);
   if(matched.length){const rows=await Promise.all(matched.slice(0,15).map(async p=>({p,s:await getStock(p.id)})));return "موجودی کالا:\n"+rows.map(x=>`• ${x.p.name}: ${qty(x.s)} ${x.p.unit}`).join("\n");}
   const rows=await Promise.all(ps.map(async p=>({p,s:await getStock(p.id)})));
   return rows.length?"موجودی کالاهای فعال:\n"+rows.sort((a,b)=>a.p.name.localeCompare(b.p.name,"fa")).slice(0,30).map(x=>`• ${x.p.name}: ${qty(x.s)} ${x.p.unit}`).join("\n"):"هنوز کالایی در برنامه ثبت نشده است.";
  }
  if (/فروش امروز|امروز چقدر فروخت|میزان فروش امروز/.test(q)) {
   const start=new Date();start.setHours(0,0,0,0);
   const sales=(await listTransactions()).filter(t=>t.type==="sale"&&t.date>=start.getTime()&&t.date<=Date.now());
   return `فروش ثبت‌شده امروز: ${money(sales.reduce((s,t)=>s+t.amount,0))}\nتعداد فاکتور فروش: ${qty(sales.length)}`;
  }
  const ps=(await listProducts()).filter(p=>p.active), matched=findProducts(q,ps);
  if(matched.length&&/قیمت|چنده|چند است/.test(q))return matched.slice(0,10).map(p=>`${p.name}: قیمت فروش ${money(p.salePrice)}`).join("\n");
  if(/تاریخ|امروز|ساعت/.test(q))return "تاریخ امروز: "+new Intl.DateTimeFormat("fa-IR-u-ca-persian").format(new Date())+".";
  return "این سؤال هنوز پشتیبانی نمی‌شود. بپرسید «لیست بدهکاران»، «موجودی کالاها»، «کالاهای کم‌موجودی» یا «فروش امروز چقدر بوده؟».";
 } catch { return "خواندن اطلاعات برنامه با خطا روبه‌رو شد. صفحه را دوباره باز کنید؛ اگر مشکل ماند، گزارش دهید."; }
}
async function speak(text:string):Promise<void>{try{await TextToSpeech.speak({text,lang:"fa-IR",rate:.92,pitch:1,volume:1});}catch{if("speechSynthesis"in window)window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));}}
async function send(text:string):Promise<void>{const v=text.trim();if(!v)return;addMessage("user",v);const pending=addMessage("assistant","در حال بررسی اطلاعات برنامه…");const reply=await localReply(v);if(pending)pending.textContent=reply;const list=document.querySelector<HTMLElement>("#secretary-messages");if(list)list.scrollTop=list.scrollHeight;await speak(reply);}
function close():void{document.querySelector("#secretary-modal")?.remove();if(listening&&Capacitor.isNativePlatform())void SpeechRecognition.stop().catch(()=>undefined);listening=false;}
export function openSmartSecretary():void{
 if(document.querySelector("#secretary-modal"))return;messages=[];
 document.body.insertAdjacentHTML("beforeend",`
 <div class="modal-backdrop" id="secretary-modal"><section class="modal secretary-modal" role="dialog" aria-modal="true" aria-labelledby="secretary-title">
 <button class="modal-close" id="secretary-close" aria-label="بستن">×</button><span class="eyebrow">دستیار آفلاین و متنی</span>
 <h2 id="secretary-title">منشی سای‌سای</h2><p class="muted">بدون اینترنت؛ بر پایه اطلاعات ذخیره‌شده در همین برنامه.</p>
 <div id="secretary-messages" class="secretary-messages" aria-live="polite"></div>
 <form id="secretary-form" class="secretary-form"><input id="secretary-input" type="text" autocomplete="off" placeholder="مثلاً لیست بدهکاران…" aria-label="پیام"/><button class="primary-button" type="submit">ارسال</button></form>
 <button class="secondary-button wide" id="secretary-mic" type="button">🎙 صحبت کردن</button>
 <small class="muted">پاسخ‌ها از اطلاعات محلی سای‌سای محاسبه می‌شوند. تشخیص گفتار ممکن است به سرویس گفتار گوشی نیاز داشته باشد.</small></section></div>`);
 document.querySelector("#secretary-close")?.addEventListener("click",close);
 document.querySelector("#secretary-modal")?.addEventListener("click",e=>{if(e.target===e.currentTarget)close();});
 document.querySelector("#secretary-form")?.addEventListener("submit",e=>{e.preventDefault();const input=document.querySelector<HTMLInputElement>("#secretary-input");if(input){const v=input.value;input.value="";void send(v);}});
 document.querySelector("#secretary-mic")?.addEventListener("click",async()=>{
  const button=document.querySelector<HTMLButtonElement>("#secretary-mic");if(!button)return;
  try{
   const available=await SpeechRecognition.available().catch(()=>({available:false}));
   if(!available.available){addMessage("assistant","سرویس تشخیص گفتار روی گوشی در دسترس نیست. در تنظیمات گوشی، برنامه Google و سرویس «Speech Recognition and Synthesis» را فعال یا به‌روز کنید؛ سپس گوشی را یک‌بار راه‌اندازی مجدد کنید.");return;}
   const permission=await SpeechRecognition.requestPermissions();
   if(permission.speechRecognition!=="granted"){addMessage("assistant","مجوز تشخیص گفتار داده نشد. از تنظیمات گوشی > برنامه‌ها > سای‌سای، مجوز میکروفون را فعال کنید.");return;}
   try{const state=await SpeechRecognition.isListening();if(state.listening)await SpeechRecognition.stop().catch(()=>undefined);}catch{}
   listening=true;button.disabled=true;button.textContent="در حال شنیدن…";
   await SpeechRecognition.start({language:"fa-IR",maxResults:1,partialResults:false,popup:false});
  }catch(error){listening=false;button.disabled=false;button.textContent="🎙 صحبت کردن";
   const detail=error instanceof Error?error.message:"";
   addMessage("assistant",/permission|denied/i.test(detail)?"دسترسی میکروفون یا تشخیص گفتار رد شده است؛ مجوزهای سای‌سای را بررسی کنید.":"سرویس تشخیص گفتار فارسی شروع نشد. سرویس گفتار Google را فعال و به‌روز کنید؛ اگر باز هم کار نکرد، فعلاً سؤال را در کادر بنویسید.");
  }
 });
 void SpeechRecognition.addListener("partialResults",e=>{const t=e.matches?.[0]?.trim();if(!t||!document.querySelector("#secretary-modal"))return;const input=document.querySelector<HTMLInputElement>("#secretary-input");if(input)input.value=t;});
 void SpeechRecognition.addListener("listeningState",e=>{if(e.status==="stopped"){listening=false;const b=document.querySelector<HTMLButtonElement>("#secretary-mic");if(b){b.disabled=false;b.textContent="🎙 صحبت کردن";}const input=document.querySelector<HTMLInputElement>("#secretary-input");if(input?.value.trim()){const v=input.value;input.value="";void send(v);}}});
 addMessage("assistant","سلام! منشی آفلاین سای‌سای آماده است. بپرسید «لیست بدهکاران»، «موجودی کالاها» یا «کالاهای کم‌موجودی».");
}
