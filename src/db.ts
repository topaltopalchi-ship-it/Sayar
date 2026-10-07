import type { Dashboard, Expense, Party, Product, StockMovement, Transaction } from "./domain";
import { lineTotal, newId, transactionTotal } from "./domain";

const DB_NAME = "sayar-db";
const DB_VERSION = 1;

const stores = ["products", "parties", "transactions", "movements", "expenses"] as const;
type StoreName = typeof stores[number];

let database: IDBDatabase | null = null;

function openDb(): Promise<IDBDatabase> {
  if (database) return Promise.resolve(database);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of stores) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: "id" });
      }
    };

    request.onsuccess = () => { database = request.result; resolve(database); };
    request.onerror = () => reject(request.error ?? new Error("خطا در باز کردن پایگاه داده"));
  });
}

async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const request = tx.objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

async function put<T extends { id: string }>(store: StoreName, value: T): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listProducts(): Promise<Product[]> { return getAll<Product>("products"); }
export async function listParties(): Promise<Party[]> { return getAll<Party>("parties"); }

export async function listTransactions(): Promise<Transaction[]> {
  const items = await getAll<Transaction>("transactions");
  return items.sort((a, b) => b.date - a.date);
}

export async function listExpenses(): Promise<Expense[]> {
  const items = await getAll<Expense>("expenses");
  return items.sort((a, b) => b.date - a.date);
}

export async function addProduct(input: Omit<Product, "id" | "createdAt" | "active">): Promise<Product> {
  const product: Product = { ...input, id: newId(), createdAt: Date.now(), active: true };
  await put("products", product);
  return product;
}

export async function addParty(input: Omit<Party, "id" | "createdAt">): Promise<Party> {
  const party: Party = { ...input, id: newId(), createdAt: Date.now() };
  await put("parties", party);
  return party;
}

export async function addExpense(input: Omit<Expense, "id">): Promise<Expense> {
  const expense: Expense = { ...input, id: newId() };
  await put("expenses", expense);
  return expense;
}

export async function addTransaction(
  input: Omit<Transaction, "id" | "createdAt" | "amount"> & { amount?: number }
): Promise<Transaction> {
  const transaction: Transaction = {
    ...input,
    id: newId(),
    createdAt: Date.now(),
    amount: input.amount ?? transactionTotal(input.lines),
  };

  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["transactions", "movements"], "readwrite");
    tx.objectStore("transactions").put(transaction);

    if (transaction.type === "sale" || transaction.type === "purchase") {
      const movementStore = tx.objectStore("movements");
      for (const line of transaction.lines) {
        movementStore.put({
          id: newId(),
          productId: line.productId,
          date: transaction.date,
          type: transaction.type,
          quantity: transaction.type === "sale" ? -line.quantity : line.quantity,
          referenceId: transaction.id,
        } satisfies StockMovement);
      }
    }

    tx.oncomplete = () => resolve(transaction);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getDashboard(): Promise<Dashboard> {
  const [products, transactions, movements] = await Promise.all([
    listProducts(), listTransactions(), getAll<StockMovement>("movements"),
  ]);

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const today = start.getTime();

  const salesToday = transactions.filter(t => t.type === "sale" && t.date >= today).reduce((s,t)=>s+t.amount,0);
  const receiptsToday = transactions.filter(t => t.type === "receipt" && t.date >= today).reduce((s,t)=>s+t.amount,0);

  const salesDebt = transactions.filter(t => t.type === "sale").reduce((s,t)=>s+Math.max(0,t.amount-t.paid),0);
  const receipts = transactions.filter(t => t.type === "receipt").reduce((s,t)=>s+t.paid,0);
  const purchasesDebt = transactions.filter(t => t.type === "purchase").reduce((s,t)=>s+Math.max(0,t.amount-t.paid),0);
  const payments = transactions.filter(t => t.type === "payment").reduce((s,t)=>s+t.paid,0);

  const quantities = new Map<string, number>();
  for (const movement of movements) quantities.set(movement.productId, (quantities.get(movement.productId) ?? 0) + movement.quantity);

  return {
    salesToday,
    receiptsToday,
    receivables: Math.max(0, salesDebt - receipts),
    payables: Math.max(0, purchasesDebt - payments),
    lowStock: products.filter(p => (quantities.get(p.id) ?? 0) <= p.lowStock).length,
    stockValue: products.reduce((s,p)=>s+Math.max(0,quantities.get(p.id)??0)*p.purchasePrice,0),
    recent: transactions.slice(0,5),
  };
}

export async function getStock(productId: string): Promise<number> {
  const movements = await getAll<StockMovement>("movements");
  return movements.filter(m => m.productId === productId).reduce((s,m)=>s+m.quantity,0);
}

export interface PartyBalance {
  partyId: string;
  balance: number;
  sales: number;
  purchases: number;
  receipts: number;
  payments: number;
}

export async function getPartyBalances(): Promise<Record<string, PartyBalance>> {
  const transactions = await listTransactions();
  const balances: Record<string, PartyBalance> = {};

  for (const t of transactions) {
    if (!t.partyId) continue;
    const current = balances[t.partyId] ?? {
      partyId: t.partyId, balance: 0, sales: 0, purchases: 0, receipts: 0, payments: 0,
    };

    if (t.type === "sale") {
      current.sales += t.amount;
      current.balance += Math.max(0, t.amount - t.paid);
    } else if (t.type === "purchase") {
      current.purchases += t.amount;
      current.balance -= Math.max(0, t.amount - t.paid);
    } else if (t.type === "receipt") {
      current.receipts += t.amount;
      current.balance -= t.amount;
    } else if (t.type === "payment") {
      current.payments += t.amount;
      current.balance += t.amount;
    }

    balances[t.partyId] = current;
  }

  return balances;
}

export async function addSale(input: {
  date: number; partyId?: string; description: string; lines: Transaction["lines"]; paid: number;
}): Promise<Transaction> {
  for (const line of input.lines) {
    const stock = await getStock(line.productId);
    if (line.quantity <= 0) throw new Error("مقدار کالا باید بیشتر از صفر باشد");
    if (stock < line.quantity) throw new Error("موجودی کالا برای این فروش کافی نیست");
  }
  return addTransaction({
    type: "sale", date: input.date, partyId: input.partyId, description: input.description,
    lines: input.lines, paid: Math.max(0, input.paid),
  });
}

export async function addSettlement(input: {
  type: "receipt" | "payment"; date: number; partyId: string; amount: number; description: string;
}): Promise<Transaction> {
  if (!input.partyId) throw new Error("انتخاب شخص الزامی است");
  if (input.amount <= 0) throw new Error("مبلغ باید بیشتر از صفر باشد");
  return addTransaction({
    type: input.type, date: input.date, partyId: input.partyId, description: input.description,
    lines: [], paid: input.amount, amount: input.amount,
  });
}

export async function addPurchase(input: {
  date: number; partyId?: string; description: string; lines: Transaction["lines"]; paid: number;
}): Promise<Transaction> {
  if (!input.lines.length) throw new Error("حداقل یک کالا برای خرید لازم است");
  for (const line of input.lines) {
    if (line.quantity <= 0) throw new Error("مقدار خرید باید بیشتر از صفر باشد");
    if (line.unitPrice < 0) throw new Error("قیمت خرید نمی‌تواند منفی باشد");
  }
  return addTransaction({
    type: "purchase", date: input.date, partyId: input.partyId, description: input.description,
    lines: input.lines, paid: Math.max(0, input.paid),
  });
}

export async function seedDemoIfEmpty(): Promise<void> {
  const products = await listProducts();
  if (products.length) return;
  await addProduct({ name: "انبه", sku: "MANGO-01", unit: "عدد", salePrice: 1000000, purchasePrice: 700000, lowStock: 5 });
  await addProduct({ name: "صندل", sku: "SANDAL-01", unit: "عدد", salePrice: 950000, purchasePrice: 620000, lowStock: 4 });
}

export async function addStockAdjustment(input: {
  date: number; productId: string; quantity: number; description: string;
}): Promise<void> {
  if (!input.productId) throw new Error("انتخاب کالا الزامی است");
  if (!Number.isFinite(input.quantity) || input.quantity === 0) throw new Error("مقدار اصلاح باید غیرصفر باشد");
  await put("movements", {
    id: newId(), productId: input.productId, date: input.date, type: "adjustment",
    quantity: input.quantity, referenceId: newId(),
  } satisfies StockMovement);
}
