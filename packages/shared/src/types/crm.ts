// CRM entity types

export type Contact = {
  id: string;
  workspaceId: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  accountId: string | null;
  source: string | null;
  avatarUrl: string | null;
  customFields: Record<string, unknown>;
  tags: string[];
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CrmAccount = {
  id: string;
  workspaceId: string;
  name: string;
  domain: string | null;
  industry: string | null;
  size: string | null;
  website: string | null;
  customFields: Record<string, unknown>;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
};

export type LeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "converted"
  | "lost";

export type Lead = {
  id: string;
  workspaceId: string;
  contactId: string | null;
  status: LeadStatus;
  source: string | null;
  score: number;
  assignedTo: string | null;
  convertedAt: Date | null;
  customFields: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type DealStatus = "open" | "won" | "lost";

export type Deal = {
  id: string;
  workspaceId: string;
  pipelineId: string;
  stageId: string;
  contactId: string | null;
  accountId: string | null;
  title: string;
  value: string | null;
  currency: string;
  expectedClose: Date | null;
  assignedTo: string | null;
  status: DealStatus;
  lostReason: string | null;
  customFields: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type Pipeline = {
  id: string;
  workspaceId: string;
  name: string;
  isDefault: boolean;
  createdAt: Date;
};

export type PipelineStage = {
  id: string;
  pipelineId: string;
  name: string;
  position: number;
  winProbability: number;
};

export type ActivityType = "call" | "email" | "meeting" | "note" | "task";

export type Activity = {
  id: string;
  workspaceId: string;
  type: ActivityType;
  subject: string | null;
  body: string | null;
  contactId: string | null;
  dealId: string | null;
  conversationId: string | null;
  performedBy: string | null;
  scheduledAt: Date | null;
  completedAt: Date | null;
  durationMin: number | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
};

// ── Products & Orders ──

export type Product = {
  id: string;
  workspaceId: string;
  name: string;
  sku: string | null;
  description: string | null;
  category: string | null;
  price: string;
  currency: string;
  unit: string;
  stockQty: number | null;
  active: boolean;
  customFields: Record<string, unknown>;
  tags: string[];
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type OrderStatus =
  | "draft"
  | "confirmed"
  | "shipped"
  | "delivered"
  | "cancelled";

export type Order = {
  id: string;
  workspaceId: string;
  number: string;
  contactId: string | null;
  accountId: string | null;
  dealId: string | null;
  status: OrderStatus;
  currency: string;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  totalAmount: string;
  notes: string | null;
  assignedTo: string | null;
  confirmedAt: Date | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  customFields: Record<string, unknown>;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type OrderItem = {
  id: string;
  orderId: string;
  productId: string | null;
  productName: string;
  productSku: string | null;
  unitPrice: string;
  quantity: number;
  discountPct: string;
  lineTotal: string;
  notes: string | null;
};
