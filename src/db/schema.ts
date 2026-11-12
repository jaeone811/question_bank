import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

// 시각은 전부 epoch 밀리초(integer)

export const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  subject: text("subject"),
  grade: text("grade").notNull().default("고2"),
  difficulty: text("difficulty"), // '기본' | '표준' | '심화' 등 자유 입력
  questionCount: integer("question_count"),
  pageCount: integer("page_count"), // 업로드한 PDF 에서 자동 계산
  price: integer("price").notNull(),
  description: text("description"),
  samplePdfUrl: text("sample_pdf_url"), // storage/samples 안의 파일명 (공개)
  originalFilePath: text("original_file_path"), // storage/private/questions 안의 파일명 (비공개)
  originalFileName: text("original_file_name"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

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

export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    orderNumber: text("order_number").notNull().unique(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    buyerName: text("buyer_name").notNull(),
    depositorName: text("depositor_name").notNull(),
    buyerEmail: text("buyer_email"),
    buyerInstagram: text("buyer_instagram"),
    buyerPhone: text("buyer_phone").notNull(),
    preferredChannel: text("preferred_channel").$type<PreferredChannel>().notNull(),
    paymentMethod: text("payment_method").$type<PaymentMethod>().notNull(),
    totalAmount: integer("total_amount").notNull(),
    status: text("status").$type<OrderStatus>().notNull().default("PENDING_VERIFICATION"),
    agentSeenAt: integer("agent_seen_at"), // 에이전트가 주문서를 확인한 시각
    reissueRequestedAt: integer("reissue_requested_at"),
    adminMemo: text("admin_memo"),
    createdAt: integer("created_at").notNull(),
    approvedAt: integer("approved_at"),
    deliveredAt: integer("delivered_at"),
  },
  (t) => [index("orders_status_idx").on(t.status, t.createdAt)],
);

export const downloadTokens = sqliteTable(
  "download_tokens",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: integer("expires_at").notNull(), // 승인 시각 + 5시간
    downloadCount: integer("download_count").notNull().default(0),
    maxDownloads: integer("max_downloads").notNull().default(3),
    lastDownloadedAt: integer("last_downloaded_at"),
    clientIpLog: text("client_ip_log").notNull().default("[]"), // JSON [{ip, at}]
    isRevoked: integer("is_revoked", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("download_tokens_order_idx").on(t.orderId)],
);

export const TASK_TYPES = ["SEND_RECEIPT_ACK", "SEND_DOWNLOAD_LINK"] as const;
export type TaskType = (typeof TASK_TYPES)[number];
export const TASK_CHANNELS = ["INSTAGRAM", "EMAIL"] as const;
export type TaskChannel = (typeof TASK_CHANNELS)[number];
export const TASK_STATUSES = ["QUEUED", "RUNNING", "AWAITING_HUMAN_AUTH", "COMPLETED", "FAILED", "SKIPPED"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const agentTasks = sqliteTable(
  "agent_tasks",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    taskType: text("task_type").$type<TaskType>().notNull(),
    targetChannel: text("target_channel").$type<TaskChannel>().notNull(),
    status: text("status").$type<TaskStatus>().notNull().default("QUEUED"),
    // JSON { downloadUrl?, expiresAt?, message? } : 발송에 필요한 값. 완료되면 링크는 지움
    payload: text("payload").notNull().default("{}"),
    attempts: integer("attempts").notNull().default(0),
    screenshotPath: text("screenshot_path"),
    errorMessage: text("error_message"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("agent_tasks_status_idx").on(t.status, t.createdAt)],
);

export const agentLogs = sqliteTable("agent_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: text("task_id"),
  orderId: text("order_id"),
  level: text("level").$type<"info" | "warn" | "error">().notNull().default("info"),
  message: text("message").notNull(),
  screenshotPath: text("screenshot_path"),
  createdAt: integer("created_at").notNull(),
});

// 워커 heartbeat, 로그인 상태 등 단순 키-값
export const agentState = sqliteTable("agent_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export type Product = typeof products.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type DownloadToken = typeof downloadTokens.$inferSelect;
export type AgentTask = typeof agentTasks.$inferSelect;
export type AgentLog = typeof agentLogs.$inferSelect;
