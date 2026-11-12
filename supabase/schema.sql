-- =========================================================
-- 기말고사 문제은행 (Next.js + Supabase + 피클 AI 버전)
-- Supabase Dashboard > SQL Editor 에 통째로 붙여넣고 [Run] 을 눌러 주세요.
-- =========================================================

-- 기존 legacy 트리거/함수 정리 (있을 경우에만)
drop trigger if exists trg_products_updated_at on public.products;
drop trigger if exists trg_orders_approved_at on public.orders;

-- 1. 패키지(상품) 테이블
create table if not exists public.products (
  id                 text primary key,
  title              text not null,
  subject            text,
  grade              text not null default '고2',
  difficulty         text,
  question_count     integer,
  page_count         integer,
  price              integer not null,
  description        text,
  sample_pdf_url     text,                      -- 공개 버킷 'samples' 안의 파일명
  original_file_path text,                      -- 비공개 버킷 'questions' 안의 파일명
  original_file_name text,
  sort_order         integer not null default 0,
  is_active          boolean not null default true,
  created_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at         bigint not null default (extract(epoch from now()) * 1000)::bigint
);

-- 기존 legacy 테이블이 이미 만들어져 있던 경우 컬럼 및 타입 호환 패치
alter table public.products add column if not exists grade text not null default '고2';
alter table public.products add column if not exists difficulty text;
alter table public.products add column if not exists question_count integer;
alter table public.products add column if not exists page_count integer;
alter table public.products add column if not exists sample_pdf_url text;
alter table public.products add column if not exists original_file_path text;
alter table public.products add column if not exists original_file_name text;
alter table public.products add column if not exists sort_order integer not null default 0;
alter table public.products add column if not exists is_active boolean not null default true;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'created_at' and data_type <> 'bigint'
  ) then
    alter table public.products alter column created_at drop default;
    alter table public.products alter column created_at type bigint using (extract(epoch from created_at) * 1000)::bigint;
    alter table public.products alter column created_at set default (extract(epoch from now()) * 1000)::bigint;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'updated_at' and data_type <> 'bigint'
  ) then
    alter table public.products alter column updated_at drop default;
    alter table public.products alter column updated_at type bigint using (extract(epoch from updated_at) * 1000)::bigint;
    alter table public.products alter column updated_at set default (extract(epoch from now()) * 1000)::bigint;
  end if;
end $$;

-- 2. 주문 테이블
create table if not exists public.orders (
  id                   text primary key,
  order_number         text not null unique,
  product_id           text not null references public.products(id),
  buyer_name           text not null,
  depositor_name       text not null,
  buyer_email          text,
  buyer_instagram      text,
  buyer_phone          text not null,
  preferred_channel    text not null,           -- 'INSTAGRAM_DM' | 'EMAIL' | 'BOTH'
  payment_method       text not null,           -- 'BANK' | 'KAKAOPAY' | 'TOSS'
  total_amount         integer not null,
  status               text not null default 'PENDING_VERIFICATION',
  reissue_requested_at bigint,
  admin_memo           text,
  download_url         text,                    -- 최신 발급된 5시간 다운로드 링크 (피클 AI / 관리자 전달용)
  email_sent_at        bigint,
  email_error          text,
  created_at           bigint not null default (extract(epoch from now()) * 1000)::bigint,
  approved_at          bigint,
  delivered_at         bigint
);

create index if not exists orders_status_idx on public.orders (status, created_at desc);
create index if not exists orders_instagram_idx on public.orders (buyer_instagram);
create index if not exists orders_phone_idx on public.orders (buyer_phone);

-- 3. 다운로드 토큰 테이블 (SHA-256 해시만 저장, 승인 후 5시간 · 기본 3회 제한)
create table if not exists public.download_tokens (
  id                 text primary key,
  order_id           text not null references public.orders(id) on delete cascade,
  product_id         text not null references public.products(id),
  token_hash         text not null unique,
  expires_at         bigint not null,
  download_count     integer not null default 0,
  max_downloads      integer not null default 3,
  last_downloaded_at bigint,
  client_ip_log      text not null default '[]',
  is_revoked         boolean not null default false,
  created_at         bigint not null default (extract(epoch from now()) * 1000)::bigint
);

create index if not exists download_tokens_order_idx on public.download_tokens (order_id);

-- 4. 주문/발송 처리 로그 테이블
create table if not exists public.order_logs (
  id         bigserial primary key,
  order_id   text,
  level      text not null default 'info',
  message    text not null,
  created_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);

create index if not exists order_logs_created_idx on public.order_logs (id desc);

-- 5. RLS 활성화 (Next.js 서버가 SUPABASE_SERVICE_ROLE_KEY 로만 접근하므로 외부 직접 접근 차단)
alter table public.products        enable row level security;
alter table public.orders          enable row level security;
alter table public.download_tokens enable row level security;
alter table public.order_logs      enable row level security;

-- 6. Storage 버킷 생성
-- questions: 원본 PDF/HWP/ZIP (비공개 — 서버가 워터마크 삽입 후 내려보냄)
-- samples  : 샘플 2쪽 PDF (공개)
insert into storage.buckets (id, name, public)
values ('questions', 'questions', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('samples', 'samples', true)
on conflict (id) do nothing;

-- 7. 기본 고2 예시 패키지 3종 (관리자 페이지에서 원본 PDF를 올리기 전까지는 사이트에 노출되지 않음)
insert into public.products (id, subject, title, description, price, sort_order, is_active, created_at, updated_at)
values
  ('h2-eng',  '영어', '영어Ⅰ 모의고사 변형', '최근 모의고사 지문을 내신형으로 변형한 문제입니다.',       10900, 10, true, (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint),
  ('h2-kor',  '국어', '문학 (천재 김동환)',   '현대시·고전시가·소설 작품별 핵심 개념과 변형 문제입니다.', 10900, 20, true, (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint),
  ('h2-math', '수학', '수학Ⅰ 지수·로그함수', '단원별 기본·심화 문항과 학교 기출 유형 변형을 담았습니다.', 9900,  30, true, (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint)
on conflict (id) do nothing;
