/* ============================================================
   BCC Common — Claude API Client
   ------------------------------------------------------------
   Static-site safe Claude API wrapper.
   Calls a server-side proxy (Cloudflare Worker / GAS / etc.)
   instead of embedding the ANTHROPIC_API_KEY in the browser.

   Configure BCC_CLAUDE_PROXY_URL below once a proxy is deployed.
   When unset, BCCClaudeAPI.call() returns { ok: false, code: 'no_proxy' }
   and downstream consumers fall back to a demo template.

   Daily usage cap (per browser): BCCClaudeAPI.DAILY_LIMIT.
   ============================================================ */
(function () {
  'use strict';

  /* TODO: deploy a proxy and set this URL.
   * The proxy must accept POST with JSON { model, max_tokens, system, messages }
   * and forward to https://api.anthropic.com/v1/messages with the
   * ANTHROPIC_API_KEY server-side. Response should match Anthropic's
   * { content: [{ type: 'text', text: '...' }] } shape OR { text: '...' }.
   * Recommended: Cloudflare Worker with rate-limiting per IP.
   */
  const BCC_CLAUDE_PROXY_URL = '';

  const DAILY_LIMIT = 5;
  const STORAGE_PREFIX = 'bcc_claude_used_';
  const DEFAULT_MODEL = 'claude-sonnet-4-5';
  const DEFAULT_MAX_TOKENS = 2000;

  function todayKey() {
    return STORAGE_PREFIX + new Date().toISOString().slice(0, 10);
  }
  function getUsage() {
    try { return parseInt(localStorage.getItem(todayKey()) || '0') || 0; }
    catch (e) { return 0; }
  }
  function incrementUsage() {
    try {
      const n = getUsage() + 1;
      localStorage.setItem(todayKey(), String(n));
      return n;
    } catch (e) { return getUsage(); }
  }
  function isQuotaExceeded() { return getUsage() >= DAILY_LIMIT; }
  function remainingQuota() { return Math.max(0, DAILY_LIMIT - getUsage()); }
  function resetUsage() {
    try { localStorage.removeItem(todayKey()); } catch (e) {}
  }
  function isProxyConfigured() {
    return typeof BCC_CLAUDE_PROXY_URL === 'string' && BCC_CLAUDE_PROXY_URL.length > 0;
  }

  /**
   * Call Claude via the configured proxy.
   * @param {Object} opts
   * @param {string} opts.system - System prompt
   * @param {Array<{role:string, content:string}>} opts.messages
   * @param {number} [opts.max_tokens=2000]
   * @param {string} [opts.model='claude-sonnet-4-5']
   * @returns {Promise<{ok:boolean, text?:string, code?:string, used?:number, remaining?:number, message?:string}>}
   */
  async function call(opts) {
    opts = opts || {};
    if (!isProxyConfigured()) {
      return { ok: false, code: 'no_proxy', message: 'BCC Claude API proxy URL is not configured.' };
    }
    if (isQuotaExceeded()) {
      return { ok: false, code: 'quota_exceeded', remaining: 0, limit: DAILY_LIMIT };
    }

    const payload = {
      model: opts.model || DEFAULT_MODEL,
      max_tokens: opts.max_tokens || DEFAULT_MAX_TOKENS,
      system: opts.system || '',
      messages: opts.messages || []
    };

    let res;
    try {
      res = await fetch(BCC_CLAUDE_PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (err) {
      return { ok: false, code: 'network_error', message: err.message || 'network failure' };
    }

    if (!res.ok) {
      let bodyText = '';
      try { bodyText = await res.text(); } catch (e) {}
      let code = 'proxy_error';
      if (res.status === 429) code = 'rate_limited';
      else if (res.status === 401 || res.status === 403) code = 'proxy_auth';
      return { ok: false, code: code, status: res.status, message: bodyText.slice(0, 200) };
    }

    let data;
    try { data = await res.json(); }
    catch (err) {
      return { ok: false, code: 'parse_error', message: 'proxy returned non-JSON' };
    }

    // Accept Anthropic-native shape or a flattened proxy shape.
    let text = '';
    if (data && Array.isArray(data.content) && data.content[0] && typeof data.content[0].text === 'string') {
      text = data.content[0].text;
    } else if (data && typeof data.text === 'string') {
      text = data.text;
    } else if (typeof data === 'string') {
      text = data;
    } else {
      return { ok: false, code: 'parse_error', message: 'proxy response missing text field' };
    }

    const used = incrementUsage();
    return { ok: true, text: text, used: used, remaining: Math.max(0, DAILY_LIMIT - used), limit: DAILY_LIMIT };
  }

  window.BCCClaudeAPI = {
    PROXY_URL: BCC_CLAUDE_PROXY_URL,
    DAILY_LIMIT: DAILY_LIMIT,
    DEFAULT_MODEL: DEFAULT_MODEL,
    call: call,
    getUsage: getUsage,
    remainingQuota: remainingQuota,
    isQuotaExceeded: isQuotaExceeded,
    isProxyConfigured: isProxyConfigured,
    resetUsage: resetUsage
  };
})();
