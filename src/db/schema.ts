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

// Supabase row (snake_case) -> App type (camelCase)
export function mapProduct(r: Record<string, unknown>): Product {
  return {
    id: String(r.id),
    title: String(r.title),
    subject: (r.subject as string | null) ?? null,
    grade: String(r.grade ?? "고2"),
    difficulty: (r.difficulty as string | null) ?? null,
    questionCount: r.question_count != null ? Number(r.question_count) : null,
    pageCount: r.page_count != null ? Number(r.page_count) : null,
    price: Number(r.price),
    description: (r.description as string | null) ?? null,
    samplePdfUrl: (r.sample_pdf_url as string | null) ?? null,
    originalFilePath: (r.original_file_path as string | null) ?? null,
    originalFileName: (r.original_file_name as string | null) ?? null,
    sortOrder: Number(r.sort_order ?? 0),
    isActive: Boolean(r.is_active ?? true),
    createdAt: Number(r.created_at ?? Date.now()),
    updatedAt: Number(r.updated_at ?? Date.now()),
  };
}

export function mapOrder(r: Record<string, unknown>): Order {
  return {
    id: String(r.id),
    orderNumber: String(r.order_number),
    productId: String(r.product_id),
    buyerName: String(r.buyer_name),
    depositorName: String(r.depositor_name),
    buyerEmail: (r.buyer_email as string | null) ?? null,
    buyerInstagram: (r.buyer_instagram as string | null) ?? null,
    buyerPhone: String(r.buyer_phone),
    preferredChannel: r.preferred_channel as PreferredChannel,
    paymentMethod: r.payment_method as PaymentMethod,
    totalAmount: Number(r.total_amount),
    status: r.status as OrderStatus,
    reissueRequestedAt: r.reissue_requested_at != null ? Number(r.reissue_requested_at) : null,
    adminMemo: (r.admin_memo as string | null) ?? null,
    downloadUrl: (r.download_url as string | null) ?? null,
    emailSentAt: r.email_sent_at != null ? Number(r.email_sent_at) : null,
    emailError: (r.email_error as string | null) ?? null,
    createdAt: Number(r.created_at),
    approvedAt: r.approved_at != null ? Number(r.approved_at) : null,
    deliveredAt: r.delivered_at != null ? Number(r.delivered_at) : null,
  };
}

export function mapDownloadToken(r: Record<string, unknown>): DownloadToken {
  return {
    id: String(r.id),
    orderId: String(r.order_id),
    productId: String(r.product_id),
    tokenHash: String(r.token_hash),
    expiresAt: Number(r.expires_at),
    downloadCount: Number(r.download_count ?? 0),
    maxDownloads: Number(r.max_downloads ?? 3),
    lastDownloadedAt: r.last_downloaded_at != null ? Number(r.last_downloaded_at) : null,
    clientIpLog: String(r.client_ip_log ?? "[]"),
    isRevoked: Boolean(r.is_revoked ?? false),
    createdAt: Number(r.created_at),
  };
}

export function mapOrderLog(r: Record<string, unknown>): OrderLog {
  return {
    id: Number(r.id),
    orderId: (r.order_id as string | null) ?? null,
    level: (r.level as "info" | "warn" | "error") ?? "info",
    message: String(r.message),
    createdAt: Number(r.created_at),
  };
}
