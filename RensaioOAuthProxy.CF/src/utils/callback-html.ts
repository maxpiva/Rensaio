/**
 * Renders the OAuth callback success HTML page.
 *
 * Maps 1:1 to the inline HTML in OAuthController.cs lines 80-106.
 * The page is displayed after a successful OAuth code exchange and
 * uses postMessage to notify the opener window (the Rensaio frontend).
 */
export function renderCallbackHtml(providerName: string, provider: string, state: string): string {
  const safeProviderName = escapeHtml(providerName);
  const safeProvider = escapeJsString(provider);
  const safeState = escapeJsString(state);

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Rensaiō &mdash; Complete</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:hsl(20,14.3%,4.1%);color:hsl(0,0%,95%)}
@media(prefers-color-scheme:light){body{background:hsl(0,0%,100%);color:hsl(240,10%,3.9%)}.card{background:hsl(180,8.2%,90.2%)}}
.card{background:hsl(24,9.8%,10%);border-radius:12px;padding:2.5rem 3rem;text-align:center;max-width:380px;box-shadow:0 4px 24px rgba(0,0,0,0.3)}
.logo{font-size:1.5rem;font-weight:700;letter-spacing:-0.02em;color:hsl(346.8,77.2%,49.8%);margin-bottom:1.25rem}
.logo span{color:hsl(0,0%,95%)}
@media(prefers-color-scheme:light){.logo span{color:hsl(240,10%,3.9%)}}
.mark{width:48px;height:48px;border-radius:50%;border:3px solid hsl(346.8,77.2%,49.8%);display:inline-flex;align-items:center;justify-content:center;margin-bottom:1rem}
.mark::after{content:'';display:block;width:14px;height:24px;border:solid hsl(346.8,77.2%,49.8%);border-width:0 3px 3px 0;transform:rotate(45deg) translateY(-2px)}
h1{font-size:1.125rem;font-weight:600;margin-bottom:0.5rem}
p{font-size:0.875rem;opacity:0.7;margin-bottom:1.5rem}
.pill{display:inline-block;background:hsl(346.8,77.2%,49.8%);color:hsl(355.7,100%,97.3%);font-size:0.75rem;font-weight:600;padding:0.25rem 0.75rem;border-radius:999px;text-transform:uppercase;letter-spacing:0.04em}
.hint{font-size:0.75rem;opacity:0.4;margin-top:1.5rem}
</style></head><body>
<div class="card">
<div class="logo">Rensaiō</span></div>
<div class="mark"></div>
<h1>Authentication Complete</h1>
<p>Your ${safeProviderName} account has been connected to Rensaiō.</p>
<div class="pill">Connected</div>
<p class="hint">You may close this window.</p></div>
<script>(function(){try{if(window.opener){window.opener.postMessage({type:'oauth-success',provider:'${safeProvider}',state:'${safeState}'},'*')}}catch(e){}})()</script>
</body></html>`;
}

/**
 * Renders the OAuth callback error HTML page.
 *
 * Shown when the token exchange with the provider fails (e.g. provider API down,
 * invalid credentials, network error). Displays the underlying error so the user
 * understands why authentication failed.
 */
export function renderErrorHtml(providerName: string, errorMessage: string): string {
  const safeProvider = escapeHtml(providerName);
  const safeError = escapeHtml(errorMessage);

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Rensaiō &mdash; Authentication Failed</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:hsl(20,14.3%,4.1%);color:hsl(0,0%,95%)}
@media(prefers-color-scheme:light){body{background:hsl(0,0%,100%);color:hsl(240,10%,3.9%)}.card{background:hsl(180,8.2%,90.2%)}}
.card{background:hsl(24,9.8%,10%);border-radius:12px;padding:2.5rem 3rem;text-align:center;max-width:420px;box-shadow:0 4px 24px rgba(0,0,0,0.3)}
.logo{font-size:1.5rem;font-weight:700;letter-spacing:-0.02em;color:hsl(346.8,77.2%,49.8%);margin-bottom:1.25rem}
.logo span{color:hsl(0,0%,95%)}
@media(prefers-color-scheme:light){.logo span{color:hsl(240,10%,3.9%)}}
.cross{width:48px;height:48px;border-radius:50%;border:3px solid hsl(0,84.2%,60.2%);display:inline-flex;align-items:center;justify-content:center;margin-bottom:1rem;color:hsl(0,84.2%,60.2%);font-size:1.75rem;font-weight:700;line-height:1}
h1{font-size:1.125rem;font-weight:600;margin-bottom:0.5rem}
p{font-size:0.875rem;opacity:0.7;margin-bottom:0.75rem}
.error-detail{font-size:0.8rem;background:hsl(0,0%,15%);padding:0.75rem 1rem;border-radius:8px;text-align:left;word-break:break-word;font-family:monospace;color:hsl(0,84.2%,70.2%);margin-bottom:1.5rem}
@media(prefers-color-scheme:light){.error-detail{background:hsl(0,0%,93%);color:hsl(0,70%,40%)}}
.pill{display:inline-block;background:hsl(0,84.2%,60.2%);color:hsl(355.7,100%,97.3%);font-size:0.75rem;font-weight:600;padding:0.25rem 0.75rem;border-radius:999px;text-transform:uppercase;letter-spacing:0.04em}
.hint{font-size:0.75rem;opacity:0.4;margin-top:1.5rem}
</style></head><body>
<div class="card">
<div class="logo">Rensaiō</span></div>
<div class="cross">&#10005;</div>
<h1>Authentication Failed</h1>
<p>Could not connect your ${safeProvider} account to Rensaiō</p>
<div class="error-detail">${safeError}</div>
<div class="pill">Failed</div>
<p class="hint">Please try again. If the problem persists, contact support.</p></div>
<script>(function(){try{if(window.opener){window.opener.postMessage({type:'oauth-error',provider:'${escapeJsString(providerName)}'},'*')}}catch(e){}})()</script>
</body></html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/[&]/g, '&')
    .replace(/[<]/g, '<')
    .replace(/[>]/g, '>')
    .replace(/["]/g, '"')
    .replace(/[']/g, '&#x27;');
}

function escapeJsString(str: string): string {
  return str
    .replace(/[\\]/g, '\\\\')
    .replace(/[']/g, "\\'")
    .replace(/["]/g, '\\"')
    .replace(/[\n]/g, '\\n')
    .replace(/[\r]/g, '\\r');
}