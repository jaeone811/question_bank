export const ORDER_STATUSES = [
  "PENDING_VERIFICATION",
  "NOTIFIED_USER",
  "APPROVED",
  "DISPATCHING",
  "DELIVERED",
  "DISPATCH_FAILED",
  "EXPIRED",
  "REJECTED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const CHANNELS = ["INSTAGRAM_DM", "EMAIL", "BOTH"] as const;
export type PreferredChannel = (typeof CHANNELS)[number];

export const PAYMENT_METHODS = ["BANK", "KAKAOPAY", "TOSS"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type TaskChannel = "INSTAGRAM" | "EMAIL";

export type Product = {
  id: string;
  title: string;
  subject: string | null;
  grade: string;
  difficulty: string | null;
  questionCount: number | null;
  pageCount: number | null;
  price: number;
  description: string | null;
  samplePdfUrl: string | null;
  originalFilePath: string | null;
  originalFileName: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
};

export type Order = {
  id: string;
  orderNumber: string;
  productId: string;
  buyerName: string;
  depositorName: string;
  buyerEmail: string | null;
  buyerInstagram: string | null;
  buyerPhone: string;
  preferredChannel: PreferredChannel;
  paymentMethod: PaymentMethod;
  totalAmount: number;
  status: OrderStatus;
  reissueRequestedAt: number | null;
  adminMemo: string | null;
  downloadUrl: string | null;
  emailSentAt: number | null;
  emailError: string | null;
  createdAt: number;
  approvedAt: number | null;
  deliveredAt: number | null;
};

export type DownloadToken = {
  id: string;
  orderId: string;
  productId: string;
  tokenHash: string;
  expiresAt: number;
  downloadCount: number;
  maxDownloads: number;
  lastDownloadedAt: number | null;
  clientIpLog: string;
  isRevoked: boolean;
  createdAt: number;
};

export type OrderLog = {
  id: number;
  orderId: string | null;
  level: "info" | "warn" | "error";
  message: string;
  createdAt: number;
};

function toMs(v: unknown, fallback = Date.now()): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const num = Number(v);
    if (Number.isFinite(num)) return num;
    const parsed = Date.parse(v);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function toMsOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  return toMs(v, 0) || null;
}

// Supabase row (snake_case) -> App type (camelCase)
export function mapProduct(r: Record<string, unknown>): Product {
  const qc = r.question_count ?? r.item_count;
  const origPath = r.original_file_path ?? r.file_path;
  const sampleUrl = r.sample_pdf_url ?? r.sample_path;
  return {
    id: String(r.id),
    title: String(r.title),
    subject: (r.subject as string | null) ?? null,
    grade: String(r.grade ?? "고2"),
    difficulty: (r.difficulty as string | null) ?? null,
    questionCount: qc != null ? Number(qc) : null,
    pageCount: r.page_count != null ? Number(r.page_count) : null,
    price: Number(r.price),
    description: (r.description as string | null) ?? null,
    samplePdfUrl: (sampleUrl as string | null) ?? null,
    originalFilePath: (origPath as string | null) ?? null,
    originalFileName: (r.original_file_name as string | null) ?? null,
    sortOrder: Number(r.sort_order ?? 0),
    isActive: Boolean(r.is_active ?? true),
    createdAt: toMs(r.created_at),
    updatedAt: toMs(r.updated_at),
  };
}

export function mapOrder(r: Record<string, unknown>): Order {
  return {
    id: String(r.id),
    orderNumber: String(r.order_number ?? r.order_no ?? ""),
    productId: String(r.product_id),
    buyerName: String(r.buyer_name),
    depositorName: String(r.depositor_name ?? r.buyer_name ?? ""),
    buyerEmail: (r.buyer_email ?? r.email ?? null) as string | null,
    buyerInstagram: (r.buyer_instagram ?? r.instagram_id ?? null) as string | null,
    buyerPhone: String(r.buyer_phone ?? ""),
    preferredChannel: (r.preferred_channel ?? (r.delivery_method === "INSTAGRAM" ? "INSTAGRAM_DM" : "EMAIL")) as PreferredChannel,
    paymentMethod: r.payment_method as PaymentMethod,
    totalAmount: Number(r.total_amount ?? r.amount ?? 0),
    status: (r.status === "PENDING" ? "PENDING_VERIFICATION" : r.status) as OrderStatus,
    reissueRequestedAt: toMsOrNull(r.reissue_requested_at),
    adminMemo: (r.admin_memo as string | null) ?? null,
    downloadUrl: (r.download_url as string | null) ?? null,
    emailSentAt: toMsOrNull(r.email_sent_at),
    emailError: ((r.email_error ?? r.delivery_error) as string | null) ?? null,
    createdAt: toMs(r.created_at),
    approvedAt: toMsOrNull(r.approved_at),
    deliveredAt: toMsOrNull(r.delivered_at),
  };
}

export function mapDownloadToken(r: Record<string, unknown>): DownloadToken {
  return {
    id: String(r.id),
    orderId: String(r.order_id),
    productId: String(r.product_id),
    tokenHash: String(r.token_hash),
    expiresAt: toMs(r.expires_at),
    downloadCount: Number(r.download_count ?? 0),
    maxDownloads: Number(r.max_downloads ?? 3),
    lastDownloadedAt: toMsOrNull(r.last_downloaded_at),
    clientIpLog: String(r.client_ip_log ?? "[]"),
    isRevoked: Boolean(r.is_revoked ?? false),
    createdAt: toMs(r.created_at),
  };
}

export function mapOrderLog(r: Record<string, unknown>): OrderLog {
  return {
    id: Number(r.id),
    orderId: (r.order_id as string | null) ?? null,
    level: (r.level as "info" | "warn" | "error") ?? "info",
    message: String(r.message),
    createdAt: toMs(r.created_at),
  };
}
