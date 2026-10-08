import type { Account, AccountEntry, Check, Dashboard, Expense, Order, Party, Product, StockMovement, Transaction } from "./domain";
import { lineTotal, newId, transactionTotal } from "./domain";

const DB_NAME = "sayar-db";
const DB_VERSION = 5;

const stores = ["products", "parties", "transactions", "movements", "expenses", "accounts", "accountEntries", "checks", "orders"] as const;
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

export async function updateAccount(account: Account): Promise<void> {
  await put("accounts", account);
}

export async function deleteAccount(accountId: string): Promise<void> {
  const [transactions, checks, entries] = await Promise.all([listTransactions(), listChecks(), listAccountEntries()]);
  if (transactions.some(t => t.accountId === accountId) || checks.some(c => c.accountId === accountId)) {
    throw new Error("این حساب در اسناد ثبت‌شده استفاده شده و قابل حذف نیست؛ ابتدا اسناد مرتبط را اصلاح کنید");
  }
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(["accounts", "accountEntries"], "readwrite");
    tx.objectStore("accounts").delete(accountId);
    for (const entry of entries.filter(e => e.accountId === accountId)) tx.objectStore("accountEntries").delete(entry.id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

let integrityRepairDone = false;

export async function repairDataIntegrity(): Promise<void> {
  const db = await openDb();
  const [transactions, movements] = await Promise.all([listTransactions(), listMovements()]);
  const inventoryTransactions = transactions.filter(t => t.type === "sale" || t.type === "purchase");

  // Rebuild every sale/purchase movement deterministically. This prevents
  // legacy builds from leaving the inventory ledger half-empty or duplicated.
  const transactionIds = new Set(inventoryTransactions.map(t => t.id));

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(["transactions", "movements"], "readwrite");
    const store = tx.objectStore("movements");

    for (const m of movements) {
      if (m.referenceId && transactionIds.has(m.referenceId) && (m.type === "sale" || m.type === "purchase")) {
        store.delete(m.id);
      }
    }

    for (const t of inventoryTransactions) {
      for (const line of t.lines) {
        store.put({
          id: newId(),
          productId: line.productId,
          date: t.date,
          type: t.type === "sale" ? "sale" : "purchase",
          quantity: t.type === "sale" ? -Number(line.quantity || 0) : Number(line.quantity || 0),
          referenceId: t.id,
        } satisfies StockMovement);
      }
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("اصلاح گردش موجودی ناموفق بود"));
    tx.onabort = () => reject(tx.error ?? new Error("اصلاح گردش موجودی ناموفق بود"));
  });

  integrityRepairDone = true;
}
export async function listOrders(): Promise<Order[]> {
  const items = await getAll<Order>("orders");
  return items.sort((a, b) => a.deliveryDate - b.deliveryDate || b.createdAt - a.createdAt);
}

export async function addOrder(input: Omit<Order, "id" | "createdAt" | "status">): Promise<Order> {
  if (!input.customerName?.trim() && !input.partyId) throw new Error("نام مشتری برای سفارش الزامی است");
  if (!input.productId) throw new Error("انتخاب کالا الزامی است");
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new Error("مقدار سفارش باید بیشتر از صفر باشد");
  if (!Number.isFinite(input.unitPrice) || input.unitPrice < 0) throw new Error("قیمت سفارش معتبر نیست");
  if (!Number.isFinite(input.deliveryDate) || input.deliveryDate <= 0) throw new Error("تاریخ تحویل معتبر نیست");
  const order: Order = { ...input, id: newId(), status: "pending", createdAt: Date.now() };
  await put("orders", order);
  return order;
}

export async function updateOrder(order: Order): Promise<void> {
  if ((!order.customerName?.trim() && !order.partyId) || !order.productId || order.quantity <= 0 || order.deliveryDate <= 0) throw new Error("اطلاعات سفارش کامل نیست");
  await put("orders", order);
}

export async function deleteOrder(id: string): Promise<void> {
  const orders = await listOrders();
  if (!orders.some(o => o.id === id)) throw new Error("سفارش پیدا نشد");
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("orders", "readwrite");
    tx.objectStore("orders").delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("حذف سفارش ناموفق بود"));
  });
}

export async function listProducts(): Promise<Product[]> { return getAll<Product>("products"); }
export async function listParties(): Promise<Party[]> { return getAll<Party>("parties"); }

export async function listMovements(): Promise<StockMovement[]> {
  const items = await getAll<StockMovement>("movements");
  return items.sort((a, b) => b.date - a.date);
}

export async function listTransactions(): Promise<Transaction[]> {
  const items = await getAll<Transaction>("transactions");
  return items.sort((a, b) => b.date - a.date);
}

export async function listExpenses(): Promise<Expense[]> {
  const items = await getAll<Expense>("expenses");
  return items.sort((a, b) => b.date - a.date);
}

export async function updateProduct(product: Product): Promise<void> { await put("products", product); }

export async function deleteProduct(productId: string): Promise<void> {
  const [transactions, movements] = await Promise.all([listTransactions(), listMovements()]);
  if (transactions.some(t => t.lines.some(l => l.productId === productId)) || movements.some(m => m.productId === productId)) {
    throw new Error("این کالا در فاکتورها یا گردش موجودی استفاده شده و قابل حذف نیست");
  }
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("products", "readwrite");
    tx.objectStore("products").delete(productId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function addProduct(
  input: Omit<Product, "id" | "createdAt" | "active">,
  initialStock = 0,
): Promise<Product> {
  const product: Product = { ...input, id: newId(), createdAt: Date.now(), active: true };
  const openingQuantity = Number.isFinite(initialStock) ? Math.max(0, initialStock) : 0;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["products", "movements"], "readwrite");
    tx.objectStore("products").put(product);
    if (openingQuantity > 0) {
      tx.objectStore("movements").put({
        id: newId(),
        productId: product.id,
        date: Date.now(),
        type: "adjustment",
        quantity: openingQuantity,
        referenceId: newId(),
      } satisfies StockMovement);
    }
    tx.oncomplete = () => resolve(product);
    tx.onerror = () => reject(tx.error ?? new Error("ذخیره کالا ناموفق بود"));
    tx.onabort = () => reject(tx.error ?? new Error("ذخیره کالا ناموفق بود"));
  });
}

export async function updateParty(party: Party): Promise<void> { await put("parties", party); }

export async function deleteParty(partyId: string): Promise<void> {
  const [transactions, checks] = await Promise.all([listTransactions(), listChecks()]);
  if (transactions.some(t => t.partyId === partyId) || checks.some(c => c.partyId === partyId)) {
    throw new Error("این شخص در فاکتورها، دریافت/پرداخت یا چک‌ها استفاده شده و قابل حذف نیست");
  }
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("parties", "readwrite");
    tx.objectStore("parties").delete(partyId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function addParty(input: Omit<Party, "id" | "createdAt">): Promise<Party> {
  const party: Party = { ...input, id: newId(), createdAt: Date.now() };
  await put("parties", party);
  return party;
}

export async function updateExpense(expense: Expense): Promise<void> {
  const entries = await listAccountEntries();
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["expenses","accountEntries"], "readwrite");
    for (const e of entries.filter(e => e.referenceId === expense.id)) tx.objectStore("accountEntries").delete(e.id);
    if (!entries.some(e => e.referenceId === expense.id) && expense.accountId) { const old = entries.find(e => e.accountId === expense.accountId && e.date === expense.date && e.amount === -Math.round(expense.amount) && e.description === expense.title); if (old) tx.objectStore("accountEntries").delete(old.id); }
    tx.objectStore("expenses").put(expense);
    if (expense.accountId && expense.amount > 0) tx.objectStore("accountEntries").put({ id: newId(), accountId: expense.accountId, date: expense.date, type: "withdraw", amount: -Math.round(expense.amount), description: expense.title, referenceId: expense.id } satisfies AccountEntry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteExpense(id: string): Promise<void> {
  const expenses = await listExpenses();
  const current = expenses.find(e => e.id === id);
  if (!current) throw new Error("هزینه پیدا نشد");
  const entries = await listAccountEntries();
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["expenses","accountEntries"], "readwrite");
    tx.objectStore("expenses").delete(id);
    for (const e of entries.filter(e => e.referenceId === id)) tx.objectStore("accountEntries").delete(e.id);
    if (!entries.some(e => e.referenceId === id) && current.accountId && current.amount > 0) {
      const old = entries.find(e => e.accountId === current.accountId && e.date === current.date && e.amount === -Math.round(current.amount) && e.description === current.title);
      if (old) tx.objectStore("accountEntries").delete(old.id);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function addExpense(input: Omit<Expense, "id">): Promise<Expense> {
  const expense: Expense = { ...input, id: newId() };
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["expenses", "accountEntries"], "readwrite");
    tx.objectStore("expenses").put(expense);
    if (expense.accountId && expense.amount > 0) {
      tx.objectStore("accountEntries").put({
        id: newId(),
        accountId: expense.accountId,
        date: expense.date,
        type: "withdraw",
        amount: -Math.round(expense.amount),
        description: expense.title,
        referenceId: expense.id,
      } satisfies AccountEntry);
    }
    tx.oncomplete = () => resolve(expense);
    tx.onerror = () => reject(tx.error);
  });
}

export async function updateTransaction(id: string, input: {
  date: number; partyId?: string; customerName?: string; accountId?: string; description: string; lines: Transaction["lines"]; paid: number;
}): Promise<Transaction> {
  const current = (await listTransactions()).find(t => t.id === id);
  if (!current) throw new Error("تراکنش پیدا نشد");
  if (!["sale","purchase","receipt","payment"].includes(current.type)) throw new Error("ویرایش این نوع تراکنش هنوز پشتیبانی نمی‌شود");
  if ((current.type === "sale" || current.type === "purchase") && !input.lines.length) throw new Error("حداقل یک کالا لازم است");
  const products = await listProducts();
  const movements = await listMovements();
  if (current.type === "sale") {
    const requested = new Map<string, number>();
    for (const line of input.lines) {
      if (!line.productId) throw new Error("کالای فروش معتبر نیست");
      if (line.quantity <= 0) throw new Error("مقدار کالا باید بیشتر از صفر باشد");
      requested.set(line.productId, (requested.get(line.productId) ?? 0) + Number(line.quantity));
    }
    for (const [productId, quantity] of requested) {
      const available = await getStock(productId, id);
      if (available < quantity) throw new Error("موجودی کالا برای این فروش کافی نیست");
    }
  }
  const amount = current.type === "receipt" || current.type === "payment" ? Math.max(0, Math.round(input.paid)) : transactionTotal(input.lines);
  const updated: Transaction = { ...current, date: input.date, partyId: input.partyId, customerName: input.customerName?.trim() || undefined, accountId: input.accountId, description: input.description, lines: input.lines, paid: Math.max(0, input.paid), amount };
  if (updated.type === "sale") updated.costOfGoods = calculateHistoricalCOGS((await listTransactions()).filter(t => t.id !== id).concat(updated), products).get(id) ?? 0;
  const entries = await listAccountEntries();
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["transactions","movements","accountEntries"], "readwrite");
    const ms = tx.objectStore("movements"); const es = tx.objectStore("accountEntries");
    for (const m of movements.filter(m => m.referenceId === id)) ms.delete(m.id);
    for (const e of entries.filter(e => e.referenceId === id)) es.delete(e.id);
    if (current.accountId && current.paid > 0 && !entries.some(e => e.referenceId === id)) { const expected = current.type === "sale" || current.type === "receipt" ? Math.round(current.paid) : -Math.round(current.paid); const old = entries.find(e => e.accountId === current.accountId && e.date === current.date && e.amount === expected && e.description === current.description); if (old) es.delete(old.id); }
    tx.objectStore("transactions").put(updated);
    if (updated.accountId && updated.paid > 0) {
      const entryType = updated.type === "sale" || updated.type === "receipt" ? "deposit" : "withdraw";
      es.put({ id: newId(), accountId: updated.accountId, date: updated.date, type: entryType, amount: entryType === "deposit" ? Math.round(updated.paid) : -Math.round(updated.paid), description: updated.description, referenceId: updated.id } satisfies AccountEntry);
    }
    if (updated.type === "sale" || updated.type === "purchase") {
      for (const line of updated.lines) ms.put({ id: newId(), productId: line.productId, date: updated.date, type: updated.type, quantity: updated.type === "sale" ? -line.quantity : line.quantity, referenceId: updated.id } satisfies StockMovement);
    }
    tx.oncomplete = () => resolve(updated);
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteTransaction(id: string): Promise<void> {
  const current = (await listTransactions()).find(t => t.id === id);
  if (!current) throw new Error("تراکنش پیدا نشد");
  const db = await openDb();
  const [movements, entries] = await Promise.all([listMovements(), listAccountEntries()]);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["transactions","movements","accountEntries"], "readwrite");
    tx.objectStore("transactions").delete(id);
    const ms = tx.objectStore("movements");
    for (const m of movements.filter(m => m.referenceId === id)) ms.delete(m.id);
    const es = tx.objectStore("accountEntries");
    for (const e of entries.filter(e => e.referenceId === id)) es.delete(e.id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
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

  if (transaction.type === "sale" || transaction.type === "purchase") {
    const year = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { year: "numeric" })
      .format(new Date(transaction.date))
      .replace(/\D/g, "");
    const prefix = transaction.type === "sale" ? "SAI-F" : "SAI-K";
    const existing = (await listTransactions()).filter(t => t.type === transaction.type);
    const maxSequence = existing.reduce((max, t) => {
      const match = t.invoiceNumber?.match(new RegExp("^" + prefix + "-\\d{4}-(\\d+)$"));
      return Math.max(max, match ? Number(match[1]) : 0);
    }, 0);
    transaction.invoiceNumber = `${prefix}-${year}-${String(maxSequence + 1).padStart(4, "0")}`;
  }

  if (transaction.type === "sale") {
    const [history, products] = await Promise.all([listTransactions(), listProducts()]);
    transaction.costOfGoods = calculateHistoricalCOGS([...history, transaction], products).get(transaction.id) ?? 0;
  }

  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["transactions", "movements", "accountEntries"], "readwrite");
    tx.objectStore("transactions").put(transaction);
    if (transaction.accountId && transaction.paid > 0) {
      const entryType = transaction.type === "sale" || transaction.type === "receipt" ? "deposit" : "withdraw";
      tx.objectStore("accountEntries").put({
        id: newId(),
        accountId: transaction.accountId,
        date: transaction.date,
        type: entryType,
        amount: entryType === "deposit" ? Math.round(transaction.paid) : -Math.round(transaction.paid),
        description: transaction.description || (entryType === "deposit" ? "دریافت وجه" : "پرداخت وجه"),
        referenceId: transaction.id,
      } satisfies AccountEntry);
    }

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

  const stockEntries = await Promise.all(products.map(async p => [p.id, await getStock(p.id)] as const));
  const quantities = new Map(stockEntries);

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

export async function getStock(productId: string, excludeTransactionId?: string): Promise<number> {
  // The inventory ledger is the single source of truth. Startup repair rebuilds
  // purchase/sale movements from transactions, while manual adjustments remain
  // independent opening/physical-count movements.
  const movements = await listMovements();
  const stock = movements
    .filter(m => m.productId === productId && m.referenceId !== excludeTransactionId)
    .reduce((sum, m) => sum + Number(m.quantity || 0), 0);

  return Math.max(0, stock);
}

export interface PartyBalance {
  partyId: string;
  balance: number;
  sales: number;
  purchases: number;
  receipts: number;
  payments: number;
  pendingReceivedChecks: number;
  pendingIssuedChecks: number;
  clearedReceivedChecks: number;
  clearedIssuedChecks: number;
}

export async function getPartyBalances(): Promise<Record<string, PartyBalance>> {
  const transactions = await listTransactions();
  const balances: Record<string, PartyBalance> = {};

  for (const t of transactions) {
    if (!t.partyId) continue;
    const current = balances[t.partyId] ?? {
      partyId: t.partyId, balance: 0, sales: 0, purchases: 0, receipts: 0, payments: 0,
      pendingReceivedChecks: 0, pendingIssuedChecks: 0, clearedReceivedChecks: 0, clearedIssuedChecks: 0,
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

  const checks = await listChecks();
  for (const check of checks) {
    if (!check.partyId) continue;
    const current = balances[check.partyId] ?? {
      partyId: check.partyId, balance: 0, sales: 0, purchases: 0, receipts: 0, payments: 0,
      pendingReceivedChecks: 0, pendingIssuedChecks: 0, clearedReceivedChecks: 0, clearedIssuedChecks: 0,
    };
    const settlesParty = check.status === "pending" || check.status === "cleared" || check.status === "spent";
    if (check.direction === "received") {
      if (check.status === "pending") current.pendingReceivedChecks += check.amount;
      if (check.status === "cleared") current.clearedReceivedChecks += check.amount;
      if (settlesParty) current.balance -= check.amount;
    } else {
      if (check.status === "pending") current.pendingIssuedChecks += check.amount;
      if (check.status === "cleared" || check.status === "spent") current.clearedIssuedChecks += check.amount;
      if (settlesParty) current.balance += check.amount;
    }
    balances[check.partyId] = current;
  }

  return balances;
}

export function calculateHistoricalCOGS(transactions: Transaction[], products: Product[]): Map<string, number> {
  type Lot = { quantity: number; unitCost: number };
  const lots = new Map<string, Lot[]>();
  const fallback = new Map(products.map(p => [p.id, p.purchasePrice]));
  const costs = new Map<string, number>();
  const ordered = [...transactions].sort((a, b) => a.date - b.date || a.createdAt - b.createdAt);

  for (const t of ordered) {
    if (t.type === "purchase") {
      for (const line of t.lines) {
        const q = Math.max(0, line.quantity);
        if (!q) continue;
        const unitCost = lineTotal(line) / q;
        const queue = lots.get(line.productId) ?? [];
        queue.push({ quantity: q, unitCost });
        lots.set(line.productId, queue);
      }
    } else if (t.type === "sale") {
      let total = 0;
      for (const line of t.lines) {
        let remaining = Math.max(0, line.quantity);
        const queue = lots.get(line.productId) ?? [];
        while (remaining > 0 && queue.length) {
          const lot = queue[0];
          const used = Math.min(remaining, lot.quantity);
          total += used * lot.unitCost;
          lot.quantity -= used;
          remaining -= used;
          if (lot.quantity <= 0.0000001) queue.shift();
        }
        if (remaining > 0) total += remaining * (fallback.get(line.productId) ?? 0);
        lots.set(line.productId, queue);
      }
      costs.set(t.id, Math.round(total));
    }
  }
  return costs;
}

export async function addSale(input: {
  date: number; partyId?: string; customerName?: string; accountId?: string; description: string; lines: Transaction["lines"]; paid: number;
}): Promise<Transaction> {
  if (!input.lines.length) throw new Error("حداقل یک کالا برای فروش لازم است");
  const requested = new Map<string, number>();
  for (const line of input.lines) {
    if (!line.productId) throw new Error("کالای فروش معتبر نیست");
    if (line.quantity <= 0) throw new Error("مقدار کالا باید بیشتر از صفر باشد");
    requested.set(line.productId, (requested.get(line.productId) ?? 0) + Number(line.quantity));
  }
  for (const [productId, quantity] of requested) {
    const stock = await getStock(productId);
    if (stock < quantity) throw new Error("موجودی کالا برای این فروش کافی نیست");
  }
  return addTransaction({
    type: "sale", date: input.date, partyId: input.partyId, customerName: input.customerName?.trim() || undefined, accountId: input.accountId, description: input.description,
    lines: input.lines, paid: Math.max(0, input.paid),
  });
}

export async function addSettlement(input: {
  type: "receipt" | "payment"; date: number; partyId: string; accountId?: string; amount: number; description: string;
}): Promise<Transaction> {
  if (!input.partyId) throw new Error("انتخاب شخص الزامی است");
  if (input.amount <= 0) throw new Error("مبلغ باید بیشتر از صفر باشد");
  return addTransaction({
    type: input.type, date: input.date, partyId: input.partyId, accountId: input.accountId, description: input.description,
    lines: [], paid: input.amount, amount: input.amount,
  });
}

export async function addPurchase(input: {
  date: number; partyId?: string; accountId?: string; description: string; lines: Transaction["lines"]; paid: number;
}): Promise<Transaction> {
  if (!input.lines.length) throw new Error("حداقل یک کالا برای خرید لازم است");
  for (const line of input.lines) {
    if (line.quantity <= 0) throw new Error("مقدار خرید باید بیشتر از صفر باشد");
    if (line.unitPrice < 0) throw new Error("قیمت خرید نمی‌تواند منفی باشد");
  }
  return addTransaction({
    type: "purchase", date: input.date, partyId: input.partyId, accountId: input.accountId, description: input.description,
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


export async function restoreBackup(data: {
  products: Product[]; parties: Party[]; transactions: Transaction[]; expenses?: Expense[];
  accounts?: Account[]; accountEntries?: AccountEntry[]; checks?: Check[]; movements?: StockMovement[]; orders?: Order[];
}): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const stores = ["products","parties","transactions","movements","expenses","accounts","accountEntries","checks","orders"];
    const tx = db.transaction(stores, "readwrite");
    const maps: Record<string, unknown[]> = {
      products: data.products ?? [], parties: data.parties ?? [], transactions: data.transactions ?? [],
      expenses: data.expenses ?? [], accounts: data.accounts ?? [], accountEntries: data.accountEntries ?? [], checks: data.checks ?? [], movements: data.movements ?? [], orders: data.orders ?? [],
    };
    for (const store of stores) {
      tx.objectStore(store).clear();
      for (const item of maps[store] ?? []) tx.objectStore(store).put(item);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("بازیابی ناموفق بود"));
  });
}

export async function listAccounts(): Promise<Account[]> {
  const items = await getAll<Account>("accounts");
  return items.sort((a, b) => a.createdAt - b.createdAt);
}

export async function listAccountEntries(): Promise<AccountEntry[]> {
  const items = await getAll<AccountEntry>("accountEntries");
  return items.sort((a, b) => a.date - b.date);
}

export async function addAccount(input: Omit<Account, "id" | "createdAt">): Promise<Account> {
  const account: Account = { ...input, id: newId(), createdAt: Date.now() };
  await put("accounts", account);
  return account;
}

export async function addAccountEntry(input: Omit<AccountEntry, "id">): Promise<AccountEntry> {
  const entry: AccountEntry = { ...input, id: newId() };
  await put("accountEntries", entry);
  return entry;
}



export async function updateAccountEntry(id: string, patch: Partial<Pick<AccountEntry, "date" | "type" | "amount" | "description">>): Promise<AccountEntry> {
  const entries = await listAccountEntries();
  const current = entries.find(e => e.id === id);
  if (!current) throw new Error("گردش حساب پیدا نشد");
  if (current.referenceId) throw new Error("این گردش از یک تراکنش ساخته شده است؛ خود تراکنش را ویرایش کنید");
  if (current.transferId) throw new Error("انتقال بین حساب‌ها را از گزینه انتقال ویرایش کنید");
  const next = { ...current, ...patch, id } as AccountEntry;
  if (!Number.isFinite(next.amount) || next.amount === 0) throw new Error("مبلغ باید غیرصفر باشد");
  next.amount = next.type === "withdraw" ? -Math.abs(Math.round(next.amount)) : Math.abs(Math.round(next.amount));
  await put("accountEntries", next);
  return next;
}

export async function deleteAccountEntry(id: string): Promise<void> {
  const entries = await listAccountEntries();
  const current = entries.find(e => e.id === id);
  if (!current) throw new Error("گردش حساب پیدا نشد");
  if (current.referenceId) throw new Error("این گردش از یک تراکنش ساخته شده است؛ خود تراکنش را حذف کنید");
  if (current.transferId) throw new Error("انتقال را از گزینه انتقال بین حساب‌ها حذف کنید");
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("accountEntries", "readwrite");
    tx.objectStore("accountEntries").delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function updateTransfer(transferId: string, amount: number, description: string): Promise<void> {
  const entries = (await listAccountEntries()).filter(e => e.transferId === transferId);
  if (entries.length !== 2) throw new Error("انتقال کامل پیدا نشد");
  const source = entries.find(e => e.amount < 0);
  const target = entries.find(e => e.amount > 0);
  if (!source || !target) throw new Error("ساختار انتقال نامعتبر است");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("مبلغ باید بیشتر از صفر باشد");
  const value = Math.round(amount);
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("accountEntries", "readwrite");
    const store = tx.objectStore("accountEntries");
    store.put({ ...source, amount: -value, description });
    store.put({ ...target, amount: value, description });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteTransfer(transferId: string): Promise<void> {
  const entries = (await listAccountEntries()).filter(e => e.transferId === transferId);
  if (!entries.length) throw new Error("انتقال پیدا نشد");
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("accountEntries", "readwrite");
    const store = tx.objectStore("accountEntries");
    entries.forEach(e => store.delete(e.id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
export async function transferBetweenAccounts(fromAccountId: string, toAccountId: string, amount: number, description: string): Promise<void> {
  if (fromAccountId === toAccountId || amount <= 0) throw new Error("حساب مبدأ و مقصد را درست انتخاب کنید");
  const id = newId();
  const date = Date.now();
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("accountEntries", "readwrite");
    tx.objectStore("accountEntries").put({ id: newId(), accountId: fromAccountId, date, type: "transfer", amount: -Math.round(amount), description, transferId: id } satisfies AccountEntry);
    tx.objectStore("accountEntries").put({ id: newId(), accountId: toAccountId, date, type: "transfer", amount: Math.round(amount), description, transferId: id } satisfies AccountEntry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAccountLedger(accountId: string, from?: number, to?: number): Promise<AccountEntry[]> {
  const entries = await listAccountEntries();
  return entries
    .filter(e => e.accountId === accountId && (from === undefined || e.date >= from) && (to === undefined || e.date < to))
    .sort((a, b) => b.date - a.date);
}

export async function getAccountBalances(): Promise<Record<string, number>> {
  const [accounts, entries] = await Promise.all([listAccounts(), listAccountEntries()]);
  const balances: Record<string, number> = {};
  for (const account of accounts) balances[account.id] = account.openingBalance;
  for (const entry of entries) balances[entry.accountId] = (balances[entry.accountId] ?? 0) + entry.amount;
  return balances;
}


export async function listChecks(): Promise<Check[]> {
  const items = await getAll<Check>("checks");
  return items.sort((a, b) => a.dueDate - b.dueDate);
}

export async function addCheck(input: Omit<Check, "id" | "createdAt">): Promise<Check> {
  const check: Check = { ...input, id: newId(), createdAt: Date.now() };
  await put("checks", check);
  return check;
}

export async function deleteCheck(id: string): Promise<void> {
  const checks = await listChecks();
  const check = checks.find(c => c.id === id);
  if (!check) throw new Error("چک پیدا نشد");
  if (check.clearedEntryId) throw new Error("چک وصول‌شده را نمی‌توان حذف کرد؛ ابتدا وضعیت آن را اصلاح کنید");
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("checks", "readwrite");
    tx.objectStore("checks").delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function updateCheck(id: string, patch: Partial<Check>): Promise<void> {
  const items = await listChecks();
  const current = items.find(x => x.id === id);
  if (!current) throw new Error("چک پیدا نشد");

  const nextStatus = patch.status ?? current.status;
  if (current.clearedEntryId && nextStatus !== "cleared") {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["checks", "accountEntries"], "readwrite");
      tx.objectStore("accountEntries").delete(current.clearedEntryId!);
      tx.objectStore("checks").put({
        ...current, ...patch, id,
        status: nextStatus,
        clearedEntryId: undefined,
        accountId: nextStatus === "pending" ? undefined : (patch.accountId ?? current.accountId),
      } as Check);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("اصلاح وضعیت چک ناموفق بود"));
      tx.onabort = () => reject(tx.error ?? new Error("اصلاح وضعیت چک ناموفق بود"));
    });
    return;
  }

  await put("checks", { ...current, ...patch, id } as Check);
}
export async function clearCheck(id: string, accountId: string): Promise<void> {
  if (!accountId) throw new Error("انتخاب حساب مالی الزامی است");
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["checks", "accountEntries"], "readwrite");
    const checks = tx.objectStore("checks");
    const entries = tx.objectStore("accountEntries");
    const req = checks.get(id);
    req.onsuccess = () => {
      const check = req.result as Check | undefined;
      if (!check) { tx.abort(); reject(new Error("چک پیدا نشد")); return; }
      if (check.status === "cleared" || check.clearedEntryId) { tx.abort(); reject(new Error("این چک قبلاً وصول شده است")); return; }
      if (check.status !== "pending") { tx.abort(); reject(new Error("فقط چک در انتظار قابل وصول است")); return; }
      const entryId = newId();
      entries.put({
        id: entryId, accountId, date: Date.now(), type: check.direction === "received" ? "deposit" : "withdraw",
        amount: check.direction === "received" ? check.amount : -check.amount,
        description: "وصول چک " + (check.number || ""),
      } satisfies AccountEntry);
      checks.put({ ...check, status: "cleared", accountId, clearedEntryId: entryId } satisfies Check);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("وصول چک انجام نشد"));
  });
}
