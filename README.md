# 易富路 RAG

面向用户的知识库问答界面与独立管理后台。纯静态前端，无运行时框架依赖。

## 页面

| 地址 | 用途 |
| --- | --- |
| `/` | 问答、会话、引用来源 |
| `/admin.html` | 知识库、文档、检索测试、问答反馈 |

用户端以问答为中心，引用内嵌于回答并可按需展开；管理端独立提供知识库、文档与检索测试。视觉系统以中性背景、深色文字和克制的蓝色强调为主，`logo.svg` 用作统一品牌标识。

界面不包含预置答案、模拟知识库、虚构统计或伪造的检索轨迹。没有配置 API 时显示空状态；所有业务数据必须由后端返回。

## 部署

GitHub Pages：仓库设置 → Pages → Deploy from a branch → `main` → `/(root)`。发布后的网址为：

- https://professorzjh.github.io/yifulu_rag/
- https://professorzjh.github.io/yifulu_rag/admin.html

开发完成后合并代码到部署分支，再访问以上地址。无需构建。

在 `config.js` 里填写**已部署的 HTTPS 后端 Origin**：

```js
window.YIFULU_RAG_CONFIG = {
  apiBaseUrl: "https://YOUR-RAG-API.example.com"
};
```

不要把 Qdrant、LLM、管理账号或其他密钥放进公开仓库与浏览器代码。

## 预期 API 契约

以下只是前端对接契约，**并不意味着后端已实现这些接口**。API 返回普通 JSON 对象，或带 `code/data` 的对象（前端自动解析）。失败使用相应 HTTP 状态码与可选 `message`。

### 用户端

- `GET /api/knowledge-bases` → `[{id, name}]`；用于知识库选择。
- `GET /api/suggestions` → `[{question}]` 或字符串数组；可选，不存在时不显示推荐问题。
- `POST /api/chat` ← `{question, knowledge_base_id?, conversation_id?}` → `{answer, answer_id?, conversation_id?, sources: [{title, snippet, page?, url?}]}`。
- `POST /api/feedback` ← `{answer_id, vote: "up"|"down"}`；仅当回答包含 `answer_id` 时显示反馈按钮。

当后端回答正文中包含 `[1]`、`[2]` 等引用编号，界面会将它们映射到 `sources` 数组的对应文档，点击可打开来源抽屉。**引用及原文必须是真实检索产生的证据**，不得由前端凭空构造。

用户端的最近会话目前保存在浏览器 `sessionStorage` 中（仅实际请求生成的对话，非跨设备持久历史）。服务端对话持久化、流式输出与真正的逐阶段检索进度，待后端实现后再接入。

### 管理端

管理端须先调用 `POST /api/admin/auth/login`，入参 `{username,password}`，返回 `{access_token}`；页面仅在内存中保留 Bearer Token，刷新后需重新登录。退出时请求 `POST /api/admin/auth/logout`，后台需负责撤销或过期管理会话。

每个下列接口都必须由**后端**检查管理员身份、知识库访问权限和租户隔离：

- `GET /api/admin/knowledge-bases` → `[{id,name,description?,document_count?}]`
- `POST /api/admin/knowledge-bases` ← `{name,description}`
- `PATCH /api/admin/knowledge-bases/:id` ← `{name,description}`
- `DELETE /api/admin/knowledge-bases/:id`
- `GET /api/admin/knowledge-bases/:id/documents` → 文档数组（`id,name,size_bytes,status,chunk_count,updated_at`）
- `POST /api/admin/knowledge-bases/:id/documents` ← `multipart/form-data` 字段 `file`
- `GET /api/admin/documents/:id` → 文档详情（可选 `content_preview,page_count,error_message,processing_events`）
- `POST /api/admin/documents/:id/reindex`
- `DELETE /api/admin/documents/:id`
- `POST /api/admin/retrieval/test` ← `{knowledge_base_id,query,top_k}` → `{hits:[{title,snippet,score?,page?}],elapsed_ms?}`
- `GET /api/admin/feedback` → 反馈数组（`question,vote,created_at`）

管理端的“检索验证”只显示后端返回的**真实检索命中结果**，不生成演示回答。文档处理时间、分块数、检索分数等均来自后端。

### 服务端必须负责

- 管理员认证与权限、知识库和文档隔离，拒绝越权读写。
- 文件扩展名、内容、大小、压缩包与恶意内容安全检查；前端 20 MB 大小限制仅作为提前提示。
- GitHub Pages 访问域的精确 CORS 白名单以及 `Authorization` 请求头；HTTPS；限流、配额与 LLM Token 预算。
- 文档索引任务状态和失败重试的持久化、删除时 Qdrant 索引同步清理。
- 对用户问答的证据引用、无答案处理、模型输出安全和可观测性。

GitHub Pages 只托管前端，不能运行 Python / Qdrant，也不能替代后台鉴权。

## 开发检查

需要 Node.js 22，不需要安装第三方 npm 包：

```sh
npm run check
```

GitHub Actions 还会运行独立的 Playwright 浏览器验收，覆盖会话与引用、管理员登录、知识库、文档、检索及移动端。`tests/ui.e2e.mjs` 中的数据仅用于自动化测试，不会显示在正式页面。
