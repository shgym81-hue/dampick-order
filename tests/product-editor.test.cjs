const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function setup(result = {data: {id:'p1', name:'새 상품'}}) {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, {value:'', disabled:false, listeners:{}, addEventListener(name, fn) {this.listeners[name] = fn;}, reportValidity:()=>true, focus(){}, showModal(){this.open=true;}, close(){this.open=false;}});
    return elements.get(id);
  };
  const calls = [];
  const query = {update(payload){calls.push(payload);return this;}, eq(...args){calls.push(args);return this;}, select(){return this;}, single:async()=>result};
  const context = {window:{}, document:{getElementById:get}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/js/admin-product-editor.js'),'utf8'),context);
  let saved = null;
  const editor = context.window.createDampickProductEditor({from(table){assert.equal(table,'products');return query;}}, async data=>{saved=data;});
  editor.open({id:'p1', name:'사과', unit_price:1000, unit_name:'개', pickup_date:'2026-09-01'});
  return {get,calls,editor, saved:()=>saved, submit:()=>get('productEditForm').listeners.submit({preventDefault(){}})};
}
test('editor loads product and saves all four fields only to matching active product', async()=>{
  const s=setup();
  assert.equal(s.get('editProductName').value,'사과');
  s.get('editProductName').value='수정 사과';
  s.get('editProductPrice').value='2000';
  s.get('editProductUnit').value='봉';
  s.get('editProductPickupDate').value='2026-09-04';
  await s.submit();
  assert.deepEqual(JSON.parse(JSON.stringify(s.calls)),[{name:'수정 사과',unit_price:2000,unit_name:'봉',pickup_date:'2026-09-04'},['id','p1'],['is_active',true]]);
  assert.equal(s.get('productEditDialog').open,false);
  assert.equal(s.saved().id,'p1');
});
test('invalid price or blank name never writes',async()=>{
  for(const price of ['', '-1', '1.5', 'NaN']) {
    const s=setup(); s.get('editProductPrice').value=price; await s.submit(); assert.equal(s.calls.length,0);
  }
  const s=setup(); s.get('editProductPrice').value='1000';s.get('editProductName').value='  ';await s.submit();assert.equal(s.calls.length,0);
});
test('failed or denied update keeps dialog and input for retry',async()=>{
  const s=setup({data:null,error:{message:'Permission denied'}});
  s.get('editProductPrice').value='1000';await s.submit();
  assert.equal(s.get('productEditDialog').open,true);
  assert.equal(s.saved(),null);
  assert.match(s.get('productEditMessage').textContent,/Permission denied/);
  assert.equal(s.get('saveProductEdit').disabled,false);
});
test('cancel does not write and another product can use the same dialog',()=>{
  const s=setup();s.get('cancelProductEdit').listeners.click();assert.equal(s.calls.length,0);
  s.editor.open({id:'p2',name:'배',unit_price:0,unit_name:'개',pickup_date:'2026-09-02'});
  assert.equal(s.get('editProductName').value,'배');assert.equal(s.get('editProductPrice').value,0);
});
