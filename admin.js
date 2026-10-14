import { isConnected, request, icon, notify, formatBytes, formatDate } from "./shared.js";

const $ = (id) => document.getElementById(id);
for (const slot of document.querySelectorAll("[data-icon]")) slot.replaceChildren(icon(slot.dataset.icon, 18));

const state = {
  view: "knowledge",
  token: null,
  bases: [],
  documents: [],
  feedback: [],
  selectedBaseId: null,
  selectedDoc: null,
  error: "",
  query: "",
  hits: null,
  retrievalElapsed: null,
  editingBaseId: null,
  busy: false
};
const api = async (path, options = {}) => {
  try {
    return await request(path, { ...options, token: state.token });
  } catch (error) {
    if (error.status === 401 && state.token) {
      state.token = null;
      $("login-backdrop").hidden = false;
      $("backend-status").textContent = "登录已过期";
      $("backend-status").classList.remove("connected");
    }
    throw error;
  }
};
const itemsFrom = (payload) => Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : [];
const idOf = (obj) => obj?.id == null ? null : String(obj.id);
const activeBase = () => state.bases.find((base) => idOf(base) === state.selectedBaseId) || null;
const canEdit = () => Boolean(isConnected && state.token);
const apiId = (id) => encodeURIComponent(String(id));
const make = (tag, cls, text) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
};
const append = (target, ...nodes) => { target.append(...nodes); return target; };
const button = (text, cls, handler, iconName) => {
  const b = make("button", cls, text);
  b.type = "button";
  if (iconName) b.prepend(icon(iconName, 17));
  if (handler) b.addEventListener("click", handler);
  return b;
};
const heading = (title, action) => {
  const root = $("admin-content");
  root.replaceChildren();
  const line = make("div", "admin-page-head");
  const head = make("div", "admin-title-group");
  append(head, make("h1", "", title));
  append(line, head);
  if (action) append(line, make("div", "admin-actions")).lastElementChild.append(action);
  root.append(line);
  return root;
};
const notice = (container) => {
  if (!state.error) return;
  append(container, make("div", "error-strip", state.error));
};
function emptyState(label, ico = "folder", action) {
  const block = make("div", "empty-state");
  const mark = make("div", "empty-icon");
  mark.append(icon(ico, 25));
  block.append(mark, make("strong", "", label));
  if (action) block.append(action);
  return block;
}
function filterInput(placeholder, onChange) {
  const wrap = make("label", "search-box");
  wrap.append(icon("search", 18));
  const input = make("input");
  input.placeholder = placeholder;
  input.type = "search";
  input.addEventListener("input", (event) => onChange(event.target.value.trim().toLowerCase()));
  wrap.append(input);
  return wrap;
}
function pageToolbar(left, right) {
  const wrap = make("div", "toolbar");
  if (left) wrap.append(left);
  if (right) wrap.append(right);
  return wrap;
}
function statusChip(status) {
  const names = {
    ready: "已完成", completed: "已完成", indexed: "已完成", success: "已完成",
    processing: "处理中", indexing: "处理中", pending: "排队中", failed: "失败"
  };
  const key = String(status || "").toLowerCase();
  return make("span", "status-chip " + (["ready","completed","indexed","success"].includes(key) ? "ready" : key), names[key] || "未知");
}
function switchView(view) {
  if (state.view !== view) state.error = "";
  state.view = view;
  const names = { knowledge: "知识库", documents: "文档管理", detail: "文档详情", retrieval: "检索验证", feedback: "问答反馈" };
  $("breadcrumb").textContent = names[view] || "知识库";
  document.querySelectorAll(".admin-nav-item[data-view]").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  if (view !== "detail") history.replaceState(null, "", "#" + view);
  closeMobile();
  render();
}
function render() {
  if (state.view === "documents") return renderDocuments();
  if (state.view === "detail") return renderDetail();
  if (state.view === "retrieval") return renderRetrieval();
  if (state.view === "feedback") return renderFeedback();
  renderKnowledge();
}
function renderKnowledge(search = "") {
  const create = button("新建知识库", "button button-primary", () => openBaseDialog(), "plus");
  create.disabled = !canEdit();
  const root = heading("知识库", create);
  notice(root);
  const grid = make("div", "kb-grid");
  const bar = pageToolbar(filterInput("搜索知识库", (value) => fillGrid(value, grid)), make("span", "muted-label", "共 " + state.bases.length + " 个"));
  root.append(bar, grid);
  fillGrid(search, grid);
}
function fillGrid(search, grid) {
  grid.replaceChildren();
  const entries = state.bases.filter((base) =>
    (String(base.name || "") + " " + String(base.description || "")).toLowerCase().includes(search));
  if (!entries.length) {
    const action = !state.bases.length && canEdit() ? button("新建知识库", "button button-primary button-small", () => openBaseDialog(), "plus") : null;
    const item = emptyState(state.bases.length ? "没有匹配的知识库" : (isConnected ? "暂无知识库" : "服务尚未连接"), "book", action);
    item.style.gridColumn = "1 / -1";
    grid.append(item);
    return;
  }
  for (const base of entries) {
    const card = make("div", "panel kb-card");
    const row = make("div", "kb-main");
    const visual = make("div", "kb-icon");
    visual.append(icon("book", 21));
    const inner = make("div");
    const link = button(String(base.name || "未命名知识库"), "kb-name", () => openDocuments(idOf(base)));
    append(inner, link);
    if (base.description) append(inner, make("div", "kb-desc", String(base.description)));
    append(row, visual, inner);
    const bottom = make("div", "kb-card-footer");
    const countText = Number.isFinite(base.document_count) ? base.document_count + " 个文档" : "—";
    bottom.append(make("span", "", countText));
    const controls = make("div", "card-controls");
    const open = button("", "icon-button", () => openDocuments(idOf(base)), "arrowRight");
    open.setAttribute("aria-label", "打开 " + base.name);
    controls.append(open);
    if (canEdit()) {
      const edit = button("", "icon-button", () => openBaseDialog(base), "file");
      edit.setAttribute("aria-label", "编辑 " + base.name);
      controls.append(edit);
      const del = button("", "icon-button", () => deleteBase(base), "trash");
      del.setAttribute("aria-label", "删除 " + base.name);
      controls.append(del);
    }
    bottom.append(controls);
    append(card, row, bottom);
    grid.append(card);
  }
}
async function loadBases() {
  if (!canEdit()) { state.bases = []; render(); return; }
  try {
    state.error = "";
    state.bases = itemsFrom(await api("/api/admin/knowledge-bases"));
    if (state.selectedBaseId && !activeBase()) state.selectedBaseId = null;
    if (!state.selectedBaseId && state.bases.length) state.selectedBaseId = idOf(state.bases[0]);
  } catch (error) {
    state.error = error.message;
    state.bases = [];
  }
  render();
}
function openBaseDialog(base = null) {
  if (!canEdit()) return;
  state.editingBaseId = base ? idOf(base) : null;
  $("dialog-title").textContent = base ? "编辑知识库" : "新建知识库";
  $("kb-name").value = base ? String(base.name || "") : "";
  $("kb-description").value = base ? String(base.description || "") : "";
  $("dialog-backdrop").hidden = false;
  $("kb-name").focus();
}
function closeBaseDialog() { $("dialog-backdrop").hidden = true; state.editingBaseId = null; }
async function deleteBase(base) {
  if (!canEdit()) return;
  if (!confirm("确定删除「" + base.name + "」？")) return;
  try {
    await api("/api/admin/knowledge-bases/" + apiId(idOf(base)), { method: "DELETE" });
    notify("已删除", "success");
    await loadBases();
  } catch (error) { notify(error.message); }
}

async function openDocuments(id = state.selectedBaseId) {
  if (!id && state.bases.length) id = idOf(state.bases[0]);
  state.selectedBaseId = id || null;
  state.documents = [];
  state.error = "";
  switchView("documents");
  if (!canEdit() || !id) return;
  try {
    state.documents = itemsFrom(await api("/api/admin/knowledge-bases/" + apiId(id) + "/documents"));
  } catch (error) { state.error = error.message; }
  renderDocuments();
}
async function reloadDocuments() {
  if (!state.selectedBaseId || !canEdit()) return;
  try {
    state.error = "";
    state.documents = itemsFrom(await api("/api/admin/knowledge-bases/" + apiId(state.selectedBaseId) + "/documents"));
  } catch (error) { state.error = error.message; }
  renderDocuments();
}
function renderDocuments(search = "", filterStatus = "") {
  const base = activeBase();
  const uploadBtn = button("上传文档", "button button-primary", () => $("file-upload").click(), "upload");
  uploadBtn.disabled = !canEdit() || !base;
  const root = heading(base ? String(base.name) : "文档管理", uploadBtn);
  if (base) {
    const back = button("全部知识库", "detail-back", () => switchView("knowledge"), "arrowLeft");
    root.insertBefore(back, root.firstElementChild);
  }
  notice(root);
  if (!base) {
    root.append(emptyState(isConnected ? "尚未选择知识库" : "服务尚未连接", "folder",
      state.bases.length ? button("选择知识库", "button button-small", () => switchView("knowledge")) : null));
    return;
  }
  const strip = make("div", "upload-strip");
  strip.append(icon("upload", 20), make("strong", "", "PDF · DOCX · Markdown · TXT"));
  const add = button("选择文件", "button button-small", () => $("file-upload").click(), "plus");
  add.disabled = !canEdit();
  strip.append(add);
  root.append(strip);
  const filters = make("div", "page-filter");
  filters.append(filterInput("搜索文档", (value) => updateRows(value, status.value)));
  const status = make("select", "simple-select");
  for (const [value, label] of [["", "全部状态"], ["ready", "已完成"], ["processing", "处理中"], ["failed", "失败"]]) {
    status.append(new Option(label, value));
  }
  status.addEventListener("change", () => updateRows(filters.querySelector("input").value.trim().toLowerCase(), status.value));
  filters.append(status);
  root.append(pageToolbar(filters, make("span", "muted-label", "共 " + state.documents.length + " 个文件")));
  const panel = make("div", "panel table-panel");
  const table = make("table", "data-table");
  const thead = make("thead");
  const header = make("tr");
  for (const title of ["文件名称", "大小", "状态", "内容片段", "更新时间", "操作"]) header.append(make("th", "", title));
  thead.append(header);
  const tbody = make("tbody");
  table.append(thead, tbody);
  panel.append(table);
  root.append(panel);
  function updateRows(searchValue, filterValue) {
    tbody.replaceChildren();
    const filtered = state.documents.filter((doc) => {
      const matchedText = String(doc.name || "").toLowerCase().includes(searchValue);
      const statusName = String(doc.status || "").toLowerCase();
      const matchedStatus = !filterValue ||
        (filterValue === "ready" && ["ready", "completed", "success", "indexed"].includes(statusName)) ||
        (filterValue === "processing" && ["processing", "pending", "indexing"].includes(statusName)) ||
        (filterValue === "failed" && statusName === "failed");
      return matchedText && matchedStatus;
    });
    if (!filtered.length) {
      const tr = make("tr");
      const cell = make("td", "", state.documents.length ? "没有匹配的文档" : "暂无文档");
      cell.colSpan = 6;
      cell.style.textAlign = "center";
      cell.style.padding = "68px";
      tr.append(cell);
      tbody.append(tr);
      return;
    }
    for (const doc of filtered) {
      const row = make("tr");
      const first = make("td");
      const fileCell = make("div", "file-cell");
      const glyph = make("div", "file-glyph");
      glyph.append(icon("file", 19));
      fileCell.append(glyph, button(String(doc.name || "未命名文件"), "file-name", () => openDetail(idOf(doc))));
      first.append(fileCell);
      row.append(first, make("td", "", formatBytes(doc.size_bytes)));
      const st = make("td"); st.append(statusChip(doc.status)); row.append(st);
      row.append(make("td", "", Number.isFinite(doc.chunk_count) ? String(doc.chunk_count) : "—"));
      row.append(make("td", "", formatDate(doc.updated_at)));
      const actions = make("td");
      if (String(doc.status).toLowerCase() === "failed") actions.append(button("重试", "text-button", () => retryDocument(doc)));
      actions.append(button("查看", "text-button", () => openDetail(idOf(doc))));
      if (canEdit()) actions.append(button("删除", "text-button danger", () => deleteDocument(doc)));
      row.append(actions);
      tbody.append(row);
    }
  }
  updateRows(search, filterStatus);
}
async function uploadDocument(file) {
  if (!canEdit() || !state.selectedBaseId || !file) return;
  if (!/\.(pdf|docx|md|txt)$/i.test(file.name)) { notify("文件格式不支持"); return; }
  if (file.size > 20 * 1024 * 1024) { notify("单个文件不能超过 20 MB"); return; }
  const form = new FormData(); form.append("file", file);
  try {
    notify("正在上传", "success");
    await api("/api/admin/knowledge-bases/" + apiId(state.selectedBaseId) + "/documents", { method: "POST", body: form, timeout: 90000 });
    notify("已提交处理", "success");
    await reloadDocuments();
  } catch (error) { notify(error.message); }
}
async function retryDocument(doc) {
  if (!canEdit()) return;
  try {
    await api("/api/admin/documents/" + apiId(idOf(doc)) + "/reindex", { method: "POST" });
    notify("已提交处理", "success");
    if (state.view === "detail") await openDetail(idOf(doc));
    else await reloadDocuments();
  } catch (error) { notify(error.message); }
}
async function deleteDocument(doc) {
  if (!canEdit() || !confirm("确定删除「" + doc.name + "」？")) return;
  try {
    await api("/api/admin/documents/" + apiId(idOf(doc)), { method: "DELETE" });
    notify("已删除", "success");
    if (state.view === "detail") await openDocuments(state.selectedBaseId);
    else await reloadDocuments();
  } catch (error) { notify(error.message); }
}
async function openDetail(id) {
  if (!id) return;
  state.selectedDoc = null;
  state.error = "";
  switchView("detail");
  try {
    if (!canEdit()) throw new Error("服务尚未连接");
    const result = await api("/api/admin/documents/" + apiId(id));
    if (!result || typeof result !== "object") throw new Error("未找到文档");
    state.selectedDoc = result;
  } catch (error) { state.error = error.message; }
  renderDetail();
}
function renderDetail() {
  const doc = state.selectedDoc;
  const root = heading(doc ? String(doc.name || "文档详情") : "文档详情");
  root.insertBefore(button("返回文档管理", "detail-back", () => openDocuments(state.selectedBaseId), "arrowLeft"), root.firstElementChild);
  notice(root);
  if (!doc) { root.append(emptyState("暂无文档内容", "file")); return; }
  const meta = make("div", "detail-overview");
  meta.append(statusChip(doc.status));
  const detail = make("div", "detail-meta");
  detail.append(make("span", "", formatBytes(doc.size_bytes)), make("span", "", formatDate(doc.updated_at)));
  meta.append(detail);
  if (String(doc.status || "").toLowerCase() === "failed") {
    meta.append(button("重新处理", "button button-small", () => retryDocument(doc), "refresh"));
  }
  root.append(meta);
  const cols = make("div", "detail-grid");
  const preview = make("div", "panel");
  preview.append(make("div", "panel-header", "内容预览"));
  const text = typeof doc.content_preview === "string" ? doc.content_preview : "";
  preview.append(make("div", "document-preview" + (!text ? " empty" : ""), text || "暂无可预览内容"));
  const right = make("div");
  const facts = make("div", "panel");
  facts.append(make("div", "panel-header", "文档信息"));
  const body = make("div", "document-facts");
  for (const [label, value] of [
    ["文件名", doc.name || "—"], ["文件大小", formatBytes(doc.size_bytes)],
    ["状态", String(doc.status || "—")],
    ["页数", Number.isFinite(doc.page_count) ? doc.page_count : "—"],
    ["内容片段", Number.isFinite(doc.chunk_count) ? doc.chunk_count : "—"],
    ["更新时间", formatDate(doc.updated_at)]
  ]) {
    const entry = make("div", "fact");
    entry.append(make("span", "", label), make("b", "", String(value))); body.append(entry);
  }
  if (doc.error_message) {
    const entry = make("div", "error-strip", String(doc.error_message));
    body.append(entry);
  }
  facts.append(body);
  right.append(facts);
  if (Array.isArray(doc.processing_events) && doc.processing_events.length) {
    const timeline = make("div", "panel");
    timeline.style.marginTop = "18px";
    timeline.append(make("div", "panel-header", "处理记录"));
    const events = make("div", "timeline");
    for (const step of doc.processing_events) {
      const line = make("div", "timeline-item");
      line.append(icon("check", 16), make("strong", "", String(step.label || step.stage || "处理")));
      if (step.at) line.append(make("span", "", formatDate(step.at)));
      events.append(line);
    }
    timeline.append(events);
    right.append(timeline);
  }
  cols.append(preview, right);
  root.append(cols);
}
function baseSelector(onChange) {
  const sel = make("select", "simple-select");
  sel.setAttribute("aria-label", "选择知识库");
  sel.append(new Option("选择知识库", ""));
  for (const base of state.bases) if (idOf(base)) sel.append(new Option(String(base.name || ""), idOf(base)));
  sel.value = state.selectedBaseId || "";
  sel.addEventListener("change", (event) => {
    state.selectedBaseId = event.target.value || null;
    onChange?.();
  });
  return sel;
}
function renderRetrieval() {
  const root = heading("检索验证");
  notice(root);
  const cols = make("div", "test-layout");
  const queryPanel = make("section", "panel query-card");
  const label = make("label", "", "问题");
  label.htmlFor = "retrieval-query";
  const query = make("textarea");
  query.id = "retrieval-query";
  query.placeholder = "输入要检索的问题";
  query.maxLength = 2000;
  query.value = state.query;
  query.addEventListener("input", () => { state.query = query.value; });
  const actions = make("div", "query-card-actions");
  const select = baseSelector();
  const run = button("开始检索", "button button-primary", runRetrieval, "search");
  run.id = "run-retrieval";
  run.disabled = !canEdit() || !state.selectedBaseId || state.busy;
  select.addEventListener("change", () => { run.disabled = !canEdit() || !state.selectedBaseId || state.busy; state.hits = null; renderRetrieval(); });
  actions.append(select, run);
  queryPanel.append(label, query, actions);
  const result = make("section", "panel");
  const head = make("div", "test-result-head");
  head.append(make("strong", "", "检索结果"));
  if (state.retrievalElapsed != null && state.hits) head.append(make("span", "muted-label", String(state.retrievalElapsed) + " ms"));
  result.append(head);
  if (!state.hits) {
    const empty = emptyState("暂无检索结果", "search");
    empty.classList.add("test-placeholder");
    result.append(empty);
  }
  else if (!state.hits.length) result.append(emptyState("未找到相关内容", "search"));
  else {
    const list = make("div", "result-list");
    state.hits.forEach((hit, i) => {
      const card = make("div", "hit-card");
      const rank = make("span", "hit-rank", i + 1);
      const text = make("div", "hit-main");
      const h = make("div", "hit-heading");
      h.append(make("span", "", String(hit.title || "未命名文档")));
      if (typeof hit.score === "number" && Number.isFinite(hit.score)) {
        h.append(make("span", "hit-score", hit.score.toFixed(3)));
      }
      text.append(h);
      if (hit.snippet) text.append(make("div", "hit-snippet", String(hit.snippet)));
      const foot = make("div", "muted-label", hit.page != null ? "第 " + hit.page + " 页" : "");
      text.append(foot);
      card.append(rank, text); list.append(card);
    });
    result.append(list);
  }
  cols.append(queryPanel, result);
  root.append(cols);
}
async function runRetrieval() {
  if (!canEdit() || !state.selectedBaseId || !state.query.trim() || state.busy) {
    if (!state.query.trim()) notify("请输入问题");
    return;
  }
  state.busy = true;
  state.hits = null;
  state.retrievalElapsed = null;
  renderRetrieval();
  try {
    const data = await api("/api/admin/retrieval/test", {
      method: "POST",
      json: { knowledge_base_id: state.selectedBaseId, query: state.query.trim(), top_k: 5 },
      timeout: 60000
    });
    state.hits = itemsFrom(data?.hits ?? data);
    state.retrievalElapsed = typeof data?.elapsed_ms === "number" ? data.elapsed_ms : null;
  } catch (error) { notify(error.message); }
  finally { state.busy = false; renderRetrieval(); }
}
async function loadFeedback() {
  if (!canEdit()) return;
  try { state.error = ""; state.feedback = itemsFrom(await api("/api/admin/feedback")); }
  catch (error) { state.error = error.message; state.feedback = []; }
  renderFeedback();
}
function renderFeedback() {
  const root = heading("问答反馈");
  notice(root);
  const panel = make("div", "panel table-panel");
  if (!state.feedback.length) {
    panel.append(emptyState(isConnected ? "暂无反馈" : "服务尚未连接", "feedback"));
  } else {
    const table = make("table", "data-table");
    const head = make("tr");
    for (const text of ["问题", "反馈", "提交时间"]) head.append(make("th", "", text));
    const thead = make("thead"); thead.append(head);
    const body = make("tbody");
    for (const f of state.feedback) {
      const tr = make("tr");
      tr.append(make("td", "cell-strong", String(f.question || "—")));
      tr.append(make("td", "", f.vote === "up" ? "有帮助" : f.vote === "down" ? "没有帮助" : "—"));
      tr.append(make("td", "", formatDate(f.created_at)));
      body.append(tr);
    }
    table.append(thead, body);
    panel.append(table);
  }
  root.append(panel);
}
function closeMobile() {
  $("admin-sidebar").classList.remove("open");
  $("admin-overlay").hidden = true;
}
$("admin-menu").addEventListener("click", () => {
  $("admin-sidebar").classList.toggle("open");
  $("admin-overlay").hidden = !$("admin-sidebar").classList.contains("open");
});
$("admin-overlay").addEventListener("click", closeMobile);
for (const nav of document.querySelectorAll(".admin-nav-item[data-view]")) {
  nav.addEventListener("click", async () => {
    const v = nav.dataset.view;
    if (v === "documents") return openDocuments();
    switchView(v);
    if (v === "feedback") await loadFeedback();
  });
}
$("dialog-close").addEventListener("click", closeBaseDialog);
$("dialog-cancel").addEventListener("click", closeBaseDialog);
$("dialog-backdrop").addEventListener("click", (event) => { if (event.target === $("dialog-backdrop")) closeBaseDialog(); });
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") { closeBaseDialog(); closeMobile(); }
});
$("knowledge-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!canEdit()) return;
  const name = $("kb-name").value.trim();
  const description = $("kb-description").value.trim();
  if (!name) return;
  const submit = $("dialog-submit");
  submit.disabled = true;
  try {
    const path = state.editingBaseId
      ? "/api/admin/knowledge-bases/" + apiId(state.editingBaseId)
      : "/api/admin/knowledge-bases";
    await api(path, { method: state.editingBaseId ? "PATCH" : "POST", json: { name, description } });
    closeBaseDialog();
    notify("已保存", "success");
    await loadBases();
  } catch (error) { notify(error.message); }
  finally { submit.disabled = false; }
});
$("file-upload").addEventListener("change", async (event) => {
  const files = [...event.target.files];
  event.target.value = "";
  for (const file of files) await uploadDocument(file);
});
$("admin-login").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isConnected) return;
  const submit = $("login-submit");
  submit.disabled = true;
  $("login-error").hidden = true;
  try {
    const data = await request("/api/admin/auth/login", {
      method: "POST",
      json: { username: $("login-username").value.trim(), password: $("login-password").value },
      timeout: 30000
    });
    if (typeof data?.access_token !== "string" || !data.access_token) throw new Error("登录响应无效");
    state.token = data.access_token;
    $("login-password").value = "";
    $("login-backdrop").hidden = true;
    $("logout-button").hidden = false;
    $("backend-status").textContent = "已连接";
    $("backend-status").classList.add("connected");
    await loadBases();
    const view = location.hash.slice(1);
    if (["documents", "retrieval", "feedback"].includes(view)) {
      if (view === "documents") await openDocuments();
      else if (view === "feedback") { switchView(view); await loadFeedback(); }
      else switchView(view);
    }
  } catch (error) {
    $("login-error").textContent = error.message;
    $("login-error").hidden = false;
  } finally { submit.disabled = false; }
});
$("logout-button").addEventListener("click", async () => {
  if (state.token) {
    try { await api("/api/admin/auth/logout", { method: "POST" }); }
    catch { /* Expiration remains backend-enforced. */ }
  }
  state.token = null;
  state.bases = [];
  state.documents = [];
  state.feedback = [];
  state.hits = null;
  $("backend-status").textContent = "未登录";
  $("backend-status").classList.remove("connected");
  $("logout-button").hidden = true;
  $("login-backdrop").hidden = false;
  render();
});
if (!isConnected) {
  $("backend-status").textContent = "未连接";
  render();
} else {
  $("backend-status").textContent = "未登录";
  $("login-backdrop").hidden = false;
  render();
}
