import type { CustomerTier, Product, Transaction } from "./domain";

export type MarketSettings = {
  dollarRate: number;
  goldRate: number;
  marketIndexPercent: number;
  replacementBufferPercent: number;
  defaultMarginPercent: number;
  minMarginPercent: number;
  silverSalesThreshold: number;
  goldSalesThreshold: number;
  silverDiscountPercent: number;
  goldDiscountPercent: number;
  regularDiscountPercent: number;
};

const KEY = "sai-sai-pricing-settings";
const defaults: MarketSettings = {
  dollarRate: 0,
  goldRate: 0,
  marketIndexPercent: 0,
  replacementBufferPercent: 5,
  defaultMarginPercent: 25,
  minMarginPercent: 10,
  silverSalesThreshold: 500_000_000,
  goldSalesThreshold: 2_000_000_000,
  silverDiscountPercent: 3,
  goldDiscountPercent: 7,
  regularDiscountPercent: 0,
};

export function getMarketSettings(): MarketSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}") as Partial<MarketSettings>;
    return { ...defaults, ...saved };
  } catch { return { ...defaults }; }
}

export function setMarketSettings(value: MarketSettings): void {
  localStorage.setItem(KEY, JSON.stringify(value));
}

export function getCustomerTier(partyId: string | undefined, transactions: Transaction[]): CustomerTier {
  if (!partyId) return "regular";
  const partySales = transactions.filter(t => t.type === "sale" && t.partyId === partyId);
  const sales = partySales.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const paid = partySales.reduce((sum, t) => sum + Number(t.paid || 0), 0);
  const paymentRatio = sales > 0 ? paid / sales : 0;
  if (sales >= getMarketSettings().goldSalesThreshold && paymentRatio >= 0.75) return "gold";
  if (sales >= getMarketSettings().silverSalesThreshold && paymentRatio >= 0.6) return "silver";
  return "regular";
}

export function tierLabel(tier: CustomerTier): string {
  return tier === "gold" ? "طلایی" : tier === "silver" ? "نقره‌ای" : "عادی";
}

export function tierDiscountPercent(tier: CustomerTier, settings = getMarketSettings()): number {
  if (tier === "gold") return Math.max(0, settings.goldDiscountPercent);
  if (tier === "silver") return Math.max(0, settings.silverDiscountPercent);
  return Math.max(0, settings.regularDiscountPercent);
}

export type PriceRecommendation = {
  replacementCost: number;
  recommendedPrice: number;
  floorPrice: number;
  maxDiscountAmount: number;
  maxDiscountPercent: number;
  marketFactor: number;
  reason: string;
};

export function recommendPrice(product: Product, tier: CustomerTier = "regular", settings = getMarketSettings()): PriceRecommendation {
  const purchase = Math.max(0, Number(product.purchasePrice || 0));
  const basis = product.marketBasis || "none";
  const reference = Math.max(0, Number(product.marketReferenceRate || 0));
  let factor = 1;
  let reason = "بر پایه قیمت خرید فعلی";

  if (basis === "dollar" && reference > 0 && settings.dollarRate > 0) {
    factor = settings.dollarRate / reference;
    reason = "بر پایه تغییر نرخ دلار و قیمت جایگزینی";
  } else if (basis === "gold" && reference > 0 && settings.goldRate > 0) {
    factor = settings.goldRate / reference;
    reason = "بر پایه تغییر نرخ طلا و قیمت جایگزینی";
  } else if (basis === "market") {
    factor = 1 + Math.max(-0.9, settings.marketIndexPercent / 100);
    reason = "بر پایه شاخص تغییرات بازار";
  }

  const replacementCost = Math.round(purchase * Math.max(0.1, factor) * (1 + Math.max(0, settings.replacementBufferPercent) / 100));
  const margin = Math.max(0, Number(product.targetMarginPercent ?? settings.defaultMarginPercent));
  const minMargin = Math.max(0, Number(product.minMarginPercent ?? settings.minMarginPercent));
  const recommendedPrice = Math.max(replacementCost, Math.round(replacementCost * (1 + margin / 100)));
  const floorPrice = Math.max(replacementCost, Math.round(replacementCost * (1 + minMargin / 100)));
  const requestedDiscount = tierDiscountPercent(tier, settings);
  const maxDiscountAmount = Math.max(0, Math.min(recommendedPrice - floorPrice, Math.round(recommendedPrice * requestedDiscount / 100)));
  const maxDiscountPercent = recommendedPrice > 0 ? Math.round(maxDiscountAmount / recommendedPrice * 10000) / 100 : 0;

  return { replacementCost, recommendedPrice, floorPrice, maxDiscountAmount, maxDiscountPercent, marketFactor: factor, reason };
}
