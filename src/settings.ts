export type CurrencyUnit = "rial" | "toman";
const CURRENCY_KEY = "sai-sai-currency";

export function getCurrencyUnit(): CurrencyUnit {
  return localStorage.getItem(CURRENCY_KEY) === "toman" ? "toman" : "rial";
}

export function setCurrencyUnit(unit: CurrencyUnit): void {
  localStorage.setItem(CURRENCY_KEY, unit);
}

export function formatMoney(value: number): string {
  const isToman = getCurrencyUnit() === "toman";
  const amount = Math.round(isToman ? value / 10 : value);
  const unit = isToman ? "تومان" : "ریال";
  return `${new Intl.NumberFormat("fa-IR").format(amount)} ${unit}`;
}
