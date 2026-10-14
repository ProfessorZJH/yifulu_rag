"use strict";
const cases = {
  sync: {
    question:"一批商品入库后，怎样在小程序展示？",
    answer:"演示流程：仓库完成收货、验收和上架后，商品的可售库存进入库存系统。随后由商品与渠道同步模块检查商品绑定、规格映射以及渠道上架条件，再将符合条件的数据提供给小程序展示。\n\n如果商品已上架却仍不可见，应检查渠道绑定状态、商品审核状态、库存同步任务和最近一次同步错误。\n\n注意：以上只是用于测试 RAG 页面交互的合成示例，不代表易富路当前真实实现或业务规则。",
    rewrite:"商品入库 上架 库存同步；渠道商品规格映射；小程序商品不可见 排查",
    sources:[{title:"示例文档 A · 入库与库存同步",snippet:"商品验收入库后，库存更新与渠道商品同步分开处理。",score:"演示引用 · 01"},{title:"示例文档 B · 渠道商品展示",snippet:"检查商品绑定、规格映射、审核及渠道上架状态。",score:"演示引用 · 02"}]
  },
  stock:{
    question:"为什么有库存却显示缺货？",
    answer:"演示排查顺序：首先区分物理库存、锁定库存与可售库存；其次核对商品规格与库位，再看渠道商品映射和同步任务状态。\n\n例如物理库存为 10 件，但其中 10 件已被其他订单预占时，实际可售库存可能为 0。也可能是 WMS 有库存，但渠道侧尚未收到最新数据。\n\n这是合成演示答案，请以正式系统的数据和业务规则为准。",
    rewrite:"实物库存 可售库存 锁定库存 区别；库存同步延迟；规格映射",
    sources:[{title:"示例文档 C · 库存计算说明",snippet:"可售库存需要扣除有效锁定量，并按对应规格单独计算。",score:"演示引用 · 01"},{title:"示例文档 D · 同步故障排查",snippet:"库存异常需要区分业务占用、规格映射和同步延迟。",score:"演示引用 · 02"}]
  },
  refund:{
    question:"退款后库存会自动增加吗？",
    answer:"演示规则：退款成功不一定意味着商品可重新销售。通常要区分仅退款、退货退款、实物签收、质检和重新上架几个事件。\n\n更安全的设计是以经过确认的退货入库事件驱动库存增加，避免只收到退款回调就重复加库存。\n\n此处仅为通用示例，不构成易富路现有退款实现的说明。",
    rewrite:"退款事件 库存恢复；退货入库 上架；退款幂等",
    sources:[{title:"示例文档 E · 退货与库存恢复",snippet:"付款状态、退款状态和实物入库状态应分别记录。",score:"演示引用 · 01"}]
  },
  dedupe:{
    question:"如何避免订单重复扣库存？",
    answer:"演示做法：给每个业务扣减操作定义稳定的幂等键，例如订单 ID 与业务事件类型的组合；在数据库中使用唯一约束限制重复入账，并在同一事务中完成幂等记录和库存修改。\n\n对网络超时的重试，应查询操作结果，而不是无条件再扣一次。出现回调重放、消息重复投递时也应返回相同的业务结果。\n\n这是面向展示的技术示例，不等同于真实项目已经完成的验证。",
    rewrite:"订单扣库存 幂等键；回调重复 消息重试；唯一约束 事务",
    sources:[{title:"示例文档 F · 幂等处理",snippet:"业务键唯一约束与事务保证同一事件不会重复影响库存。",score:"演示引用 · 01"},{title:"示例文档 G · 库存并发控制",snippet:"对并发预占、扣减和释放应进行状态校验与并发控制。",score:"演示引用 · 02"}]
  }
};
const $ = (id) => document.getElementById(id);
const form=$("chat-form"),input=$("question"),messages=$("messages"),conversation=$("conversation");
const hero=$("hero"),trace=$("trace"),sources=$("sources");
let busy=false;
let apiBase="";
function el(tag,cls,text){
  const node=document.createElement(tag);
  if(cls)node.className=cls;
  if(text!==undefined)node.textContent=text;
  return node;
}
function scrollEnd(){conversation.scrollTop=conversation.scrollHeight;}
function showMessage(role,text){
  const node=el("div","message "+(role==="user"?"user":"answer"));
  if(role==="assistant")node.append(el("div","answer-label",apiBase?"KNOWLEDGE ANSWER":"DEMO ANSWER · 合成数据"));
  for(const paragraph of text.split(/\n\n/))node.append(el("p","",paragraph));
  messages.append(node);scrollEnd();
}
function renderTrace(rewrite,sourceCount){
  trace.replaceChildren();
  const steps=[
    ["01 · Query 改写",rewrite],
    ["02 · 混合召回","BM25 关键词检索 + 向量语义检索"],
    ["03 · RRF 融合","合并多路候选结果并去重"],
    ["04 · 重排序","Reranker 对候选证据重新评分"],
    ["05 · 答案生成","利用检索证据生成回答并记录引用"]
  ];
  for(const [name,details] of steps){
    const node=el("div","step");
    node.append(el("div","step-title",name),el("div","step-detail",details));trace.append(node);
  }
  $("source-count").textContent=sourceCount+" 篇文档";
}
function renderSources(items){
  sources.replaceChildren();
  if(!items.length){sources.append(el("div","source-empty","当前回答没有可显示的引用。"));return;}
  for(const item of items){
    const node=el("div","source-card");
    node.append(el("div","source-title",item.title),el("p","source-snippet",item.snippet),el("span","source-tag",item.score||"引用文档"));
    sources.append(node);
  }
}
function demoMatch(question,preferred){
  if(preferred && cases[preferred])return cases[preferred];
  const q=question.toLowerCase();
  if(/退款|退货/.test(q))return cases.refund;
  if(/重复|幂等|扣库存/.test(q))return cases.dedupe;
  if(/缺货|锁定|可售库存/.test(q))return cases.stock;
  if(/入库|同步|小程序|上架/.test(q))return cases.sync;
  return null;
}
function setBusy(value){busy=value;$("send-button").disabled=value;$("send-button").firstElementChild.textContent=value?"处理中…":"发送提问";}
async function runQuestion(question,preferred){
  if(!question.trim()||busy)return;
  hero.hidden=true;
  showMessage("user",question);
  setBusy(true);
  try{
    let data;
    if(apiBase){
      const response=await fetch(apiBase+"/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question}),signal:AbortSignal.timeout(30000)});
      if(!response.ok)throw new Error("API 返回 HTTP "+response.status);
      data=await response.json();
      if(typeof data.answer!=="string"||!Array.isArray(data.sources))throw new Error("API 返回结构不符合接口约定");
    }else{
      const sample=demoMatch(question,preferred);
      data=sample?{answer:sample.answer,sources:sample.sources,rewrite:sample.rewrite}:{answer:"当前是交互演示模式，还没有接入真实知识库。请点击左侧四个示例问题体验完整的问答、引用和检索流程。\n\n等 RAG API 接入后，这里会对任意问题执行真实检索并生成答案。",sources:[],rewrite:question};
    }
    showMessage("assistant",data.answer);
    renderTrace(String(data.rewrite||question),data.sources.length);
    renderSources(data.sources.map(x=>({title:String(x.title||"未知文档"),snippet:String(x.snippet||""),score:String(x.score||"引用")})));
  }catch(err){
    showMessage("assistant","请求失败："+err.message+"。请确认服务可访问并已正确配置跨域。");
    renderTrace(question,0);renderSources([]);
  }finally{setBusy(false);input.focus();}
}
for(const button of document.querySelectorAll("[data-example]")){
  button.addEventListener("click",()=>{const key=button.dataset.example;input.value=cases[key].question;runQuestion(cases[key].question,key);});
}
form.addEventListener("submit",(event)=>{event.preventDefault();const q=input.value.trim();if(!q)return;input.value="";runQuestion(q);});
input.addEventListener("keydown",(event)=>{if(event.key==="Enter"&&!event.shiftKey&&!event.isComposing){event.preventDefault();form.requestSubmit();}});
$("reset-button").addEventListener("click",()=>{messages.replaceChildren();hero.hidden=false;trace.replaceChildren();trace.append(el("div","inspector-empty","发送问题后，在这里查看检索链路。"));sources.replaceChildren();sources.append(el("div","source-empty","暂无引用，等待检索。"));$("source-count").textContent="0 篇文档";input.value="";input.focus();});
/* When deploying the FastAPI backend, set this URL to its HTTPS origin.
   All model and Qdrant secrets must remain on the backend. */
apiBase="";
