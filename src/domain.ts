export type ID = string;
export type Money = number; // integer rial

export type Unit = "عدد" | "کیلوگرم" | "گرم" | "لیتر" | "متر" | "بسته";

export interface Product {
  id: ID;
  name: string;
  sku: string;
  unit: Unit;
  salePrice: Money;
  purchasePrice: Money;
  lowStock: number;
  createdAt: number;
  active: boolean;
}

export type PartyType = "customer" | "supplier" | "both";

export interface Party {
  id: ID;
  name: string;
  phone: string;
  type: PartyType;
  createdAt: number;
}

export type TransactionType =
  | "sale"
  | "purchase"
  | "receipt"
  | "payment"
  | "expense"
  | "stockAdjustment";

export interface TransactionLine {
  productId: ID;
  quantity: number;
  unitPrice: Money;
  discount: Money;
}

export type SettlementType = "receipt" | "payment";

export interface Transaction {
  id: ID;
  type: TransactionType;
  date: number;
  partyId?: ID;
  description: string;
  lines: TransactionLine[];
  amount: Money;
  paid: Money;
  createdAt: number;
}

export interface StockMovement {
  id: ID;
  productId: ID;
  date: number;
  type: "purchase" | "sale" | "adjustment";
  quantity: number;
  referenceId: ID;
}

export interface Expense {
  id: ID;
  date: number;
  title: string;
  amount: Money;
  description: string;
}

export interface Dashboard {
  salesToday: Money;
  receiptsToday: Money;
  receivables: Money;
  payables: Money;
  lowStock: number;
  stockValue: Money;
  recent: Transaction[];
}

export const newId = (): ID =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function lineTotal(line: TransactionLine): Money {
  return Math.max(0, Math.round(line.quantity * line.unitPrice) - line.discount);
}

export function transactionTotal(lines: TransactionLine[]): Money {
  return lines.reduce((sum, line) => sum + lineTotal(line), 0);
}
