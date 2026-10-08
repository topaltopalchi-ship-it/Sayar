import { SpeechRecognition } from "@capacitor-community/speech-recognition";
import { speakSaiSai } from "./voice-assistant";

function normalizeDigits(text: string): string {
  return text.replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

function wordNumbers(text: string): string {
  const words: Record<string,string> = {
    صفر:"0",یک:"1",یکی:"1",دو:"2",سه:"3",چهار:"4",پنج:"5",شش:"6",هفت:"7",هشت:"8",نه:"9",ده:"10",
    یازده:"11",دوازده:"12",سیزده:"13",چهارده:"14",پانزده:"15",شانزده:"16",هفده:"17",هجده:"18",نوزده:"19",
    بیست:"20",سی:"30",چهل:"40",پنجاه:"50",شصت:"60",هفتاد:"70",هشتاد:"80",نود:"90",صد:"100"
  };
  let out=text;
  for (const [k,v] of Object.entries(words)) out=out.replace(new RegExp("\\b"+k+"\\b","g"),v);
  return out;
}

function expressionFromSpeech(text: string): string {
  let s=wordNumbers(normalizeDigits(text).replace(/،|,/g," "));
  s=s.replace(/(?:ماشین حساب|حساب کن|محاسبه کن|لطفا|لطفاً)/g," ");
  s=s.replace(/ضرب(?:در| شده با)?|در/g," * ");
  s=s.replace(/جمع(?: با)?|به علاوه|بعلاوه/g," + ");
  s=s.replace(/منهای|منها|کم کن|منفی/g," - ");
  s=s.replace(/تقسیم(?: بر)?|تقسیمه بر/g," / ");
  s=s.replace(/برابر با|مساوی است|مساوی/g," ");
  s=s.replace(/×/g," * ").replace(/[÷]/g," / ");
  s=s.replace(/[^0-9.*/+\-() ]/g," ").replace(/\s+/g," ").trim();
  return s;
}

function calculate(expression: string): number {
  const tokens=expression.match(/\d+(?:\.\d+)?|[()+\-*/]/g) ?? [];
  if (!tokens.length || tokens.join("") !== expression.replace(/\s/g,"")) throw new Error("عبارت ریاضی قابل تشخیص نیست");
  const values:number[]=[]; const ops:string[]=[];
  const precedence=(op:string)=>op==="+"||op==="-"?1:2;
  const apply=()=>{ const op=ops.pop(); const b=values.pop(); const a=values.pop(); if(op===undefined||a===undefined||b===undefined) throw new Error("عبارت ناقص است"); if(op==="+") values.push(a+b); else if(op==="-") values.push(a-b); else if(op==="*") values.push(a*b); else if(op==="/"){ if(b===0) throw new Error("تقسیم بر صفر ممکن نیست"); values.push(a/b); } };
  for(let i=0;i<tokens.length;i++){ const t=tokens[i]; if(/^\d/.test(t)) values.push(Number(t)); else if(t==="(") ops.push(t); else if(t===")"){ while(ops.length&&ops.at(-1)!=="(") apply(); if(ops.pop()!=="(") throw new Error("پرانتز نامعتبر است"); } else { if((t==="+"||t==="-")&&(i===0||tokens[i-1]==="(")){ values.push(0); } while(ops.length&&ops.at(-1)!=="("&&precedence(ops.at(-1)!)>=precedence(t)) apply(); ops.push(t); } }
  while(ops.length) { if(ops.at(-1)==="(") throw new Error("پرانتز نامعتبر است"); apply(); }
  if(values.length!==1||!Number.isFinite(values[0])) throw new Error("نتیجه معتبر نیست");
  return values[0];
}

function formatResult(value:number):string { return Number.isInteger(value) ? value.toLocaleString("fa-IR") : value.toLocaleString("fa-IR",{maximumFractionDigits:8}); }

async function listenAndCalculate(modal: HTMLElement): Promise<void> {
  const button=modal.querySelector<HTMLButtonElement>("#calc-voice")!;
  const available=await SpeechRecognition.available().catch(()=>({available:false}));
  if(!available.available){ alert("تشخیص صدا در این دستگاه در دسترس نیست"); return; }
  const permission=await SpeechRecognition.requestPermissions().catch(()=>null);
  if(permission && permission.speechRecognition!=="granted"){ alert("اجازه میکروفون لازم است"); return; }
  button.disabled=true; button.textContent="🎙 در حال شنیدن…";
  try {
    const result=await SpeechRecognition.start({language:"fa-IR",maxResults:1,partialResults:false,popup:false,prompt:"عملیات را بگویید؛ مثلاً صد به علاوه بیست ضربدر دو"});
    const text=result.matches?.[0]?.trim()||"";
    if(!text) throw new Error("عملیات شنیده نشد");
    const expression=expressionFromSpeech(text);
    const value=calculate(expression);
    modal.querySelector<HTMLElement>("#calc-expression")!.textContent=text;
    modal.querySelector<HTMLElement>("#calc-result")!.textContent=formatResult(value);
    speakSaiSai("نتیجه " + formatResult(value));
  } catch(e) { alert(e instanceof Error?e.message:"محاسبه صوتی ناموفق بود"); }
  finally { button.disabled=false; button.textContent="🎙 محاسبه با صدا"; }
}

export function openVoiceCalculator(): void {
  document.querySelector("#voice-calculator-modal")?.remove();
  const modal=document.createElement("div"); modal.className="modal-backdrop"; modal.id="voice-calculator-modal";
  modal.innerHTML='<section class="modal" role="dialog" aria-modal="true"><button class="modal-close" id="calc-close">×</button><span class="eyebrow">ماشین حساب صوتی</span><h2>ماشین حساب سای‌سای</h2><p class="muted">مثلاً بگویید: «صد به علاوه بیست ضربدر دو»</p><div class="voice-transcript"><span>آخرین عبارت</span><b id="calc-expression">—</b></div><div class="voice-draft-grid"><div><small>نتیجه</small><strong id="calc-result">—</strong></div></div><div class="form-actions"><button class="secondary-button" id="calc-close-2">بستن</button><button class="primary-button" id="calc-voice">🎙 محاسبه با صدا</button></div></section></div>';
  document.body.appendChild(modal);
  modal.querySelector("#calc-close")?.addEventListener("click",()=>modal.remove());
  modal.querySelector("#calc-close-2")?.addEventListener("click",()=>modal.remove());
  modal.querySelector("#calc-voice")?.addEventListener("click",()=>void listenAndCalculate(modal));
}
