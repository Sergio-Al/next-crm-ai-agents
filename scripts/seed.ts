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

  console.log("✅ Seed complete!");
  console.log(`   📦 1 workspace`);
  console.log(`   👤 1 user`);
  console.log(`   🏢 ${accountData.length} accounts`);
  console.log(`   👥 ${contactData.length} contacts`);
  console.log(`   🎯 ${leadData.length} leads`);
  console.log(`   📊 1 pipeline, ${stageData.length} stages`);
  console.log(`   💰 ${dealData.length} deals`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  });
