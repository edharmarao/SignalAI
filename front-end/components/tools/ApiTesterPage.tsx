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
  variable?: { key: string; value: string; type?: string }[];
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

interface EditedConfig {
  url: string;
  method: string;
  headers: { key: string; value: string }[];
  body: string;
}

// ── Minimal pm mock ───────────────────────────────────────────────────────────

function runTests(
  scripts: string[], 
  response: { status: number; body: unknown },
  currentVars: Record<string, string>,
  onVariableChange: (key: string, value: string) => void
): TestResult[] {
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
    collectionVariables: {
      set: (key: string, value: string) => {
        onVariableChange(key, value);
      },
      get: (key: string) => {
        return currentVars[key] ?? "";
      }
    },
    environment: {
      set: (key: string, value: string) => {
        onVariableChange(key, value);
      },
      get: (key: string) => {
        return currentVars[key] ?? "";
      }
    }
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

// ── Variable resolver ─────────────────────────────────────────────────────────

function resolveTemplate(tmpl: string, vars: Record<string, string>): string {
  if (!tmpl) return "";
  return tmpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ApiTesterPage() {
  const [collection, setCollection] = useState<PMCollection | null>(null);
  const [loadError, setLoadError]   = useState("");
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const [running, setRunning]       = useState<string | null>(null);     // folder name, "all", or "single"
  const [results, setResults]       = useState<Record<string, RequestResult>>({});
  const [activeRequest, setActiveRequest] = useState<string | null>(null);
  const [showVarsModal, setShowVarsModal] = useState(false);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [parallel, setParallel] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const [filterType, setFilterType] = useState<"all" | "failed">("all");
  const [editedConfigs, setEditedConfigs] = useState<Record<string, EditedConfig>>({});

  function isRequestFailed(folderName: string, reqName: string): boolean {
    const key = `${folderName}::${reqName}`;
    const res = results[key];
    if (!res) return false;
    const hasFailedTests = res.tests.length > 0 && res.tests.some((t) => !t.passed);
    const isHttpError = res.status !== null && res.status >= 400;
    return hasFailedTests || !!res.error || isHttpError;
  }

  function getRequestConfig(folderName: string, reqName: string): EditedConfig {
    const key = `${folderName}::${reqName}`;
    if (editedConfigs[key]) {
      return editedConfigs[key];
    }
    const folder = collection?.item.find((f) => f.name === folderName);
    const reqItem = folder?.item?.find((r) => r.name === reqName);
    const req = reqItem?.request;
    const rawUrl = typeof req?.url === "string" ? req.url : req?.url?.raw ?? "";
    const headers = (req?.header ?? []).map((h) => ({ key: h.key, value: h.value }));
    const body = req?.body?.raw ?? "";
    const method = req?.method ?? "GET";
    return { url: rawUrl, method, headers, body };
  }

  function updateRequestConfig(key: string, updates: Partial<EditedConfig>) {
    setEditedConfigs((prev) => {
      const current = prev[key] || getRequestConfig(...(key.split("::") as [string, string]));
      return {
        ...prev,
        [key]: {
          ...current,
          ...updates,
        },
      };
    });
  }

  useEffect(() => {
    fetch("/signalai-collection.json")
      .then((r) => r.json())
      .then((data: PMCollection) => {
        setCollection(data);
        
        // Load variables from localStorage
        const saved = localStorage.getItem("signalai_api_tester_variables");
        if (saved) {
          try {
            setVariables(JSON.parse(saved));
            return;
          } catch (e) {
            console.error("Failed to parse saved variables", e);
          }
        }
        
        // Wrangle defaults from collection
        const defaults: Record<string, string> = {};
        if (data.variable) {
          data.variable.forEach((v) => {
            if (v.key) defaults[v.key] = v.value ?? "";
          });
        }
        
        // Fallback default setups for local environment
        const apiBase = `${window.location.origin}/api/v1`;
        const apiRoot = window.location.origin;
        defaults["base_url"] = defaults["base_url"] || apiBase;
        defaults["api_root"] = defaults["api_root"] || apiRoot;
        defaults["api_username"] = defaults["api_username"] || "edrao";
        defaults["api_password"] = defaults["api_password"] || "prabhas123*";
        defaults["exchange"] = defaults["exchange"] || "NSE_EQ";
        defaults["symbol"] = defaults["symbol"] || "RELIANCE";
        defaults["isin"] = defaults["isin"] || "INE002A01018";
        
        setVariables(defaults);
      })
      .catch(() => setLoadError("Failed to load collection"));
  }, []);

  function toggleFolder(name: string) {
    setOpenFolders((prev) => {
      const n = new Set(prev);
      n.has(name) ? n.delete(name) : n.add(name);
      return n;
    });
  }

  function resetVariablesToDefault() {
    if (!collection) return;
    const defaults: Record<string, string> = {};
    if (collection.variable) {
      collection.variable.forEach((v) => {
        if (v.key) defaults[v.key] = v.value ?? "";
      });
    }
    const apiBase = `${window.location.origin}/api/v1`;
    const apiRoot = window.location.origin;
    defaults["base_url"] = defaults["base_url"] || apiBase;
    defaults["api_root"] = defaults["api_root"] || apiRoot;
    defaults["api_username"] = defaults["api_username"] || "edrao";
    defaults["api_password"] = defaults["api_password"] || "prabhas123*";
    defaults["exchange"] = defaults["exchange"] || "NSE_EQ";
    defaults["symbol"] = defaults["symbol"] || "RELIANCE";
    defaults["isin"] = defaults["isin"] || "INE002A01018";
    
    setVariables(defaults);
    localStorage.setItem("signalai_api_tester_variables", JSON.stringify(defaults));
  }

  function updateVariable(key: string, val: string) {
    setVariables((prev) => {
      const updated = { ...prev, [key]: val };
      localStorage.setItem("signalai_api_tester_variables", JSON.stringify(updated));
      return updated;
    });
  }

  function removeVariable(key: string) {
    setVariables((prev) => {
      const updated = { ...prev };
      delete updated[key];
      localStorage.setItem("signalai_api_tester_variables", JSON.stringify(updated));
      return updated;
    });
  }

  async function runRequest(item: PMItem, reqKey: string, currentVars: Record<string, string>): Promise<RequestResult> {
    const [folderName, reqName] = reqKey.split("::");
    const config = getRequestConfig(folderName, reqName);
    const url = resolveTemplate(config.url, currentVars);
    const method = config.method.toUpperCase();

    // Prepare headers resolving variables
    const headers: Record<string, string> = {};
    config.headers.forEach((h) => {
      if (h.key) {
        headers[resolveTemplate(h.key, currentVars)] = resolveTemplate(h.value, currentVars);
      }
    });

    if (method !== "GET" && method !== "HEAD" && config.body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    // Set Authorization header
    if (!headers["Authorization"]) {
      const authToken = currentVars["auth_token"];
      if (authToken) {
        headers["Authorization"] = `Basic ${authToken}`;
      } else if (currentVars["api_username"] && currentVars["api_password"]) {
        const encoded = btoa(`${currentVars["api_username"]}:${currentVars["api_password"]}`);
        headers["Authorization"] = `Basic ${encoded}`;
      } else if (auth.getHeader()) {
        headers["Authorization"] = `Basic ${auth.getHeader()}`;
      }
    }

    const start = Date.now();
    let status = 0, statusText = "", responseBody = "", responseJson: unknown = null;

    try {
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      // Resolve body variables
      let resolvedBody: string | undefined = undefined;
      if (method !== "GET" && method !== "HEAD" && config.body) {
        resolvedBody = resolveTemplate(config.body, currentVars);
      }

      const res = await fetch(url, {
        method,
        headers,
        body: resolvedBody,
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

    // Run test scripts with dynamic variable modifications
    const testEvent = (item.event ?? []).find((e) => e.listen === "test");
    const tests = testEvent
      ? runTests(testEvent.script.exec, { status, body: responseJson }, currentVars, (key, val) => {
          setVariables((prev) => {
            const updated = { ...prev, [key]: val };
            localStorage.setItem("signalai_api_tester_variables", JSON.stringify(updated));
            currentVars[key] = val;
            return updated;
          });
        })
      : [];

    const result: RequestResult = { name: item.name, method, url, status, statusText, durationMs, responseBody, tests };
    setResults((prev) => ({ ...prev, [reqKey]: result }));
    return result;
  }

  async function runFolder(folder: PMItem, isParallel = parallel) {
    const requests = (folder.item ?? []).filter((i) => i.request);
    setRunning(folder.name);
    setOpenFolders((prev) => new Set([...prev, folder.name]));
    
    // Pass localVars so sequential scripts can pass values to next requests
    const localVars = { ...variables };
    if (isParallel) {
      const promises = requests.map((req) => {
        const key = `${folder.name}::${req.name}`;
        return runRequest(req, key, localVars);
      });
      await Promise.all(promises);
    } else {
      for (const req of requests) {
        const key = `${folder.name}::${req.name}`;
        setActiveRequest(key);
        await runRequest(req, key, localVars);
      }
    }
    setRunning(null);
    setActiveRequest(null);
  }

  async function runAll(isParallel = parallel) {
    if (!collection) return;
    setRunning("all");
    
    // Pass localVars to support dynamic output variables across folders
    const localVars = { ...variables };
    if (isParallel) {
      const promises = collection.item.flatMap((folder) => {
        if (!folder.item) return [];
        setOpenFolders((prev) => new Set([...prev, folder.name]));
        return folder.item.filter((i) => i.request).map((req) => {
          const key = `${folder.name}::${req.name}`;
          return runRequest(req, key, localVars);
        });
      });
      await Promise.all(promises);
    } else {
      for (const folder of collection.item) {
        if (!folder.item) continue;
        setOpenFolders((prev) => new Set([...prev, folder.name]));
        for (const req of folder.item.filter((i) => i.request)) {
          const key = `${folder.name}::${req.name}`;
          setActiveRequest(key);
          await runRequest(req, key, localVars);
        }
      }
    }
    setRunning(null);
    setActiveRequest(null);
  }

  async function runSingleRequest(req: PMItem, key: string) {
    setRunning("single");
    const localVars = { ...variables };
    await runRequest(req, key, localVars);
    setRunning(null);
  }

  function stopRun() {
    abortRef.current?.abort();
    setRunning(null);
    setActiveRequest(null);
  }

  // Summary calculations
  const allResults = Object.values(results) as RequestResult[];
  const passed = allResults.flatMap((r) => r.tests).filter((t) => t.passed).length;
  const failed = allResults.flatMap((r) => r.tests).filter((t) => !t.passed).length;
  const totalReqs = allResults.length;

  function statusColor(status: number | null) {
    if (status === null) return "text-slate-400";
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

  // Helper to find selected request in collection
  const findRequestInCollection = (key: string | null): { folder: PMItem; requestItem: PMItem } | null => {
    if (!key || !collection) return null;
    const [folderName, reqName] = key.split("::");
    const folder = collection.item.find((f) => f.name === folderName);
    if (!folder || !folder.item) return null;
    const requestItem = folder.item.find((r) => r.name === reqName);
    if (!requestItem) return null;
    return { folder, requestItem };
  };

  const selectedItem = findRequestInCollection(activeRequest);
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
            <div className="flex items-center gap-2.5 text-sm mr-2 bg-slate-900/40 border border-slate-800/80 rounded-xl px-3 py-1.5 select-none">
              <button 
                onClick={() => setFilterType("all")}
                className={`transition-all hover:text-slate-200 ${
                  filterType === "all" 
                    ? "text-slate-100 font-semibold underline underline-offset-4 decoration-violet-500 decoration-2" 
                    : "text-slate-400"
                }`}>
                {totalReqs} ran
              </button>
              <span className="text-slate-700">|</span>
              <button 
                onClick={() => setFilterType("failed")}
                disabled={failed === 0}
                className={`transition-all ${failed > 0 ? "hover:text-red-350" : "opacity-40 cursor-not-allowed"} ${
                  filterType === "failed" 
                    ? "text-red-400 font-semibold underline underline-offset-4 decoration-red-500 decoration-2" 
                    : "text-red-400/80"
                }`}>
                ✗ {failed} failed
              </button>
            </div>
          )}
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-400 bg-slate-900/40 border border-slate-800 rounded-lg px-3 py-2 cursor-pointer hover:bg-slate-800/40 hover:text-slate-200 transition">
            <input 
              type="checkbox" 
              checked={parallel} 
              onChange={(e) => setParallel(e.target.checked)} 
              className="accent-violet-500 rounded border-slate-800 bg-slate-950 focus:ring-violet-500 w-3.5 h-3.5" 
            />
            <span>Parallel Run</span>
          </label>
          <button 
            onClick={() => setShowVarsModal(true)}
            className="px-4 py-2 rounded-lg text-sm font-semibold border border-slate-800 bg-slate-900/40 text-slate-300 hover:text-slate-100 hover:bg-slate-800/60 hover:border-slate-700 transition flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-slate-400">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
            Variables
          </button>
          {running ? (
            <button onClick={stopRun}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 transition flex items-center gap-1.5">
              <span>⏹</span> Stop
            </button>
          ) : (
            <button onClick={() => runAll()}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition flex items-center gap-1.5">
              <span>▶</span> Run All
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-4" style={{ minHeight: "72vh" }}>

        {/* ── Left: Folder and Request List ─────────────────────────── */}
        <div className="w-72 shrink-0 flex flex-col gap-1 overflow-y-auto max-h-[75vh] pr-1">
          {filterType === "failed" && (
            <div className="flex items-center justify-between px-3 py-2 bg-red-950/20 border border-red-900/35 rounded-lg mb-1.5 text-xs text-red-400 shrink-0 select-none">
              <span className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
                Filtered: Failed cases
              </span>
              <button 
                onClick={() => setFilterType("all")} 
                className="underline hover:text-red-300 transition-colors font-medium">
                Show All
              </button>
            </div>
          )}
          {collection.item.map((folder) => {
            const requests = (folder.item ?? []).filter((i) => i.request);
            const visibleRequests = requests.filter((r) => {
              if (filterType === "failed") {
                return isRequestFailed(folder.name, r.name);
              }
              return true;
            });

            if (filterType === "failed" && visibleRequests.length === 0) {
              return null;
            }

            const isOpen = openFolders.has(folder.name);
            const folderResults = requests.map((r) => results[`${folder.name}::${r.name}`]).filter(Boolean);
            const folderPassed = folderResults.flatMap((r) => r.tests).filter((t) => t.passed).length;
            const folderFailed = folderResults.flatMap((r) => r.tests).filter((t) => !t.passed).length;
            const folderErrors = folderResults.filter((r) => r.status !== null && r.status >= 400).length;

            return (
              <div key={folder.name} className="bg-slate-900/60 border border-slate-800/80 rounded-lg overflow-hidden shrink-0">
                <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-slate-800/20 transition-colors">
                  <button onClick={() => toggleFolder(folder.name)}
                    className="flex-1 flex items-center gap-2 text-left">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                      className={`w-3.5 h-3.5 text-slate-500 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`}>
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                    <span className="text-sm font-medium text-slate-200 truncate">{folder.name}</span>
                    <span className="text-xs text-slate-500 shrink-0">({visibleRequests.length})</span>
                  </button>
                  <div className="flex items-center gap-1.5 shrink-0 mr-1">
                    {folderPassed > 0 && <span className="text-[10px] px-1 bg-emerald-500/10 text-emerald-400 rounded">✓{folderPassed}</span>}
                    {folderFailed > 0 && <span className="text-[10px] px-1 bg-red-500/10 text-red-400 rounded">✗{folderFailed}</span>}
                    {folderErrors > 0 && <span className="text-[10px] px-1 bg-amber-500/10 text-amber-400 rounded">⚠{folderErrors}</span>}
                  </div>
                  <button
                    disabled={running !== null}
                    onClick={() => runFolder(folder)}
                    className="text-xs px-2 py-0.5 rounded border border-slate-700 bg-slate-800/40 text-slate-400 hover:text-slate-200 hover:border-slate-500 disabled:opacity-40 transition">
                    ▶
                  </button>
                </div>

                {isOpen && (
                  <div className="border-t border-slate-800/60 divide-y divide-slate-800/40 bg-slate-950/20">
                    {visibleRequests.map((req) => {
                      const key = `${folder.name}::${req.name}`;
                      const res = results[key];
                      const isActive = activeRequest === key;
                      const isSelected = activeRequest === key;
                      const testsPassed = res?.tests.length > 0 && res.tests.every((t) => t.passed);
                      const testsFailed = res?.tests.some((t) => !t.passed);
                      const config = getRequestConfig(folder.name, req.name);

                      return (
                        <button key={key} onClick={() => { setActiveRequest(key); }}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-left transition ${
                            isSelected ? "bg-slate-800/60 text-slate-100" : "hover:bg-slate-850/40 text-slate-400 hover:text-slate-200"
                          }`}>
                          <span className={`text-[9px] font-bold px-1 py-0.5 rounded shrink-0 w-10 text-center ${methodColor(config.method)}`}>
                            {config.method}
                          </span>
                          <span className="text-xs truncate flex-1 font-medium">
                            {req.name}
                          </span>
                          {isActive && running && running !== "single" && (
                            <span className="text-xs text-amber-400 shrink-0 animate-pulse">…</span>
                          )}
                          {res && (
                            <span className={`text-[10px] font-semibold shrink-0 ${statusColor(res.status)}`}>
                              {res.status ?? "err"}
                            </span>
                          )}
                          {res && (res.tests.length > 0 || res.error || (res.status !== null && res.status >= 400)) && (
                            <span className={`text-xs shrink-0 ${testsPassed && !res.error && res.status !== null && res.status < 400 ? "text-emerald-500" : "text-red-500"}`}>
                              {testsPassed && !res.error && res.status !== null && res.status < 400 ? "✓" : "✗"}
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

        {/* ── Right: Request & Response Detail Panel ────────────────── */}
        <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl p-5 overflow-auto flex flex-col gap-4">
          {activeRequest && selectedItem ? (() => {
            const [folderName, reqName] = activeRequest.split("::");
            const currentConfig = getRequestConfig(folderName, reqName);
            const r = selectedResult;
            const resolvedUrl = resolveTemplate(currentConfig.url, variables);
            
            let bodyPretty = r?.responseBody || "";
            if (bodyPretty) {
              try { bodyPretty = JSON.stringify(JSON.parse(bodyPretty), null, 2); } catch { /* raw */ }
            }

            return (
              <div className="flex flex-col gap-4 h-full">
                {/* Top Request Bar */}
                <div className="flex items-center gap-3 bg-slate-950/40 border border-slate-800 rounded-xl p-3.5">
                  <select
                    value={currentConfig.method}
                    onChange={(e) => updateRequestConfig(activeRequest, { method: e.target.value })}
                    className={`text-xs font-bold px-2 py-1 rounded shrink-0 bg-slate-950 border border-slate-800 text-slate-100 focus:outline-none focus:border-violet-500 cursor-pointer`}>
                    {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  <div className="flex-1 flex flex-col gap-1">
                    <input
                      type="text"
                      value={currentConfig.url}
                      onChange={(e) => updateRequestConfig(activeRequest, { url: e.target.value })}
                      className="font-mono text-xs text-slate-300 bg-slate-950 border border-slate-800/80 rounded-lg px-3 py-1.5 focus:border-violet-500 focus:outline-none w-full"
                      placeholder="Request URL"
                    />
                    {currentConfig.url && currentConfig.url.includes("{{") && (
                      <span className="text-[10px] text-slate-500 font-mono truncate px-1">
                        Resolves to: {resolvedUrl}
                      </span>
                    )}
                  </div>
                  <button
                    disabled={running !== null}
                    onClick={() => runSingleRequest(selectedItem.requestItem, activeRequest)}
                    className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-slate-100 disabled:opacity-40 transition flex items-center gap-1 shrink-0">
                    {running === "single" ? "Sending..." : "Send Request"}
                  </button>
                </div>

                {/* Sub info */}
                <div className="flex items-center gap-4 text-xs text-slate-500 border-b border-slate-800 pb-3">
                  <span>Name: <strong className="text-slate-300">{selectedItem.requestItem.name}</strong></span>
                  <span>Folder: <span className="text-slate-400">{selectedItem.folder.name}</span></span>
                  {r && (
                    <>
                      <span className="ml-auto">Status: <strong className={statusColor(r.status)}>{r.status ?? "Error"} {r.statusText}</strong></span>
                      <span>Duration: <strong className="text-slate-300">{r.durationMs}ms</strong></span>
                    </>
                  )}
                </div>

                {r?.error && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400 font-mono">
                    {r.error}
                  </div>
                )}

                {/* Left/Right splitting for Request Payload vs Response Results */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1">
                  
                  {/* Left Column: Request Configuration */}
                  <div className="flex flex-col gap-3">
                    {/* Headers */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Headers</div>
                        <button
                          onClick={() => {
                            const newHeaders = [...currentConfig.headers, { key: "", value: "" }];
                            updateRequestConfig(activeRequest, { headers: newHeaders });
                          }}
                          className="text-[10px] text-violet-400 hover:text-violet-300 transition font-semibold"
                        >
                          + Add Header
                        </button>
                      </div>
                      <div className="bg-slate-950/30 border border-slate-800/80 rounded-lg p-3 flex flex-col gap-2 max-h-52 overflow-y-auto">
                        <div className="flex text-[10px] font-bold text-slate-500 border-b border-slate-800/85 pb-1">
                          <span className="w-1/3">Key</span>
                          <span className="w-7/12">Value</span>
                          <span className="w-1/12"></span>
                        </div>
                        {/* Auth header mock preview */}
                        <div className="flex text-xs font-mono py-0.5 text-slate-400 items-center">
                          <span className="w-1/3 truncate text-slate-500 font-semibold">Authorization</span>
                          <span className="w-8/12 truncate text-slate-500/90 font-medium">
                            {variables["auth_token"] ? "Basic {{auth_token}} (custom)" : variables["api_username"] ? "Basic (username/password)" : auth.getHeader() ? "Basic (current user auth)" : "(not configured)"}
                          </span>
                          <span className="w-1/12"></span>
                        </div>
                        {currentConfig.headers.map((h, i) => (
                          <div key={i} className="flex items-center gap-2 border-t border-slate-900/50 pt-2 first:border-t-0 first:pt-0">
                            <input
                              type="text"
                              placeholder="Key"
                              value={h.key}
                              onChange={(e) => {
                                const newHeaders = [...currentConfig.headers];
                                newHeaders[i] = { ...newHeaders[i], key: e.target.value };
                                updateRequestConfig(activeRequest, { headers: newHeaders });
                              }}
                              className="w-1/3 bg-slate-950 border border-slate-850 rounded px-2 py-1 text-xs text-slate-200 font-mono focus:border-violet-500 focus:outline-none"
                            />
                            <input
                              type="text"
                              placeholder="Value"
                              value={h.value}
                              onChange={(e) => {
                                const newHeaders = [...currentConfig.headers];
                                newHeaders[i] = { ...newHeaders[i], value: e.target.value };
                                updateRequestConfig(activeRequest, { headers: newHeaders });
                              }}
                              className="w-7/12 bg-slate-950 border border-slate-850 rounded px-2 py-1 text-xs text-slate-200 font-mono focus:border-violet-500 focus:outline-none"
                            />
                            <button
                              onClick={() => {
                                const newHeaders = currentConfig.headers.filter((_, idx) => idx !== i);
                                updateRequestConfig(activeRequest, { headers: newHeaders });
                              }}
                              className="w-1/12 text-slate-500 hover:text-red-400 text-center transition"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Body */}
                    {(["POST", "PUT", "PATCH"].includes(currentConfig.method) || currentConfig.body.length > 0) && (
                      <div className="flex-1 flex flex-col min-h-0">
                        <div className="text-xs font-semibold text-slate-400 uppercase mb-1.5 tracking-wider">Request Body (JSON)</div>
                        <textarea
                          value={currentConfig.body}
                          onChange={(e) => updateRequestConfig(activeRequest, { body: e.target.value })}
                          className="w-full min-h-[140px] flex-1 bg-slate-950 border border-slate-850 rounded-lg p-3 text-xs text-slate-300 font-mono focus:border-violet-500 focus:outline-none resize-y"
                          placeholder="{}"
                        />
                        {currentConfig.body && currentConfig.body.includes("{{") && (
                          <div className="mt-1 text-[10px] text-slate-500 font-mono px-1">
                            Resolves to:
                            <pre className="mt-0.5 bg-slate-950/40 p-1.5 rounded border border-slate-900/60 whitespace-pre-wrap max-h-24 overflow-y-auto">
                              {resolveTemplate(currentConfig.body, variables)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right Column: Execution Output */}
                  <div className="flex flex-col gap-3">
                    {r ? (
                      <>
                        {/* Test results */}
                        {r.tests.length > 0 && (
                          <div>
                            <div className="text-xs font-semibold text-slate-400 uppercase mb-1.5 tracking-wider">Test Assertions ({r.tests.length})</div>
                            <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                              {r.tests.map((t, i) => (
                                <div key={i} className={`flex items-start gap-2 text-xs px-3 py-1.5 rounded-lg ${
                                  t.passed ? "bg-emerald-500/5 text-emerald-300 border border-emerald-500/10" : "bg-red-500/5 text-red-300 border border-red-500/10"
                                }`}>
                                  <span className="shrink-0">{t.passed ? "✓" : "✗"}</span>
                                  <span className="font-medium">{t.name}</span>
                                  {!t.passed && t.error && (
                                    <span className="text-[10px] text-red-400 ml-auto font-mono">{t.error}</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Response Body */}
                        <div className="flex-1 flex flex-col">
                          <div className="text-xs font-semibold text-slate-400 uppercase mb-1.5 tracking-wider">Response Body</div>
                          <pre className="bg-slate-950 border border-slate-850 rounded-lg p-3 text-xs text-slate-300 font-mono overflow-auto max-h-80 whitespace-pre-wrap flex-1 select-all">
                            {bodyPretty || "(empty response)"}
                          </pre>
                        </div>
                      </>
                    ) : (
                      <div className="flex-1 border border-dashed border-slate-800 rounded-xl flex flex-col items-center justify-center text-slate-600 gap-2 p-6">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-10 h-10 opacity-30">
                          <polygon points="5 3 19 12 5 21 5 3"></polygon>
                        </svg>
                        <p className="text-xs font-medium">Request not executed yet. Click "Send Request" to run.</p>
                      </div>
                    )}
                  </div>

                </div>
              </div>
            );
          })() : (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600 py-12">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-12 h-12 opacity-40">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                <polyline points="13 2 13 9 20 9" />
              </svg>
              <p className="text-sm font-medium">Select a request from the sidebar to inspect parameters or run it individually.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Environment Variables Configuration Modal ──────────────── */}
      {showVarsModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-100">Environment Variables</h3>
                <p className="text-xs text-slate-400 mt-0.5">Configure environment settings. Replaced everywhere request templates match `{"{{key}}"}`.</p>
              </div>
              <button 
                onClick={() => setShowVarsModal(false)}
                className="text-slate-400 hover:text-slate-200 transition">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-5 h-5">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                {Object.keys(variables).length === 0 ? (
                  <div className="text-center py-8 text-slate-500 text-sm">
                    No variables defined. Click "+ Add Variable" to configure.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 max-h-[50vh] overflow-y-auto pr-1 divide-y divide-slate-850">
                    <div className="flex items-center gap-3 text-[10px] font-bold text-slate-500 uppercase pb-1 tracking-wider">
                      <span className="w-5/12 pl-2">Variable Name (Key)</span>
                      <span className="w-6/12">Current Value</span>
                      <span className="w-1/12 text-center">Delete</span>
                    </div>
                    {Object.entries(variables).map(([key, val], idx) => (
                      <div key={idx} className="flex items-center gap-3 py-2">
                        <input
                          type="text"
                          placeholder="Variable Key"
                          value={key}
                          onChange={(e) => {
                            const newKey = e.target.value.trim();
                            if (newKey === key) return;
                            setVariables((prev) => {
                              const updated = { ...prev };
                              delete updated[key];
                              updated[newKey] = val;
                              localStorage.setItem("signalai_api_tester_variables", JSON.stringify(updated));
                              return updated;
                            });
                          }}
                          className="w-5/12 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono focus:border-violet-500 focus:outline-none transition"
                        />
                        <input
                          type="text"
                          placeholder="Variable Value"
                          value={val as string}
                          onChange={(e) => {
                            updateVariable(key, e.target.value);
                          }}
                          className="w-6/12 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono focus:border-violet-500 focus:outline-none transition"
                        />
                        <button
                          onClick={() => removeVariable(key)}
                          className="w-1/12 p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition flex justify-center">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            <line x1="10" y1="11" x2="10" y2="17"></line>
                            <line x1="14" y1="11" x2="14" y2="17"></line>
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-between bg-slate-950/20">
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setVariables((prev) => ({ ...prev, "": "" }));
                  }}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-850 bg-slate-900/60 text-slate-300 hover:text-slate-100 hover:border-slate-700 transition">
                  + Add Variable
                </button>
                <button
                  onClick={resetVariablesToDefault}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-850 bg-slate-900/60 text-slate-300 hover:text-slate-100 hover:border-slate-700 transition">
                  Reset Defaults
                </button>
              </div>
              <button
                onClick={() => setShowVarsModal(false)}
                className="px-5 py-1.5 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-slate-100 transition shadow-lg shadow-violet-600/25">
                Close
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
