-- 참고용 구버전: 현재 운영 DB에 그대로 실행하지 마세요. database/README.md 참고.
-- =========================================================
-- 담픽 결제·픽업·집 앞 배송 기능 추가
-- 실행 위치: Supabase → SQL Editor → New query
-- 이 파일 전체 붙여넣기 → Run
-- 기존 customers / products / orders / order_items는 유지합니다.
-- =========================================================

create extension if not exists pgcrypto;

-- 1. 고객 결제·수령 신청 테이블
create table if not exists public.checkout_requests (
  id uuid primary key default gen_random_uuid(),
  request_code text not null unique,
  customer_id uuid not null
    references public.customers(id)
    on delete cascade,
  nickname_snapshot text not null,
  order_numbers text[] not null,
  order_key text not null,
  product_amount integer not null default 0
    check (product_amount >= 0),
  delivery_fee integer not null default 0
    check (delivery_fee >= 0),
  final_amount integer not null default 0
    check (final_amount >= 0),

  receipt_method text not null
    check (receipt_method in ('pickup', 'home')),

  payment_method text not null
    check (
      payment_method in (
        'pickup_pay',
        'bank_transfer',
        'card_online'
      )
    ),

  delivery_address text not null default '',
  entrance_info text not null default '',
  delivery_request text not null default '',

  payment_status text not null default '결제 대기',
  fulfillment_status text not null default '수령 방법 접수',
  request_status text not null default '신청',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (customer_id, order_key)
);

create index if not exists
checkout_requests_created_at_idx
on public.checkout_requests (created_at desc);

create index if not exists
checkout_requests_status_idx
on public.checkout_requests (
  request_status,
  payment_status,
  fulfillment_status
);

-- 2. RLS
alter table public.checkout_requests
enable row level security;

drop policy if exists
"authenticated checkout requests all"
on public.checkout_requests;

create policy
"authenticated checkout requests all"
on public.checkout_requests
for all
to authenticated
using (true)
with check (true);

-- anon 사용자는 테이블을 직접 읽거나 수정하지 못합니다.
-- 고객은 아래 SECURITY DEFINER 함수만 실행합니다.

-- 3. updated_at 자동 갱신
create or replace function
public.set_checkout_request_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists
checkout_requests_updated_at_trigger
on public.checkout_requests;

create trigger
checkout_requests_updated_at_trigger
before update on public.checkout_requests
for each row
execute function
public.set_checkout_request_updated_at();

-- 4. 고객 결제·배송 신청 함수
-- 합계와 배송비는 브라우저 값이 아니라 DB에서 다시 계산합니다.
create or replace function
public.submit_checkout_request(
  p_nickname text,
  p_order_numbers text[],
  p_receipt_method text,
  p_payment_method text,
  p_delivery_address text default '',
  p_entrance_info text default '',
  p_delivery_request text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_normalized_orders text[];
  v_order_key text;
  v_product_amount integer;
  v_delivery_fee integer;
  v_final_amount integer;
  v_request_code text;
  v_payment_status text;
  v_fulfillment_status text;
  v_request_id uuid;
  v_found_count integer;
begin
  if btrim(coalesce(p_nickname, '')) = '' then
    raise exception '닉네임을 입력해주세요.';
  end if;

  select c.id
  into v_customer_id
  from public.customers c
  where lower(btrim(c.nickname)) =
        lower(btrim(p_nickname))
    and c.is_active = true
  limit 1;

  if v_customer_id is null then
    raise exception '고객 정보를 찾을 수 없습니다.';
  end if;

  select array_agg(distinct btrim(x) order by btrim(x))
  into v_normalized_orders
  from unnest(coalesce(p_order_numbers, array[]::text[])) x
  where btrim(x) <> '';

  if v_normalized_orders is null
     or cardinality(v_normalized_orders) = 0 then
    raise exception '결제할 주문을 하나 이상 선택해주세요.';
  end if;

  if p_receipt_method not in ('pickup', 'home') then
    raise exception '수령 방법이 올바르지 않습니다.';
  end if;

  if p_payment_method not in (
    'pickup_pay',
    'bank_transfer',
    'card_online'
  ) then
    raise exception '결제 방법이 올바르지 않습니다.';
  end if;

  if p_receipt_method = 'home'
     and p_payment_method = 'pickup_pay' then
    raise exception
      '집 앞 배송은 선결제가 필요합니다. 계좌이체 또는 카드결제를 선택해주세요.';
  end if;

  if p_receipt_method = 'home'
     and btrim(coalesce(p_delivery_address, '')) = '' then
    raise exception '집 앞 배송 주소를 입력해주세요.';
  end if;

  if p_receipt_method = 'home'
     and btrim(coalesce(p_entrance_info, '')) = '' then
    raise exception '공동현관 비밀번호 또는 출입방법을 입력해주세요.';
  end if;

  select count(*)
  into v_found_count
  from public.orders o
  where o.customer_id = v_customer_id
    and o.is_visible = true
    and o.order_number = any(v_normalized_orders);

  if v_found_count <> cardinality(v_normalized_orders) then
    raise exception
      '선택한 주문 중 고객님의 주문이 아닌 항목이 있습니다.';
  end if;

  select coalesce(sum(oi.line_total), 0)::integer
  into v_product_amount
  from public.orders o
  join public.order_items oi
    on oi.order_id = o.id
  where o.customer_id = v_customer_id
    and o.is_visible = true
    and o.order_number = any(v_normalized_orders);

  if p_receipt_method = 'home'
     and v_product_amount <= 40000 then
    v_delivery_fee := 500;
  else
    v_delivery_fee := 0;
  end if;

  v_final_amount :=
    v_product_amount + v_delivery_fee;

  v_order_key :=
    array_to_string(v_normalized_orders, '|');

  v_request_code :=
    'DP-' ||
    to_char(clock_timestamp(), 'YYYYMMDDHH24MISS') ||
    '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  v_payment_status :=
    case p_payment_method
      when 'pickup_pay'
        then '현장 결제 예정'
      when 'bank_transfer'
        then '입금 확인 대기'
      when 'card_online'
        then '카드 결제 대기'
      else '결제 대기'
    end;

  v_fulfillment_status :=
    case p_receipt_method
      when 'pickup'
        then '매장 픽업 예정'
      when 'home'
        then '집 앞 배송 접수'
      else '수령 방법 접수'
    end;

  insert into public.checkout_requests (
    request_code,
    customer_id,
    nickname_snapshot,
    order_numbers,
    order_key,
    product_amount,
    delivery_fee,
    final_amount,
    receipt_method,
    payment_method,
    delivery_address,
    entrance_info,
    delivery_request,
    payment_status,
    fulfillment_status,
    request_status
  )
  values (
    v_request_code,
    v_customer_id,
    btrim(p_nickname),
    v_normalized_orders,
    v_order_key,
    v_product_amount,
    v_delivery_fee,
    v_final_amount,
    p_receipt_method,
    p_payment_method,
    case
      when p_receipt_method = 'home'
        then btrim(coalesce(p_delivery_address, ''))
      else ''
    end,
    case
      when p_receipt_method = 'home'
        then btrim(coalesce(p_entrance_info, ''))
      else ''
    end,
    case
      when p_receipt_method = 'home'
        then btrim(coalesce(p_delivery_request, ''))
      else ''
    end,
    v_payment_status,
    v_fulfillment_status,
    '신청'
  )
  on conflict (customer_id, order_key)
  do update set
    request_code = excluded.request_code,
    nickname_snapshot = excluded.nickname_snapshot,
    order_numbers = excluded.order_numbers,
    product_amount = excluded.product_amount,
    delivery_fee = excluded.delivery_fee,
    final_amount = excluded.final_amount,
    receipt_method = excluded.receipt_method,
    payment_method = excluded.payment_method,
    delivery_address = excluded.delivery_address,
    entrance_info = excluded.entrance_info,
    delivery_request = excluded.delivery_request,
    payment_status = excluded.payment_status,
    fulfillment_status = excluded.fulfillment_status,
    request_status = '신청',
    updated_at = now()
  returning id, request_code
  into v_request_id, v_request_code;

  update public.orders o
  set payment_status = v_payment_status
  where o.customer_id = v_customer_id
    and o.order_number = any(v_normalized_orders);

  return jsonb_build_object(
    'success', true,
    'request_id', v_request_id,
    'request_code', v_request_code,
    'product_amount', v_product_amount,
    'delivery_fee', v_delivery_fee,
    'final_amount', v_final_amount,
    'receipt_method', p_receipt_method,
    'payment_method', p_payment_method,
    'payment_status', v_payment_status,
    'fulfillment_status', v_fulfillment_status
  );
end;
$$;

revoke all
on function public.submit_checkout_request(
  text, text[], text, text, text, text, text
)
from public;

grant execute
on function public.submit_checkout_request(
  text, text[], text, text, text, text, text
)
to anon;

grant execute
on function public.submit_checkout_request(
  text, text[], text, text, text, text, text
)
to authenticated;

-- 5. 고객 주문조회 함수 교체
-- 기존 항목은 유지하고, 각 주문의 최근 결제·수령 신청 상태를 추가합니다.
create or replace function
public.lookup_orders_by_nickname(
  p_nickname text
)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'nickname', c.nickname,
        'order_number', o.order_number,
        'order_date', o.order_date,
        'payment_status', o.payment_status,
        'order_status', o.order_status,
        'notice', o.notice,
        'checkout', (
          select jsonb_build_object(
            'request_code', cr.request_code,
            'receipt_method', cr.receipt_method,
            'payment_method', cr.payment_method,
            'product_amount', cr.product_amount,
            'delivery_fee', cr.delivery_fee,
            'final_amount', cr.final_amount,
            'payment_status', cr.payment_status,
            'fulfillment_status', cr.fulfillment_status,
            'request_status', cr.request_status,
            'updated_at', cr.updated_at
          )
          from public.checkout_requests cr
          where o.order_number = any(cr.order_numbers)
          order by cr.updated_at desc
          limit 1
        ),
        'items', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'product_name', oi.product_name,
                'quantity', oi.quantity,
                'unit_name', oi.unit_name,
                'unit_price', oi.unit_price,
                'line_total', oi.line_total,
                'pickup_date', oi.pickup_date
              )
              order by
                oi.pickup_date nulls last,
                oi.created_at
            )
            from public.order_items oi
            where oi.order_id = o.id
          ),
          '[]'::jsonb
        )
      )
      order by o.created_at desc
    ),
    '[]'::jsonb
  )
  from public.customers c
  join public.orders o
    on o.customer_id = c.id
  where lower(btrim(c.nickname)) =
        lower(btrim(p_nickname))
    and c.is_active = true
    and o.is_visible = true;
$$;

revoke all
on function public.lookup_orders_by_nickname(text)
from public;

grant execute
on function public.lookup_orders_by_nickname(text)
to anon;

grant execute
on function public.lookup_orders_by_nickname(text)
to authenticated;

notify pgrst, 'reload schema';
