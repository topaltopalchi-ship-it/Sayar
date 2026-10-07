export type SubscriptionStatus = "active" | "expired" | "pending" | "none";

export interface Subscription {
  status: SubscriptionStatus;
  plan: "monthly" | "none";
  expiresAt: number | null;
}

const API_BASE = (import.meta.env.VITE_BILLING_API_URL as string | undefined)?.replace(/\/$/, "");

export async function getSubscription(): Promise<Subscription> {
  if (!API_BASE) return { status: "none", plan: "none", expiresAt: null };

  const response = await fetch(`${API_BASE}/subscription/status`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("وضعیت اشتراک دریافت نشد");
  return response.json() as Promise<Subscription>;
}

export async function createMonthlyCheckout(): Promise<string> {
  if (!API_BASE) throw new Error("درگاه پرداخت هنوز به سرور سایار متصل نشده است");

  const response = await fetch(`${API_BASE}/subscription/checkout`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ plan: "monthly" }),
  });

  if (!response.ok) throw new Error("ایجاد پرداخت ناموفق بود");
  const data = (await response.json()) as { checkoutUrl?: string };
  if (!data.checkoutUrl) throw new Error("لینک پرداخت معتبر دریافت نشد");
  return data.checkoutUrl;
}
