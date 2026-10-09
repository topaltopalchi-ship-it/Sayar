type MarketPrice = { symbol: string; label: string; price: number; unit: string; updatedAt: string };
type Cache = { fetchedAt: number; source: string; prices: MarketPrice[] };
const CACHE_KEY = "saysay-market-prices-v1";
const CACHE_TTL = 30 * 60 * 1000;
const SOURCE = "https://raw.githubusercontent.com/iran-market/iran-market.github.io/main/data/popular.json";

function readCache(): Cache | null {
  try {
    const value = localStorage.getItem(CACHE_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as Cache;
    return Array.isArray(parsed.prices) ? parsed : null;
  } catch { return null; }
}
function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const n = Number(String(value ?? "").replace(/[٬,]/g, "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function normalize(raw: unknown): MarketPrice[] {
  if (!raw || typeof raw !== "object") return [];
  const obj = raw as { data?: unknown; items?: unknown };
  const rows = Array.isArray(obj.data) ? obj.data : Array.isArray(obj.items) ? obj.items : [];
  const find = (terms: RegExp) => rows.map((v) => {
    const r = v as Record<string, unknown>;
    const symbol = String(r.symbol ?? r.id ?? r.code ?? "");
    const label = String(r.name ?? r.title ?? r.label ?? symbol);
    const price = toNumber(r.price ?? r.value ?? r.rate);
    return { symbol, label, price, unit: String(r.unit ?? "تومان"), updatedAt: String(r.updatedAt ?? r.updated_at ?? "") };
  }).find(x => terms.test((x.symbol + " " + x.label).toLowerCase()) && x.price > 0);
  const usd = find(/usd_irr_free|usd.*free|dollar.*free|دلار.*آزاد|دلار آمریکا/);
  const gold = find(/gold_18|geram18|18k|gold.*18|طلای ۱۸|طلای 18/);
  const coin = find(/coin.*emami|emami.*coin|sek[e]?h.*emami|سکه امامی/);
  return [
    ...(usd ? [{ ...usd, symbol: "usd", label: "دلار آزاد", unit: "تومان" }] : []),
    ...(gold ? [{ ...gold, symbol: "gold", label: "طلای ۱۸ عیار", unit: "تومان/گرم" }] : []),
    ...(coin ? [{ ...coin, symbol: "coin", label: "سکه امامی", unit: "تومان" }] : []),
  ];
}
function formatPrice(n: number): string { return new Intl.NumberFormat("fa-IR").format(Math.round(n)); }
function ensureWidget(): HTMLElement {
  let el = document.getElementById("saysay-market-widget");
  if (el) return el;
  el = document.createElement("aside");
  el.id = "saysay-market-widget";
  el.dir = "rtl";
  el.style.cssText = "position:fixed;z-index:999;left:10px;bottom:10px;width:min(300px,calc(100vw - 20px));max-height:38vh;overflow:auto;background:#111c30;color:#f8fafc;border:1px solid #334155;border-radius:14px;padding:10px 12px;box-shadow:0 8px 28px #0005;font:12px/1.6 system-ui,sans-serif";
  document.body.appendChild(el);
  return el;
}
function render(cache: Cache | null, status: string): void {
  const el = ensureWidget();
  const rows = cache?.prices ?? [];
  el.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><strong>قیمت بازار ایران</strong><button id="saysay-market-refresh" type="button" style="border:0;border-radius:8px;padding:4px 8px;background:#2563eb;color:white">به‌روزرسانی</button></div>' +
    (rows.length ? rows.map(p => '<div style="display:flex;justify-content:space-between;gap:8px;border-bottom:1px solid #334155;padding:4px 0"><span>'+p.label+'</span><b>'+formatPrice(p.price)+' '+p.unit+'</b></div>').join("") : '<div>قیمت ذخیره‌شده‌ای موجود نیست.</div>') +
    '<small style="display:block;color:#cbd5e1;margin-top:5px">'+status+(cache ? ' · آخرین دریافت: '+new Date(cache.fetchedAt).toLocaleString("fa-IR") : "")+'</small>';
  el.querySelector("#saysay-market-refresh")?.addEventListener("click", () => void refresh(true));
}
async function refresh(force = false): Promise<void> {
  let cache = readCache();
  if (!navigator.onLine) { render(cache, "آفلاین · نمایش آخرین قیمت ذخیره‌شده"); return; }
  if (!force && cache && Date.now() - cache.fetchedAt < CACHE_TTL) { render(cache, "قیمت‌ها از حافظه محلی"); return; }
  render(cache, "در حال دریافت قیمت‌ها…");
  try {
    const response = await fetch(SOURCE, { cache: "no-store", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const raw = await response.json();
    const prices = normalize(raw);
    if (!prices.length) throw new Error("ساختار داده یا نمادهای بازار شناسایی نشد");
    cache = { fetchedAt: Date.now(), source: SOURCE, prices };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    render(cache, "به‌روز از منبع عمومی · داده‌ها ممکن است با تأخیر منتشر شوند");
  } catch {
    render(cache, cache ? "اتصال ناموفق · آخرین قیمت ذخیره‌شده نمایش داده می‌شود" : "دریافت قیمت ناموفق بود؛ هنوز قیمت ذخیره‌شده‌ای ندارید");
  }
}
export function initializeOfflineServices(): void {
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => void navigator.serviceWorker.register("/sw.js").catch(() => undefined), { once: true });
  }
  window.addEventListener("online", () => void refresh(true));
  window.addEventListener("offline", () => render(readCache(), "آفلاین · نمایش آخرین قیمت ذخیره‌شده"));
  void refresh();
}
