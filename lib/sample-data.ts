export interface BusinessProfile {
  id: string;
  name: string;
  ownerName: string;
  ownerEmail: string;
  ownerAvatar: string;
  phone: string;
  currency: string;
  plan: string;
  openingCashBalance: number;
}

export interface MetricCardData {
  title: string;
  amount: number;
  subtitle: string;
  trendText?: string;
  trendType?: "positive" | "warning" | "danger" | "neutral";
  iconName: string;
}

export interface CashflowForecastPoint {
  date: string;
  displayDate: string;
  expectedInflows: number;
  upcomingExpenses: number;
  netCashflow: number;
  projectedBalance: number;
  milestoneDescription?: string;
}

export interface SmartActionItem {
  id: string;
  type: "overdue_followup" | "promise_due" | "upcoming_bill" | "batch_generation";
  urgency: "urgent" | "action_required" | "scheduled";
  title: string;
  description: string;
  amount?: number;
  studentName?: string;
  parentPhone?: string;
  dueDate: string;
  primaryActionLabel: string;
  secondaryActionLabel?: string;
}

export type SampleInvoiceStatus = "paid" | "partially_paid" | "sent" | "overdue" | "draft" | "cancelled";

export interface SampleInvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface SampleInvoice {
  id: string;
  customerId?: string;
  invoiceNumber: string;
  customerName: string;
  customerGrade: string;
  parentPhone: string;
  parentName?: string;
  issueDate: string;
  dueDate: string;
  subtotal: number;
  discount: number;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  status: SampleInvoiceStatus;
  paymentTerms?: string;
  notes?: string;
  overdueDays?: number;
  items: SampleInvoiceItem[];
}

export type ExpenseCategory =
  | "Rent"
  | "Electricity"
  | "Internet"
  | "Salary/Honorarium"
  | "Materials"
  | "Software"
  | "Other";

export type BillStatus = "unpaid" | "paid" | "overdue";
export type RecurrenceFrequency = "monthly" | "quarterly" | "yearly";

export interface SampleBill {
  id: string;
  title: string;
  vendorName: string;
  category: ExpenseCategory;
  amount: number;
  dueDate: string;
  status: BillStatus;
  isRecurring: boolean;
  recurringFrequency?: RecurrenceFrequency;
  recurringDayOfMonth?: number;
  recurringEndDate?: string;
  paidDate?: string;
  paymentMethod?: "UPI" | "Net Banking" | "Cash" | "Cheque";
  paymentReference?: string;
  notes?: string;
  isGeneratedOccurrence?: boolean;
}

export interface SamplePayment {
  id: string;
  receiptNumber?: string;
  customerId?: string;
  studentName: string;
  customerGrade: string;
  parentName?: string;
  parentPhone?: string;
  amount: number;
  paymentMode: "UPI" | "Net Banking" | "Cash" | "Cheque";
  referenceId: string;
  paidAt: string;
  paymentDate?: string;
  invoiceNumber: string;
  invoiceId?: string;
  notes?: string;
  previousBalance?: number;
  remainingBalance?: number;
  status?: "completed" | "recorded";
}

export interface SamplePaymentPromise {
  id: string;
  customerId: string;
  invoiceId?: string;
  rawMessage: string;
  promisedAmount: number;
  promisedDate: string;
  status: "pending" | "fulfilled" | "broken" | "cancelled";
  confidenceScore?: number;
}

export type FollowUpOutcome =
  | "reminder_prepared"
  | "contacted"
  | "promised_payment"
  | "no_response"
  | "extension_requested"
  | "payment_received";

export type FollowUpTone = "friendly" | "polite" | "firm";

export interface RecoveryFollowUp {
  id: string;
  customerId: string;
  customerName: string;
  parentName: string;
  invoiceId?: string;
  invoiceNumber?: string;
  followUpDate: string; // ISO YYYY-MM-DD
  outcome: FollowUpOutcome;
  notes: string;
  nextFollowUpDate?: string;
  tone?: FollowUpTone;
  recordedAt: string;
}

export interface SampleCustomer {
  id: string;
  name: string; // Student name
  parentName: string;
  gradeSubject: string; // Class / Batch
  email?: string;
  phone: string;
  whatsappNumber: string;
  defaultFeeAmount: number; // Monthly fee
  billingCycleDay: number; // e.g. 1st, 5th, 10th
  status: "active" | "inactive" | "archived";
  notes?: string;
  totalInvoiced: number;
  totalCollected: number;
  outstandingBalance: number;
  nextPaymentDate: string;
  overdueCount: number;
  joinedDate: string;
}

export const sampleBusiness: BusinessProfile = {
  id: "biz-001",
  name: "Sharma Mathematics & Science Academy",
  ownerName: "Rajesh Sharma",
  ownerEmail: "rajesh@sharmamaths.in",
  ownerAvatar: "RS",
  phone: "+91 98201 54321",
  currency: "INR",
  plan: "Pro Plan",
  openingCashBalance: 65000,
};

export const sampleBranches = [
  { id: "biz-001", name: "Sharma Maths Academy (Main Centre - Malviya Nagar)" },
  { id: "biz-002", name: "Sharma Classes (Branch 2 - Sector 14)" },
];

export const sampleFinancialMetrics: MetricCardData[] = [
  {
    title: "Total Outstanding",
    amount: 142500,
    subtitle: "Across 18 students with pending fees",
    trendText: "12 invoices pending approval/sent",
    trendType: "neutral",
    iconName: "Clock",
  },
  {
    title: "Overdue Amount",
    amount: 48000,
    subtitle: "33.7% of total receivables",
    trendText: "6 students past payment due date",
    trendType: "danger",
    iconName: "AlertTriangle",
  },
  {
    title: "Collected This Month",
    amount: 215000,
    subtitle: "Target: ₹2,50,000 (86% achieved)",
    trendText: "↑ 18.4% compared to last month",
    trendType: "positive",
    iconName: "TrendingUp",
  },
  {
    title: "Expected Collections",
    amount: 186500,
    subtitle: "Next 30 days projected inflow",
    trendText: "14 scheduled cycles + 3 promises",
    trendType: "positive",
    iconName: "CalendarCheck",
  },
];

export const sampleCashflowForecast: CashflowForecastPoint[] = [
  {
    date: "2026-11-21",
    displayDate: "21 Nov (Today)",
    expectedInflows: 6000,
    upcomingExpenses: 0,
    netCashflow: 6000,
    projectedBalance: 71000,
    milestoneDescription: "Priya Nair promised fee ₹6k",
  },
  {
    date: "2026-11-23",
    displayDate: "23 Nov",
    expectedInflows: 14500,
    upcomingExpenses: 0,
    netCashflow: 14500,
    projectedBalance: 85500,
    milestoneDescription: "Batch A fee cycle",
  },
  {
    date: "2026-11-25",
    displayDate: "25 Nov",
    expectedInflows: 8000,
    upcomingExpenses: 35000,
    netCashflow: -27000,
    projectedBalance: 58500,
    milestoneDescription: "Coaching Centre Rent ₹35k due",
  },
  {
    date: "2026-11-28",
    displayDate: "28 Nov",
    expectedInflows: 22000,
    upcomingExpenses: 4200,
    netCashflow: 17800,
    projectedBalance: 76300,
    milestoneDescription: "Utilities bill ₹4.2k",
  },
  {
    date: "2026-11-30",
    displayDate: "30 Nov",
    expectedInflows: 15000,
    upcomingExpenses: 18000,
    netCashflow: -3000,
    projectedBalance: 73300,
    milestoneDescription: "Assistant tutor honorarium ₹18k",
  },
  {
    date: "2026-12-03",
    displayDate: "03 Dec",
    expectedInflows: 28000,
    upcomingExpenses: 3800,
    netCashflow: 24200,
    projectedBalance: 97500,
    milestoneDescription: "Mock test printing ₹3.8k",
  },
  {
    date: "2026-12-05",
    displayDate: "05 Dec",
    expectedInflows: 45000,
    upcomingExpenses: 0,
    netCashflow: 45000,
    projectedBalance: 142500,
    milestoneDescription: "Primary monthly fee collection peak",
  },
  {
    date: "2026-12-10",
    displayDate: "10 Dec",
    expectedInflows: 32000,
    upcomingExpenses: 5000,
    netCashflow: 27000,
    projectedBalance: 169500,
    milestoneDescription: "Final Batch C collection",
  },
  {
    date: "2026-12-15",
    displayDate: "15 Dec",
    expectedInflows: 12000,
    upcomingExpenses: 8000,
    netCashflow: 4000,
    projectedBalance: 173500,
    milestoneDescription: "Lab supplies & mid-month balance",
  },
  {
    date: "2026-12-20",
    displayDate: "20 Dec",
    expectedInflows: 4000,
    upcomingExpenses: 0,
    netCashflow: 4000,
    projectedBalance: 177500,
    milestoneDescription: "Stable cash runway (68 days)",
  },
];

export const sampleSmartActions: SmartActionItem[] = [
  {
    id: "act-1",
    type: "overdue_followup",
    urgency: "urgent",
    title: "Arjun Verma (Class 10 CBSE)",
    description: "₹8,500 overdue by 14 days. Parent: Ramesh Verma. Last contacted 4 days ago with professional tone.",
    amount: 8500,
    studentName: "Arjun Verma",
    parentPhone: "+91 98765 43210",
    dueDate: "2026-11-07",
    primaryActionLabel: "Send WhatsApp Reminder",
    secondaryActionLabel: "View Invoice",
  },
  {
    id: "act-2",
    type: "promise_due",
    urgency: "action_required",
    title: "Priya Nair (Class 12 IIT JEE)",
    description: "Promised payment of ₹6,000 is due TODAY. Stated payment will be made via Google Pay by 7:00 PM.",
    amount: 6000,
    studentName: "Priya Nair",
    parentPhone: "+91 98112 34567",
    dueDate: "2026-11-21",
    primaryActionLabel: "Record Received UPI",
    secondaryActionLabel: "Log Note",
  },
  {
    id: "act-3",
    type: "upcoming_bill",
    urgency: "scheduled",
    title: "Coaching Centre Rent — Nov 2026",
    description: "₹35,000 due in 4 days (25 Nov). Projected bank balance on due date: ₹85,500. Cashflow health is SAFE.",
    amount: 35000,
    dueDate: "2026-11-25",
    primaryActionLabel: "Review Bill Details",
    secondaryActionLabel: "Mark as Paid",
  },
  {
    id: "act-4",
    type: "batch_generation",
    urgency: "action_required",
    title: "Batch Invoices Ready: Grade 11 JEE",
    description: "16 tuition fee invoices (₹7,500 each, total ₹1,20,000) for December cycle can be auto-generated and dispatched.",
    amount: 120000,
    dueDate: "2026-12-01",
    primaryActionLabel: "Review & Issue 16 Invoices",
    secondaryActionLabel: "Adjust Fees",
  },
];

export const sampleRecentInvoices: SampleInvoice[] = [
  {
    id: "inv-092",
    customerId: "cust-1",
    invoiceNumber: "INV-2026-092",
    customerName: "Aarav Patel",
    customerGrade: "Grade 11 Mathematics",
    parentName: "Sunil Patel",
    parentPhone: "+91 98200 11223",
    issueDate: "2026-11-10",
    dueDate: "2026-11-17",
    subtotal: 7500,
    discount: 0,
    totalAmount: 7500,
    amountPaid: 7500,
    balanceDue: 0,
    status: "paid",
    paymentTerms: "Net 7 Days",
    notes: "Full fee payment cleared via PhonePe UPI.",
    items: [
      {
        id: "item-92-1",
        description: "Grade 11 Mathematics Tuition Fee (November)",
        quantity: 1,
        unitPrice: 7500,
        totalPrice: 7500,
      },
    ],
  },
  {
    id: "inv-091",
    customerId: "cust-2",
    invoiceNumber: "INV-2026-091",
    customerName: "Arjun Verma",
    customerGrade: "Grade 10 CBSE Full Batch",
    parentName: "Ramesh Verma",
    parentPhone: "+91 98765 43210",
    issueDate: "2026-10-28",
    dueDate: "2026-11-07",
    subtotal: 8500,
    discount: 0,
    totalAmount: 8500,
    amountPaid: 0,
    balanceDue: 8500,
    status: "overdue",
    overdueDays: 14,
    paymentTerms: "Due on Receipt",
    notes: "Overdue by 14 days. Reminder sent via WhatsApp.",
    items: [
      {
        id: "item-91-1",
        description: "Grade 10 CBSE Comprehensive Tuition (Nov)",
        quantity: 1,
        unitPrice: 7500,
        totalPrice: 7500,
      },
      {
        id: "item-91-2",
        description: "CBSE Pre-Board Test Series & Evaluation",
        quantity: 1,
        unitPrice: 1000,
        totalPrice: 1000,
      },
    ],
  },
  {
    id: "inv-090",
    customerId: "cust-3",
    invoiceNumber: "INV-2026-090",
    customerName: "Priya Nair",
    customerGrade: "Grade 12 IIT JEE Advanced",
    parentName: "Suresh Nair",
    parentPhone: "+91 98112 34567",
    issueDate: "2026-11-01",
    dueDate: "2026-11-08",
    subtotal: 12000,
    discount: 0,
    totalAmount: 12000,
    amountPaid: 6000,
    balanceDue: 6000,
    status: "partially_paid",
    paymentTerms: "Net 7 Days",
    notes: "50% advance received. Balance ₹6,000 promised today via Google Pay.",
    items: [
      {
        id: "item-90-1",
        description: "Grade 12 IIT JEE Advanced Math & Physics Batch",
        quantity: 1,
        unitPrice: 10000,
        totalPrice: 10000,
      },
      {
        id: "item-90-2",
        description: "Advanced Problem Modules & Doubt Sessions",
        quantity: 1,
        unitPrice: 2000,
        totalPrice: 2000,
      },
    ],
  },
  {
    id: "inv-089",
    customerId: "cust-4",
    invoiceNumber: "INV-2026-089",
    customerName: "Rohan Mehta",
    customerGrade: "Grade 9 Foundation Science",
    parentName: "Deepak Mehta",
    parentPhone: "+91 98334 55667",
    issueDate: "2026-11-15",
    dueDate: "2026-11-24",
    subtotal: 5000,
    discount: 0,
    totalAmount: 5000,
    amountPaid: 0,
    balanceDue: 5000,
    status: "sent",
    paymentTerms: "Net 10 Days",
    notes: "Dispatched on Nov 15. Due in 3 days.",
    items: [
      {
        id: "item-89-1",
        description: "Grade 9 Foundation Science Monthly Fee",
        quantity: 1,
        unitPrice: 5000,
        totalPrice: 5000,
      },
    ],
  },
  {
    id: "inv-088",
    customerId: "cust-5",
    invoiceNumber: "INV-2026-088",
    customerName: "Ananya Gupta",
    customerGrade: "Grade 12 NEET Physics",
    parentName: "Manoj Gupta",
    parentPhone: "+91 98450 67890",
    issueDate: "2026-11-05",
    dueDate: "2026-11-12",
    subtotal: 9500,
    discount: 500,
    totalAmount: 9000,
    amountPaid: 9000,
    balanceDue: 0,
    status: "paid",
    paymentTerms: "Net 7 Days",
    notes: "Early settlement sibling discount applied (₹500). Paid via NEFT.",
    items: [
      {
        id: "item-88-1",
        description: "Grade 12 NEET Physics Fast-Track Coaching",
        quantity: 1,
        unitPrice: 8000,
        totalPrice: 8000,
      },
      {
        id: "item-88-2",
        description: "Printed NEET Formula Handbook & Test Bank",
        quantity: 1,
        unitPrice: 1500,
        totalPrice: 1500,
      },
    ],
  },
  {
    id: "inv-087",
    customerId: "cust-6",
    invoiceNumber: "INV-2026-087",
    customerName: "Kabir Singh",
    customerGrade: "Grade 10 ICSE Maths",
    parentName: "Gurpreet Singh",
    parentPhone: "+91 98991 22334",
    issueDate: "2026-11-05",
    dueDate: "2026-11-15",
    subtotal: 6500,
    discount: 0,
    totalAmount: 6500,
    amountPaid: 0,
    balanceDue: 6500,
    status: "overdue",
    overdueDays: 6,
    paymentTerms: "Net 10 Days",
    notes: "6 days overdue. Follow-up reminder scheduled.",
    items: [
      {
        id: "item-87-1",
        description: "Grade 10 ICSE Mathematics Regular Batch",
        quantity: 1,
        unitPrice: 6500,
        totalPrice: 6500,
      },
    ],
  },
  {
    id: "inv-086",
    customerId: "cust-7",
    invoiceNumber: "INV-2026-086",
    customerName: "Sneha Iyer",
    customerGrade: "Grade 11 Chemistry",
    parentName: "Venkat Iyer",
    parentPhone: "+91 98190 44556",
    issueDate: "2026-11-20",
    dueDate: "2026-11-28",
    subtotal: 7000,
    discount: 0,
    totalAmount: 7000,
    amountPaid: 0,
    balanceDue: 7000,
    status: "draft",
    paymentTerms: "Net 7 Days",
    notes: "Draft invoice for mid-month enrollment. Ready for dispatch.",
    items: [
      {
        id: "item-86-1",
        description: "Grade 11 Chemistry Regular Batch (November)",
        quantity: 1,
        unitPrice: 7000,
        totalPrice: 7000,
      },
    ],
  },
];

export const sampleUpcomingBills: SampleBill[] = [
  {
    id: "bill-1",
    title: "Coaching Centre Rent (Nov)",
    vendorName: "Apex Realties Pvt Ltd",
    category: "Rent",
    amount: 35000,
    dueDate: "2026-11-25",
    status: "unpaid",
    isRecurring: true,
    recurringFrequency: "monthly",
    recurringDayOfMonth: 25,
    notes: "Main centre rent for November 2026. Cheque/RTGS to landlord.",
  },
  {
    id: "bill-2",
    title: "Airtel High-Speed Optical Fibre",
    vendorName: "Airtel Broadband Ltd",
    category: "Internet",
    amount: 1800,
    dueDate: "2026-11-28",
    status: "unpaid",
    isRecurring: true,
    recurringFrequency: "monthly",
    recurringDayOfMonth: 28,
    notes: "300 Mbps dedicated fibre for online lecture broadcasts.",
  },
  {
    id: "bill-3",
    title: "Centre Electricity Bill (BSES)",
    vendorName: "BSES Rajdhani Power Ltd",
    category: "Electricity",
    amount: 4500,
    dueDate: "2026-11-18",
    status: "overdue",
    isRecurring: true,
    recurringFrequency: "monthly",
    recurringDayOfMonth: 18,
    notes: "3 days past due date. Late fee penalty will apply after 23 Nov.",
  },
  {
    id: "bill-4",
    title: "Assistant Tutor Honorarium - Vikram Joshi",
    vendorName: "Vikram Joshi (M.Sc. Physics)",
    category: "Salary/Honorarium",
    amount: 18000,
    dueDate: "2026-11-30",
    status: "unpaid",
    isRecurring: true,
    recurringFrequency: "monthly",
    recurringDayOfMonth: 30,
    notes: "Honorarium for Physics doubt batches and lab tutorials.",
  },
  {
    id: "bill-5",
    title: "Mock Test Papers Printing (CBSE & JEE)",
    vendorName: "Sri Ganesh Printers",
    category: "Materials",
    amount: 3800,
    dueDate: "2026-12-03",
    status: "unpaid",
    isRecurring: false,
    notes: "Term 1 Pre-Board mock paper bundles and OMR evaluation sheets.",
  },
  {
    id: "bill-6",
    title: "Classroom Audio & Projector Rental",
    vendorName: "Modern AV Systems",
    category: "Other",
    amount: 2500,
    dueDate: "2026-11-12",
    status: "paid",
    paidDate: "2026-11-10",
    paymentMethod: "UPI",
    paymentReference: "UPI/558291048210",
    isRecurring: false,
    notes: "Paid in advance via UPI.",
  },
  {
    id: "bill-7",
    title: "FeePulse Cloud & LMS Hosting Subscription",
    vendorName: "AWS / Cloud Infrastructure",
    category: "Software",
    amount: 2200,
    dueDate: "2026-11-05",
    status: "paid",
    paidDate: "2026-11-04",
    paymentMethod: "Net Banking",
    paymentReference: "NEFT/SBIN4492019",
    isRecurring: true,
    recurringFrequency: "monthly",
    recurringDayOfMonth: 5,
    notes: "Auto-debited on 4th Nov.",
  },
];

export const sampleRecentPayments: SamplePayment[] = [
  {
    id: "pay-101",
    receiptNumber: "REC-2026-101",
    customerId: "cust-1",
    studentName: "Aarav Patel",
    customerGrade: "Grade 11 Maths",
    parentName: "Sunil Patel",
    parentPhone: "+91 98200 11223",
    amount: 7500,
    paymentMode: "UPI",
    referenceId: "UPI/632198745612",
    paidAt: "Today, 2:40 PM",
    paymentDate: "2026-11-21",
    invoiceNumber: "INV-2026-092",
    invoiceId: "inv-092",
    previousBalance: 7500,
    remainingBalance: 0,
    status: "completed",
    notes: "Full tuition fee payment received via UPI.",
  },
  {
    id: "pay-100",
    receiptNumber: "REC-2026-100",
    customerId: "cust-3",
    studentName: "Priya Nair",
    customerGrade: "Grade 12 IIT JEE",
    parentName: "Suresh Nair",
    parentPhone: "+91 98112 34567",
    amount: 6000,
    paymentMode: "UPI",
    referenceId: "GPay/445892103847",
    paidAt: "Yesterday, 6:15 PM",
    paymentDate: "2026-11-20",
    invoiceNumber: "INV-2026-090",
    invoiceId: "inv-090",
    previousBalance: 12000,
    remainingBalance: 6000,
    status: "completed",
    notes: "Part payment (50%) received. Balance promised.",
  },
  {
    id: "pay-099",
    receiptNumber: "REC-2026-099",
    customerId: "cust-5",
    studentName: "Ananya Gupta",
    customerGrade: "Grade 12 NEET",
    parentName: "Rajeev Gupta",
    parentPhone: "+91 98990 12345",
    amount: 9000,
    paymentMode: "Net Banking",
    referenceId: "NEFT/HDFC26310948",
    paidAt: "19 Nov 2026",
    paymentDate: "2026-11-19",
    invoiceNumber: "INV-2026-088",
    invoiceId: "inv-088",
    previousBalance: 9000,
    remainingBalance: 0,
    status: "completed",
    notes: "NEFT direct bank transfer confirmed.",
  },
  {
    id: "pay-098",
    receiptNumber: "REC-2026-098",
    customerId: "cust-8",
    studentName: "Devansh Sharma",
    customerGrade: "Grade 10 CBSE",
    parentName: "Manoj Sharma",
    parentPhone: "+91 98210 99887",
    amount: 5000,
    paymentMode: "Cash",
    referenceId: "RCPT-CASH-409",
    paidAt: "18 Nov 2026",
    paymentDate: "2026-11-18",
    invoiceNumber: "INV-2026-082",
    invoiceId: "inv-082",
    previousBalance: 5000,
    remainingBalance: 0,
    status: "completed",
    notes: "Cash payment deposited at front desk. Signed receipt issued.",
  },
  {
    id: "pay-097",
    receiptNumber: "REC-2026-097",
    customerId: "cust-9",
    studentName: "Meera Kulkarni",
    customerGrade: "Grade 11 Maths",
    parentName: "Anand Kulkarni",
    parentPhone: "+91 98199 87654",
    amount: 8000,
    paymentMode: "UPI",
    referenceId: "Paytm/77893420195",
    paidAt: "17 Nov 2026",
    paymentDate: "2026-11-17",
    invoiceNumber: "INV-2026-081",
    invoiceId: "inv-081",
    previousBalance: 8000,
    remainingBalance: 0,
    status: "completed",
    notes: "Fee paid via Paytm QR scan at centre.",
  },
];

export const samplePaymentPromises: SamplePaymentPromise[] = [
  {
    id: "prm-1",
    customerId: "cust-3",
    invoiceId: "inv-090",
    rawMessage: "Will send remaining 6k by Saturday 7pm through GPay",
    promisedAmount: 6000,
    promisedDate: "2026-11-21",
    status: "pending",
    confidenceScore: 0.95,
  },
  {
    id: "prm-2",
    customerId: "cust-2",
    invoiceId: "inv-091",
    rawMessage: "Papa will transfer fee on 15th once salary is credited",
    promisedAmount: 8500,
    promisedDate: "2026-11-15",
    status: "broken",
    confidenceScore: 0.70,
  },
  {
    id: "prm-3",
    customerId: "cust-1",
    invoiceId: "inv-092",
    rawMessage: "Already paid 7.5k via PhonePe scanner at front desk",
    promisedAmount: 7500,
    promisedDate: "2026-11-10",
    status: "fulfilled",
    confidenceScore: 0.99,
  },
];

export const sampleFollowUps: RecoveryFollowUp[] = [
  {
    id: "fup-1",
    customerId: "cust-2",
    customerName: "Arjun Verma",
    parentName: "Ramesh Verma",
    invoiceNumber: "INV-2026-091",
    followUpDate: "2026-11-11",
    outcome: "contacted",
    tone: "friendly",
    notes: "Spoke with father. He stated salary was delayed and promised to clear on 15 Nov.",
    nextFollowUpDate: "2026-11-16",
    recordedAt: "11 Nov, 4:30 PM",
  },
  {
    id: "fup-2",
    customerId: "cust-2",
    customerName: "Arjun Verma",
    parentName: "Ramesh Verma",
    invoiceNumber: "INV-2026-091",
    followUpDate: "2026-11-16",
    outcome: "no_response",
    tone: "polite",
    notes: "WhatsApp reminder sent after promised date passed; message delivered but no reply.",
    nextFollowUpDate: "2026-11-21",
    recordedAt: "16 Nov, 11:15 AM",
  },
  {
    id: "fup-3",
    customerId: "cust-6",
    customerName: "Kabir Singh",
    parentName: "Gurpreet Singh",
    invoiceNumber: "INV-2026-087",
    followUpDate: "2026-11-17",
    outcome: "contacted",
    tone: "friendly",
    notes: "Father requested UPI QR code to be resent on WhatsApp. Resent immediately.",
    nextFollowUpDate: "2026-11-22",
    recordedAt: "17 Nov, 5:00 PM",
  },
  {
    id: "fup-4",
    customerId: "cust-3",
    customerName: "Priya Nair",
    parentName: "Suresh Nair",
    invoiceNumber: "INV-2026-090",
    followUpDate: "2026-11-20",
    outcome: "contacted",
    tone: "polite",
    notes: "Father paid ₹6,000 part-payment; verbally confirmed balance ₹6,000 will be paid by 7 PM today via GPay.",
    nextFollowUpDate: "2026-11-21",
    recordedAt: "20 Nov, 6:30 PM",
  },
];

export const sampleCustomers: SampleCustomer[] = [
  {
    id: "cust-1",
    name: "Aarav Patel",
    parentName: "Sunil Patel",
    gradeSubject: "Grade 11 Mathematics",
    email: "sunil.patel@gmail.com",
    phone: "+91 98200 11223",
    whatsappNumber: "+91 98200 11223",
    defaultFeeAmount: 7500,
    billingCycleDay: 10,
    status: "active",
    notes: "Consistently clears fee on first reminder. Top ranker in calculus.",
    totalInvoiced: 22500,
    totalCollected: 22500,
    outstandingBalance: 0,
    nextPaymentDate: "2026-12-10",
    overdueCount: 0,
    joinedDate: "2026-06-15",
  },
  {
    id: "cust-2",
    name: "Arjun Verma",
    parentName: "Ramesh Verma",
    gradeSubject: "Grade 10 CBSE Full Batch",
    email: "ramesh.verma77@yahoo.com",
    phone: "+91 98765 43210",
    whatsappNumber: "+91 98765 43210",
    defaultFeeAmount: 8500,
    billingCycleDay: 28,
    status: "active",
    notes: "Previous promise of Nov 15 was broken. Father salary delayed. Requires firm tone.",
    totalInvoiced: 25500,
    totalCollected: 17000,
    outstandingBalance: 8500,
    nextPaymentDate: "2026-11-07",
    overdueCount: 1,
    joinedDate: "2026-05-10",
  },
  {
    id: "cust-3",
    name: "Priya Nair",
    parentName: "Suresh Nair",
    gradeSubject: "Grade 12 IIT JEE Advanced",
    email: "suresh.nair@infosys.com",
    phone: "+91 98112 34567",
    whatsappNumber: "+91 98112 34567",
    defaultFeeAmount: 12000,
    billingCycleDay: 1,
    status: "active",
    notes: "Paid 50% part-payment (₹6,000) on 20 Nov. Balance promised TODAY via GPay.",
    totalInvoiced: 36000,
    totalCollected: 30000,
    outstandingBalance: 6000,
    nextPaymentDate: "2026-11-21",
    overdueCount: 0,
    joinedDate: "2026-04-01",
  },
  {
    id: "cust-4",
    name: "Rohan Mehta",
    parentName: "Deepak Mehta",
    gradeSubject: "Grade 9 Foundation Science",
    email: "deepak.mehta@rediffmail.com",
    phone: "+91 98334 55667",
    whatsappNumber: "+91 98334 55667",
    defaultFeeAmount: 5000,
    billingCycleDay: 15,
    status: "active",
    notes: "Invoice sent on Nov 15. Due on Nov 24.",
    totalInvoiced: 15000,
    totalCollected: 10000,
    outstandingBalance: 5000,
    nextPaymentDate: "2026-11-24",
    overdueCount: 0,
    joinedDate: "2026-07-01",
  },
  {
    id: "cust-5",
    name: "Ananya Gupta",
    parentName: "Manoj Gupta",
    gradeSubject: "Grade 12 NEET Physics",
    email: "manoj.gupta@tcs.com",
    phone: "+91 98450 67890",
    whatsappNumber: "+91 98450 67890",
    defaultFeeAmount: 9000,
    billingCycleDay: 5,
    status: "active",
    notes: "Always pays via Net Banking NEFT. Never delays.",
    totalInvoiced: 27000,
    totalCollected: 27000,
    outstandingBalance: 0,
    nextPaymentDate: "2026-12-05",
    overdueCount: 0,
    joinedDate: "2026-04-15",
  },
  {
    id: "cust-6",
    name: "Kabir Singh",
    parentName: "Gurpreet Singh",
    gradeSubject: "Grade 10 ICSE Maths",
    email: "gurpreet.singh@gmail.com",
    phone: "+91 98991 22334",
    whatsappNumber: "+91 98991 22334",
    defaultFeeAmount: 6500,
    billingCycleDay: 5,
    status: "active",
    notes: "6 days overdue. Father requested UPI QR code to be resent on WhatsApp.",
    totalInvoiced: 19500,
    totalCollected: 13000,
    outstandingBalance: 6500,
    nextPaymentDate: "2026-11-15",
    overdueCount: 1,
    joinedDate: "2026-05-20",
  },
  {
    id: "cust-7",
    name: "Sneha Iyer",
    parentName: "Venkat Iyer",
    gradeSubject: "Grade 11 Chemistry",
    email: "venkat.iyer@wipro.com",
    phone: "+91 98190 44556",
    whatsappNumber: "+91 98190 44556",
    defaultFeeAmount: 7000,
    billingCycleDay: 20,
    status: "active",
    notes: "Joined mid-month. Draft invoice generated.",
    totalInvoiced: 14000,
    totalCollected: 7000,
    outstandingBalance: 7000,
    nextPaymentDate: "2026-11-28",
    overdueCount: 0,
    joinedDate: "2026-09-01",
  },
  {
    id: "cust-8",
    name: "Devansh Sharma",
    parentName: "Anita Sharma",
    gradeSubject: "Grade 10 CBSE Full Batch",
    email: "anita.sharma@delhi.gov.in",
    phone: "+91 98711 00223",
    whatsappNumber: "+91 98711 00223",
    defaultFeeAmount: 5000,
    billingCycleDay: 18,
    status: "active",
    notes: "Prefers physical cash receipt at the tuition desk.",
    totalInvoiced: 15000,
    totalCollected: 15000,
    outstandingBalance: 0,
    nextPaymentDate: "2026-12-18",
    overdueCount: 0,
    joinedDate: "2026-06-01",
  },
  {
    id: "cust-9",
    name: "Meera Kulkarni",
    parentName: "Shrikant Kulkarni",
    gradeSubject: "Grade 11 Mathematics",
    email: "shrikant.k@gmail.com",
    phone: "+91 98220 33445",
    whatsappNumber: "+91 98220 33445",
    defaultFeeAmount: 8000,
    billingCycleDay: 17,
    status: "active",
    notes: "Clears fee monthly via Paytm UPI.",
    totalInvoiced: 24000,
    totalCollected: 24000,
    outstandingBalance: 0,
    nextPaymentDate: "2026-12-17",
    overdueCount: 0,
    joinedDate: "2026-05-15",
  },
  {
    id: "cust-10",
    name: "Tanvi Deshmukh",
    parentName: "Sanjay Deshmukh",
    gradeSubject: "Grade 9 Foundation Science",
    email: "sanjay.deshmukh@gmail.com",
    phone: "+91 98100 88776",
    whatsappNumber: "+91 98100 88776",
    defaultFeeAmount: 5000,
    billingCycleDay: 1,
    status: "archived",
    notes: "Family relocated to Bengaluru in September 2026. Account fully settled and archived.",
    totalInvoiced: 15000,
    totalCollected: 15000,
    outstandingBalance: 0,
    nextPaymentDate: "—",
    overdueCount: 0,
    joinedDate: "2026-04-10",
  },
];
