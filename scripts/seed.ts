import { createDb } from "@crm-agent/shared/db";
import {
  workspaces,
  users,
  workspaceMembers,
  crmAccounts,
  contacts,
  leads,
  pipelines,
  pipelineStages,
  deals,
  products,
  orders,
  orderItems,
} from "@crm-agent/shared/db/schema";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://platform:platform@localhost:6432/platform";

const db = createDb(DATABASE_URL);

async function seed() {
  console.log("🌱 Seeding database...");

  // ── Workspace ──
  const [workspace] = await db
    .insert(workspaces)
    .values({
      name: "Acme Corp",
      slug: "acme-corp",
      ownerId: "00000000-0000-0000-0000-000000000001",
    })
    .onConflictDoNothing()
    .returning();

  const wsId = workspace?.id;
  if (!wsId) {
    console.log("⚠️  Workspace already exists, fetching...");
    const existing = await db.query.workspaces.findFirst({
      where: (w, { eq }) => eq(w.slug, "acme-corp"),
    });
    if (!existing) throw new Error("Failed to find or create workspace");
    return seedData(existing.id);
  }

  await seedData(wsId);
}

async function seedData(wsId: string) {
  // ── User ──
  const [user] = await db
    .insert(users)
    .values({
      id: "00000000-0000-0000-0000-000000000001",
      email: "admin@acme.com",
      name: "Sarah Chen",
    })
    .onConflictDoNothing()
    .returning();

  const userId = user?.id ?? "00000000-0000-0000-0000-000000000001";

  await db
    .insert(workspaceMembers)
    .values({ workspaceId: wsId, userId, role: "owner" })
    .onConflictDoNothing();

  // ── CRM Accounts ──
  const accountData = [
    { name: "TechStart Inc", domain: "techstart.io", industry: "Technology", size: "51-200" },
    { name: "Global Dynamics", domain: "globaldynamics.com", industry: "Manufacturing", size: "201-500" },
    { name: "Pinnacle Health", domain: "pinnaclehealth.org", industry: "Healthcare", size: "501-1000" },
    { name: "Vertex Finance", domain: "vertexfinance.com", industry: "Finance", size: "201-500" },
    { name: "EcoSustain", domain: "ecosustain.co", industry: "Energy", size: "11-50" },
  ];

  const insertedAccounts = await db
    .insert(crmAccounts)
    .values(accountData.map((a) => ({ ...a, workspaceId: wsId, createdBy: userId })))
    .onConflictDoNothing()
    .returning();

  const acctIds = insertedAccounts.map((a) => a.id);

  // ── Contacts ──
  const contactData = [
    { firstName: "James", lastName: "Rodriguez", email: "james@techstart.io", companyName: "TechStart Inc", accountId: acctIds[0], source: "website", tags: ["enterprise", "tech"] },
    { firstName: "Emily", lastName: "Watson", email: "emily@techstart.io", companyName: "TechStart Inc", accountId: acctIds[0], source: "referral", tags: ["decision-maker"] },
    { firstName: "Michael", lastName: "Park", email: "michael@globaldynamics.com", companyName: "Global Dynamics", accountId: acctIds[1], source: "linkedin", tags: ["enterprise", "manufacturing"] },
    { firstName: "Aisha", lastName: "Khan", email: "aisha@globaldynamics.com", companyName: "Global Dynamics", accountId: acctIds[1], source: "cold-outreach", tags: ["vp-level"] },
    { firstName: "David", lastName: "Chen", email: "david@pinnaclehealth.org", companyName: "Pinnacle Health", accountId: acctIds[2], source: "conference", tags: ["healthcare", "compliance"] },
    { firstName: "Sofia", lastName: "Martinez", email: "sofia@pinnaclehealth.org", companyName: "Pinnacle Health", accountId: acctIds[2], source: "website", tags: ["it-buyer"] },
    { firstName: "Robert", lastName: "Taylor", email: "robert@vertexfinance.com", companyName: "Vertex Finance", accountId: acctIds[3], source: "referral", tags: ["finance", "enterprise"] },
    { firstName: "Lisa", lastName: "Nguyen", email: "lisa@vertexfinance.com", companyName: "Vertex Finance", accountId: acctIds[3], source: "webinar", tags: ["decision-maker"] },
    { firstName: "Alex", lastName: "Johnson", email: "alex@ecosustain.co", companyName: "EcoSustain", accountId: acctIds[4], source: "linkedin", tags: ["startup", "green-tech"] },
    { firstName: "Maria", lastName: "Garcia", email: "maria@ecosustain.co", companyName: "EcoSustain", accountId: acctIds[4], source: "inbound", tags: ["cto"] },
    { firstName: "Thomas", lastName: "Brown", email: "thomas@acmecorp.com", companyName: "Acme Division", source: "cold-outreach", tags: ["prospect"] },
    { firstName: "Olivia", lastName: "Wilson", email: "olivia@sunrise.io", companyName: "Sunrise Labs", source: "website", tags: ["startup", "saas"] },
    { firstName: "Daniel", lastName: "Lee", email: "daniel@quantum.dev", companyName: "Quantum Dev", source: "referral", tags: ["developer", "tech"] },
    { firstName: "Emma", lastName: "Davis", email: "emma@brightpath.co", companyName: "BrightPath", source: "conference", tags: ["education"] },
    { firstName: "Kevin", lastName: "Miller", email: "kevin@nextera.com", companyName: "NextEra Solutions", source: "linkedin", tags: ["enterprise"] },
    { firstName: "Rachel", lastName: "Thompson", email: "rachel@cloudnine.io", companyName: "CloudNine", source: "inbound", tags: ["saas", "cloud"] },
    { firstName: "Chris", lastName: "Anderson", email: "chris@boldventures.com", companyName: "Bold Ventures", source: "webinar", tags: ["vc", "investor"] },
    { firstName: "Nina", lastName: "Patel", email: "nina@healwell.org", companyName: "HealWell", source: "website", tags: ["healthcare"] },
    { firstName: "Sam", lastName: "Wright", email: "sam@ironforge.io", companyName: "IronForge", source: "cold-outreach", tags: ["manufacturing"] },
    { firstName: "Jasmine", lastName: "Kim", email: "jasmine@finleap.com", companyName: "FinLeap", source: "referral", tags: ["fintech", "decision-maker"] },
  ];

  const insertedContacts = await db
    .insert(contacts)
    .values(contactData.map((c) => ({ ...c, workspaceId: wsId, createdBy: userId })))
    .onConflictDoNothing()
    .returning();

  const contactIds = insertedContacts.map((c) => c.id);

  // ── Leads (from some contacts) ──
  const leadData = [
    { contactId: contactIds[10], status: "new", source: "cold-outreach", score: 25 },
    { contactId: contactIds[11], status: "new", source: "website", score: 40 },
    { contactId: contactIds[12], status: "contacted", source: "referral", score: 55 },
    { contactId: contactIds[13], status: "contacted", source: "conference", score: 35 },
    { contactId: contactIds[14], status: "qualified", source: "linkedin", score: 70 },
    { contactId: contactIds[15], status: "new", source: "inbound", score: 60 },
    { contactId: contactIds[16], status: "qualified", source: "webinar", score: 80 },
    { contactId: contactIds[17], status: "new", source: "website", score: 30 },
  ];

  await db
    .insert(leads)
    .values(leadData.map((l) => ({ ...l, workspaceId: wsId, assignedTo: userId })))
    .onConflictDoNothing();

  // ── Pipeline & Stages ──
  const [pipeline] = await db
    .insert(pipelines)
    .values({ workspaceId: wsId, name: "Sales Pipeline", isDefault: true })
    .onConflictDoNothing()
    .returning();

  const pipeId = pipeline?.id;
  if (!pipeId) {
    console.log("⚠️  Pipeline might already exist. Skipping stages & deals.");
    console.log("✅ Seed complete (partial).");
    process.exit(0);
  }

  const stageData = [
    { name: "Prospecting", position: 0, winProbability: 10 },
    { name: "Qualification", position: 1, winProbability: 30 },
    { name: "Proposal", position: 2, winProbability: 50 },
    { name: "Negotiation", position: 3, winProbability: 70 },
    { name: "Closed Won", position: 4, winProbability: 100 },
  ];

  const insertedStages = await db
    .insert(pipelineStages)
    .values(stageData.map((s) => ({ ...s, pipelineId: pipeId })))
    .returning();

  const stageIds = insertedStages.map((s) => s.id);

  // ── Deals ──
  const dealData = [
    // Prospecting (3)
    { title: "TechStart Platform License", value: "45000.00", contactId: contactIds[0], accountId: acctIds[0], stageId: stageIds[0], expectedClose: "2025-03-15" },
    { title: "Sunrise Labs Onboarding", value: "12000.00", contactId: contactIds[11], stageId: stageIds[0], expectedClose: "2025-04-01" },
    { title: "IronForge Pilot Program", value: "28000.00", contactId: contactIds[18], stageId: stageIds[0], expectedClose: "2025-04-10" },
    // Qualification (3)
    { title: "Global Dynamics Enterprise Suite", value: "120000.00", contactId: contactIds[2], accountId: acctIds[1], stageId: stageIds[1], expectedClose: "2025-02-28" },
    { title: "NextEra Annual Contract", value: "36000.00", contactId: contactIds[14], stageId: stageIds[1], expectedClose: "2025-03-20" },
    { title: "FinLeap Integration Package", value: "55000.00", contactId: contactIds[19], stageId: stageIds[1], expectedClose: "2025-03-30" },
    // Proposal (4)
    { title: "Pinnacle Health CRM Migration", value: "85000.00", contactId: contactIds[4], accountId: acctIds[2], stageId: stageIds[2], expectedClose: "2025-02-15" },
    { title: "Vertex Finance Analytics Add-on", value: "32000.00", contactId: contactIds[6], accountId: acctIds[3], stageId: stageIds[2], expectedClose: "2025-02-20" },
    { title: "CloudNine SaaS Bundle", value: "48000.00", contactId: contactIds[15], stageId: stageIds[2], expectedClose: "2025-03-05" },
    { title: "Quantum Dev Tools License", value: "22000.00", contactId: contactIds[12], stageId: stageIds[2], expectedClose: "2025-03-10" },
    // Negotiation (3)
    { title: "EcoSustain Green Platform", value: "67000.00", contactId: contactIds[8], accountId: acctIds[4], stageId: stageIds[3], expectedClose: "2025-02-10" },
    { title: "Bold Ventures Partnership", value: "150000.00", contactId: contactIds[16], stageId: stageIds[3], expectedClose: "2025-02-18" },
    { title: "BrightPath Education Suite", value: "41000.00", contactId: contactIds[13], stageId: stageIds[3], expectedClose: "2025-02-25" },
    // Closed Won (2)
    { title: "HealWell Annual Subscription", value: "58000.00", contactId: contactIds[17], stageId: stageIds[4], status: "won" as const, expectedClose: "2025-01-15" },
    { title: "TechStart Support Renewal", value: "18000.00", contactId: contactIds[1], accountId: acctIds[0], stageId: stageIds[4], status: "won" as const, expectedClose: "2025-01-20" },
  ];

  await db
    .insert(deals)
    .values(
      dealData.map((d) => ({
        ...d,
        workspaceId: wsId,
        pipelineId: pipeId,
        assignedTo: userId,
        status: d.status ?? "open",
      })),
    )
    .onConflictDoNothing();

  // ── Products ──
  const productData = [
    // Software
    { name: "CRM Platform License", sku: "SW-CRM-001", category: "Software", price: "2500.00", currency: "USD", unit: "license", stockQty: null, description: "Full-featured CRM platform with contact management, deal tracking, and analytics.", tags: ["crm", "enterprise", "saas"] },
    { name: "Analytics Dashboard Pro", sku: "SW-ANA-001", category: "Software", price: "1200.00", currency: "USD", unit: "license", description: "Advanced analytics and reporting dashboard with real-time data visualization.", tags: ["analytics", "dashboard", "reporting"] },
    { name: "Email Marketing Suite", sku: "SW-EML-001", category: "Software", price: "800.00", currency: "USD", unit: "license", description: "Automated email marketing platform with templates, A/B testing, and campaign analytics.", tags: ["email", "marketing", "automation"] },
    { name: "Project Management Tool", sku: "SW-PM-001", category: "Software", price: "900.00", currency: "USD", unit: "license", description: "Collaborative project management with Kanban boards, Gantt charts, and time tracking.", tags: ["project-management", "collaboration", "agile"] },
    { name: "API Integration Hub", sku: "SW-API-001", category: "Software", price: "1500.00", currency: "USD", unit: "license", description: "Connect all your tools with pre-built integrations and custom API workflows.", tags: ["integration", "api", "automation"] },
    // Services
    { name: "Implementation Package", sku: "SV-IMP-001", category: "Services", price: "15000.00", currency: "USD", unit: "project", description: "Full implementation service including data migration, configuration, and training.", tags: ["implementation", "onboarding", "professional-services"] },
    { name: "Custom Development (per hour)", sku: "SV-DEV-001", category: "Services", price: "175.00", currency: "USD", unit: "hour", description: "Custom development and integration services by our expert engineering team.", tags: ["development", "custom", "engineering"] },
    { name: "Training Workshop", sku: "SV-TRN-001", category: "Services", price: "3000.00", currency: "USD", unit: "session", description: "On-site or virtual training workshop for up to 20 participants.", tags: ["training", "education", "workshop"] },
    { name: "Consulting Engagement", sku: "SV-CON-001", category: "Services", price: "5000.00", currency: "USD", unit: "engagement", description: "Strategic consulting for CRM optimization and digital transformation.", tags: ["consulting", "strategy", "optimization"] },
    { name: "Data Migration Service", sku: "SV-MIG-001", category: "Services", price: "8000.00", currency: "USD", unit: "project", description: "Full data migration from legacy systems with validation and cleanup.", tags: ["migration", "data", "legacy"] },
    // Support
    { name: "Basic Support Plan", sku: "SP-BAS-001", category: "Support", price: "500.00", currency: "USD", unit: "month", description: "Email support with 48-hour response time during business hours.", tags: ["support", "basic", "email"] },
    { name: "Premium Support Plan", sku: "SP-PRE-001", category: "Support", price: "2000.00", currency: "USD", unit: "month", description: "24/7 priority support with dedicated account manager and 4-hour SLA.", tags: ["support", "premium", "24/7", "sla"] },
    { name: "Enterprise Support Plan", sku: "SP-ENT-001", category: "Support", price: "5000.00", currency: "USD", unit: "month", description: "White-glove support with on-site visits, custom SLA, and quarterly reviews.", tags: ["support", "enterprise", "on-site"] },
    // Hardware
    { name: "Conference Room Kit", sku: "HW-CRK-001", category: "Hardware", price: "3500.00", currency: "USD", unit: "kit", stockQty: 50, description: "Complete conference room setup with camera, microphone, and display adapter.", tags: ["hardware", "conference", "meeting"] },
    { name: "IoT Sensor Bundle", sku: "HW-IOT-001", category: "Hardware", price: "1200.00", currency: "USD", unit: "bundle", stockQty: 200, description: "Set of 10 IoT sensors for environmental monitoring and facility management.", tags: ["hardware", "iot", "sensors"] },
    // Add-ons
    { name: "Extra Storage (100GB)", sku: "AO-STR-001", category: "Add-ons", price: "50.00", currency: "USD", unit: "month", description: "Additional 100GB of cloud storage for documents and attachments.", tags: ["storage", "cloud", "add-on"] },
    { name: "Advanced Security Module", sku: "AO-SEC-001", category: "Add-ons", price: "750.00", currency: "USD", unit: "month", description: "SSO, SAML, audit logs, and advanced access controls.", tags: ["security", "sso", "compliance"] },
    { name: "AI Assistant Add-on", sku: "AO-AI-001", category: "Add-ons", price: "400.00", currency: "USD", unit: "month", description: "AI-powered assistant for automated data entry, lead scoring, and insights.", tags: ["ai", "automation", "assistant"] },
    { name: "White-Label Branding", sku: "AO-WL-001", category: "Add-ons", price: "1000.00", currency: "USD", unit: "month", description: "Custom branding with your logo, colors, and domain.", tags: ["branding", "white-label", "customization"] },
    { name: "Compliance Pack (HIPAA/SOC2)", sku: "AO-CMP-001", category: "Add-ons", price: "2000.00", currency: "USD", unit: "month", description: "HIPAA and SOC2 compliance features including encryption, BAA, and audit tooling.", tags: ["compliance", "hipaa", "soc2", "security"] },
  ];

  const insertedProducts = await db
    .insert(products)
    .values(productData.map((p) => ({ ...p, workspaceId: wsId, active: true })))
    .onConflictDoNothing()
    .returning();

  const productIds = insertedProducts.map((p) => p.id);

  // ── Orders ──
  // Helper to generate order number
  let orderCounter = 1;
  const nextOrderNum = () => `ORD-${String(orderCounter++).padStart(4, "0")}`;

  // Create orders for various contacts with different statuses
  const orderSpecs: Array<{
    contactIdx: number;
    accountIdx?: number;
    status: string;
    items: Array<{ productIdx: number; quantity: number }>;
    discountPercent?: string;
    taxPercent?: string;
    notes?: string;
  }> = [
    // James Rodriguez — 2 delivered orders (repeat customer)
    { contactIdx: 0, accountIdx: 0, status: "delivered", items: [{ productIdx: 0, quantity: 5 }, { productIdx: 5, quantity: 1 }], taxPercent: "8.5" },
    { contactIdx: 0, accountIdx: 0, status: "delivered", items: [{ productIdx: 11, quantity: 1 }, { productIdx: 1, quantity: 5 }], taxPercent: "8.5", discountPercent: "10" },
    // Michael Park — 1 delivered, 1 confirmed
    { contactIdx: 2, accountIdx: 1, status: "delivered", items: [{ productIdx: 0, quantity: 10 }, { productIdx: 4, quantity: 10 }, { productIdx: 5, quantity: 1 }], taxPercent: "7", discountPercent: "15" },
    { contactIdx: 2, accountIdx: 1, status: "confirmed", items: [{ productIdx: 12, quantity: 1 }, { productIdx: 16, quantity: 1 }], taxPercent: "7" },
    // David Chen — 1 shipped
    { contactIdx: 4, accountIdx: 2, status: "shipped", items: [{ productIdx: 0, quantity: 3 }, { productIdx: 19, quantity: 1 }, { productIdx: 9, quantity: 1 }], taxPercent: "6", notes: "Healthcare compliance requirements — ensure HIPAA pack is configured before go-live." },
    // Robert Taylor — 1 delivered, 1 draft
    { contactIdx: 6, accountIdx: 3, status: "delivered", items: [{ productIdx: 0, quantity: 8 }, { productIdx: 1, quantity: 8 }, { productIdx: 16, quantity: 1 }], taxPercent: "8", discountPercent: "12" },
    { contactIdx: 6, accountIdx: 3, status: "draft", items: [{ productIdx: 12, quantity: 1 }, { productIdx: 17, quantity: 1 }], notes: "Pending budget approval for next quarter." },
    // Alex Johnson — 1 confirmed
    { contactIdx: 8, accountIdx: 4, status: "confirmed", items: [{ productIdx: 0, quantity: 2 }, { productIdx: 7, quantity: 1 }, { productIdx: 2, quantity: 2 }], taxPercent: "9.5" },
    // Olivia Wilson — 1 draft
    { contactIdx: 11, status: "draft", items: [{ productIdx: 0, quantity: 1 }, { productIdx: 3, quantity: 1 }, { productIdx: 15, quantity: 1 }] },
    // Kevin Miller — 1 delivered, 1 shipped
    { contactIdx: 14, status: "delivered", items: [{ productIdx: 0, quantity: 15 }, { productIdx: 5, quantity: 1 }, { productIdx: 12, quantity: 1 }], taxPercent: "8.5", discountPercent: "20" },
    { contactIdx: 14, status: "shipped", items: [{ productIdx: 1, quantity: 15 }, { productIdx: 4, quantity: 15 }], taxPercent: "8.5", discountPercent: "15" },
    // Jasmine Kim — 1 confirmed
    { contactIdx: 19, status: "confirmed", items: [{ productIdx: 0, quantity: 3 }, { productIdx: 16, quantity: 1 }, { productIdx: 17, quantity: 1 }], taxPercent: "7.5" },
    // Rachel Thompson — 1 cancelled
    { contactIdx: 15, status: "cancelled", items: [{ productIdx: 0, quantity: 2 }, { productIdx: 2, quantity: 2 }], notes: "Customer chose competitor solution." },
    // Nina Patel — 1 draft
    { contactIdx: 17, status: "draft", items: [{ productIdx: 0, quantity: 1 }, { productIdx: 19, quantity: 1 }, { productIdx: 10, quantity: 1 }], notes: "Waiting for procurement process." },
    // Sam Wright — 1 shipped
    { contactIdx: 18, status: "shipped", items: [{ productIdx: 13, quantity: 5 }, { productIdx: 14, quantity: 10 }, { productIdx: 6, quantity: 40 }], taxPercent: "6.5", discountPercent: "10" },
  ];

  for (const spec of orderSpecs) {
    // Calculate line totals
    const resolvedItems = spec.items.map((item) => {
      const product = insertedProducts[item.productIdx];
      const unitPrice = parseFloat(product.price);
      const lineTotal = unitPrice * item.quantity;
      return {
        productId: product.id,
        productName: product.name,
        productSku: product.sku,
        unitPrice: product.price,
        quantity: item.quantity,
        lineTotal: lineTotal.toFixed(2),
      };
    });

    const subtotal = resolvedItems.reduce((sum, i) => sum + parseFloat(i.lineTotal), 0);
    const discountPct = parseFloat(spec.discountPercent ?? "0");
    const taxPct = parseFloat(spec.taxPercent ?? "0");
    const discountAmount = subtotal * (discountPct / 100);
    const taxAmount = (subtotal - discountAmount) * (taxPct / 100);
    const totalAmount = subtotal - discountAmount + taxAmount;

    const statusTimestamps: Record<string, Date> = {};
    const now = new Date();
    if (["confirmed", "shipped", "delivered"].includes(spec.status)) {
      statusTimestamps.confirmedAt = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    }
    if (["shipped", "delivered"].includes(spec.status)) {
      statusTimestamps.shippedAt = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }
    if (spec.status === "delivered") {
      statusTimestamps.deliveredAt = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    }
    if (spec.status === "cancelled") {
      statusTimestamps.cancelledAt = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    }

    const [order] = await db
      .insert(orders)
      .values({
        workspaceId: wsId,
        contactId: contactIds[spec.contactIdx],
        accountId: spec.accountIdx !== undefined ? acctIds[spec.accountIdx] : undefined,
        number: nextOrderNum(),
        status: spec.status,
        currency: "USD",
        subtotal: subtotal.toFixed(2),
        discountPercent: spec.discountPercent ?? "0",
        discountAmount: discountAmount.toFixed(2),
        taxPercent: spec.taxPercent ?? "0",
        taxAmount: taxAmount.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
        notes: spec.notes,
        ...statusTimestamps,
      })
      .onConflictDoNothing()
      .returning();

    if (order) {
      await db
        .insert(orderItems)
        .values(resolvedItems.map((item) => ({ ...item, orderId: order.id })))
        .onConflictDoNothing();
    }
  }

  console.log("✅ Seed complete!");
  console.log(`   📦 1 workspace`);
  console.log(`   👤 1 user`);
  console.log(`   🏢 ${accountData.length} accounts`);
  console.log(`   👥 ${contactData.length} contacts`);
  console.log(`   🎯 ${leadData.length} leads`);
  console.log(`   📊 1 pipeline, ${stageData.length} stages`);
  console.log(`   💰 ${dealData.length} deals`);
  console.log(`   🛍️  ${productData.length} products`);
  console.log(`   📋 ${orderSpecs.length} orders`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  });
