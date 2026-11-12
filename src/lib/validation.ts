// 브라우저에서도 쓰는 파일이라 DB 스키마 모듈을 직접 불러오지 않음 (타입만 참조)
import type { PreferredChannel, PaymentMethod } from "../db/schema";

const CHANNELS: PreferredChannel[] = ["INSTAGRAM_DM", "EMAIL", "BOTH"];
const PAYMENT_METHODS: PaymentMethod[] = ["BANK", "KAKAOPAY", "TOSS"];

export const RE = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
  instagram: /^[a-z0-9._]{1,30}$/,
  phone: /^01[016789]\d{7,8}$/,
};

export type OrderInput = {
  productId: string;
  buyerName: string;
  depositorName: string;
  buyerEmail: string | null;
  buyerInstagram: string | null;
  buyerPhone: string;
  preferredChannel: PreferredChannel;
  paymentMethod: PaymentMethod;
};

export type FieldErrors = Partial<Record<keyof OrderInput | "agreeRefund" | "agreeCopyright", string>>;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

// 서버와 브라우저가 같은 규칙으로 검증
export function validateOrder(body: Record<string, unknown>): { ok: true; data: OrderInput } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const buyerName = str(body.buyerName);
  const depositorName = str(body.depositorName) || buyerName;
  const email = str(body.buyerEmail).toLowerCase();
  const instagram = str(body.buyerInstagram).toLowerCase().replace(/^@+/, "");
  const phone = str(body.buyerPhone).replace(/[\s-]/g, "");
  const channel = str(body.preferredChannel) as PreferredChannel;
  const method = str(body.paymentMethod) as PaymentMethod;

  if (!str(body.productId)) errors.productId = "자료를 선택해 주세요.";
  if (buyerName.length < 1 || buyerName.length > 20) errors.buyerName = "성함을 20자 이내로 입력해 주세요.";
  if (depositorName.length > 20) errors.depositorName = "입금자명을 20자 이내로 입력해 주세요.";
  if (!RE.phone.test(phone)) errors.buyerPhone = "휴대전화 번호를 확인해 주세요. 예: 010-1234-5678";
  if (!CHANNELS.includes(channel)) errors.preferredChannel = "받으실 방법을 선택해 주세요.";
  if (!PAYMENT_METHODS.includes(method)) errors.paymentMethod = "송금 방법을 선택해 주세요.";

  const needEmail = channel === "EMAIL" || channel === "BOTH";
  const needInsta = channel === "INSTAGRAM_DM" || channel === "BOTH";
  if (needEmail && !email) errors.buyerEmail = "이메일 주소를 입력해 주세요.";
  else if (email && !RE.email.test(email)) errors.buyerEmail = "이메일 주소 형식을 확인해 주세요.";
  if (needInsta && !instagram) errors.buyerInstagram = "인스타그램 아이디를 입력해 주세요.";
  else if (instagram && !RE.instagram.test(instagram))
    errors.buyerInstagram = "인스타그램 아이디는 영문 소문자, 숫자, 마침표, 밑줄만 쓸 수 있습니다.";

  if (body.agreeRefund !== true) errors.agreeRefund = "환불 규정에 동의해 주세요.";
  if (body.agreeCopyright !== true) errors.agreeCopyright = "복제 금지 안내에 동의해 주세요.";

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    data: {
      productId: str(body.productId),
      buyerName,
      depositorName,
      buyerEmail: email || null,
      buyerInstagram: instagram || null,
      buyerPhone: phone,
      preferredChannel: channel,
      paymentMethod: method,
    },
  };
}
