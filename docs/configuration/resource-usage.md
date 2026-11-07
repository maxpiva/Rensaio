# Resource usage

Be aware: **Rensaiō** can be **memory-intensive**, especially when managing large libraries or doing parallel searches and downloads.

## Garbage collector and container memory limits

The backend runs the .NET **workstation, concurrent** garbage collector with `System.GC.ConserveMemory=8` (see `RensaioBackend/runtimeconfig.template.json`). Server GC creates one heap per CPU core, so on a many-core host with no container limit it will hold 10+ GB of garbage before it bothers to collect. Workstation GC keeps one heap, collects early and hands memory back to the OS.

Always give the container a memory limit. The GC reads the cgroup limit and keeps its managed heap under 75% of it, so a limit bounds memory instead of just killing the process once it is exceeded:

| Platform | Setting |
|----------|---------|
| `docker run` | `--memory=4g` |
| Docker Compose | `mem_limit: 4g` |
| Unraid | Container settings → **Extra Parameters**: `--memory=4g` |
| Kubernetes | `resources.limits.memory` (the Helm chart sets `2Gi`) |

4 GB is plenty for large libraries. Raise it if the log shows `Out of memory` or the container keeps restarting. Advanced override: the environment variable `DOTNET_GCHeapHardLimit=0x100000000` caps the managed heap at 4 GB regardless of the container limit.

## WebView/CEF renderer processes (`jcef_helper`)

Extensions that need a browser context (anti-bot / Cloudflare bypass via the `WebViewFetchInterceptor`) spawn Chromium renderer processes (`jcef_helper --type=renderer`), each consuming roughly 80–200 MB. To keep long-running instances from accumulating orphaned helpers and exhausting memory, Rensaiō bounds and reaps them automatically:

| Knob | Default | Meaning |
|------|---------|---------|
| `cefMaxRenderers` | `4` | Hard cap on concurrently alive renderer processes **across all extensions**. Requests beyond the cap degrade to the direct network chain instead of spawning another helper. Also passed to CEF as `--max-render-processes`. |
| `cefIdleTimeoutMs` | `300000` | Idle time (ms) before an unused pooled WebView's browser is destroyed by the watchdog sweep (5 minutes). |
| `cefWebViewPoolEnabled` | `true` | Enables host-keyed WebView reuse (same host reuses the same browser/cookie context) instead of a fresh WebView per request. |

These are configurable from Settings → Server (`cefMaxRenderers`, `cefIdleTimeoutMs`, `cefWebViewPoolEnabled`).

### How it stays bounded

1. The authoritative renderer budget (`RendererGate`) is enforced **inside the CEF WebView provider itself**, at browser creation — so the cap covers every WebView in the process, including extension-owned ones (e.g. Keiyoushi-style `runWebView`/`WebViewSession` helpers), not just the interceptor path. When the cap is reached the provider refuses to spawn another renderer; the interceptor pre-checks the budget and falls back to the direct network/FlareSolverr chain.
2. WebViews are pooled per host (`WebViewPool`) instead of created per request, and are deterministically destroyed in a `finally` block on success/timeout/error — the old racy `postDelayed(destroy)` is gone.
3. A time-gated watchdog sweep runs on the existing safe CEF pump path (the IKVM-attached daemon on Docker, the Avalonia UI thread on desktop) and evicts idle browsers, posting destruction to the main looper. It never calls JCEF from a raw thread.

### Validation checklist (long-running instances)

- Run with several WebView-requiring sources active for 24–48 h.
- Monitor with your platform's process tooling (`ps aux --sort=-%mem` on Linux/macOS, Task Manager on Windows); the number of `jcef_helper --type=renderer` processes should stay at or below `cefMaxRenderers` (plus a short transition window), not accumulate.
- Watch the log for `Renderer budget exhausted` / `WebView pool saturated` — these indicate you may want to raise `cefMaxRenderers` on a memory-rich host, or lower it on a constrained one.
- No manual process killing is needed on any platform: renderer processes are bounded by the budget and reaped automatically by the watchdog. If the process list ever looks wrong, the fix is to restart Rensaiō (a clean restart tears down CEF entirely), not to kill individual helper processes.
