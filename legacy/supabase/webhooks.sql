-- =========================================================
-- 주문 INSERT / UPDATE 시 notify-order Edge Function 호출
-- (Dashboard > Database > Webhooks 에서 GUI 로 만들어도 동일함)
--
-- <PROJECT_REF>     : 프로젝트 ref (https://<PROJECT_REF>.supabase.co)
-- <WEBHOOK_SECRET>  : supabase secrets set WEBHOOK_SECRET=... 로 넣은 값과 동일하게
-- 이 파일은 실제 값 채운 채로 git 에 커밋하지 말 것!
-- =========================================================

drop trigger if exists "orders_notify_insert" on public.orders;
create trigger "orders_notify_insert"
  after insert on public.orders
  for each row
  execute function supabase_functions.http_request(
    'https://<PROJECT_REF>.supabase.co/functions/v1/notify-order',
    'POST',
    '{"Content-Type":"application/json","x-webhook-secret":"<WEBHOOK_SECRET>"}',
    '{}',
    '5000'
  );

drop trigger if exists "orders_notify_update" on public.orders;
create trigger "orders_notify_update"
  after update of status on public.orders
  for each row
  when (old.status is distinct from new.status)
  execute function supabase_functions.http_request(
    'https://<PROJECT_REF>.supabase.co/functions/v1/notify-order',
    'POST',
    '{"Content-Type":"application/json","x-webhook-secret":"<WEBHOOK_SECRET>"}',
    '{}',
    '5000'
  );
