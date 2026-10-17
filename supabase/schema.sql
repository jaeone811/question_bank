-- =========================================================
-- 기말고사 문제은행 - Supabase 스키마
-- Supabase Dashboard > SQL Editor 에 통째로 붙여넣고 Run
-- =========================================================

-- ---------- 1. 상품 ----------
create table if not exists public.products (
  id          text primary key,                -- 프론트 PRODUCTS[].id 와 동일 (예: 'h1-eng')
  title       text not null,
  price       integer not null check (price > 0),
  file_path   text not null,                   -- 비공개 Storage 버킷 'products' 안의 경로 (예: 'h1-eng/full.pdf')
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------- 2. 주문 ----------
create table if not exists public.orders (
  id               uuid primary key default gen_random_uuid(),
  order_no         text not null unique,
  buyer_name       text not null check (char_length(buyer_name) between 1 and 20),
  delivery_method  text not null default 'EMAIL' check (delivery_method in ('EMAIL', 'INSTAGRAM')),
  email            text check (email ~* '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'),
  instagram_id     text check (instagram_id ~ '^[a-z0-9._]{1,30}$'),
  product_id       text not null references public.products(id),
  payment_method   text not null check (payment_method in ('KAKAOPAY', 'BANK', 'TOSS')),
  amount           integer not null check (amount > 0),
  status           text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  admin_memo       text,
  created_at       timestamptz not null default now(),
  approved_at      timestamptz,
  delivered_at        timestamptz,               -- EMAIL: 첨부 메일 발송 성공 시각 / INSTAGRAM: 관리자가 DM 발송 완료 체크한 시각
  delivery_error      text,                      -- 발송 실패 사유 (관리자 페이지에 표시)
  download_url        text,                      -- INSTAGRAM: 5시간짜리 Signed URL (관리자만 조회 가능)
  download_expires_at timestamptz
);
-- 이전 버전(다운로드 링크 방식) 스키마를 이미 실행했다면 컬럼 정리
alter table public.orders drop column if exists download_count;
alter table public.orders drop column if exists download_limit;
alter table public.orders drop column if exists last_download_at;
alter table public.orders add column if not exists delivered_at timestamptz;
alter table public.orders add column if not exists delivery_error text;
-- 인스타그램 수령 추가 (이전 버전에서 업그레이드하는 경우)
alter table public.orders add column if not exists delivery_method text not null default 'EMAIL'
  check (delivery_method in ('EMAIL', 'INSTAGRAM'));
alter table public.orders add column if not exists instagram_id text check (instagram_id ~ '^[a-z0-9._]{1,30}$');
alter table public.orders add column if not exists download_url text;
alter table public.orders add column if not exists download_expires_at timestamptz;
alter table public.orders alter column email drop not null;
-- 받는 방법에 맞는 연락처가 반드시 있어야 함
alter table public.orders drop constraint if exists orders_contact_chk;
alter table public.orders add constraint orders_contact_chk check (
  (delivery_method = 'EMAIL' and email is not null) or
  (delivery_method = 'INSTAGRAM' and instagram_id is not null)
);
create index if not exists orders_status_created_idx on public.orders (status, created_at desc);
create index if not exists orders_email_idx on public.orders (email);

-- ---------- 3. 관리자 ----------
-- Authentication > Users 에서 관리자 계정 만든 뒤:
--   insert into public.admins (user_id) values ('<그 유저의 UUID>');
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ---------- 4. RLS ----------
alter table public.products enable row level security;
alter table public.orders   enable row level security;
alter table public.admins   enable row level security;

-- 상품: 활성 상품은 누구나 조회 가능 (file_path 는 비공개 버킷이라 노출돼도 접근 불가)
drop policy if exists "products read" on public.products;
create policy "products read" on public.products for select using (is_active or public.is_admin());
drop policy if exists "products admin write" on public.products;
create policy "products admin write" on public.products for all
  using (public.is_admin()) with check (public.is_admin());

-- 주문: anon 은 테이블 직접 접근 불가 (아래 RPC 로만). 관리자만 조회/수정.
drop policy if exists "orders admin read" on public.orders;
create policy "orders admin read" on public.orders for select using (public.is_admin());
drop policy if exists "orders admin update" on public.orders;
create policy "orders admin update" on public.orders for update
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins self read" on public.admins;
create policy "admins self read" on public.admins for select using (user_id = auth.uid());

-- ---------- 5. 승인 시각 자동 기록 ----------
create or replace function public.orders_set_approved_at()
returns trigger language plpgsql as $$
begin
  if new.status = 'APPROVED' and old.status is distinct from 'APPROVED' then
    new.approved_at := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_orders_approved_at on public.orders;
create trigger trg_orders_approved_at before update on public.orders
  for each row execute function public.orders_set_approved_at();

-- ---------- 6. RPC: 주문 생성 (anon 호출) ----------
-- 금액은 클라이언트 값을 믿지 않고 products.price 로 덮어씀
drop function if exists public.create_order(text, text, text, text, integer);
create or replace function public.create_order(
  p_buyer_name      text,
  p_product_id      text,
  p_payment_method  text,
  p_delivery_method text,
  p_email           text default null,
  p_instagram_id    text default null,
  p_amount          integer default null
)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_price integer;
  v_row   public.orders;
begin
  select price into v_price from public.products where id = p_product_id and is_active;
  if v_price is null then
    raise exception 'INVALID_PRODUCT';
  end if;

  insert into public.orders (order_no, buyer_name, product_id, payment_method, amount,
                             delivery_method, email, instagram_id)
  values (
    'QB-' || to_char(now() at time zone 'Asia/Seoul', 'YYMMDD') || '-'
          || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    trim(p_buyer_name),
    p_product_id,
    p_payment_method,
    v_price,
    p_delivery_method,
    case when p_delivery_method = 'EMAIL' then nullif(lower(trim(p_email)), '') end,
    case when p_delivery_method = 'INSTAGRAM' then nullif(lower(ltrim(trim(p_instagram_id), '@')), '') end
  )
  returning * into v_row;

  return json_build_object(
    'order_no',   v_row.order_no,
    'amount',     v_row.amount,
    'status',     v_row.status,
    'created_at', v_row.created_at
  );
end $$;

-- ---------- 7. RPC: 주문 상태 조회 (주문번호 + 이메일/인스타 아이디 둘 다 맞아야 함) ----------
drop function if exists public.get_order_status(text, text);
create or replace function public.get_order_status(p_order_no text, p_contact text)
returns text
language sql stable security definer set search_path = public
as $$
  select status from public.orders
  where order_no = p_order_no
    and (email = lower(trim(p_contact)) or instagram_id = lower(ltrim(trim(p_contact), '@')));
$$;

-- (이전 버전의 다운로드 횟수 차감 함수 제거)
drop function if exists public.claim_download(text, text);

-- ---------- 9. 권한 ----------
revoke all on function public.create_order(text, text, text, text, text, text, integer) from public;
revoke all on function public.get_order_status(text, text)               from public;
grant execute on function public.create_order(text, text, text, text, text, text, integer) to anon, authenticated;
grant execute on function public.get_order_status(text, text)               to anon, authenticated;

-- ---------- 10. 비공개 Storage 버킷 ----------
-- 정책을 하나도 안 만들면 anon/authenticated 는 접근 불가, service_role(Edge Function)만 읽을 수 있음
insert into storage.buckets (id, name, public)
values ('products', 'products', false)
on conflict (id) do nothing;

-- ---------- 11. 샘플 상품 데이터 (프론트 PRODUCTS 와 맞춰서 수정) ----------
insert into public.products (id, title, price, file_path) values
  ('h1-eng',  '고1 영어 · 능률(민병천) 1~4과',      9900,  'h1-eng/full.pdf'),
  ('h1-kor',  '고1 국어 · 비상(박영민) 문학·비문학', 8900,  'h1-kor/full.pdf'),
  ('h1-math', '고1 수학 · 공통수학1 다항식~방정식',  9900,  'h1-math/full.pdf'),
  ('h2-kor',  '고2 국어 · 문학 (천재 김동환)',       10900, 'h2-kor/full.pdf'),
  ('h2-eng',  '고2 영어 · 영어Ⅰ 모의고사 변형',     10900, 'h2-eng/full.pdf'),
  ('h3-eng',  '고3 영어 · 수능특강 영어 변형',       12900, 'h3-eng/full.pdf')
on conflict (id) do update set title = excluded.title, price = excluded.price, file_path = excluded.file_path;
