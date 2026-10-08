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
  accountId?: ID;
  description: string;
  lines: TransactionLine[];
  amount: Money;
  paid: Money;
  createdAt: number;
  invoiceNumber?: string;
  costOfGoods?: Money;
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
  accountId?: ID;
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


export type AccountType = "cash" | "bank";

export interface Account {
  id: ID;
  name: string;
  type: AccountType;
  openingBalance: Money;
  createdAt: number;
}

export interface AccountEntry {
  id: ID;
  accountId: ID;
  date: number;
  type: "deposit" | "withdraw" | "transfer";
  amount: Money;
  description: string;
  transferId?: ID;
  referenceId?: ID;
}


export type OrderStatus = "pending" | "completed" | "cancelled";

export interface Order {
  id: ID;
  partyId: ID;
  productId: ID;
  orderType?: string;
  quantity: number;
  unitPrice: Money;
  orderDate: number;
  deliveryDate: number;
  deliveryTime?: string;
  note: string;
  status: OrderStatus;
  createdAt: number;
}

export type CheckDirection = "received" | "issued";
export type CheckStatus = "pending" | "cleared" | "bounced" | "spent" | "cancelled";

export interface Check {
  id: ID;
  direction: CheckDirection;
  number: string;
  bank: string;
  issuerName: string;
  amount: Money;
  issueDate: number;
  dueDate: number;
  partyId?: ID;
  accountId?: ID;
  status: CheckStatus;
  description: string;
  createdAt: number;
  clearedEntryId?: ID;
}
