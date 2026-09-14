-- 담픽 재고 관리
-- 기존 테이블과 데이터를 삭제하지 않습니다.

alter table public.products
  add column if not exists stock_quantity integer not null default 0;

-- 재고 기능 적용 전에 생성된 주문은 재고를 차감하지 않았으므로 false로 구분합니다.
alter table public.orders
  add column if not exists stock_deducted boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_stock_quantity_nonnegative'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_stock_quantity_nonnegative
      check (stock_quantity >= 0);
  end if;
end $$;

create or replace function public.create_order_with_stock(
  p_customer_id uuid,
  p_order_number text,
  p_order_date date,
  p_payment_status text,
  p_order_status text,
  p_notice text,
  p_items jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order_id uuid;
  v_item record;
  v_requested_count integer;
  v_locked_count integer := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception '주문 상품을 한 개 이상 선택해주세요.';
  end if;

  select count(*) into v_requested_count
  from jsonb_to_recordset(p_items) as x(product_id uuid, quantity integer);

  if exists (
    select 1 from jsonb_to_recordset(p_items) as x(product_id uuid, quantity integer)
    where x.product_id is null or x.quantity is null or x.quantity < 1
  ) or exists (
    select 1 from jsonb_to_recordset(p_items) as x(product_id uuid, quantity integer)
    group by x.product_id having count(*) > 1
  ) then
    raise exception '주문 상품과 수량을 확인해주세요.';
  end if;

  for v_item in
    select p.id, p.name, p.unit_price, p.unit_name, p.pickup_date,
           p.stock_quantity, x.quantity
    from jsonb_to_recordset(p_items) as x(product_id uuid, quantity integer)
    join public.products p on p.id = x.product_id
    where p.is_active = true
    order by p.id
    for update of p
  loop
    v_locked_count := v_locked_count + 1;
    if v_item.stock_quantity < v_item.quantity then
      raise exception '재고가 부족합니다. 남은 재고를 확인해주세요.';
    end if;
  end loop;

  if v_locked_count <> v_requested_count then
    raise exception '판매 중인 상품 정보를 확인해주세요.';
  end if;

  insert into public.orders (
    customer_id, order_number, order_date, payment_status, order_status, notice, stock_deducted
  ) values (
    p_customer_id, p_order_number, p_order_date, p_payment_status, p_order_status, p_notice, true
  ) returning id into v_order_id;

  for v_item in
    select p.id, p.name, p.unit_price, p.unit_name, p.pickup_date, x.quantity
    from jsonb_to_recordset(p_items) as x(product_id uuid, quantity integer)
    join public.products p on p.id = x.product_id
    order by p.id
  loop
    insert into public.order_items (
      order_id, product_id, product_name, quantity, unit_name, unit_price, pickup_date
    ) values (
      v_order_id, v_item.id, v_item.name, v_item.quantity,
      v_item.unit_name, v_item.unit_price, v_item.pickup_date
    );

    update public.products
    set stock_quantity = stock_quantity - v_item.quantity
    where id = v_item.id;
  end loop;

  return v_order_id;
end;
$$;

create or replace function public.cancel_order_items_with_stock(
  p_order_id uuid,
  p_item_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item record;
  v_expected integer;
  v_found integer := 0;
  v_stock_deducted boolean;
begin
  if p_item_ids is null or cardinality(p_item_ids) = 0 then
    raise exception '취소할 상품을 선택해주세요.';
  end if;

  select count(distinct x.item_id) into v_expected
  from unnest(p_item_ids) as x(item_id);
  select stock_deducted into v_stock_deducted
  from public.orders where id = p_order_id for update;
  if not found then raise exception '주문 정보를 찾을 수 없습니다.'; end if;

  for v_item in
    select oi.id, oi.product_id, oi.quantity
    from public.order_items oi
    where oi.order_id = p_order_id and oi.id = any(p_item_ids)
    order by oi.product_id, oi.id
    for update of oi
  loop
    v_found := v_found + 1;
    if v_stock_deducted and v_item.product_id is not null then
      update public.products
      set stock_quantity = stock_quantity + v_item.quantity
      where id = v_item.product_id;
    end if;
  end loop;

  if v_found <> v_expected then
    raise exception '취소할 주문 상품 정보를 확인해주세요.';
  end if;

  delete from public.order_items
  where order_id = p_order_id and id = any(p_item_ids);

  if not exists (select 1 from public.order_items where order_id = p_order_id) then
    delete from public.orders where id = p_order_id;
  end if;
end;
$$;

create or replace function public.delete_order_with_stock(p_order_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item record;
  v_stock_deducted boolean;
begin
  select stock_deducted into v_stock_deducted
  from public.orders where id = p_order_id for update;
  if not found then raise exception '주문 정보를 찾을 수 없습니다.'; end if;

  if v_stock_deducted then
    for v_item in
      select product_id, sum(quantity)::integer as quantity
      from public.order_items
      where order_id = p_order_id and product_id is not null
      group by product_id
      order by product_id
    loop
      update public.products
      set stock_quantity = stock_quantity + v_item.quantity
      where id = v_item.product_id;
    end loop;
  end if;

  delete from public.orders where id = p_order_id;
end;
$$;

create or replace function public.update_order_item_quantity_with_stock(
  p_order_id uuid,
  p_item_id uuid,
  p_quantity integer
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item record;
  v_difference integer;
begin
  if p_quantity is null or p_quantity < 1 then
    raise exception '수량은 1개 이상의 정수로 입력해주세요.';
  end if;

  select oi.id, oi.product_id, oi.quantity, oi.product_name, o.stock_deducted
  into v_item
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where oi.id = p_item_id and oi.order_id = p_order_id
  for update of oi, o;

  if not found then raise exception '주문 상품 정보를 찾을 수 없습니다.'; end if;
  if not v_item.stock_deducted then
    update public.order_items set quantity = p_quantity
    where id = p_item_id and order_id = p_order_id;
    return;
  end if;

  if v_item.product_id is null then raise exception '연결된 상품 정보를 찾을 수 없습니다.'; end if;

  perform 1 from public.products where id = v_item.product_id for update;
  if not found then raise exception '연결된 상품 정보를 찾을 수 없습니다.'; end if;
  v_difference := p_quantity - v_item.quantity;

  if v_difference > 0 and not exists (
    select 1 from public.products
    where id = v_item.product_id and stock_quantity >= v_difference
  ) then
    raise exception '재고가 부족합니다. 남은 재고를 확인해주세요.';
  end if;

  update public.products
  set stock_quantity = stock_quantity - v_difference
  where id = v_item.product_id;

  update public.order_items
  set quantity = p_quantity
  where id = p_item_id and order_id = p_order_id;
end;
$$;

create or replace function public.delete_customer_with_stock(p_customer_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item record;
begin
  perform 1 from public.customers where id = p_customer_id for update;
  if not found then raise exception '회원 정보를 찾을 수 없습니다.'; end if;

  for v_item in
    select oi.product_id, sum(oi.quantity)::integer as quantity
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    where o.customer_id = p_customer_id
      and o.stock_deducted = true
      and oi.product_id is not null
    group by oi.product_id
    order by oi.product_id
  loop
    update public.products
    set stock_quantity = stock_quantity + v_item.quantity
    where id = v_item.product_id;
  end loop;

  delete from public.customers where id = p_customer_id;
end;
$$;

revoke all on function public.create_order_with_stock(uuid,text,date,text,text,text,jsonb) from public, anon;
revoke all on function public.cancel_order_items_with_stock(uuid,uuid[]) from public, anon;
revoke all on function public.delete_order_with_stock(uuid) from public, anon;
revoke all on function public.update_order_item_quantity_with_stock(uuid,uuid,integer) from public, anon;
revoke all on function public.delete_customer_with_stock(uuid) from public, anon;

grant execute on function public.create_order_with_stock(uuid,text,date,text,text,text,jsonb) to authenticated;
grant execute on function public.cancel_order_items_with_stock(uuid,uuid[]) to authenticated;
grant execute on function public.delete_order_with_stock(uuid) to authenticated;
grant execute on function public.update_order_item_quantity_with_stock(uuid,uuid,integer) to authenticated;
grant execute on function public.delete_customer_with_stock(uuid) to authenticated;
