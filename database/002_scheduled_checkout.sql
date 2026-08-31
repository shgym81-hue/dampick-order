-- 설치 전 database/README.md와 docs/delivery-checkout.md를 확인하세요.
-- 기존 상품별 신청 RPC에 서버 배송 일정 검증을 추가하는 래퍼입니다.
-- 운영 함수 원본 확보 및 테스트 프로젝트 검증 후 설치해야 합니다.
begin;

do $$
begin
  if to_regprocedure('public.submit_checkout_item_request_v2(text,uuid[],text,text,text,text,text,text)') is null then
    raise exception '기존 상품 신청 RPC의 시그니처를 확인하세요. 설치를 중단합니다.';
  end if;
end $$;

create or replace function public.submit_scheduled_checkout_request(
  p_nickname text, p_item_ids uuid[], p_receipt_method text,
  p_payment_method text, p_delivery_phone text, p_delivery_address text,
  p_entrance_info text, p_delivery_request text
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_item record;
  v_day integer;
  v_date date;
  v_delivery date;
  v_expected date;
  v_ids uuid[];
  v_count integer := 0;
  v_amount bigint := 0;
  v_fee integer;
  v_result jsonb;
begin
  if p_receipt_method is distinct from 'home' or p_payment_method is null or p_payment_method not in ('bank_transfer', 'card_online') then
    raise exception '문고리 배송은 계좌이체 또는 카드 선결제만 가능합니다.';
  end if;
  select array_agg(distinct id) into v_ids from unnest(p_item_ids) id where id is not null;
  if coalesce(cardinality(v_ids), 0) = 0 then raise exception '상품을 선택해주세요.'; end if;

  -- 정렬된 행 잠금으로 같은 상품의 동시 신청을 직렬화합니다.
  for v_item in
    select oi.id, oi.pickup_date, oi.line_total
    from public.order_items oi join public.orders o on o.id = oi.order_id
    join public.customers c on c.id = o.customer_id
    where oi.id = any(v_ids) and lower(btrim(c.nickname)) = lower(btrim(p_nickname))
      and c.is_active = true and o.is_visible = true
    order by oi.id for update of oi
  loop
    v_count := v_count + 1;
    v_date := v_item.pickup_date::date;
    v_day := extract(isodow from v_date);
    if v_date is null or v_day not between 1 and 5 then
      raise exception '주말 또는 픽업일 미정 상품은 문고리 배송을 신청할 수 없습니다.';
    end if;
    v_delivery := v_date + case when v_day <= 2 then 3 - v_day else 5 - v_day end;
    if v_expected is not null and v_expected <> v_delivery then
      raise exception '배송 날짜가 다른 상품은 함께 결제할 수 없습니다.';
    end if;
    v_expected := v_delivery;
    if v_item.line_total is null or v_item.line_total < 0 then raise exception '상품 금액을 확인해주세요.'; end if;
    v_amount := v_amount + v_item.line_total;
  end loop;
  if v_count <> cardinality(v_ids) then raise exception '선택 상품의 고객 정보를 확인할 수 없습니다.'; end if;
  v_fee := case when v_amount > 40000 then 0 else 500 end;

  -- 중복 신청/기결제 상품 처리 등 기존 운영 로직은 기존 RPC가 담당합니다.
  select public.submit_checkout_item_request_v2(
    p_nickname, v_ids, p_receipt_method, p_payment_method, p_delivery_phone,
    p_delivery_address, p_entrance_info, p_delivery_request
  )::jsonb into v_result;
  if (v_result->>'product_amount')::bigint is distinct from v_amount
    or (v_result->>'delivery_fee')::integer is distinct from v_fee
    or (v_result->>'final_amount')::bigint is distinct from v_amount + v_fee then
    raise exception '서버 결제 금액 또는 배송비 설정이 다릅니다. 관리자에게 문의해주세요.';
  end if;
  return v_result || jsonb_build_object('delivery_date', v_expected);
end $$;

revoke all on function public.submit_scheduled_checkout_request(text,uuid[],text,text,text,text,text,text) from public;
grant execute on function public.submit_scheduled_checkout_request(text,uuid[],text,text,text,text,text,text) to anon, authenticated;
-- 우회 호출 차단. 기존 고객 화면을 쓰는 다른 서비스가 있다면 함께 전환해야 합니다.
revoke execute on function public.submit_checkout_item_request_v2(text,uuid[],text,text,text,text,text,text) from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
