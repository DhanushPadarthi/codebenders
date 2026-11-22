import { createClient } from "@supabase/supabase-js";

export const DEMO_USER_EMAIL = "demo@feepulse.internal";
export const DEMO_USER_PASSWORD = process.env.DEMO_USER_PASSWORD || "FeePulseDemo#2026!Judge";
export const DEMO_ACADEMY_NAME = "Sharma Mathematics & Science Academy";

// Sliding-window rate limiter for demo login endpoint (max 10 logins/min per IP)
interface RateRecord {
  timestamps: number[];
}
const demoLoginLimiter = new Map<string, RateRecord>();

export function checkDemoLoginRateLimit(clientIp: string, maxRequests = 10, windowMs = 60000) {
  const now = Date.now();
  const windowStart = now - windowMs;
  const record = demoLoginLimiter.get(clientIp) || { timestamps: [] };
  record.timestamps = record.timestamps.filter((t) => t > windowStart);

  if (record.timestamps.length >= maxRequests) {
    const oldest = record.timestamps[0];
    const retryAfterSeconds = Math.ceil((oldest + windowMs - now) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  record.timestamps.push(now);
  demoLoginLimiter.set(clientIp, record);
  return { allowed: true, remaining: maxRequests - record.timestamps.length };
}

let isDemoAccountVerified = false;

/**
 * Ensures the dedicated demo user and populated sample business exist in Supabase.
 * Strictly uses server-side service credentials and authenticated client.
 */
export async function ensureDemoAccount(forceRefresh = false) {
  if (isDemoAccountVerified && !forceRefresh) {
    return;
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    throw new Error("Missing Supabase environment variables for demo provisioning");
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Check if user already exists
  const { data: usersData, error: listErr } = await adminClient.auth.admin.listUsers();
  if (listErr) throw listErr;

  let demoUser = usersData.users.find((u) => u.email === DEMO_USER_EMAIL);

  if (!demoUser) {
    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email: DEMO_USER_EMAIL,
      password: DEMO_USER_PASSWORD,
      email_confirm: true,
      user_metadata: {
        full_name: "Prof. Rajesh Sharma",
        business_name: DEMO_ACADEMY_NAME,
        role: "academy_owner",
        is_demo: true,
      },
    });
    if (createErr) throw createErr;
    demoUser = created.user;
  }

  // 2. Sign in to obtain an authenticated session for RLS-compliant seeding
  const anonClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let userToken: string;
  const { data: sessionData, error: signInErr } = await anonClient.auth.signInWithPassword({
    email: DEMO_USER_EMAIL,
    password: DEMO_USER_PASSWORD,
  });

  if (signInErr || !sessionData?.session) {
    // If password mismatch or missing session, update demo user password to current secure password
    await adminClient.auth.admin.updateUserById(demoUser.id, {
      password: DEMO_USER_PASSWORD,
    });
    const retry = await anonClient.auth.signInWithPassword({
      email: DEMO_USER_EMAIL,
      password: DEMO_USER_PASSWORD,
    });
    if (retry.error || !retry.data?.session) {
      throw retry.error || new Error("Failed to sign in demo user");
    }
    userToken = retry.data.session.access_token;
  } else {
    userToken = sessionData.session.access_token;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userClient: any = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${userToken}` } },
  });

  // 3. Check if business already exists
  const { data: existingBizList } = await userClient
    .from("businesses")
    .select("id, name")
    .eq("owner_id", demoUser.id)
    .order("created_at", { ascending: false });

  let businessId: string;

  if (existingBizList && existingBizList.length > 0) {
    businessId = existingBizList[0].id;
  } else {
    const { data: newBiz, error: bizErr } = await userClient
      .from("businesses")
      .insert({
        name: DEMO_ACADEMY_NAME,
        owner_id: demoUser.id,
        currency: "INR",
        timezone: "Asia/Kolkata",
      })
      .select()
      .single();
    if (bizErr) throw bizErr;
    businessId = newBiz.id;
  }

  // 4. Check if sample data is populated; if empty, seed it
  const { data: custCountData } = await userClient
    .from("customers")
    .select("id", { count: "exact" })
    .eq("business_id", businessId);

  const existingCustCount = custCountData?.length || 0;

  if (existingCustCount < 5) {
    await seedDemoData(userClient, businessId);
  }

  isDemoAccountVerified = true;
  return { userId: demoUser.id, businessId };
}

/**
 * Seeds realistic fictional students, invoices, payments, expenses, and promises for the demo business.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function seedDemoData(userClient: any, businessId: string) {
  // Settings
  await userClient.from("business_settings").upsert({
    business_id: businessId,
    opening_cash_balance: 65000.0,
    default_payment_terms_days: 7,
    upi_id: "sharma.maths@okhdfcbank",
    invoice_prefix: "INV-2026-",
    monthly_burn_target: 50000.0,
  });

  // 14 Fictional Students
  const students = [
    { name: "Arjun Verma", parent_name: "Ramesh Verma", phone: "+91 98765 43210", whatsapp_number: "+91 98765 43210", grade_subject: "Class 10 - Mathematics CBSE", default_fee_amount: 8500, billing_cycle_day: 5 },
    { name: "Priya Nair", parent_name: "Suresh Nair", phone: "+91 98765 12345", whatsapp_number: "+91 98765 12345", grade_subject: "Class 12 - Advanced Physics", default_fee_amount: 12000, billing_cycle_day: 10 },
    { name: "Rohan Mehta", parent_name: "Sunita Mehta", phone: "+91 98765 67890", whatsapp_number: "+91 98765 67890", grade_subject: "Class 9 - Foundation Science", default_fee_amount: 6500, billing_cycle_day: 1 },
    { name: "Ananya Iyer", parent_name: "Venkatesh Iyer", phone: "+91 98765 24680", whatsapp_number: "+91 98765 24680", grade_subject: "Class 11 - Calculus & Trigonometry", default_fee_amount: 9500, billing_cycle_day: 15 },
    { name: "Kavita Rao", parent_name: "Deepak Rao", phone: "+91 98765 13579", whatsapp_number: "+91 98765 13579", grade_subject: "Class 10 - Mathematics ICSE", default_fee_amount: 8000, billing_cycle_day: 1 },
    { name: "Aditya Chopra", parent_name: "Vikram Chopra", phone: "+91 98765 98765", whatsapp_number: "+91 98765 98765", grade_subject: "Class 12 - Chemistry JEE Prep", default_fee_amount: 11000, billing_cycle_day: 10 },
    { name: "Meera Sen", parent_name: "Pradip Sen", phone: "+91 98765 33445", whatsapp_number: "+91 98765 33445", grade_subject: "Class 9 - Maths Foundation", default_fee_amount: 6000, billing_cycle_day: 5 },
    { name: "Devansh Patel", parent_name: "Nilesh Patel", phone: "+91 98765 77889", whatsapp_number: "+91 98765 77889", grade_subject: "Class 11 - Physics Mechanics", default_fee_amount: 9000, billing_cycle_day: 20 },
    { name: "Ishaan Gupta", parent_name: "Amit Gupta", phone: "+91 98765 55667", whatsapp_number: "+91 98765 55667", grade_subject: "Class 10 - Science & Maths", default_fee_amount: 8500, billing_cycle_day: 1 },
    { name: "Diya Sharma", parent_name: "Manoj Sharma", phone: "+91 98765 22110", whatsapp_number: "+91 98765 22110", grade_subject: "Class 12 - Mathematics Core", default_fee_amount: 10500, billing_cycle_day: 5 },
    { name: "Tanvi Kulkarni", parent_name: "Sanjay Kulkarni", phone: "+91 98765 88990", whatsapp_number: "+91 98765 88990", grade_subject: "Class 8 - Junior Science", default_fee_amount: 5500, billing_cycle_day: 1 },
    { name: "Varun Reddy", parent_name: "Gopal Reddy", phone: "+91 98765 44332", whatsapp_number: "+91 98765 44332", grade_subject: "Class 11 - Chemistry Organic", default_fee_amount: 9500, billing_cycle_day: 15 },
    { name: "Sneha Mukherjee", parent_name: "Subrata Mukherjee", phone: "+91 98765 66778", whatsapp_number: "+91 98765 66778", grade_subject: "Class 10 - Mathematics CBSE", default_fee_amount: 8500, billing_cycle_day: 5 },
    { name: "Kabir Joshi", parent_name: "Rajiv Joshi", phone: "+91 98765 99112", whatsapp_number: "+91 98765 99112", grade_subject: "Class 12 - Physics NEET Batch", default_fee_amount: 12000, billing_cycle_day: 10 },
  ];

  const custMap: Record<string, string> = {};
  for (const s of students) {
    const { data: c } = await userClient
      .from("customers")
      .insert({ ...s, business_id: businessId, status: "active" })
      .select()
      .single();
    if (c) custMap[s.name] = c.id;
  }

  // 12 Fictional Invoices
  const invoicesData = [
    { num: "INV-2026-085", cust: "Arjun Verma", issue: "2026-11-01", due: "2026-11-08", total: 8500, status: "overdue", item: "Class 10 Monthly Tuition Fee (Nov)" },
    { num: "INV-2026-086", cust: "Priya Nair", issue: "2026-11-10", due: "2026-11-17", total: 12000, status: "partially_paid", item: "Class 12 Advanced Physics (Nov)" },
    { num: "INV-2026-087", cust: "Rohan Mehta", issue: "2026-11-01", due: "2026-11-08", total: 6500, status: "paid", item: "Class 9 Foundation Science (Nov)" },
    { num: "INV-2026-088", cust: "Ananya Iyer", issue: "2026-11-15", due: "2026-11-22", total: 9500, status: "overdue", item: "Class 11 Calculus & Trig (Nov)" },
    { num: "INV-2026-089", cust: "Kavita Rao", issue: "2026-11-01", due: "2026-11-08", total: 8000, status: "paid", item: "Class 10 Maths ICSE (Nov)" },
    { num: "INV-2026-090", cust: "Aditya Chopra", issue: "2026-11-10", due: "2026-11-25", total: 11000, status: "sent", item: "Class 12 Chemistry JEE (Nov)" },
    { num: "INV-2026-091", cust: "Meera Sen", issue: "2026-11-05", due: "2026-11-12", total: 6000, status: "overdue", item: "Class 9 Maths Foundation (Nov)" },
    { num: "INV-2026-092", cust: "Devansh Patel", issue: "2026-11-20", due: "2026-11-27", total: 9000, status: "sent", item: "Class 11 Physics Mechanics (Nov)" },
    { num: "INV-2026-093", cust: "Ishaan Gupta", issue: "2026-11-01", due: "2026-11-08", total: 8500, status: "partially_paid", item: "Class 10 Science & Maths (Nov)" },
    { num: "INV-2026-094", cust: "Diya Sharma", issue: "2026-11-05", due: "2026-11-15", total: 10500, status: "paid", item: "Class 12 Mathematics Core (Nov)" },
    { num: "INV-2026-095", cust: "Tanvi Kulkarni", issue: "2026-11-22", due: "2026-11-29", total: 5500, status: "draft", item: "Class 8 Junior Science (Dec Advance)" },
    { num: "INV-2026-096", cust: "Varun Reddy", issue: "2026-11-15", due: "2026-11-22", total: 9500, status: "sent", item: "Class 11 Chemistry Organic (Nov)" },
  ];

  const invMap: Record<string, string> = {};
  for (const inv of invoicesData) {
    const cId = custMap[inv.cust];
    if (!cId) continue;

    const { data: createdInv } = await userClient
      .from("invoices")
      .insert({
        business_id: businessId,
        customer_id: cId,
        invoice_number: inv.num,
        issue_date: inv.issue,
        due_date: inv.due,
        subtotal: inv.total,
        discount: 0,
        total_amount: inv.total,
        status: inv.status,
      })
      .select()
      .single();

    if (createdInv) {
      invMap[inv.num] = createdInv.id;
      // Line item
      await userClient.from("invoice_items").insert({
        business_id: businessId,
        invoice_id: createdInv.id,
        description: inv.item,
        quantity: 1,
        unit_price: inv.total,
        total_price: inv.total,
      });
    }
  }

  // Payments (reconciling exactly with invoice balances)
  const payments = [
    { inv: "INV-2026-086", cust: "Priya Nair", amt: 6000, mode: "upi", ref: "UPI-PN-982143", date: "2026-11-12" },
    { inv: "INV-2026-087", cust: "Rohan Mehta", amt: 6500, mode: "cash", ref: "CASH-RM-1029", date: "2026-11-03" },
    { inv: "INV-2026-089", cust: "Kavita Rao", amt: 8000, mode: "bank_transfer", ref: "IMPS-KR-882190", date: "2026-11-06" },
    { inv: "INV-2026-093", cust: "Ishaan Gupta", amt: 4000, mode: "upi", ref: "UPI-IG-773122", date: "2026-11-05" },
    { inv: "INV-2026-094", cust: "Diya Sharma", amt: 10500, mode: "cheque", ref: "CHQ-DS-441029", date: "2026-11-08" },
  ];

  for (const p of payments) {
    const invId = invMap[p.inv];
    const cId = custMap[p.cust];
    if (!invId || !cId) continue;

    // Use RPC if available, or direct insert with balance update
    const { error: rpcErr } = await userClient.rpc("record_invoice_payment", {
      p_invoice_id: invId,
      p_amount: p.amt,
      p_payment_mode: p.mode,
      p_payment_date: p.date,
      p_reference_id: p.ref,
    });

    if (rpcErr) {
      // Fallback direct payment insert
      await userClient.from("payments").insert({
        business_id: businessId,
        invoice_id: invId,
        customer_id: cId,
        amount: p.amt,
        payment_mode: p.mode,
        payment_date: p.date,
        reference_id: p.ref,
      });
      // update invoice amount_paid
      const { data: currentInv } = await userClient.from("invoices").select("amount_paid, total_amount").eq("id", invId).single();
      if (currentInv) {
        const newPaid = Number(currentInv.amount_paid) + p.amt;
        const newStatus = newPaid >= Number(currentInv.total_amount) ? "paid" : "partially_paid";
        await userClient.from("invoices").update({ amount_paid: newPaid, status: newStatus }).eq("id", invId);
      }
    }
  }

  // 4 Operational Bills & Expenses
  const bills = [
    { title: "Coaching Centre Rent (Sector 14)", vendor_name: "Vasanth Commercial Properties", category: "rent", amount: 35000, due_date: "2026-11-26", status: "unpaid", is_recurring: true, recurring_frequency: "monthly" },
    { title: "Faculty Honorarium - Advanced Physics", vendor_name: "Prof. S. K. Gupta", category: "salary", amount: 22000, due_date: "2026-12-01", status: "unpaid", is_recurring: true, recurring_frequency: "monthly" },
    { title: "Commercial Power & High-Speed Broadband", vendor_name: "Airtel Broadband & BSES", category: "electricity", amount: 4200, due_date: "2026-11-20", status: "overdue", is_recurring: true, recurring_frequency: "monthly" },
    { title: "Term 1 Formula Sheets & Test Booklets", vendor_name: "City Print & Stationery Works", category: "materials", amount: 4800, due_date: "2026-11-15", status: "paid", paid_date: "2026-11-15", is_recurring: false },
  ];

  for (const b of bills) {
    await userClient.from("bills").insert({ ...b, business_id: businessId });
  }

  // Payment Promises for Overdue Accounts
  if (custMap["Arjun Verma"] && invMap["INV-2026-085"]) {
    await userClient.from("payment_promises").insert({
      business_id: businessId,
      customer_id: custMap["Arjun Verma"],
      invoice_id: invMap["INV-2026-085"],
      promised_amount: 8500,
      promised_date: "2026-11-24",
      raw_message: "Sir will settle full 8500 by Tuesday 24 Nov evening via Google Pay.",
      status: "pending",
      confidence_score: 0.95,
    });
  }

  if (custMap["Priya Nair"] && invMap["INV-2026-086"]) {
    await userClient.from("payment_promises").insert({
      business_id: businessId,
      customer_id: custMap["Priya Nair"],
      invoice_id: invMap["INV-2026-086"],
      promised_amount: 6000,
      promised_date: "2026-11-22",
      raw_message: "Remaining 6000 will be paid today evening after office.",
      status: "pending",
      confidence_score: 0.98,
    });
  }

  if (custMap["Ananya Iyer"] && invMap["INV-2026-088"]) {
    await userClient.from("payment_promises").insert({
      business_id: businessId,
      customer_id: custMap["Ananya Iyer"],
      invoice_id: invMap["INV-2026-088"],
      promised_amount: 9500,
      promised_date: "2026-11-18",
      raw_message: "Will clear pending 9500 by 18th November.",
      status: "broken",
      confidence_score: 0.92,
    });
  }
}
