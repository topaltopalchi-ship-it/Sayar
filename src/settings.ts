export type CurrencyUnit = "rial" | "toman";
const CURRENCY_KEY = "sai-sai-currency";

export function getCurrencyUnit(): CurrencyUnit {
  return localStorage.getItem(CURRENCY_KEY) === "toman" ? "toman" : "rial";
}

export function setCurrencyUnit(unit: CurrencyUnit): void {
  localStorage.setItem(CURRENCY_KEY, unit);
}

export function getCurrencyLabel(): string {
  return getCurrencyUnit() === "toman" ? "تومان" : "ریال";
}

/** Convert a user-entered/displayed amount into the app's storage unit (rial). */
export function parseMoneyInput(value: string | number | null | undefined): number {
  const normalized = String(value ?? "")
    .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[٬,]/g, "")
    .trim();
  const n = Number(normalized);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(getCurrencyUnit() === "toman" ? n * 10 : n));
}

/** Convert a stored rial amount to the selected unit for editing in an input. */
export function moneyInputValue(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  const amount = getCurrencyUnit() === "toman" ? Math.round(n / 10) : Math.round(n);
  return String(Math.max(0, amount));
}

export function formatMoney(value: number): string {
  const isToman = getCurrencyUnit() === "toman";
  const amount = Math.round(isToman ? value / 10 : value);
  const unit = isToman ? "تومان" : "ریال";
  return `${new Intl.NumberFormat("fa-IR").format(amount)} ${unit}`;
}
