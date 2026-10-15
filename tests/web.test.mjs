import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

globalThis.window = {
  YIFULU_RAG_CONFIG: { apiBaseUrl: "https://api.example.test" },
  location: { origin: "https://professorzjh.github.io" }
};
const shared = await import("../shared.js");

test("API client passes JSON, bearer token and unwraps API envelopes", async () => {
  let actual;
  globalThis.fetch = async (url, options) => {
    actual = { url, options };
    return { ok: true, json: async () => ({ code: 0, data: { id: "abc" } }) };
  };
  const value = await shared.request("/api/admin/knowledge-bases", { method: "POST", token: "session-only", json: { name: "文档" } });
  assert.deepEqual(value, { id: "abc" });
  assert.equal(actual.url, "https://api.example.test/api/admin/knowledge-bases");
  assert.equal(actual.options.headers.Authorization, "Bearer session-only");
  assert.equal(actual.options.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(actual.options.body), { name: "文档" });
  assert.equal(actual.options.credentials, "omit");
});

test("API client does not hide HTTP errors or accept arbitrary paths", async () => {
  globalThis.fetch = async () => ({ ok: false, status: 403, json: async () => ({ message: "没有权限" }) });
  await assert.rejects(() => shared.request("/api/admin/knowledge-bases"), /没有权限/);
  await assert.rejects(() => shared.request("https://evil.example.test/collect"), /无效的 API 地址/);
});

test("text and source links are sanitized", () => {
  assert.equal(shared.escapeHtml('<img src=x onerror="alert(1)">'), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  assert.equal(shared.safeLink("javascript:alert(1)"), null);
  assert.equal(shared.safeLink("https://example.com/docs"), "https://example.com/docs");
});

test("both entry points share the product theme and have no sample answers", () => {
  for (const page of ["index.html", "admin.html"]) {
    const html = readFileSync(page, "utf8");
    assert.match(html, /lang="zh-CN"/);
    assert.match(html, /styles\.css/);
    assert.match(html, /config\.js/);
    assert.ok(!/测试回答|示例答案|模拟数据/.test(html));
  }
  assert.ok(existsSync("admin.css"));
  assert.ok(existsSync("app.js"));
  assert.ok(existsSync("admin.js"));
  const chat = readFileSync("app.js", "utf8");
  assert.ok(!/示例文档|演示流程|DEMO ANSWER|const cases\s*=/.test(chat));
  assert.match(chat, /\/api\/chat/);
  assert.match(chat, /openSources/);
  const admin = readFileSync("admin.js", "utf8");
  assert.ok(!/测试回答|模拟数据|示例结果/.test(admin));
  assert.match(admin, /\/api\/admin\/knowledge-bases/);
  assert.match(admin, /\/api\/admin\/retrieval\/test/);
  assert.match(admin, /\/api\/admin\/auth\/login/);
});
