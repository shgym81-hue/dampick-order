const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const completion = require('../assets/js/admin-completion.js').DampickAdminCompletion;
const visibility = require('../assets/js/payments-visibility.js').DampickPaymentsVisibility;

const item = (id, amount) => ({ id, product_name:id, quantity:1, unit_price:amount, line_total:amount });
const order = (id, items, overrides = {}) => ({ id, customers:{nickname:'테스트'}, order_items:items, order_status:'주문 접수', completed_at:null, ...overrides });
const home = (items, overrides = {}) => ({ id:'r1', receipt_method:'home', nickname_snapshot:'테스트',
  request_status:'신청', payment_status:'결제 완료', fulfillment_status:'배송 준비 중',
  checkout_request_items:items.map(x => ({order_item_id:x.id, quantity:x.quantity, line_total:x.line_total})),
  product_amount:items.reduce((sum,x)=>sum+x.line_total,0), delivery_fee:500,
  final_amount:items.reduce((sum,x)=>sum+x.line_total,500), updated_at:'2026-09-19T10:00:00Z', ...overrides });

test('unfinished pickup order stays in category 4 and not category 5', () => {
  const o=order('o1',[item('apple',5000)]);
  assert.deepEqual(completion.pendingItems(o,[]).map(x=>x.id),['apple']);
  assert.deepEqual(completion.salesEntries([o],[]),[]);
});

test('pickup-completed order leaves category 4 and enters category 5', () => {
  const o=order('o1',[item('apple',5000)],{order_status:'픽업 완료',completed_at:'2026-09-19T09:00:00Z'});
  assert.equal(completion.pendingItems(o,[]).length,0);
  assert.deepEqual(completion.salesEntries([o],[]).map(x=>[x.kind,x.total]),[['픽업 완료',5000]]);
  assert.equal(completion.salesEntries([o],[])[0].dateSource,'completed_at');
});

test('completed pickup without completed_at uses updated_at then created_at', () => {
  const base={order_status:'픽업 완료',completed_at:null,created_at:'2026-08-01T09:00:00Z'};
  const updated=order('old1',[item('apple',5000)],{...base,updated_at:'2026-09-19T11:00:00Z'});
  const created=order('old2',[item('pear',7000)],base);
  assert.equal(completion.pendingItems(updated,[]).length,0);
  assert.equal(completion.pendingItems(created,[]).length,0);
  assert.deepEqual(completion.salesEntries([updated,created],[]).map(x=>[x.dateSource,x.dateIsFallback,x.total]),
    [['updated_at',true,5000],['created_at',true,7000]]);
});

test('completed delivery order without completed_at still enters sales', () => {
  const o=order('old3',[item('apple',5000)],{order_status:'배송 완료',completed_at:null,
    updated_at:'2026-09-18T11:00:00Z',created_at:'2026-09-01T09:00:00Z'});
  assert.equal(completion.pendingItems(o,[]).length,0);
  assert.deepEqual(completion.salesEntries([o],[]).map(x=>[x.dateSource,x.kind,x.total]),
    [['updated_at','배송 완료',5000]]);
});

test('pending home item remains in payment management and outside sales', () => {
  const apple=item('apple',5000), o=order('o1',[apple]), r=home([apple]);
  assert.deepEqual(completion.pendingItems(o,[r]).map(x=>x.id),['apple']);
  assert.deepEqual(completion.salesEntries([o],[r]),[]);
});

test('delivered home item leaves open orders and enters sales including shipping', () => {
  const apple=item('apple',5000), o=order('o1',[apple]);
  const r=home([apple],{fulfillment_status:'배송 완료'});
  assert.equal(completion.pendingItems(o,[r]).length,0);
  assert.deepEqual(completion.salesEntries([o],[r]).map(x=>[x.kind,x.productAmount,x.deliveryFee,x.total]),
    [['배송 완료',5000,500,5500]]);
  assert.equal(visibility.isActiveRequest(r),false);
  assert.equal(completion.salesEntries([o],[r])[0].dateSource,'updated_at');
});

test('delivered request falls back through completed_at, updated_at, created_at without querying absent columns', () => {
  const apple=item('apple',5000), o=order('o1',[apple]);
  const r=home([apple],{fulfillment_status:'배송 완료',created_at:'2026-08-01T09:00:00Z'});
  assert.equal(completion.salesEntries([o],[r])[0].dateSource,'updated_at');
  assert.equal(completion.salesEntries([o],[{...r,updated_at:null,completed_at:'2026-09-18T09:00:00Z'}])[0].dateSource,'completed_at');
  assert.equal(completion.salesEntries([o],[{...r,updated_at:null}])[0].dateSource,'created_at');
});

test('mixed pickup and home items move independently without duplicate sales', () => {
  const apple=item('apple',5000), pear=item('pear',7000);
  const o=order('o1',[apple,pear]), r=home([apple]);
  assert.deepEqual(completion.pendingItems(o,[r]).map(x=>x.id),['apple','pear']);
  assert.equal(completion.isHomeItem(apple,[r]),true);
  assert.equal(completion.isHomeItem(pear,[r]),false);
  const pickupFinished=order('o1',[apple,pear],{order_status:'픽업 완료',completed_at:'2026-09-19T11:00:00Z'});
  assert.deepEqual(completion.pendingItems(pickupFinished,[r]).map(x=>x.id),['apple']);
  assert.deepEqual(completion.salesEntries([pickupFinished],[r]).map(x=>[x.kind,x.total]),[['픽업 완료',7000]]);
  const delivered=home([apple],{fulfillment_status:'delivery_completed'});
  assert.deepEqual(completion.pendingItems(o,[delivered]).map(x=>x.id),['pear']);
  const finished=order('o1',[apple,pear],{order_status:'픽업 완료',completed_at:'2026-09-19T11:00:00Z'});
  assert.equal(completion.pendingItems(finished,[delivered]).length,0);
  const entries=completion.salesEntries([finished],[delivered]);
  assert.deepEqual(entries.map(x=>[x.kind,x.productAmount,x.deliveryFee,x.total]),
    [['픽업 완료',7000,0,7000],['배송 완료',5000,500,5500]]);
  assert.equal(entries.reduce((sum,x)=>sum+x.total,0),12500);
});

test('failed checkout_requests lookup keeps admin orders and renders category 4', async () => {
  const source=fs.readFileSync(path.join(__dirname,'../assets/js/admin.js'),'utf8');
  const loadFunction=source.slice(source.indexOf('async function loadOrders()'),source.indexOf('async function addCustomer('));
  const calls={renderOrders:0,renderSales:0,warnings:0,messages:[]};
  const context={
    sb:{from(table){return {select(){return {
      order(){assert.equal(table,'orders');return Promise.resolve({data:[{id:'o1',is_visible:true,order_items:[item('apple',5000)]}],error:null});},
      eq(){assert.equal(table,'checkout_requests');return Promise.resolve({data:null,error:new Error('permission denied')});}
    };}};}},
    renderOrders(){calls.renderOrders++;},renderSalesCalendar(){calls.renderSales++;},
    setMessage(_element,message){calls.messages.push(message);},appMessage:{},
    showAppError(error){throw error;},console:{warn(){calls.warnings++;}}
  };
  const result=await vm.runInNewContext('let orders=[];let checkoutRequests=[];'+loadFunction+'\nloadOrders().then(()=>({orders,checkoutRequests}))',context);
  assert.deepEqual(Array.from(result.orders,x=>x.id),['o1']);
  assert.equal(result.checkoutRequests.length,0);
  assert.equal(calls.renderOrders,1);
  assert.equal(calls.renderSales,1);
  assert.equal(calls.warnings,1);
  assert.match(calls.messages[0],/문고리 배송 신청 상태/);
});
