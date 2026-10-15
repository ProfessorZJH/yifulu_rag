import { isConnected, request, icon, notify, safeLink } from "./shared.js";

const $ = (id) => document.getElementById(id);
for (const slot of document.querySelectorAll("[data-icon]")) slot.replaceChildren(icon(slot.dataset.icon, 18));

const state = {
  threads: [],
  activeId: null,
  knowledgeBaseId: "",
  busy: false,
  activeSources: []
};
const storageKey = "yifulu-rag-session-threads-v1";

try {
  const saved = JSON.parse(sessionStorage.getItem(storageKey) || "[]");
  state.threads = Array.isArray(saved)
    ? saved.filter((item) => item && typeof item.id === "string" && Array.isArray(item.messages))
      .slice(-30)
      .map((item) => ({
        id: item.id, title: String(item.title || "对话").slice(0, 80),
        serverId: typeof item.serverId === "string" ? item.serverId : null,
        messages: item.messages.filter((message) => ["user", "assistant"].includes(message.role) && typeof message.text === "string").slice(-60)
      }))
    : [];
} catch { state.threads = []; }

function persist() {
  try { sessionStorage.setItem(storageKey, JSON.stringify(state.threads.slice(-30))); }
  catch { /* Private mode or storage quota: keep the session in memory. */ }
}
function currentThread() { return state.threads.find((thread) => thread.id === state.activeId) || null; }
function make(tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (value !== undefined) element.textContent = value;
  return element;
}
function updateHistory() {
  const list = $("conversation-list");
  list.replaceChildren();
  for (const thread of state.threads.slice().reverse()) {
    const button = make("button", "history-item" + (thread.id === state.activeId ? " active" : ""));
    button.type = "button";
    button.append(icon("message", 15), make("span", "", thread.title));
    button.addEventListener("click", () => {
      if (state.busy) return;
      state.activeId = thread.id;
      renderConversation();
      updateHistory();
      closeMobileMenu();
    });
    list.append(button);
  }
}
function showWelcome(value) {
  const composer = $("chat-input-wrap");
  if (value) $("welcome-content").insertBefore(composer, $("suggestions"));
  else $("chat-main").append(composer);
  $("welcome").hidden = !value;
  $("message-list").hidden = value;
}
function scrollDown() { const container = $("chat-scroll"); container.scrollTop = container.scrollHeight; }

function appendMessage(message) {
  const row = make("article", "chat-message " + message.role);
  if (message.role === "user") {
    row.append(make("div", "chat-bubble", message.text));
  } else {
    row.append(make("div", "ai-avatar", "✦"));
    const main = make("div", "ai-answer");
    const paragraphs = String(message.text).split(/\n{2,}/);
    for (const paragraph of paragraphs) {
      const p = make("p");
      const segments = paragraph.split(/(\[\d+\])/g);
      for (const part of segments) {
        const marker = /^\[(\d+)\]$/.exec(part);
        const sourceIndex = marker ? Number(marker[1]) - 1 : -1;
        if (sourceIndex >= 0 && Array.isArray(message.sources) && message.sources[sourceIndex]) {
          const sourceButton = make("button", "citation", part);
          sourceButton.type = "button";
          sourceButton.setAttribute("aria-label", "查看来源 " + marker[1]);
          sourceButton.addEventListener("click", () => openSources(message.sources, sourceIndex));
          p.append(sourceButton);
        } else {
          p.append(document.createTextNode(part));
        }
      }
      main.append(p);
    }
    const tools = make("div", "answer-tools");
    const copy = make("button", "");
    copy.type = "button";
    copy.append(icon("copy", 16));
    copy.setAttribute("aria-label", "复制回答");
    copy.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(message.text); notify("已复制", "success"); }
      catch { notify("复制失败"); }
    });
    tools.append(copy);
    if (message.answerId) {
      for (const vote of ["up", "down"]) {
        const button = make("button");
        button.type = "button";
        button.setAttribute("aria-label", vote === "up" ? "有帮助" : "没有帮助");
        button.append(icon(vote === "up" ? "thumbsUp" : "thumbsDown", 16));
        button.addEventListener("click", async () => {
          try {
            await request("/api/feedback", { method: "POST", json: { answer_id: message.answerId, vote } });
            notify("已提交", "success");
          } catch (error) { notify(error.message); }
        });
        tools.append(button);
      }
    }
    if (Array.isArray(message.sources) && message.sources.length) {
      const sources = make("button", "source-count", message.sources.length + " 个来源");
      sources.type = "button";
      sources.append(icon("chevronRight", 13));
      sources.addEventListener("click", () => openSources(message.sources));
      tools.append(sources);
    }
    main.append(tools);
    row.append(main);
  }
  $("message-list").append(row);
  scrollDown();
}
function renderConversation() {
  $("message-list").replaceChildren();
  const thread = currentThread();
  showWelcome(!thread || thread.messages.length === 0);
  if (thread) for (const message of thread.messages) appendMessage(message);
  scrollDown();
}
function newConversation() {
  if (state.busy) return;
  state.activeId = null;
  renderConversation();
  updateHistory();
  closeMobileMenu();
  $("question").focus();
}
function setBusy(value) {
  state.busy = value;
  $("send-button").disabled = value;
  $("question").readOnly = value;
}

async function submitQuestion(question) {
  if (!question || state.busy) return;
  if (!isConnected) { notify("知识库服务尚未连接"); return; }

  let thread = currentThread();
  if (!thread) {
    thread = { id: crypto.randomUUID(), title: question.slice(0, 36), serverId: null, messages: [] };
    state.threads.push(thread);
    state.activeId = thread.id;
  }
  thread.messages.push({ role: "user", text: question });
  showWelcome(false);
  appendMessage(thread.messages.at(-1));
  updateHistory();
  persist();
  setBusy(true);

  const loading = make("div", "chat-message assistant");
  loading.append(make("div", "ai-avatar", "✦"));
  const loadingText = make("div", "ai-loading");
  loadingText.append(make("span", "loading-spinner"), make("span", "", "正在获取回答…"));
  loading.append(loadingText);
  $("message-list").append(loading);
  scrollDown();
  try {
    const payload = {
      question,
      ...(state.knowledgeBaseId ? { knowledge_base_id: state.knowledgeBaseId } : {}),
      ...(thread.serverId ? { conversation_id: thread.serverId } : {})
    };
    const result = await request("/api/chat", { method: "POST", json: payload, timeout: 60000 });
    if (!result || typeof result.answer !== "string" || !result.answer.trim()) throw new Error("没有收到有效回答");
    if (typeof result.conversation_id === "string") thread.serverId = result.conversation_id;
    const reply = {
      role: "assistant",
      text: result.answer,
      sources: Array.isArray(result.sources) ? result.sources.slice(0, 30).map((item) => ({
        title: String(item.title || "未命名文档"),
        snippet: String(item.snippet || ""),
        page: item.page ?? null,
        url: typeof item.url === "string" ? item.url : null
      })) : [],
      answerId: typeof result.answer_id === "string" ? result.answer_id : null
    };
    loading.remove();
    thread.messages.push(reply);
    appendMessage(reply);
  } catch (error) {
    loading.remove();
    const row = make("div", "chat-message assistant");
    row.append(make("div", "ai-avatar", "✦"), make("div", "ai-loading", error.message));
    $("message-list").append(row);
    scrollDown();
  } finally {
    setBusy(false);
    persist();
    $("question").focus();
  }
}

function openSources(list, focused = -1) {
  state.activeSources = list;
  const content = $("source-items");
  content.replaceChildren();
  list.forEach((source, i) => {
    const card = make("section", "source-card" + (i === focused ? " focus" : ""));
    const heading = make("div", "source-heading");
    heading.append(make("span", "source-number", i + 1), make("span", "", source.title));
    card.append(heading);
    if (source.snippet) card.append(make("p", "source-snippet", source.snippet));
    const meta = make("div", "source-meta");
    meta.append(make("span", "", source.page != null ? "第 " + source.page + " 页" : ""));
    const linkUrl = safeLink(source.url);
    if (linkUrl) {
      const link = make("a", "source-link", "查看原文");
      link.href = linkUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.append(icon("external", 14));
      meta.append(link);
    }
    card.append(meta);
    content.append(card);
  });
  $("source-drawer").hidden = false;
  $("source-backdrop").hidden = false;
  document.body.style.overflow = "hidden";
  $("source-close").focus();
  if (focused >= 0 && content.children[focused]) content.children[focused].scrollIntoView({ block: "nearest" });
}
function closeSources() {
  $("source-drawer").hidden = true;
  $("source-backdrop").hidden = true;
  document.body.style.overflow = "";
}
function closeMobileMenu() {
  $("sidebar").classList.remove("open");
  $("sidebar-overlay").hidden = true;
}

$("new-conversation").addEventListener("click", newConversation);
$("chat-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const value = $("question").value.trim();
  if (!value) return;
  if (!isConnected) { notify("知识库服务尚未连接"); return; }
  $("question").value = "";
  $("question").style.height = "";
  submitQuestion(value);
});
$("question").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    $("chat-form").requestSubmit();
  }
});
$("question").addEventListener("input", () => {
  const field = $("question");
  field.style.height = "auto";
  field.style.height = Math.min(field.scrollHeight, 150) + "px";
});
$("mobile-toggle").addEventListener("click", () => {
  $("sidebar").classList.toggle("open");
  $("sidebar-overlay").hidden = !$("sidebar").classList.contains("open");
});
$("sidebar-overlay").addEventListener("click", closeMobileMenu);
$("source-backdrop").addEventListener("click", closeSources);
$("source-close").addEventListener("click", closeSources);
document.addEventListener("keydown", (event) => { if (event.key === "Escape") { closeSources(); closeMobileMenu(); } });

async function loadCatalog() {
  if (!isConnected) {
    $("service-state").textContent = "服务未连接";
    $("service-state").hidden = false;
    return;
  }
  try {
    const result = await request("/api/knowledge-bases");
    const items = Array.isArray(result) ? result : result?.items;
    if (Array.isArray(items)) {
      const select = $("knowledge-base");
      select.replaceChildren(new Option("全部知识库", ""));
      for (const item of items) if (item?.id != null && item.name) select.append(new Option(String(item.name), String(item.id)));
      select.disabled = false;
      select.addEventListener("change", () => { state.knowledgeBaseId = select.value; });
    }
  } catch { /* Chat endpoint can still work without a catalog endpoint. */ }
  try {
    const result = await request("/api/suggestions");
    const questions = Array.isArray(result) ? result : result?.items;
    if (Array.isArray(questions) && questions.length) {
      const box = $("suggestions");
      box.replaceChildren();
      for (const suggestion of questions.slice(0, 3)) {
        const q = typeof suggestion === "string" ? suggestion : suggestion?.question;
        if (!q || typeof q !== "string") continue;
        const button = make("button", "suggestion");
        button.type = "button";
        button.append(make("span", "", q.slice(0, 100)), icon("arrowRight", 17));
        button.addEventListener("click", () => submitQuestion(q));
        box.append(button);
      }
      box.hidden = box.childElementCount === 0;
    }
  } catch { /* Suggestions are optional. */ }
}
updateHistory();
renderConversation();
loadCatalog();
