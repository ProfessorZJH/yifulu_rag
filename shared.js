export const apiBaseUrl = String(window.YIFULU_RAG_CONFIG?.apiBaseUrl || "").trim().replace(/\/+$/, "");
export const isConnected = Boolean(apiBaseUrl);

export async function request(path, options = {}) {
  if (!isConnected) throw new Error("服务尚未连接");
  if (!path.startsWith("/api/")) throw new Error("无效的 API 地址");
  const headers = { Accept: "application/json", ...(options.headers || {}) };
  if (options.token) headers.Authorization = "Bearer " + options.token;
  let body = options.body;
  if (options.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.json);
  }
  let response;
  try {
    response = await fetch(apiBaseUrl + path, {
      method: options.method || "GET",
      headers,
      body,
      signal: options.signal || AbortSignal.timeout(options.timeout || 30000),
      credentials: "omit",
      cache: "no-store"
    });
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") throw new Error("请求超时");
    throw new Error("网络连接失败");
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof payload?.message === "string" ? payload.message : ("请求失败（" + response.status + "）");
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  if (payload && typeof payload === "object" && "data" in payload && ("code" in payload || "success" in payload)) {
    return payload.data;
  }
  return payload;
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

export function formatBytes(bytes) {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return Math.round(bytes) + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}
export function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
export function safeLink(url) {
  if (typeof url !== "string" || !url.trim()) return null;
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.protocol === "https:" || (parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname))
      ? parsed.href : null;
  } catch { return null; }
}

const shapes = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  message: '<path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.9-5.4A9 9 0 1 1 21 11.5Z"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  flask: '<path d="M9 3h6M10 3v7l-6 9a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-6-9V3M8 15h8"/>',
  feedback: '<path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.9-5.4A9 9 0 1 1 21 11.5Z"/><path d="M12 7v5M12 16h.01"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  arrowUp: '<path d="m12 19 0-14m-6 6 6-6 6 6"/>',
  arrowRight: '<path d="M4 12h16m-7-7 7 7-7 7"/>',
  arrowLeft: '<path d="M20 12H4m7 7-7-7 7-7"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4m9 1V3m-5 5 5-5 5 5"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14-5L4 8m0-5v5h5M4 13a8 8 0 0 0 14 5l2-2m0 5v-5h-5"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2m3 0-1 15H6L5 6M10 10v7m4-7v7"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 4h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  thumbsUp: '<path d="M7 10v11H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Zm0 0 5-8a3 3 0 0 1 3 3l-1 5h5a3 3 0 0 1 3 3l-2 6a3 3 0 0 1-3 2H7"/>',
  thumbsDown: '<path d="M7 14V3H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2Zm0 0 5 8a3 3 0 0 0 3-3l-1-5h5a3 3 0 0 0 3-3l-2-6a3 3 0 0 0-3-2H7"/>',
  external: '<path d="M13 5h6v6M19 5l-9 9M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6"/>',
  shield: '<path d="M12 22c6-2 9-7 9-12V5l-9-3-9 3v5c0 5 3 10 9 12Z"/><path d="m9 12 2 2 4-4"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 4 5 5-5 5m5-5H9"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'
};
export function icon(name, size = 18) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  // Only constant SVG fragments from this module, never fetched data.
  svg.innerHTML = shapes[name] || shapes.file;
  return svg;
}
export function putIcon(element, name, size = 18) { element.replaceChildren(icon(name, size)); }
export function notify(message, kind = "error") {
  let toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.className = "toast visible " + kind;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => toast.classList.remove("visible"), 3200);
}
