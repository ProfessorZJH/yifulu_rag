# 易富路 RAG · Knowledge Playground

面向 AI 应用开发作品集的可公开访问 RAG 演示界面。

## 当前状态

- 已实现：响应式静态网页、四个合成示例问答、检索步骤展示、文档引用展示、清空对话。
- **尚未接入真实 RAG API**：本仓库当前使用合成数据，页面会明显标记“演示模式”。没有真实的 BM25/向量检索、模型生成或评测指标。
- 仓库内不存放任何 Qdrant / LLM 密钥，也不在浏览器中连接向量数据库。

## GitHub Pages 部署

仓库 → **Settings** → **Pages** → **Build and deployment**：
1. Source 选择 **Deploy from a branch**。
2. Branch 选择 **main**，目录选择 **/(root)**，保存。
3. Pages 部署成功后访问 https://professorzjh.github.io/yifulu_rag/ 。

Github Pages 只负责静态网页，不能运行 Python FastAPI、Qdrant 或模型推理。

## 本地体验

用浏览器打开 `index.html` 即可（演示数据不依赖后端）。没有构建、安装或额外依赖。

## 接入真实 RAG 后端

在 `app.js` 最后一行设置 `apiBase` 为 HTTPS 后端 Origin（例：`https://rag-api.example.com`，不以斜杠结尾），然后提供：

```http
POST /api/chat
Content-Type: application/json

{"question": "如何排查有库存却显示缺货？"}
```

示例响应：

```json
{
  "answer": "这是后端真实返回的回答。",
  "rewrite": "可售库存 锁定库存 渠道库存同步",
  "sources": [
    {
      "title": "库存规则.md",
      "snippet": "被订单预占的库存不可再次销售。",
      "score": "Rerank 0.93"
    }
  ]
}
```

**注意**：这仅是第一个接口契约，实际对接前应根据现有 RAG 项目的真实返回结构调整字段；当前展示的五步 Trace 是预定义的流程描述，**不是后端实际执行轨迹**。接入时应进一步让 API 返回每一步真实统计、耗时和失败信息，避免误导。

后端需要配置允许 Pages Origin `https://professorzjh.github.io` 的 CORS、请求限流、单次 token 预算和超时，并使用 HTTPS。所有 Qdrant、LLM 密钥留在后端环境变量中。**不要在公开前端包含任何密钥。**

## 下一步

1. 将已有的文档解析、索引构建、Qdrant 混合检索和 Reranker 后端部署成 FastAPI 服务。
2. 接通真实问答和引用；检索来源必须确实来自命中文档。
3. 返回后端真实 Trace，而不是模拟五步成功状态。
4. 运行固定评测集，再报告 Recall@5、MRR 和 P95 延迟等真实指标。
