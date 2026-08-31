// 네트워크 결제·운영 DB 호출이 없는 로컬 브라우저 검증 전용 서버.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const fixtures = ['2026-08-31','2026-09-01','2026-09-02','2026-09-04','2026-09-07','2026-09-05'].map((date, i) => ({
  item_id: 'test-' + i, product_name: ['월요일 사과','화요일 배','수요일 포도','금요일 복숭아','다음주 사과','주말 상품'][i],
  quantity: 1, unit_price: 20000, line_total: 20000, pickup_date: date
}));
const mock = `
window.dampickSupabase = { rpc: async (name, args) => {
  if(name === 'lookup_orders_by_nickname') return {data:[{items:${JSON.stringify(fixtures)}}]};
  const items = ${JSON.stringify(fixtures)}.filter(item => args.p_item_ids.includes(item.item_id));
  const amount = items.reduce((sum,item)=>sum+item.line_total,0);
  return {data:{request_code:'DP-DEMO', product_amount:amount, delivery_fee:amount>40000?0:500, final_amount:amount+(amount>40000?0:500)}};
}};
window.TossPayments = Object.assign(() => ({payment: () => ({requestPayment: async args => {
  let output=document.createElement('pre'); output.id='mock-payment'; output.textContent=JSON.stringify(args); document.body.append(output);
}})}), {ANONYMOUS:'ANONYMOUS'});
`;
http.createServer((req,res) => {
  const url = new URL(req.url, 'http://localhost');
  if(url.pathname === '/mock.js') { res.setHeader('Content-Type','text/javascript; charset=utf-8'); return res.end(mock); }
  const target = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
  if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) { res.statusCode=404; return res.end(); }
  let body = fs.readFileSync(target);
  if(target.endsWith('index.html')) body=body.toString().replace(/<script src="https:[^"]+"><\/script>/g,'').replace('./assets/js/config.js','./mock.js');
  if(target.endsWith('payment-config.js')) body=body.toString().replace('tossClientKey: ""','tossClientKey: "test_ck_abc123XYZ"');
  res.setHeader('Content-Type', ({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.json':'application/json'})[path.extname(target)] || 'text/plain');
  res.end(body);
}).listen(8000,'127.0.0.1',()=>console.log('Isolated preview: http://127.0.0.1:8000'));
