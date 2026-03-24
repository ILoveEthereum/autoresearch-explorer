# AutoResearch Explorer — Full Code Audit

**Date:** March 24, 2026
**Scope:** Complete frontend, backend, configuration, and best-practices review

---

## Executive Summary

AutoResearch Explorer is an ambitious and well-conceived project. The architecture — Tauri v2 with a React Flow canvas frontend and a Rust agent backend — is a strong foundation. The code is readable, the module structure is logical, and the core agent loop design is sound.

That said, there are significant issues to address before this is safe for broader use. The most urgent are **security vulnerabilities in shell/command execution** (the agent can run arbitrary commands without sanitization), **missing input validation** throughout the Rust backend, and **no error boundaries** in the React frontend. There's also no testing infrastructure at all — no unit tests, no integration tests, no CI pipeline.

Below is every finding, organized by severity.

---

## Critical Issues

### 1. Shell Command Injection (Multiple Tools)

The shell, git, package manager, and custom tool executors all pass user/LLM-generated input directly to `sh -c` without sanitization.

**`src-tauri/src/tools/shell.rs`** — Commands go straight to the shell:
```rust
tokio::process::Command::new("sh")
    .args(["-c", command])
    .current_dir(working_dir)
```

**`src-tauri/src/tools/git.rs`** — The `args` parameter is concatenated into a shell string:
```rust
let full_command = format!("git {} {}", action, args);
tokio::process::Command::new("sh").args(["-c", &full_command])
```

**`src-tauri/src/tools/package_manager.rs`** — Package names interpolated directly:
```rust
Ok(format!("pip install {}", packages.join(" ")))
```

**`src-tauri/src/tools/custom_tool.rs`** — Manifest `command` field and JSON input concatenated:
```rust
let full_command = format!(
    "cd {} && {} --input '{}'",
    tool_dir.display(), command, input_json.replace('\'', "'\\''")
);
```

**Why it matters:** The LLM generates these inputs. A hallucinating or manipulated model could produce `; rm -rf /` or exfiltrate data. Even without adversarial intent, malformed commands can cause damage.

**Recommendation:** Implement an allowlist-based tool registry. Each tool should declare its exact command and argument schema. Use `Command::args()` with structured arguments (never `sh -c` with string concatenation). Add a confirmation step for destructive operations. At minimum, validate and sanitize all inputs before shell execution.

---

### 2. Path Traversal in File Operations

**`src-tauri/src/tools/file_ops.rs`** — Paths are joined without canonicalization:
```rust
let full_path = working_dir.join(path);
```

An LLM could use `../../etc/passwd` to read or write outside the working directory.

**Recommendation:** Canonicalize the resulting path and verify it starts with the working directory:
```rust
let full_path = working_dir.join(path).canonicalize()?;
if !full_path.starts_with(working_dir) {
    return Err("Path traversal blocked");
}
```

---

### 3. No React Error Boundary

**`src/App.tsx`** — The entire app has no error boundary. A single thrown error in any canvas node, panel, or hook crashes the whole UI with a white screen.

**Recommendation:** Wrap the app (and ideally the canvas and panels separately) in error boundaries that show a recovery UI instead of crashing.

---

### 4. Race Conditions in Event Handling

**`src/hooks/useTauriEvents.ts`** — Multiple rapid Tauri events fire `applyOps`, `setStatus`, `setLoopCount`, etc. without queuing or debouncing. The `isFirstOps` flag is a local variable in the setup function, not properly scoped for concurrent events.

**Recommendation:** Queue incoming canvas operations and process them in batches on `requestAnimationFrame`. Use a ref for flags that need to persist across event firings.

---

### 5. API Keys Stored in localStorage

**`src/panels/wizard/StepModel.tsx`** — The OpenRouter API key is stored in `localStorage`:
```typescript
localStorage.setItem('openrouter_api_key', key);
```

In a Tauri app, the WebView's localStorage is accessible to any code running in the frontend context. While not as exposed as in a browser, it's still not appropriate for secrets.

**Recommendation:** Use Tauri's secure storage plugin or the OS keychain (via `tauri-plugin-stronghold` or similar) for API keys. Never persist secrets in localStorage.

---

### 6. Content Security Policy Disabled

**`src-tauri/tauri.conf.json`** — CSP is set to `null`:
```json
"csp": null
```

This means the WebView has no restrictions on loading remote scripts, styles, or making network requests.

**Recommendation:** Define a strict CSP that allows only the sources your app needs (your own assets, OpenRouter API, etc.).

---

### 7. Mutex Poisoning Panics

**`src-tauri/src/agent/signals.rs`** — Lock acquisition uses `.unwrap()`:
```rust
let mut signals = self.signals.lock().unwrap();
```

If any thread panics while holding this lock, the mutex is poisoned and every subsequent `.unwrap()` panics too, cascading the failure.

**Recommendation:** Use `.lock().unwrap_or_else(PoisonError::into_inner)` or handle the error gracefully.

---

### 8. Unbounded Memory Growth

Several places allow unbounded growth:

- **`src-tauri/src/agent/runtime.rs`** — `history_summary` string grows without limit as loops accumulate.
- **Canvas state** — Nodes are pushed with no cap: `self.canvas_state.nodes.push(cp_node)`. A long session could accumulate thousands of nodes.
- **`src-tauri/src/llm/client.rs`** — System prompts (including skill docs) have no size limit, while user messages are truncated at 60K characters.

**Recommendation:** Set hard limits. Cap history summary length (rolling window or character budget). Limit canvas node count or archive old nodes. Apply size limits to system prompts.

---

## High Priority Issues

### 9. Global State via Window Object

**`src/stores/sessionStore.ts`** and **`src/stores/chatStore.ts`** — The session ID is passed between stores by mutating `window`:
```typescript
(window as any).__autoresearch_session_id = id;
// read elsewhere:
const sessionId = (window as any).__autoresearch_session_id;
```

This is fragile, untyped, and invisible to React's rendering cycle. It creates coupling between stores through a hidden channel.

**Recommendation:** Either pass the session ID through a shared Zustand store (single source of truth) or use React Context. Remove all `window` mutations.

---

### 10. Zustand Selector Re-render Issues

**`src/canvas/CanvasView.tsx`** — Selectors return new references on every render:
```typescript
const nodes = useCanvasStore((s) => s.nodes);
const edges = useCanvasStore((s) => s.edges);
```

If `nodes` or `edges` are reconstructed (new array) on any state change, the canvas re-renders even if the actual data hasn't changed.

**Recommendation:** Use `useShallow` from Zustand or implement custom equality checks. For React Flow specifically, use `useStore` from `@xyflow/react` with shallow comparison.

---

### 11. Synchronous Force Layout on Main Thread

**`src/canvas/layout/forceLayout.ts`** — Runs 120 ticks of force simulation synchronously:
```typescript
for (let i = 0; i < 120; i++) {
    sim.tick();
}
```

This blocks the main thread. With 500+ nodes, this causes visible UI freezing.

**Recommendation:** Move layout computation to a Web Worker, or time-slice it across animation frames. At minimum, debounce so it doesn't run on every single `applyOps` call.

---

### 12. No Timeout or Cancellation for LLM Requests

**`src-tauri/src/llm/client.rs`** — HTTP requests to OpenRouter have no cancellation token:
```rust
let response = self.http.post(OPENROUTER_URL)
    .header("Authorization", format!("Bearer {}", self.api_key))
    .json(&request)
    .send()
    .await
```

If the user stops a session, the LLM request continues to completion, wasting tokens and delaying cleanup.

**Recommendation:** Use `tokio::select!` with a cancellation signal, or pass a `CancellationToken` that aborts the request when the session is stopped.

---

### 13. No Rate Limiting on Tool Execution

**`src-tauri/src/agent/runtime.rs`** — The agent executes all tool calls in a loop with no limit:
```rust
for tc in &response.tool_calls {
    let result = tool_registry.execute(&tc.tool, &tc.input).await;
```

A hallucinating model could generate dozens of tool calls in one response, causing resource exhaustion.

**Recommendation:** Set a per-loop tool call limit (e.g., 10). Warn in the watchdog if the agent consistently hits the limit.

---

### 14. Missing Type Validation for Backend Data

Throughout the frontend, data from Tauri `invoke` calls is accepted with `as` casts and `unknown` types:

**`src/stores/canvasStore.ts`**:
```typescript
const raw = rest as Record<string, unknown>;
status: (raw.status as CanvasNode['status']) || 'queued',
```

**`src/panels/SkillsPanel.tsx`**:
```typescript
const state = await invoke<{ canvas?: { nodes?: unknown[]; ... } }>(...)
for (const node of (state.canvas.nodes || []) as Array<Record<string, unknown>>)
```

**Recommendation:** Use a runtime validation library (Zod, Valibot, or similar) to validate all data crossing the IPC boundary. Define shared schemas that match the Rust types.

---

### 15. Race Condition in Global Session Index

**`src-tauri/src/storage/global_index.rs`** — Read-modify-write without file locking:
```rust
pub fn add_to_index(entry: SessionEntry) -> Result<(), String> {
    let mut entries = read_index()?;
    entries.retain(|e| e.id != entry.id);
    entries.insert(0, entry);
    write_index(&entries)
}
```

Concurrent calls can lose updates.

**Recommendation:** Use file locking (`fs2` crate) or atomic write-and-rename.

---

### 16. SQL/FTS Injection in Memory Search

**`src-tauri/src/memory/database.rs`** — While parameterized queries are used (good), FTS5 syntax allows query injection:
```rust
WHERE sessions_fts MATCH ?1
```

A query like `hidden_column:secret` could expose data from unexpected columns.

**Recommendation:** Sanitize the query string before passing to FTS MATCH. Strip FTS operators or escape special characters.

---

## Medium Priority Issues

### 17. Console-Only Error Handling

Multiple files use `.catch(console.error)` or `console.error('Failed:', err)` as the only error handling. Users never see these errors.

**Files affected:** `signalActions.ts`, `useKeyboard.ts`, `SessionControls.tsx`, `IntegrationsPanel.tsx`, and others.

**Recommendation:** Add a toast/notification system. Surface errors to the user with actionable messages.

---

### 18. Accessibility Gaps

- SVG icons lack `aria-label` attributes throughout the canvas and panels.
- `ChatPanel.tsx` textarea has no `aria-label`.
- Status indicators rely solely on color — no icons or text alternatives for colorblind users.
- Buttons use `title` attributes instead of `aria-label` (title doesn't work for screen readers).

**Recommendation:** Add ARIA labels to all interactive elements. Use icons alongside colors for status. Test with a screen reader.

---

### 19. Inline Styles Everywhere

Every component uses inline `style={{ ... }}` objects. These create new object references on every render (contributing to re-render issues), can't use media queries, and make the codebase harder to maintain.

**Recommendation:** Extract to CSS Modules, Tailwind, or at minimum define style objects as constants outside the component.

---

### 20. Event Listener Cleanup Issues

**`src/panels/HistorySlider.tsx`** — Cleanup via `.then()` on a promise:
```typescript
return () => {
    unlisten.then((fn) => fn());
};
```

If the component unmounts before the promise resolves, cleanup may not happen.

**Recommendation:** Use `await` inside the effect setup, or track mount status with a ref.

---

### 21. O(n×m) Lookups in Connection Lists

**`src/panels/detail/ConnectionsList.tsx`** — For each edge, a linear search finds the connected node:
```typescript
const from = nodes.find((n) => n.id === e.from);
```

With many nodes and edges, this becomes expensive.

**Recommendation:** Build a `Map<string, CanvasNode>` lookup once and pass it down.

---

### 22. No Graceful Degradation for API Failures

If OpenRouter is down or rate-limited, the agent blocks indefinitely (with only a timeout). No user-facing feedback until the timeout fires.

**Recommendation:** Show "Waiting for API response..." status in the UI with elapsed time. Implement exponential backoff with user-visible retry count. Allow the user to cancel and retry with a different model.

---

### 23. Telegram Polling Has No Watchdog

**`src-tauri/src/telegram/bot.rs`** — The polling loop only checks `shutdown.borrow()`. If the sender is dropped without sending `true`, the task hangs forever.

**Recommendation:** Add a heartbeat timeout. If no updates and no shutdown signal for N minutes, self-terminate.

---

### 24. No Working Directory Validation

**`src-tauri/src/commands/session.rs`** — The `working_dir` parameter is used directly:
```rust
let work_dir = PathBuf::from(&working_dir);
```

A user or compromised frontend could specify `/root`, `/var`, or other sensitive directories.

**Recommendation:** Validate that the directory exists, is writable, and is within the user's home directory or an allowed set of paths.

---

## Low Priority Issues

### 25. Unused CSS from Template

**`src/App.css`** — Contains styles for `.hero`, `.counter`, `#next-steps`, `#docs` and other classes that aren't used. These are leftovers from the Vite React template.

**Recommendation:** Remove unused CSS.

---

### 26. Magic Numbers

Node dimensions, layout spacing (60, 100, 150, 180), and force simulation parameters are hardcoded across multiple files.

**Recommendation:** Extract to a shared constants file.

---

### 27. Missing `.unwrap()` Cleanup in Rust

Non-critical `.unwrap()` calls throughout the backend could panic in production:
- `reqwest::Client::builder().build().unwrap()` in web_search.rs and web_read.rs
- `self.signals.lock().unwrap()` in signals.rs
- Various `serde_json` unwraps in tool implementations

**Recommendation:** Replace with `?` operator or `.unwrap_or_else()` with proper error messages.

---

### 28. No Structured Logging

The Rust backend uses `tracing::info!` but logs are not structured for machine parsing. Tool outputs could contain sensitive data that gets logged.

**Recommendation:** Use structured tracing with fields. Redact sensitive data (API keys, file contents) before logging.

---

## Missing Infrastructure

### 29. No Tests

There are no unit tests, integration tests, or end-to-end tests anywhere in the project — neither in Rust nor TypeScript.

**Recommendation (high priority):** Start with:
- Rust: Unit tests for `file_ops` (path validation), `llm/client` (response parsing), `storage` (session CRUD). Integration test for the agent loop with a mock LLM.
- TypeScript: Tests for Zustand stores (canvas operations, session state), layout algorithms. Component tests for the wizard flow.
- Use `vitest` for the frontend and `cargo test` for the backend.

---

### 30. No CI/CD Pipeline

No `.github/workflows`, no pre-commit hooks, no automated checks of any kind.

**Recommendation:** Add at minimum:
- `cargo check` + `cargo clippy` for Rust
- `tsc --noEmit` + `eslint` for TypeScript
- Run on every push and PR

---

### 31. No Prettier / Formatting Enforcement

ESLint is configured but there's no Prettier or other formatter. Code style will drift as contributors join.

**Recommendation:** Add Prettier with a `.prettierrc` config. Consider `lint-staged` + `husky` for pre-commit formatting.

---

### 32. dist/ and Build Artifacts

The `dist/` folder is in `.gitignore` (good), but there's no `.env.example` file documenting required environment variables (like `BRAVE_SEARCH_API_KEY`).

**Recommendation:** Add a `.env.example` listing all required/optional env vars with placeholder values.

---

### 33. Missing Development Documentation

No `CONTRIBUTING.md` beyond the brief section in the README. No architecture decision records. No API documentation for the Tauri commands.

**Recommendation:** Add a `CONTRIBUTING.md` with setup instructions, code conventions, and PR guidelines. Document all Tauri IPC commands.

---

## Best Practices Recommendations (from research)

### Tauri v2 Specific
- **Use `tauri-specta`** to auto-generate TypeScript bindings from Rust commands — eliminates the manual `invoke<T>` typing.
- **Use `tokio::sync::Mutex`** (not `std::sync::Mutex`) for state shared across async commands, since std Mutex can't be held across `.await`.
- **Define capabilities strictly** — the current `default.json` grants broad permissions.

### React Flow Performance
- **Memoize all custom node components** with `React.memo` and declare them outside parent components.
- **Use `useShallow`** for multi-value Zustand selectors.
- **Implement viewport culling** — only render detail for nodes visible in the viewport.

### OpenRouter
- **Free models allow 20 requests/minute**; paid tiers have higher limits. Implement local rate limiting.
- **Handle SSE streaming errors** — if an error occurs mid-stream, it arrives as an SSE event (not an HTTP error).
- **Implement exponential backoff** for transient failures (503, timeout).

### SQLite FTS5
- **Keep FTS as a search index** alongside normal tables with proper types/constraints — don't use FTS tables as primary storage.
- **Use BM25 ranking** for relevance: `ORDER BY bm25(table)`.
- **Sanitize FTS queries** — strip column prefixes and operators from user input.

---

## Summary by Category

| Category | Critical | High | Medium | Low |
|----------|----------|------|--------|-----|
| Security | 3 | 3 | 1 | — |
| Stability | 3 | 2 | 2 | 1 |
| Performance | — | 2 | 2 | 1 |
| Type Safety | 1 | 2 | — | — |
| UX/Accessibility | — | — | 2 | 1 |
| Infrastructure | — | — | — | 5 |
| **Total** | **7** | **9** | **7** | **8** |

---

## Suggested Priority Order

1. **Security hardening** — command injection, path traversal, CSP (issues 1–2, 6)
2. **Error boundary + error handling** — prevent white-screen crashes (issue 3)
3. **API key storage** — move out of localStorage (issue 5)
4. **Input validation** — both Rust tool inputs and IPC data (issues 14, 16, 24)
5. **Basic test suite** — at least for security-critical paths (issue 29)
6. **CI pipeline** — automated checks on push (issue 30)
7. **Performance** — layout worker, selector memoization, rate limiting (issues 11, 10, 13)
8. **Everything else** — accessibility, cleanup, documentation
