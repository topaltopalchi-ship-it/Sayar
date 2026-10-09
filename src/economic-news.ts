export type EconomicNewsItem = {
  title: string;
  link: string;
  pubDate: string;
};

export type EconomicBrief = {
  items: EconomicNewsItem[];
  sellerAdvice: string;
  ownerAdvice: string;
  updatedAt: number;
  stale: boolean;
};

const CACHE_KEY = "saisai-economic-news-v1";
const CACHE_TTL = 30 * 60 * 1000;
const FEED_URL = "https://news.google.com/rss/search?q=%D8%A7%D9%82%D8%AA%D8%B5%D8%A7%D8%AF+%D8%A7%DB%8C%D8%B1%D8%A7%D9%86&hl=fa&gl=IR&ceid=IR%3Afa";
const PROXY_URL = "https://api.rss2json.com/v1/api.json?rss_url=" + encodeURIComponent(FEED_URL);

type CachedBrief = Omit<EconomicBrief, "stale">;
type FeedResponse = { status?: string; items?: Array<{ title?: string; link?: string; pubDate?: string }> };

function adviceFor(titles: string[]): Pick<EconomicBrief, "sellerAdvice" | "ownerAdvice"> {
  const text = titles.join(" ").toLocaleLowerCase("fa");
  if (/دلار|ارز|نرخ ارز|تتر|exchange|currency/.test(text)) {
    return {
      sellerAdvice: "قیمت فروش را با هزینه جایگزینی امروز مقایسه کن؛ روی یک نرخ لحظه‌ای، عجولانه قیمت را عوض نکن.",
      ownerAdvice: "قیمت تأمین‌کننده‌ها و حاشیه سود کالاهای پرفروش را بررسی کن؛ خرید بزرگ را به یک سناریوی ارزی گره نزن."
    };
  }
  if (/تورم|گرانی|قیمت کالا|افزایش قیمت|طلا|سکه/.test(text)) {
    return {
      sellerAdvice: "قبل از تخفیف، سود واقعی و هزینه خرید مجدد را حساب کن؛ کالاهای کم‌گردش را با احتیاط تخفیف بده.",
      ownerAdvice: "موجودی را بر اساس سرعت فروش اولویت‌بندی کن و نقدینگی لازم برای هزینه‌های ضروری را نگه دار."
    };
  }
  if (/مالیات|ساماندهی|بخشنامه|قانون|گمرک|تعرفه/.test(text)) {
    return {
      sellerAdvice: "فاکتورها و رسیدها را مرتب ثبت کن و شرایط تازه را از منبع رسمی بررسی کن.",
      ownerAdvice: "تغییرات مقررات را با حسابدار تطبیق بده؛ پیش از تصمیم مالیاتی به تیتر خبر اکتفا نکن."
    };
  }
  if (/نفت|بنزین|سوخت|حمل.?ونقل|کرایه|انرژی/.test(text)) {
    return {
      sellerAdvice: "هزینه ارسال را جداگانه حساب کن و قبل از قول قیمت نهایی، کرایه روز را بررسی کن.",
      ownerAdvice: "اثر هزینه حمل و انرژی را در بهای تمام‌شده وارد کن و برای سفارش‌های کم‌حاشیه دوباره قیمت بگیر."
    };
  }
  if (/رکود|بازار|صادرات|واردات|تجارت|تولید|بورس/.test(text)) {
    return {
      sellerAdvice: "روی کالاهای پرفروش تمرکز کن، سفارش مشتری را دقیق ثبت کن و خرید کندفروش را زیاد نکن.",
      ownerAdvice: "فروش، مطالبات و گردش موجودی را هفتگی مرور کن؛ تصمیم خرید را با داده‌های فروش خودت بسنج."
    };
  }
  return {
    sellerAdvice: "پیش از تخفیف یا تغییر قیمت، قیمت تأمین مجدد و حاشیه سود را بررسی کن.",
    ownerAdvice: "نقدینگی، مطالبات و کالاهای پرفروش را مرور کن؛ خبر را با وضعیت واقعی کسب‌وکار خودت تطبیق بده."
  };
}

function readCache(): CachedBrief | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as CachedBrief;
    if (!Array.isArray(value.items) || typeof value.updatedAt !== "number") return null;
    return value;
  } catch { return null; }
}

export async function getEconomicBrief(forceRefresh = false): Promise<EconomicBrief> {
  const cached = readCache();
  if (!forceRefresh && cached && Date.now() - cached.updatedAt < CACHE_TTL) return { ...cached, stale: false };
  try {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 7000);
    let response: Response;
    try {
      response = await fetch(PROXY_URL, { signal: controller.signal, headers: { Accept: "application/json" } });
    } finally {
      window.clearTimeout(timeout);
    }
    if (!response.ok) throw new Error("خبرخوان در دسترس نیست");
    const feed = await response.json() as FeedResponse;
    if (feed.status !== "ok" || !Array.isArray(feed.items)) throw new Error("ساختار خبرها معتبر نیست");
    const items = feed.items
      .filter(item => typeof item.title === "string" && typeof item.link === "string" && /^https:\/\//i.test(item.link))
      .slice(0, 3)
      .map(item => ({ title: String(item.title).replace(/\s+/g, " ").trim().slice(0, 150), link: item.link!, pubDate: item.pubDate || "" }));
    if (!items.length) throw new Error("خبر تازه‌ای پیدا نشد");
    const advice = adviceFor(items.map(item => item.title));
    const result: CachedBrief = { items, ...advice, updatedAt: Date.now() };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(result)); } catch { /* cache is optional */ }
    return { ...result, stale: false };
  } catch {
    if (cached) return { ...cached, stale: true };
    return {
      items: [],
      sellerAdvice: "قیمت تأمین مجدد را پیش از تخفیف بررسی کن.",
      ownerAdvice: "نقدینگی، مطالبات و موجودی پرفروش را مرور کن.",
      updatedAt: 0,
      stale: false
    };
  }
}
