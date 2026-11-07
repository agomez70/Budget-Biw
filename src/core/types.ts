/** Integer number of cents. Never a float. */
export type Cents = number;
/** Local calendar date, `YYYY-MM-DD`. */
export type ISODate = string;
/** Calendar month, `YYYY-MM`. */
export type ISOMonth = string;
/** Full timestamp (`Date.toISOString()`), used for `asOf`/audit fields only. */
export type Timestamp = string;

export type PayType = 'salary' | 'hourly';
export type PayFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';
export type Language = 'en' | 'es';

export interface Settings {
  payType: PayType;
  frequency: PayFrequency;
  /** Anchor paycheck date. Weekly/biweekly step from here; monthly uses its day; semi-monthly uses the two days below. */
  firstPaycheck: ISODate;
  /** Salary take-home per paycheck. */
  paycheckAmount: Cents;
  /** Hourly rate in cents per hour. */
  hourlyRate: Cents;
  typicalHours: number;
  slowHours: number;
  /** 0-100 */
  taxPct: number;
  /** Semi-monthly pay days (1-31, clamped to month end). */
  semiMonthlyDays: [number, number];
  monthlyDeposit: Cents;
  /** Day of month the monthly deposit arrives (clamped). */
  monthlyDepositDay: number;
  language: Language;
  /** Reconciliation tolerance. */
  toleranceCents: Cents;
  setupComplete: boolean;
}

export interface Account {
  bankBalance: Cents;
  asOf: Timestamp;
}

export type BillMode = 'by' | 'ahead' | 'each' | 'once';
export type BillSource = 'paycheck' | 'deposit';

export interface BillRule {
  id: string;
  name: string;
  amount: Cents;
  mode: BillMode;
  /** Day of month the bill is due (by/ahead). */
  dueDay?: number;
  /** Specific date (once). */
  dueDate?: ISODate;
  source: BillSource;
  debtId?: string;
  category?: string;
}

/** Stored state for one bill occurrence; generated occurrences without edits are not stored. */
export interface BillInstance {
  /** `ruleId|dueDate` for generated, random id for manual. */
  key: string;
  ruleId?: string;
  /** Paycheck date this instance sits on. */
  paycheck: ISODate;
  name: string;
  amount: Cents;
  dueDate: ISODate;
  checked: boolean;
  override?: Cents;
  manual?: boolean;
  deleted?: boolean;
  debtId?: string;
  source: BillSource;
  /** Set when an unpaid bill was carried forward from a closed period. */
  carriedFrom?: ISODate;
}

export interface Debt {
  id: string;
  name: string;
  balance: Cents;
  /** Annual percentage rate, e.g. 24.99 */
  apr: number;
  minPayment: Cents;
  promoApr?: number;
  /** Last month (inclusive) the promo APR applies. */
  promoEndMonth?: ISOMonth;
  /** Lower number = paid first when APRs tie. */
  priority: number;
  /** Credit card: card purchases add to this balance. */
  isCard: boolean;
}

export type LogKind = 'debit' | 'card';

export interface LogEntry {
  id: string;
  date: ISODate;
  amount: Cents;
  note: string;
  kind: LogKind;
  category?: string;
  /** For card entries: which card. */
  debtId?: string;
  /** Recorded by reconciliation as unlogged spending. */
  unlogged?: boolean;
}

export interface Deposit {
  id: string;
  date: ISODate;
  amount: Cents;
  note: string;
}

export type LeftoverAction =
  | { kind: 'roll' }
  | { kind: 'debt'; debtId: string }
  | { kind: 'savings' };

export interface PeriodSummary {
  start: ISODate;
  end: ISODate;
  plannedPay: Cents;
  actualPay: Cents;
  billsPaid: { name: string; amount: Cents }[];
  billsPaidTotal: Cents;
  spentDebit: Cents;
  spentCard: Cents;
  byCategory: Record<string, Cents>;
  depositsTotal: Cents;
  unlogged: Cents;
  /** Actual − expected bank balance at close (after handling). */
  reconcileDiff: Cents;
  leftover: Cents;
  leftoverAction: LeftoverAction;
  debtBalances: { id: string; name: string; balance: Cents }[];
  /** Safe-to-spend per day at the moment the period opened. */
  safePerDayAtStart: Cents;
}

export interface Period {
  id: string;
  /** Paycheck date that opened the period. */
  start: ISODate;
  /** Next paycheck date (set when closed). */
  end?: ISODate;
  status: 'open' | 'closed';
  plannedPay: Cents;
  actualPay: Cents;
  /** Bank balance right after this period's paycheck was recorded. */
  startBalance: Cents;
  safePerDayAtStart: Cents;
  /** Sum of manual bank-balance corrections during the period. */
  manualAdjust: Cents;
  summary?: PeriodSummary;
  log?: LogEntry[];
  deposits?: Deposit[];
  bills?: BillInstance[];
}

export interface ReceivedPaycheck {
  amount: Cents;
  receivedAt: Timestamp;
}

export interface AppState {
  version: number;
  settings: Settings;
  account: Account;
  rules: BillRule[];
  /** Stored bill instance edits for the open period and future paychecks. */
  billInstances: BillInstance[];
  debts: Debt[];
  /** Active period log. */
  log: LogEntry[];
  /** Active period deposits. */
  deposits: Deposit[];
  periods: Period[];
  received: Record<ISODate, ReceivedPaycheck>;
  /** Extra paid to debt every month beyond the minimums. */
  extraMonthly: Cents;
  /** One-time lump payments keyed by month. */
  lumps: Record<ISOMonth, Cents>;
  savings: Cents;
  lastPayday?: { paycheck: ISODate; at: Timestamp; snapshotId: string };
  categories: string[];
}

export type SnapshotReason = 'payday' | 'reset' | 'import' | 'daily' | 'restore' | 'manual' | 'clear';

export interface Snapshot {
  id: string;
  at: Timestamp;
  /** Local date the snapshot was taken. */
  day: ISODate;
  reason: SnapshotReason;
  state: AppState;
}
