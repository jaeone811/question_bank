"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { won } from "@/lib/format";
import { validateOrder, type FieldErrors } from "@/lib/validation";
import { PdfPreview } from "./PdfPreview";

export type StoreProduct = {
  id: string;
  title: string;
  subject: string | null;
  grade: string;
  difficulty: string | null;
  questionCount: number | null;
  pageCount: number | null;
  price: number;
  description: string | null;
  sampleUrl: string | null;
};

type Pay = {
  bank: { name: string; account: string; holder: string };
  maxDownloads: number;
};

const dash = (v: string | number | null | undefined, unit = "") => (v === null || v === undefined || v === "" ? "미정" : `${v}${unit}`);

export function Storefront({ products, pay }: { products: StoreProduct[]; pay: Pay }) {
  const subjects = useMemo(() => [...new Set(products.map((p) => p.subject).filter(Boolean))] as string[], [products]);
  const grades = useMemo(() => [...new Set(products.map((p) => p.grade))], [products]);
  const [subject, setSubject] = useState<string | null>(null);
  const [grade, setGrade] = useState<string | null>(null);
  const [featuredId, setFeaturedId] = useState<string | null>(null);
  const [sample, setSample] = useState<StoreProduct | null>(null);
  const [buying, setBuying] = useState<StoreProduct | null>(null);

  const shown = products.filter((p) => (!subject || p.subject === subject) && (!grade || p.grade === grade));
  const featured = shown.find((p) => p.id === featuredId) ?? shown.find((p) => p.sampleUrl) ?? shown[0] ?? null;

  return (
    <>
      <section className="hero" data-enter>
        <div className="wrap hero__grid">
          <div className="hero__copy">
            <p className="eyebrow">고2 기말고사 대비</p>
            <h1><span>고2 내신 변형 문제,</span> <span>샘플을 먼저 확인하고</span> <span>구매하세요</span></h1>
            <p className="lead">
              학교 시험 범위에 맞춰 만든 변형 문제 PDF입니다. 구매 전에 앞 2쪽을 그대로 보여 드리고, 입금이 확인되면 5시간 동안 유효한 다운로드 링크를 인스타그램 DM이나 이메일로 보내 드립니다.
            </p>

            {products.length > 0 ? (
              <>
                <div className="filters" role="group" aria-label="과목으로 찾기">
                  <span className="filters__label">과목</span>
                  <Chip on={subject === null} onClick={() => setSubject(null)}>전체</Chip>
                  {subjects.map((s) => (
                    <Chip key={s} on={subject === s} onClick={() => setSubject(s)}>{s}</Chip>
                  ))}
                </div>
                {grades.length > 1 ? (
                  <div className="filters" role="group" aria-label="학년으로 찾기">
                    <span className="filters__label">학년</span>
                    <Chip on={grade === null} onClick={() => setGrade(null)}>전체</Chip>
                    {grades.map((g) => (
                      <Chip key={g} on={grade === g} onClick={() => setGrade(g)}>{g}</Chip>
                    ))}
                  </div>
                ) : null}
                <div className="hero__cta">
                  <a className="btn btn--primary" href="#catalog">자료 목록 보기</a>
                  {featured?.sampleUrl ? (
                    <button type="button" className="btn btn--ghost" onClick={() => setSample(featured)}>샘플 2쪽 펼쳐 보기</button>
                  ) : null}
                </div>
                <p className="hero__fact">
                  현재 판매 중인 PDF 자료 <b className="num">{products.length}</b>종, 무료 샘플 <b className="num">{products.filter((p) => p.sampleUrl).length}</b>종
                </p>
              </>
            ) : (
              <p className="notice">자료를 준비하고 있습니다. 등록되는 대로 이곳에 표시됩니다.</p>
            )}
          </div>

          {featured ? (
            <div className="hero__show">
              <button
                type="button"
                className="sheet"
                onClick={() => featured.sampleUrl && setSample(featured)}
                disabled={!featured.sampleUrl}
                aria-label={`${featured.title} 샘플 크게 보기`}
              >
                {featured.sampleUrl ? (
                  <PdfPreview key={featured.sampleUrl} url={featured.sampleUrl} label={`${featured.title} 샘플`} />
                ) : (
                  <span className="sheet__empty">샘플을 준비하고 있습니다</span>
                )}
              </button>
              <div className="spec">
                <p className="spec__subject">{featured.subject ?? "자료"}</p>
                <h2 className="spec__title">{featured.title}</h2>
                <dl className="spec__list">
                  <div><dt>난이도</dt><dd>{dash(featured.difficulty)}</dd></div>
                  <div><dt>문항 수</dt><dd className="num">{dash(featured.questionCount, "문항")}</dd></div>
                  <div><dt>분량</dt><dd className="num">{dash(featured.pageCount, "쪽")}</dd></div>
                  <div><dt>형식</dt><dd>PDF</dd></div>
                  <div className="spec__price"><dt>가격</dt><dd className="num">{won(featured.price)}원</dd></div>
                </dl>
                <button type="button" className="btn btn--primary btn--block" onClick={() => setBuying(featured)}>이 자료 구매하기</button>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {products.length > 0 ? (
        <section className="section" id="catalog">
          <div className="wrap">
            <div className="section__head">
              <h2>자료 목록과 가격</h2>
              <p>행을 누르면 위쪽 미리보기가 해당 자료로 바뀝니다.</p>
            </div>
            <div className="catalog" role="table" aria-label="판매 중인 자료">
              <div className="catalog__head" role="row">
                <span role="columnheader">과목</span>
                <span role="columnheader">자료</span>
                <span role="columnheader">난이도</span>
                <span role="columnheader" className="r">문항</span>
                <span role="columnheader" className="r">분량</span>
                <span role="columnheader" className="r">가격</span>
                <span role="columnheader" className="sr">선택</span>
              </div>
              {shown.map((p) => (
                <div className="catalog__row" role="row" key={p.id} data-current={featured?.id === p.id || undefined}>
                  <span role="cell" className="catalog__subject">{p.subject ?? "기타"}</span>
                  <span role="cell" className="catalog__main">
                    <button type="button" className="catalog__title" onClick={() => { setFeaturedId(p.id); document.querySelector(".hero__show")?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>
                      {p.title}
                    </button>
                    {p.description ? <span className="catalog__desc">{p.description}</span> : null}
                  </span>
                  <span role="cell" data-label="난이도">{dash(p.difficulty)}</span>
                  <span role="cell" data-label="문항" className="num r">{dash(p.questionCount)}</span>
                  <span role="cell" data-label="분량" className="num r">{dash(p.pageCount, "쪽")}</span>
                  <span role="cell" data-label="가격" className="num r catalog__price">{won(p.price)}원</span>
                  <span role="cell" className="catalog__actions">
                    <button type="button" className="btn btn--ghost btn--sm" disabled={!p.sampleUrl} onClick={() => setSample(p)}>
                      {p.sampleUrl ? "샘플 보기" : "샘플 준비 중"}
                    </button>
                    <button type="button" className="btn btn--primary btn--sm" onClick={() => setBuying(p)}>구매하기</button>
                  </span>
                </div>
              ))}
              {shown.length === 0 ? <p className="catalog__none">선택하신 조건에 맞는 자료가 없습니다.</p> : null}
            </div>
          </div>
        </section>
      ) : null}

      <section className="section section--alt" id="how">
        <div className="wrap split">
          <div className="split__aside">
            <h2>구매 절차</h2>
            <p>결제 대행사를 거치지 않고 계좌이체로 진행합니다. 입금 확인 후 즉시 링크가 발송됩니다.</p>
          </div>
          <ol className="steps">
            <li><b>샘플 확인</b><span>자료마다 앞 2쪽을 그대로 보실 수 있습니다.</span></li>
            <li><b>계좌 송금 후 주문서 제출</b><span>안내된 계좌로 입금하시고 통장에 표시되는 입금자명을 적어 주세요.</span></li>
            <li><b>입금 확인</b><span>주문 조회 화면에서 진행 상황을 바로 확인하실 수 있습니다.</span></li>
            <li><b>다운로드 링크 수령</b><span>승인 시각부터 5시간 동안, 최대 {pay.maxDownloads}회 받으실 수 있습니다.</span></li>
          </ol>
        </div>
      </section>

      <section className="section" id="policy">
        <div className="wrap split">
          <div className="split__aside">
            <h2>환불과 이용 안내</h2>
          </div>
          <dl className="policy">
            <div><dt>환불</dt><dd>디지털 자료 특성상 다운로드 링크가 발송된 뒤에는 환불이 어렵습니다. 링크 발송 전에는 요청하시면 전액 환불해 드립니다.</dd></div>
            <div><dt>워터마크</dt><dd>받으시는 PDF의 모든 쪽에 구매자 성함, 연락처, 주문번호가 반투명하게 표시됩니다.</dd></div>
            <div><dt>복제 금지</dt><dd>자료는 구매하신 분의 개인 학습용입니다. 공유, 재배포, 재판매는 허용되지 않습니다.</dd></div>
            <div><dt>링크 만료</dt><dd>5시간이 지났거나 횟수를 모두 쓰신 경우 재발급을 요청하실 수 있습니다.</dd></div>
          </dl>
        </div>
      </section>

      {sample ? <SampleModal product={sample} onClose={() => setSample(null)} onBuy={() => { setBuying(sample); setSample(null); }} /> : null}
      {buying ? <Checkout product={buying} pay={pay} onClose={() => setBuying(null)} /> : null}
    </>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className="chip" aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  );
}

// 모달/서랍 공통: ESC 로 닫기, 배경 스크롤 잠금, 열릴 때 포커스 이동
function useOverlay(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prev?.focus();
    };
  }, [onClose]);
  return ref;
}

function SampleModal({ product, onClose, onBuy }: { product: StoreProduct; onClose: () => void; onBuy: () => void }) {
  const ref = useOverlay(onClose);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="sample-title" tabIndex={-1} ref={ref}>
        <header className="modal__head">
          <div>
            <p className="eyebrow">무료 샘플</p>
            <h2 id="sample-title">{product.title}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="샘플 닫기">닫기</button>
        </header>
        <div className="modal__body">
          <PdfPreview url={product.sampleUrl!} maxPages={2} label={`${product.title} 샘플`} />
        </div>
        <footer className="modal__foot">
          <span className="num modal__price">{won(product.price)}원</span>
          <a className="btn btn--ghost" href={product.sampleUrl!} target="_blank" rel="noopener">새 창에서 열기</a>
          <button type="button" className="btn btn--primary" onClick={onBuy}>구매하기</button>
        </footer>
      </div>
    </div>
  );
}

type Channel = "INSTAGRAM_DM" | "EMAIL" | "BOTH";

function Checkout({ product, pay, onClose }: { product: StoreProduct; pay: Pay; onClose: () => void }) {
  const ref = useOverlay(onClose);
  const router = useRouter();
  const [channel, setChannel] = useState<Channel>("INSTAGRAM_DM");
  const [f, setF] = useState({ buyerName: "", depositorName: "", buyerPhone: "", buyerInstagram: "", buyerEmail: "" });
  const [depositorTouched, setDepositorTouched] = useState(false);
  const [agree, setAgree] = useState({ refund: false, copyright: false });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const set = (k: keyof typeof f, v: string) => {
    setF((s) => ({ ...s, [k]: v, ...(k === "buyerName" && !depositorTouched ? { depositorName: v } : {}) }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const copyAccount = async () => {
    try {
      await navigator.clipboard.writeText(pay.bank.account.replace(/[^0-9]/g, ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setFormError("복사하지 못했습니다. 계좌번호를 길게 눌러 직접 복사해 주세요.");
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    const body = { productId: product.id, ...f, preferredChannel: channel, paymentMethod: "BANK" as const, agreeRefund: agree.refund, agreeCopyright: agree.copyright };
    const v = validateOrder(body);
    if (!v.ok) {
      setErrors(v.errors);
      const first = Object.keys(v.errors)[0];
      (document.querySelector(`[data-field="${first}"]`) as HTMLElement | null)?.focus();
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const res = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) {
        if (json.errors) setErrors(json.errors);
        setFormError(json.error ?? "주문을 접수하지 못했습니다.");
        return;
      }
      try {
        const key = "qb_orders_v2";
        const list = JSON.parse(localStorage.getItem(key) ?? "[]") as string[];
        localStorage.setItem(key, JSON.stringify([json.data.orderNumber, ...list].slice(0, 20)));
      } catch {
        // 저장 불가 환경이어도 주문은 접수됨
      }
      router.push(`/orders/${json.data.orderNumber}`);
    } catch {
      setFormError("네트워크 오류로 주문을 접수하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const needInsta = channel !== "EMAIL";
  const needEmail = channel !== "INSTAGRAM_DM";

  return (
    <div className="overlay overlay--drawer" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="checkout-title" tabIndex={-1} ref={ref}>
        <header className="modal__head">
          <div>
            <p className="eyebrow">주문서</p>
            <h2 id="checkout-title">{product.title}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="주문서 닫기">닫기</button>
        </header>

        <form className="drawer__body" onSubmit={submit} noValidate>
          <fieldset className="block">
            <legend><span className="step-no">1</span>계좌이체 송금하기</legend>
            <div className="amount">
              <span>입금하실 금액</span>
              <b className="num">{won(product.price)}원</b>
            </div>

            {pay.bank.account ? (
              <div className="paycard">
                <dl>
                  <div><dt>은행</dt><dd>{pay.bank.name}</dd></div>
                  <div><dt>계좌번호</dt><dd className="num paycard__acct">{pay.bank.account}</dd></div>
                  <div><dt>예금주</dt><dd>{pay.bank.holder}</dd></div>
                </dl>
                <button type="button" className="btn btn--ghost btn--block" onClick={copyAccount} aria-live="polite">
                  {copied ? "복사했습니다" : "계좌번호 복사"}
                </button>
              </div>
            ) : (
              <p className="notice">계좌 정보가 아직 등록되지 않았습니다. 판매자에게 문의해 주세요.</p>
            )}
          </fieldset>

          <fieldset className="block">
            <legend><span className="step-no">2</span>주문자 정보</legend>
            <Field label="구매자 성함" error={errors.buyerName}>
              <input data-field="buyerName" value={f.buyerName} onChange={(e) => set("buyerName", e.target.value)} maxLength={20} autoComplete="name" required />
            </Field>
            <Field label="실제 입금자명" hint="통장에 찍히는 이름입니다. 구매자 성함과 다르면 고쳐 주세요." error={errors.depositorName}>
              <input data-field="depositorName" value={f.depositorName} onChange={(e) => { setDepositorTouched(true); set("depositorName", e.target.value); }} maxLength={20} required />
            </Field>
            <Field label="연락처" hint="발송에 문제가 있을 때만 연락드립니다." error={errors.buyerPhone}>
              <input data-field="buyerPhone" className="num" value={f.buyerPhone} onChange={(e) => set("buyerPhone", e.target.value)} inputMode="tel" autoComplete="tel" placeholder="010-1234-5678" required />
            </Field>

            <div className="field">
              <span className="field__label" id="ch-label">다운로드 링크 받으실 곳</span>
              <div className="seg" role="radiogroup" aria-labelledby="ch-label">
                {([["INSTAGRAM_DM", "인스타그램 DM"], ["EMAIL", "이메일"], ["BOTH", "둘 다"]] as const).map(([id, label]) => (
                  <button key={id} type="button" role="radio" aria-checked={channel === id} className="seg__btn" onClick={() => setChannel(id)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {needInsta ? (
              <>
                <p className="notice notice--wait">
                  <b>인스타그램 비공개 계정 안내:</b> 계정이 <b>비공개</b>이거나 메시지 요청 허용이 꺼져 있으면 DM 발송이 불가능합니다. 링크 수령 전까지 <b>비공개를 해제</b>해 주시거나, 위에서 <b>이메일</b>(또는 <b>둘 다</b>) 수령을 선택해 주세요.
                </p>
                <Field label="인스타그램 아이디" hint="비공개 계정은 반드시 공개로 전환해 주세요. 발송된 메시지는 '메시지 요청함'에 들어갈 수 있습니다." error={errors.buyerInstagram}>
                  <span className="prefixed">
                    <span aria-hidden="true">@</span>
                    <input data-field="buyerInstagram" className="num" value={f.buyerInstagram} onChange={(e) => set("buyerInstagram", e.target.value.replace(/^@+/, "").toLowerCase())} maxLength={30} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="my.instagram" />
                  </span>
                </Field>
              </>
            ) : null}
            {needEmail ? (
              <Field label="이메일 주소" error={errors.buyerEmail}>
                <input data-field="buyerEmail" type="email" value={f.buyerEmail} onChange={(e) => set("buyerEmail", e.target.value)} autoComplete="email" placeholder="name@example.com" />
              </Field>
            ) : null}
          </fieldset>

          <fieldset className="block">
            <legend><span className="step-no">3</span>확인 사항</legend>
            <label className="check">
              <input data-field="agreeRefund" type="checkbox" checked={agree.refund} onChange={(e) => setAgree((a) => ({ ...a, refund: e.target.checked }))} />
              <span>다운로드 링크가 발송된 뒤에는 환불이 어렵다는 점을 확인했습니다.</span>
            </label>
            {errors.agreeRefund ? <p className="field__error">{errors.agreeRefund}</p> : null}
            <label className="check">
              <input data-field="agreeCopyright" type="checkbox" checked={agree.copyright} onChange={(e) => setAgree((a) => ({ ...a, copyright: e.target.checked }))} />
              <span>자료를 공유하거나 재판매하지 않으며, PDF에 제 성함과 연락처, 주문번호가 워터마크로 들어가는 것에 동의합니다.</span>
            </label>
            {errors.agreeCopyright ? <p className="field__error">{errors.agreeCopyright}</p> : null}
          </fieldset>

          <div className="drawer__foot">
            {formError ? <p className="field__error" role="alert">{formError}</p> : null}
            <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={busy}>
              {busy ? "접수하고 있습니다" : "송금했습니다, 입금 확인 요청하기"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="field" data-invalid={error ? true : undefined}>
      <span className="field__label">{label}</span>
      {children}
      {error ? <span className="field__error" role="alert">{error}</span> : hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
}
