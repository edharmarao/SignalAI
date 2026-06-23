"use client";
import { useEffect, useState, useRef } from "react";
import { auth } from "@/lib/auth";

// ── Postman collection types ──────────────────────────────────────────────────

interface PMUrl {
  raw: string;
  query?: { key: string; value: string }[];
}

interface PMRequest {
  method: string;
  url: PMUrl | string;
  header?: { key: string; value: string }[];
  body?: { mode: string; raw?: string };
}

interface PMTestScript {
  exec: string[];
}

interface PMEvent {
  listen: string;
  script: PMTestScript;
}

interface PMItem {
  name: string;
  item?: PMItem[];          // folder
  request?: PMRequest;      // request
  event?: PMEvent[];
}

interface PMCollection {
  info: { name: string };
  item: PMItem[];
}

// ── Result types ──────────────────────────────────────────────────────────────

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

interface RequestResult {
  name: string;
  method: string;
  url: string;
  status: number | null;
  statusText: string;
  durationMs: number;
  responseBody: string;
  tests: TestResult[];
  error?: string;
}

// ── Minimal pm mock ───────────────────────────────────────────────────────────

function runTests(scripts: string[], response: { status: number; body: unknown }): TestResult[] {
  const results: TestResult[] = [];

  const expect = (actual: unknown) => {
    const chain: Record<string, unknown> = {};
    const assert = (cond: boolean, msg: string) => { if (!cond) throw new Error(msg); };

    chain.to = chain;
    chain.have = chain;
    chain.be = chain;
    chain.an = chain;
    chain.a = chain;
    chain.with = chain;
    chain.that = chain;
    chain.and = chain;
    chain.not = chain; // simplified — not negation

    (chain as { status: (code: number) => void }).status = (code: number) =>
      assert((actual as Response).status === code, `Expected status ${code} got ${(actual as Response).status}`);

    (chain as { property: (p: string) => void }).property = (p: string) =>
      assert(p in (actual as Record<string, unknown>), `Expected property '${p}'`);

    (chain as { eql: (v: unknown) => void }).eql = (v: unknown) =>
      assert(actual === v, `Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(v)}`);

    (chain as { above: (n: number) => void }).above = (n: number) =>
      assert(typeof actual === "number" && actual > n, `Expected ${actual} to be above ${n}`);

    (chain as { keys: (...k: string[]) => void }).keys = (...keys: string[]) => {
      const obj = actual as Record<string, unknown>;
      keys.forEach((k) => assert(k in obj, `Expected key '${k}'`));
    };

    (chain as { all: { keys: (...k: string[]) => void } }).all = {
      keys: (...keys: string[]) => {
        const obj = actual as Record<string, unknown>;
        keys.forEach((k) => assert(k in obj, `Expected key '${k}'`));
      },
    };

    (chain as { lengthOf: (n: number) => void }).lengthOf = (n: number) =>
      assert(Array.isArray(actual) && actual.length === n, `Expected length ${n} got ${(actual as unknown[]).length}`);

    (chain as { length: { above: (n: number) => void } }).length = {
      above: (n: number) =>
        assert(
          (Array.isArray(actual) && actual.length > n) ||
          (typeof actual === "string" && actual.length > n),
          `Expected length > ${n}`
        ),
    };

    return chain;
  };

  const pm = {
    response: {
      to: {
        have: {
          status: (code: number) => {
            if (response.status !== code)
              throw new Error(`Expected status ${code}, got ${response.status}`);
          },
        },
      },
      json: () => response.body,
    },
    test: (name: string, fn: () => void) => {
      try { fn(); results.push({ name, passed: true }); }
      catch (e) { results.push({ name, passed: false, error: (e as Error).message }); }
    },
    expect,
    collectionVariables: { set: () => {}, get: () => "" },
  };

  const code = scripts.join("\n");
  try {
    // eslint-disable-next-line no-new-func
    new Function("pm", code)(pm);
  } catch {
    // script error — already captured per-test above
  }
  return results;
}

// ── URL resolver ──────────────────────────────────────────────────────────────

function resolveUrl(raw: string | PMUrl, vars: Record<string, string>): string {
  const str = typeof raw === "string" ? raw : raw.raw ?? "";
  return str.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ApiTesterPage() {
  const [collection, setCollection] = useState<PMCollection | null>(null);
  const [loadError, setLoadError]   = useState("");
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const [running, setRunning]       = useState<string | null>(null);     // folder name or "all"
  const [results, setResults]       = useState<Record<string, RequestResult>>({});
  const [activeRequest, setActiveRequest] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch("/signalai-collection.json")
      .then((r) => r.json())
      .then(setCollection)
      .catch(() => setLoadError("Failed to load collection"));
  }, []);

  // Build variables from collection defaults
  const vars: Record<string, string> = {
    base_url:     "http://localhost:8003/api/v1",
    api_root:     "http://localhost:8003",
    exchange:     "NSE_EQ",
    symbol:       "RELIANCE",
    isin:         "INE002A01018",
    strategy_id:  "",
  };

  function toggleFolder(name: string) {
    setOpenFolders((prev) => {
      const n = new Set(prev);
      n.has(name) ? n.delete(name) : n.add(name);
      return n;
    });
  }

  async function runRequest(item: PMItem, reqKey: string): Promise<RequestResult> {
    const req = item.request!;
    const url = resolveUrl(req.url, vars);
    const method = req.method.toUpperCase();
    const authHeader = auth.getHeader() ? `Basic ${auth.getHeader()}` : "Basic ZWRyYW86cHJhYmhhczEyMyo=";

    const headers: Record<string, string> = {
      "Authorization": authHeader,
      "Content-Type": "application/json",
    };
    (req.header ?? []).forEach((h) => { headers[h.key] = h.value; });

    const start = Date.now();
    let status = 0, statusText = "", responseBody = "", responseJson: unknown = null;

    try {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const res = await fetch(url, {
        method,
        headers,
        body: method !== "GET" && method !== "HEAD" && req.body?.raw ? req.body.raw : undefined,
        signal: ctrl.signal,
      });
      status = res.status;
      statusText = res.statusText;
      const text = await res.text();
      responseBody = text;
      try { responseJson = JSON.parse(text); } catch { responseJson = text; }
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        return { name: item.name, method, url, status: null, statusText: "Aborted", durationMs: 0, responseBody: "", tests: [] };
      }
      return { name: item.name, method, url, status: null, statusText: String(e), durationMs: Date.now() - start, responseBody: "", tests: [], error: String(e) };
    }

    const durationMs = Date.now() - start;

    // Run test scripts
    const testEvent = (item.event ?? []).find((e) => e.listen === "test");
    const tests = testEvent
      ? runTests(testEvent.script.exec, { status, body: responseJson })
      : [];

    const result: RequestResult = { name: item.name, method, url, status, statusText, durationMs, responseBody, tests };
    setResults((prev) => ({ ...prev, [reqKey]: result }));
    return result;
  }

  async function runFolder(folder: PMItem) {
    const requests = (folder.item ?? []).filter((i) => i.request);
    setRunning(folder.name);
    setOpenFolders((prev) => new Set([...prev, folder.name]));
    for (const req of requests) {
      const key = `${folder.name}::${req.name}`;
      setActiveRequest(key);
      await runRequest(req, key);
    }
    setRunning(null);
    setActiveRequest(null);
  }

  async function runAll() {
    if (!collection) return;
    setRunning("all");
    for (const folder of collection.item) {
      if (!folder.item) continue;
      setOpenFolders((prev) => new Set([...prev, folder.name]));
      for (const req of folder.item.filter((i) => i.request)) {
        const key = `${folder.name}::${req.name}`;
        setActiveRequest(key);
        await runRequest(req, key);
      }
    }
    setRunning(null);
    setActiveRequest(null);
  }

  function stopRun() {
    abortRef.current?.abort();
    setRunning(null);
    setActiveRequest(null);
  }

  // Summary counts
  const allResults = Object.values(results);
  const passed = allResults.flatMap((r) => r.tests).filter((t) => t.passed).length;
  const failed = allResults.flatMap((r) => r.tests).filter((t) => !t.passed).length;
  const totalReqs = allResults.length;

  function statusColor(status: number | null) {
    if (!status) return "text-slate-400";
    if (status < 300) return "text-emerald-400";
    if (status < 400) return "text-sky-400";
    if (status < 500) return "text-amber-400";
    return "text-red-400";
  }

  function methodColor(method: string) {
    const map: Record<string, string> = {
      GET: "text-emerald-400 bg-emerald-500/10",
      POST: "text-sky-400 bg-sky-500/10",
      PUT: "text-amber-400 bg-amber-500/10",
      PATCH: "text-orange-400 bg-orange-500/10",
      DELETE: "text-red-400 bg-red-500/10",
    };
    return map[method] ?? "text-slate-400 bg-slate-700";
  }

  const selectedResult = activeRequest ? results[activeRequest] : null;

  if (loadError) return (
    <div className="flex items-center justify-center h-64 text-red-400 text-sm">{loadError}</div>
  );
  if (!collection) return (
    <div className="flex items-center justify-center h-64 text-slate-500 text-sm">Loading collection…</div>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">API Tester</h1>
          <p className="text-sm text-slate-400 mt-1">{collection.info.name} — {collection.item.length} folders</p>
        </div>
        <div className="flex items-center gap-3">
          {totalReqs > 0 && (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-slate-400">{totalReqs} ran</span>
              {passed > 0 && <span className="text-emerald-400">✓ {passed} passed</span>}
              {failed > 0 && <span className="text-red-400">✗ {failed} failed</span>}
            </div>
          )}
          {running ? (
            <button onClick={stopRun}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 transition">
              ⏹ Stop
            </button>
          ) : (
            <button onClick={runAll}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition">
              ▶ Run All
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-4" style={{ minHeight: "70vh" }}>

        {/* ── Left: Folder list ─────────────────────────────────────── */}
        <div className="w-72 shrink-0 flex flex-col gap-1 overflow-y-auto">
          {collection.item.map((folder) => {
            const requests = (folder.item ?? []).filter((i) => i.request);
            const isOpen = openFolders.has(folder.name);
            const folderResults = requests.map((r) => results[`${folder.name}::${r.name}`]).filter(Boolean);
            const folderPassed = folderResults.flatMap((r) => r.tests).filter((t) => t.passed).length;
            const folderFailed = folderResults.flatMap((r) => r.tests).filter((t) => !t.passed).length;
            const folderErrors = folderResults.filter((r) => r.status !== null && r.status >= 400).length;

            return (
              <div key={folder.name} className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <button onClick={() => toggleFolder(folder.name)}
                    className="flex-1 flex items-center gap-2 text-left">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      className={`w-3.5 h-3.5 text-slate-500 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`}>
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                    <span className="text-sm text-slate-200 truncate">{folder.name}</span>
                    <span className="text-xs text-slate-500 shrink-0">{requests.length}</span>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    {folderPassed > 0 && <span className="text-xs text-emerald-500">✓{folderPassed}</span>}
                    {folderFailed > 0 && <span className="text-xs text-red-500">✗{folderFailed}</span>}
                    {folderErrors > 0 && <span className="text-xs text-amber-500">⚠{folderErrors}</span>}
                  </div>
                  <button
                    disabled={running !== null}
                    onClick={() => runFolder(folder)}
                    className="text-xs px-2 py-0.5 rounded border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500 disabled:opacity-40 transition">
                    ▶
                  </button>
                </div>

                {isOpen && (
                  <div className="border-t border-slate-800 divide-y divide-slate-800/60">
                    {requests.map((req) => {
                      const key = `${folder.name}::${req.name}`;
                      const res = results[key];
                      const isActive = activeRequest === key;
                      const isSelected = activeRequest === key || (!activeRequest && selectedResult?.name === req.name);
                      const testsPassed = res?.tests.every((t) => t.passed) ?? null;

                      return (
                        <button key={key} onClick={() => { setActiveRequest(activeRequest === key ? null : key); }}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-left transition ${
                            isSelected ? "bg-slate-800" : "hover:bg-slate-800/50"
                          }`}>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${methodColor(req.request?.method ?? "GET")}`}>
                            {req.request?.method ?? "GET"}
                          </span>
                          <span className={`text-xs truncate flex-1 ${isActive ? "text-slate-200" : "text-slate-400"}`}>
                            {req.name}
                          </span>
                          {isActive && running && (
                            <span className="text-xs text-amber-400 shrink-0 animate-pulse">…</span>
                          )}
                          {res && (
                            <span className={`text-xs shrink-0 ${statusColor(res.status)}`}>
                              {res.status ?? "err"}
                            </span>
                          )}
                          {res && res.tests.length > 0 && (
                            <span className={`text-xs shrink-0 ${testsPassed ? "text-emerald-500" : "text-red-500"}`}>
                              {testsPassed ? "✓" : "✗"}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Right: Detail panel ───────────────────────────────────── */}
        <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl p-5 overflow-auto">
          {activeRequest && results[activeRequest] ? (() => {
            const r = results[activeRequest];
            let bodyPretty = r.responseBody;
            try { bodyPretty = JSON.stringify(JSON.parse(r.responseBody), null, 2); } catch { /* keep raw */ }

            return (
              <div className="flex flex-col gap-4">
                {/* Request info */}
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={`text-xs font-bold px-2 py-1 rounded ${methodColor(r.method)}`}>{r.method}</span>
                  <span className="font-mono text-xs text-slate-300 break-all">{r.url}</span>
                  <span className={`ml-auto text-sm font-semibold ${statusColor(r.status)}`}>{r.status ?? "Error"}</span>
                  <span className="text-xs text-slate-500">{r.durationMs}ms</span>
                </div>

                {r.error && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400">
                    {r.error}
                  </div>
                )}

                {/* Test results */}
                {r.tests.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-slate-400 uppercase mb-2">Tests ({r.tests.length})</div>
                    <div className="flex flex-col gap-1">
                      {r.tests.map((t, i) => (
                        <div key={i} className={`flex items-start gap-2 text-sm px-3 py-2 rounded-lg ${
                          t.passed ? "bg-emerald-500/5 text-emerald-300" : "bg-red-500/5 text-red-300"
                        }`}>
                          <span className="shrink-0">{t.passed ? "✓" : "✗"}</span>
                          <span>{t.name}</span>
                          {!t.passed && t.error && (
                            <span className="text-xs text-red-400 ml-auto">{t.error}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Response body */}
                <div>
                  <div className="text-xs font-medium text-slate-400 uppercase mb-2">Response Body</div>
                  <pre className="bg-slate-950 border border-slate-800 rounded-lg p-4 text-xs text-slate-300 overflow-auto max-h-[500px] whitespace-pre-wrap">
                    {bodyPretty || "(empty)"}
                  </pre>
                </div>
              </div>
            );
          })() : (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-12 h-12 opacity-40">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                <polyline points="13 2 13 9 20 9" />
              </svg>
              <p className="text-sm">Click a request to see results, or run a folder</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
