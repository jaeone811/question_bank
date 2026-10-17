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
  email            text not null check (email ~* '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'),
  product_id       text not null references public.products(id),
  payment_method   text not null check (payment_method in ('KAKAOPAY', 'BANK', 'TOSS')),
  amount           integer not null check (amount > 0),
  status           text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  admin_memo       text,
  download_count   integer not null default 0,
  download_limit   integer not null default 3,  -- Signed URL 발급 가능 횟수 (다운 실패 대비 여유분)
  created_at       timestamptz not null default now(),
  approved_at      timestamptz,
  last_download_at timestamptz
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
create or replace function public.create_order(
  p_buyer_name     text,
  p_email          text,
  p_product_id     text,
  p_payment_method text,
  p_amount         integer default null
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

  insert into public.orders (order_no, buyer_name, email, product_id, payment_method, amount)
  values (
    'QB-' || to_char(now() at time zone 'Asia/Seoul', 'YYMMDD') || '-'
          || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    trim(p_buyer_name),
    lower(trim(p_email)),
    p_product_id,
    p_payment_method,
    v_price
  )
  returning * into v_row;

  return json_build_object(
    'order_no',   v_row.order_no,
    'amount',     v_row.amount,
    'status',     v_row.status,
    'created_at', v_row.created_at
  );
end $$;

-- ---------- 7. RPC: 주문 상태 조회 (주문번호 + 이메일 둘 다 맞아야 함) ----------
create or replace function public.get_order_status(p_order_no text, p_email text)
returns text
language sql stable security definer set search_path = public
as $$
  select status from public.orders
  where order_no = p_order_no and email = lower(trim(p_email));
$$;

-- ---------- 8. RPC: 다운로드 권한 차감 (Edge Function 의 service_role 만 호출) ----------
-- 원자적으로 count +1 하고 파일 경로 반환. 승인 안 됐거나 횟수 소진이면 0 rows.
create or replace function public.claim_download(p_order_no text, p_email text)
returns table (file_path text, remaining integer)
language sql security definer set search_path = public
as $$
  update public.orders o
     set download_count   = o.download_count + 1,
         last_download_at = now()
    from public.products p
   where o.order_no = p_order_no
     and o.email = lower(trim(p_email))
     and o.status = 'APPROVED'
     and o.download_count < o.download_limit
     and p.id = o.product_id
  returning p.file_path, o.download_limit - o.download_count;
$$;

-- ---------- 9. 권한 ----------
revoke all on function public.create_order(text, text, text, text, integer) from public;
revoke all on function public.get_order_status(text, text)               from public;
revoke all on function public.claim_download(text, text)                 from public, anon, authenticated;
grant execute on function public.create_order(text, text, text, text, integer) to anon, authenticated;
grant execute on function public.get_order_status(text, text)               to anon, authenticated;
grant execute on function public.claim_download(text, text)                 to service_role;

-- ---------- 10. 비공개 Storage 버킷 ----------
-- 정책을 하나도 안 만들면 anon/authenticated 는 접근 불가, service_role 만 Signed URL 생성 가능
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
