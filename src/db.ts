import type { Account, AccountEntry, Check, Dashboard, Expense, Party, Product, StockMovement, Transaction } from "./domain";
import { lineTotal, newId, transactionTotal } from "./domain";

const DB_NAME = "sayar-db";
const DB_VERSION = 3;

const stores = ["products", "parties", "transactions", "movements", "expenses", "accounts", "accountEntries", "checks"] as const;
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
      } satisfies AccountEntry);
    }
    tx.oncomplete = () => resolve(expense);
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
    const count = (await listTransactions()).filter(t => t.type === transaction.type).length + 1;
    transaction.invoiceNumber = `${prefix}-${year}-${String(count).padStart(4, "0")}`;
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
    if (check.direction === "received") {
      if (check.status === "pending") current.pendingReceivedChecks += check.amount;
      if (check.status === "cleared") current.clearedReceivedChecks += check.amount;
    } else {
      if (check.status === "pending") current.pendingIssuedChecks += check.amount;
      if (check.status === "cleared") current.clearedIssuedChecks += check.amount;
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
  date: number; partyId?: string; accountId?: string; description: string; lines: Transaction["lines"]; paid: number;
}): Promise<Transaction> {
  for (const line of input.lines) {
    const stock = await getStock(line.productId);
    if (line.quantity <= 0) throw new Error("مقدار کالا باید بیشتر از صفر باشد");
    if (stock < line.quantity) throw new Error("موجودی کالا برای این فروش کافی نیست");
  }
  return addTransaction({
    type: "sale", date: input.date, partyId: input.partyId, accountId: input.accountId, description: input.description,
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
  date: number; partyId?: string; description: string; lines: Transaction["lines"]; paid: number;
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

export async function updateCheck(id: string, patch: Partial<Check>): Promise<void> {
  const items = await listChecks();
  const current = items.find(x => x.id === id);
  if (!current) throw new Error("چک پیدا نشد");
  await put("checks", { ...current, ...patch, id } as Check);
}

export async function clearCheck(id: string, accountId: string): Promise<void> {
  const checks = await listChecks();
  const check = checks.find(c => c.id === id);
  if (!check) throw new Error("چک پیدا نشد");
  if (check.status === "cleared") throw new Error("این چک قبلاً وصول شده است");
  if (check.status !== "pending") throw new Error("فقط چک در انتظار قابل وصول است");
  if (!accountId) throw new Error("انتخاب حساب مالی الزامی است");
  await addAccountEntry({
    accountId,
    date: Date.now(),
    type: check.direction === "received" ? "deposit" : "withdraw",
    amount: check.direction === "received" ? check.amount : -check.amount,
    description: "وصول چک " + (check.number || ""),
  });
  await updateCheck(id, { status: "cleared", accountId });
}
