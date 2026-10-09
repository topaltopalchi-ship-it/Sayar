import { createBackupSnapshot, restoreBackup, type CloudBackupSnapshot } from "./db";

type CloudSession = { access_token: string; refresh_token?: string; expires_at?: number; user: { id: string; phone?: string } };
type SupabaseError = { message?: string; msg?: string; error_description?: string };

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, "");
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const SESSION_KEY = "saysay-cloud-session-v1";

function configured(): void {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("پشتیبان ابری هنوز پیکربندی نشده است؛ تنظیمات سرویس ابری لازم است.");
  }
}
function readSession(): CloudSession | null {
  try {
    const value = sessionStorage.getItem(SESSION_KEY);
    if (!value) return null;
    const session = JSON.parse(value) as CloudSession;
    if (!session.access_token || !session.user?.id) return null;
    if (session.expires_at && session.expires_at * 1000 <= Date.now()) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch { return null; }
}
function saveSession(session: CloudSession): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}
async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  configured();
  const headers = new Headers(init.headers);
  headers.set("apikey", SUPABASE_ANON_KEY!);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${SUPABASE_URL}${path}`, { ...init, headers });
  if (!response.ok) {
    let message = "ارتباط با فضای ابری ناموفق بود";
    try {
      const error = await response.json() as SupabaseError;
      message = error.message || error.msg || error.error_description || message;
    } catch { /* Keep a safe generic message. */ }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}
function requireSession(): CloudSession {
  const session = readSession();
  if (!session) throw new Error("ابتدا با شماره موبایل وارد حساب ابری شوید.");
  return session;
}
function validateSnapshot(value: unknown): asserts value is CloudBackupSnapshot {
  if (!value || typeof value !== "object") throw new Error("نسخه پشتیبان معتبر نیست");
  const snapshot = value as Partial<CloudBackupSnapshot>;
  if (snapshot.schemaVersion !== 1 || !snapshot.data || typeof snapshot.data !== "object") {
    throw new Error("نسخه پشتیبان با این نسخه برنامه سازگار نیست");
  }
  const keys = ["products", "parties", "transactions", "expenses", "accounts", "accountEntries", "checks", "movements", "orders"] as const;
  if (!keys.every(key => Array.isArray(snapshot.data?.[key]))) throw new Error("ساختار نسخه پشتیبان ناقص است");
}

/** Send a one-time SMS code. Phone must be international E.164 format. */
export async function requestCloudSmsCode(phone: string): Promise<void> {
  const normalized = phone.trim().replace(/[\s()-]/g, "");
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw new Error("شماره را با کد کشور وارد کنید؛ نمونه: +989121234567");
  }
  await request("/auth/v1/otp", {
    method: "POST",
    body: JSON.stringify({ phone: normalized, create_user: true, channel: "sms" }),
  });
}

/** Verify the SMS OTP and keep the short-lived session only in sessionStorage. */
export async function verifyCloudSmsCode(phone: string, code: string): Promise<void> {
  const normalized = phone.trim().replace(/[\s()-]/g, "");
  const otp = code.trim();
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) throw new Error("شماره موبایل معتبر نیست");
  if (!/^\d{4,8}$/.test(otp)) throw new Error("کد پیامکی معتبر نیست");
  const session = await request<CloudSession>("/auth/v1/verify", {
    method: "POST",
    body: JSON.stringify({ phone: normalized, token: otp, type: "sms" }),
  });
  if (!session.access_token || !session.user?.id) throw new Error("ورود تأیید شد اما نشست معتبر دریافت نشد");
  saveSession(session);
}
export function getCloudAccount(): { id: string; phone?: string } | null {
  const session = readSession();
  return session ? { id: session.user.id, phone: session.user.phone } : null;
}
export function signOutCloud(): void {
  const session = readSession();
  sessionStorage.removeItem(SESSION_KEY);
  if (session?.access_token && SUPABASE_URL && SUPABASE_ANON_KEY) {
    void fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token}` },
    }).catch(() => undefined);
  }
}

/** Upload the full local accounting snapshot to the authenticated user's private row. */
export async function backupToCloud(): Promise<{ savedAt: string; recordCount: number }> {
  const session = requireSession();
  const snapshot = await createBackupSnapshot();
  const recordCount = Object.values(snapshot.data).reduce((sum, rows) => sum + rows.length, 0);
  await request<unknown[]>("/rest/v1/user_backups?on_conflict=user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      user_id: session.user.id,
      payload: snapshot,
      updated_at: new Date().toISOString(),
      schema_version: snapshot.schemaVersion,
    }),
  }, session.access_token);
  return { savedAt: new Date().toISOString(), recordCount };
}

/** Download remote data for review/restore. This does not modify local data. */
export async function downloadCloudBackup(): Promise<{ snapshot: CloudBackupSnapshot; updatedAt: string }> {
  const session = requireSession();
  const rows = await request<Array<{ payload: unknown; updated_at: string }>>(
    `/rest/v1/user_backups?select=payload,updated_at&user_id=eq.${encodeURIComponent(session.user.id)}&limit=1`,
    { method: "GET" }, session.access_token,
  );
  if (!rows.length) throw new Error("برای این حساب هنوز نسخه پشتیبان ابری ثبت نشده است");
  validateSnapshot(rows[0].payload);
  return { snapshot: rows[0].payload, updatedAt: rows[0].updated_at };
}

/** Restore is deliberately explicit; callers should ask the user before invoking it. */
export async function restoreCloudBackup(): Promise<{ restoredAt: string; recordCount: number }> {
  const { snapshot } = await downloadCloudBackup();
  const recordCount = Object.values(snapshot.data).reduce((sum, rows) => sum + rows.length, 0);
  await restoreBackup(snapshot.data);
  return { restoredAt: new Date().toISOString(), recordCount };
}
