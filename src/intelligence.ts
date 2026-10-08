import type { Party, Product, Transaction, Expense } from "./domain";
import { getStock } from "./db";
import { getCustomerTier, tierLabel, recommendPrice, getMarketSettings } from "./pricing";

export type InsightTone = "danger" | "warning" | "success" | "info";
export type BusinessInsight = { id: string; tone: InsightTone; title: string; text: string; action?: string; priority: number };
export type CustomerScore = { score: number; tier: "regular" | "silver" | "gold"; label: string; sales: number; paidRatio: number; lastPurchaseAt?: number };

function dayStart(value: number): number { const d = new Date(value); d.setHours(0, 0, 0, 0); return d.getTime(); }
function salesForParty(partyId: string, transactions: Transaction[]): Transaction[] { return transactions.filter(t => t.type === "sale" && t.partyId === partyId); }

export function customerScore(party: Party, transactions: Transaction[]): CustomerScore {
  const sales = salesForParty(party.id, transactions);
  const totalSales = sales.reduce((s, t) => s + t.amount, 0);
  const paid = sales.reduce((s, t) => s + Math.min(t.amount, Math.max(0, t.paid)), 0);
  const paidRatio = totalSales > 0 ? paid / totalSales : 1;
  const tier = party.tierLocked && party.customerTier ? party.customerTier : getCustomerTier(party.id, transactions);
  const repeatScore = Math.min(20, sales.length * 2);
  const valueScore = Math.min(35, totalSales / 20_000_000);
  const paymentScore = paidRatio * 35;
  const recency = sales.length ? Math.max(0, 10 - Math.floor((Date.now() - Math.max(...sales.map(t => t.date))) / 86_400_000 / 15)) : 0;
  return { score: Math.round(Math.min(100, valueScore + paymentScore + repeatScore + recency)), tier, label: tierLabel(tier), sales: totalSales, paidRatio, lastPurchaseAt: sales.length ? Math.max(...sales.map(t => t.date)) : undefined };
}

export async function buildBusinessInsights(products: Product[], parties: Party[], transactions: Transaction[], expenses: Expense[]): Promise<BusinessInsight[]> {
  const insights: BusinessInsight[] = []; const now = Date.now(); const settings = getMarketSettings();
  const lowStock: Array<{ product: Product; stock: number }> = [];
  for (const product of products) { if (!product.active || product.lowStock <= 0) continue; const stock = await getStock(product.id); if (stock <= product.lowStock) lowStock.push({ product, stock }); }
  lowStock.slice(0, 5).forEach(item => insights.push({ id: "stock-" + item.product.id, tone: "danger", title: "موجودی رو به اتمام", text: item.product.name + " به " + item.stock.toLocaleString("fa-IR") + " " + item.product.unit + " رسیده است.", action: "تأمین کالا", priority: 100 }));
  const monthAgo = now - 30 * 86_400_000; const sixtyDaysAgo = now - 60 * 86_400_000; const prevMonthStart = now - 60 * 86_400_000;
  for (const product of products) {
    const hasAnySale = transactions.some(t => t.type === "sale" && t.lines.some(l => l.productId === product.id));
    const soldLast60 = transactions.some(t => t.type === "sale" && t.date >= sixtyDaysAgo && t.lines.some(l => l.productId === product.id));
    if (hasAnySale && !soldLast60) { const stock = await getStock(product.id); if (stock > 0) insights.push({ id: "dormant-" + product.id, tone: "warning", title: "سرمایه خوابیده", text: product.name + " بیش از ۶۰ روز است فروش ثبت‌شده‌ای ندارد و " + stock.toLocaleString("fa-IR") + " " + product.unit + " موجودی دارد.", action: "پیشنهاد تخفیف", priority: 90 }); }
  }
  const recentSales = transactions.filter(t => t.type === "sale" && t.date >= monthAgo).reduce((s, t) => s + t.amount, 0);
  const previousSales = transactions.filter(t => t.type === "sale" && t.date >= prevMonthStart && t.date < monthAgo).reduce((s, t) => s + t.amount, 0);
  if (previousSales > 0) { const change = ((recentSales - previousSales) / previousSales) * 100; if (change <= -10) insights.push({ id: "sales-drop", tone: "danger", title: "افت فروش", text: "فروش ۳۰ روز اخیر " + Math.abs(Math.round(change)) + "% کمتر از ۳۰ روز قبل است.", action: "بررسی کالاها و مشتریان", priority: 88 }); else if (change >= 15) insights.push({ id: "sales-rise", tone: "success", title: "رشد فروش", text: "فروش ۳۰ روز اخیر " + Math.round(change) + "% رشد کرده است.", action: "تقویت موجودی پرفروش‌ها", priority: 60 }); }
  parties.filter(p => p.type === "customer" || p.type === "both").map(p => { const sales = salesForParty(p.id, transactions); return { p, last: sales.length ? Math.max(...sales.map(t => t.date)) : 0 }; }).filter(x => x.last > 0 && x.last < sixtyDaysAgo).slice(0, 4).forEach(x => insights.push({ id: "customer-" + x.p.id, tone: "info", title: "مشتری نیازمند پیگیری", text: x.p.name + " بیش از ۶۰ روز است خریدی ثبت نکرده است.", action: "تماس با مشتری", priority: 72 }));
  const debtByParty = new Map<string, number>(); transactions.filter(t => t.type === "sale" && t.partyId).forEach(t => { const debt = Math.max(0, t.amount - t.paid); if (debt) debtByParty.set(t.partyId!, (debtByParty.get(t.partyId!) || 0) + debt); });
  [...debtByParty.entries()].sort((a,b) => b[1] - a[1]).slice(0, 3).forEach(([id, debt]) => { const party = parties.find(p => p.id === id); if (party) insights.push({ id: "debt-" + id, tone: "warning", title: "مطالبه مهم", text: party.name + " " + debt.toLocaleString("fa-IR") + " ریال بدهکار است.", action: "پیگیری دریافت", priority: 82 }); });
  for (const product of products) { if (product.purchasePrice <= 0) continue; const rec = recommendPrice(product, "regular", settings); if (product.salePrice > 0 && product.salePrice < rec.floorPrice) insights.push({ id: "margin-" + product.id, tone: "danger", title: "خطر افت سرمایه", text: "قیمت فروش " + product.name + " پایین‌تر از کف امن محاسبه‌شده است.", action: "اصلاح قیمت", priority: 98 }); }
  const expenseRecent = expenses.filter(e => e.date >= monthAgo).reduce((s,e) => s + e.amount, 0);
  if (recentSales > 0 && expenseRecent / recentSales > 0.3) insights.push({ id: "expense-ratio", tone: "warning", title: "هزینه‌ها بالا رفته", text: "هزینه‌های ۳۰ روز اخیر بیش از ۳۰٪ فروش همین دوره است.", action: "بررسی هزینه‌ها", priority: 75 });
  for (const t of transactions.filter(x => x.type === "sale" && x.date >= monthAgo)) { if (t.lines.some(l => l.unitPrice > 0 && l.discount > l.quantity * l.unitPrice * 0.25)) { insights.push({ id: "discount-" + t.id, tone: "warning", title: "تخفیف غیرعادی", text: "در یک فاکتور فروش تخفیف بیش از ۲۵٪ ثبت شده است.", action: "بررسی فاکتور", priority: 70 }); break; } }
  const dailySales = new Map<number, number>(); transactions.filter(t => t.type === "sale" && t.date >= monthAgo).forEach(t => { const d = dayStart(t.date); dailySales.set(d, (dailySales.get(d) || 0) + t.amount); });
  if (dailySales.size >= 7) { const projected = Math.round((recentSales / dailySales.size) * 30); insights.push({ id: "forecast", tone: "info", title: "پیش‌بینی فروش", text: "با روند فعلی، فروش ۳۰ روز آینده حدود " + projected.toLocaleString("fa-IR") + " ریال برآورد می‌شود.", action: "برنامه‌ریزی خرید", priority: 55 }); }

  // Fast-moving products: compare units sold in the last 30 days with the previous 30 days.
  const productVelocity = new Map<string, { recent: number; previous: number; revenue: number }>();
  transactions.filter(t => t.type === "sale" && t.date >= prevMonthStart).forEach(t => {
    for (const line of t.lines) {
      const current = productVelocity.get(line.productId) || { recent: 0, previous: 0, revenue: 0 };
      if (t.date >= monthAgo) { current.recent += Math.max(0, line.quantity); current.revenue += Math.max(0, line.quantity * line.unitPrice); }
      else current.previous += Math.max(0, line.quantity);
      productVelocity.set(line.productId, current);
    }
  });
  [...productVelocity.entries()]
    .filter(([, v]) => v.recent >= 3 && v.recent > v.previous * 1.2)
    .sort((a,b) => b[1].recent - a[1].recent)
    .slice(0, 3)
    .forEach(([productId, v]) => {
      const product = products.find(p => p.id === productId);
      if (!product) return;
      insights.push({
        id: "fast-" + product.id,
        tone: "success",
        title: "کالای پرفروش",
        text: product.name + " در ۳۰ روز اخیر " + v.recent.toLocaleString("fa-IR") + " " + product.unit + " فروخته و سرعت فروش آن بالاتر رفته است.",
        action: "تقویت موجودی",
        priority: 68
      });
    });

  return insights.sort((a,b) => b.priority - a.priority);
}

export function dailyBrief(insights: BusinessInsight[]): string {
  if (!insights.length) return "امروز مورد مهمی برای پیگیری پیدا نکردم؛ وضعیت کسب‌وکار پایدار است.";
  return "امروز " + insights.slice(0, 3).map((x, i) => (i + 1) + ") " + x.title + ": " + x.text + " اقدام: " + (x.action || "بررسی وضعیت")).join(" ");
}
