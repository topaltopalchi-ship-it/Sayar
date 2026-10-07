export type SubscriptionStatus = "active" | "expired" | "pending" | "none";
export type BillingProvider = "web" | "bazaar" | "myket";

export interface Subscription {
  status: SubscriptionStatus;
  plan: "monthly" | "none";
  expiresAt: number | null;
  provider?: BillingProvider;
  isTrial?: boolean;
}

export interface StorePurchase {
  provider: Exclude<BillingProvider, "web">;
  productId: string;
  purchaseToken: string;
}

const API_BASE = (import.meta.env.VITE_BILLING_API_URL as string | undefined)?.replace(/\/$/, "");
const BILLING_DISABLED = (import.meta.env.VITE_BILLING_DISABLED as string | undefined) === "true";
const TRIAL_DAYS = 30;\n// This versioned key starts a fresh 30-day trial for the current test/release build.\n// A production store release should move entitlement enforcement to the store/backend.
const TRIAL_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;
const TRIAL_STARTED_KEY = "sai-sai-trial-started-at-v2";

function getTrialStartedAt(): number {
  const stored = Number(localStorage.getItem(TRIAL_STARTED_KEY));
  if (Number.isFinite(stored) && stored > 0) return stored;
  const now = Date.now();
  localStorage.setItem(TRIAL_STARTED_KEY, String(now));
  return now;
}

function getLocalTrialSubscription(): Subscription {
  const startedAt = getTrialStartedAt();
  const expiresAt = startedAt + TRIAL_MS;
  return Date.now() < expiresAt
    ? { status: "active", plan: "monthly", expiresAt, provider: "web", isTrial: true }
    : { status: "expired", plan: "none", expiresAt, provider: "web", isTrial: true };
}

export async function getSubscription(): Promise<Subscription> {
  if (BILLING_DISABLED) return getLocalTrialSubscription();
  // Without a configured billing server, every fresh installation gets a 30-day local trial.\n  // Once the trial ends, the normal subscription paywall is shown.\n  if (!API_BASE) return getLocalTrialSubscription();

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
