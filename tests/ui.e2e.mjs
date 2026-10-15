import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base='http://127.0.0.1:8766';
const bases=[{id:'kb1',name:'产品知识库',description:'产品与使用资料',document_count:8},{id:'kb2',name:'帮助中心',description:'常见问题',document_count:4}];
const docs=[{id:'d1',name:'产品操作手册.pdf',status:'completed',size_bytes:900000,chunk_count:184,updated_at:'2026-10-14T09:00:00Z'},{id:'d2',name:'售后规范.md',status:'processing',size_bytes:32000,updated_at:'2026-10-14T09:00:00Z'},{id:'d3',name:'常见问题.docx',status:'failed',size_bytes:42000,updated_at:'2026-10-14T09:00:00Z'}];
const replies={
'/api/knowledge-bases':bases,
'/api/suggestions':[{question:'如何提交售后申请？'},{question:'如何查看订单物流？'},{question:'如何修改收货地址？'}],
'/api/chat':{answer:'请在订单详情中发起售后申请。[1]\n\n提交后可通过售后记录查看处理进度。[2]',answer_id:'ans1',sources:[{title:'售后规范.md',snippet:'可从订单详情发起售后申请。',page:3},{title:'订单帮助.md',snippet:'售后记录提供进度信息。',page:2}]},
'/api/admin/auth/login':{access_token:'browser-test-only'},
'/api/admin/knowledge-bases':bases,
'/api/admin/knowledge-bases/kb1/documents':docs,
'/api/admin/documents/d1':{...docs[0],page_count:37,content_preview:'第一章 订单管理\n\n在订单详情中发起售后申请。',processing_events:[{label:'上传完成',at:'2026-10-14T09:00:00Z'},{label:'解析完成',at:'2026-10-14T09:01:00Z'}]},
'/api/admin/retrieval/test':{hits:[{title:'售后规范.md',snippet:'在订单详情里发起售后申请。',score:.93,page:3},{title:'产品操作手册.pdf',snippet:'订单中心提供售后入口。',score:.78,page:6}],elapsed_ms:221},
'/api/admin/feedback':[{question:'哪里查看物流？',vote:'up',created_at:'2026-10-14T09:00:00Z'}]
};
async function setup(context){await context.route('**/*',async route=>{
 const url=new URL(route.request().url());
 if(url.pathname==='/config.js') return route.fulfill({status:200,contentType:'application/javascript',body:'window.YIFULU_RAG_CONFIG={apiBaseUrl:"'+base+'"};'});
 if(url.pathname.startsWith('/api/')) {
   if(!(url.pathname in replies)) throw new Error('Missing fixture '+url.pathname);
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(replies[url.pathname])});
 }
 return route.continue();
});}
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox']});
const errors=[];
try {
 const context=await browser.newContext({viewport:{width:1440,height:900},locale:'zh-CN'}); await setup(context);
 const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
 const snap=async name=>{await page.screenshot({path:'screenshots/'+name+'.png',animations:'disabled'});console.log('Preview:',name)};
 await page.goto(base+'/',{waitUntil:'networkidle'});
 assert.equal(await page.locator('.suggestion').count(),3);await snap('user-suggestions');
 await page.getByRole('button',{name:'如何提交售后申请？'}).click();await page.getByText('请在订单详情中发起售后申请。').waitFor();await snap('user-answer');
 await page.getByRole('button',{name:'查看来源 1'}).click();assert.equal(await page.locator('.source-card').count(),2);await snap('user-sources');
 await page.goto(base+'/admin.html',{waitUntil:'networkidle'});
 await page.locator('#login-username').fill('admin');await page.locator('#login-password').fill('not-a-real-password');await page.locator('#login-submit').click();
 await page.locator('.kb-card').first().waitFor(); assert.equal(await page.locator('.kb-card').count(),2);await snap('admin-knowledge');
 await page.getByRole('button',{name:'产品知识库',exact:true}).first().click();await page.getByText('产品操作手册.pdf').waitFor();await snap('admin-documents');
 await page.getByRole('button',{name:'产品操作手册.pdf'}).click();await page.getByText('第一章 订单管理').waitFor();await snap('admin-detail');
 await page.getByRole('button',{name:'检索测试'}).click();await page.locator('#retrieval-query').fill('售后如何办理？');await page.getByRole('button',{name:'开始检索'}).click();await page.getByText('在订单详情里发起售后申请。').waitFor();await snap('admin-retrieval');
 const mobile=await browser.newContext({viewport:{width:390,height:844},locale:'zh-CN'});await setup(mobile);const m=await mobile.newPage();m.on('pageerror',e=>errors.push(String(e)));await m.goto(base+'/',{waitUntil:'networkidle'});await m.screenshot({path:'screenshots/user-mobile.png'});await m.getByRole('button',{name:'展开菜单'}).click();assert.equal(await m.locator('#sidebar.open').count(),1);await mobile.close();
 assert.deepEqual(errors,[]);console.log('E2E browser checks passed');
} finally {await browser.close();}
