export type SubscriptionStatus = "active" | "expired" | "pending" | "none";
export type BillingProvider = "web" | "bazaar" | "myket";

export interface Subscription {
  status: SubscriptionStatus;
  plan: "monthly" | "none";
  expiresAt: number | null;
  provider?: BillingProvider;
}

export interface StorePurchase {
  provider: Exclude<BillingProvider, "web">;
  productId: string;
  purchaseToken: string;
}

const API_BASE = (import.meta.env.VITE_BILLING_API_URL as string | undefined)?.replace(/\/$/, "");

export async function getSubscription(): Promise<Subscription> {
  if (!API_BASE) return { status: "none", plan: "none" };

  const response = await fetch(`${API_BASE}/subscription/status`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("وضعیت اشتراک دریافت نشد");
  return response.json() as Promise<Subscription>;
}

/**
 * Web/PWA checkout. The server decides the amount and provider.
 * Never put gateway secrets in the frontend.
 */
export async function createMonthlyCheckout(): Promise<string> {
  if (!API_BASE) throw new Error("سرویس اشتراک هنوز به سرور سایار متصل نشده است");

  const response = await fetch(`${API_BASE}/subscription/checkout`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ plan: "monthly", provider: "web" }),
  });

  if (!response.ok) throw new Error("ایجاد پرداخت ناموفق بود");
  const data = (await response.json()) as { checkoutUrl?: string };
  if (!data.checkoutUrl) throw new Error("لینک پرداخت معتبر دریافت نشد");
  return data.checkoutUrl;
}

/**
 * Bazaar/Myket purchase verification.
 * The native Android layer obtains the purchase token from the store SDK,
 * then sends only the token + product id to our backend.
 * The backend verifies the token with the store and grants the entitlement.
 */
export async function verifyStorePurchase(purchase: StorePurchase): Promise<Subscription> {
  if (!API_BASE) throw new Error("سرویس اشتراک هنوز به سرور سایار متصل نشده است");

  const response = await fetch(`${API_BASE}/subscription/store/verify`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(purchase),
  });

  if (!response.ok) throw new Error("تأیید خرید فروشگاه ناموفق بود");
  return response.json() as Promise<Subscription>;
}
