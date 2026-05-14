/* ============================================================
   BCC Common — Action Guide Module
   ------------------------------------------------------------
   Mounts a "BCC INSIGHT — AI 액션 가이드" section on every tool
   page. After analysis completes, the host tool calls
     BCCActionGuide.update(toolName, contextData)
   to enable the trigger button. Clicking the button hits
   BCCClaudeAPI (via proxy) for a 5-step JSON guide.

   When no proxy is configured (BCC_CLAUDE_PROXY_URL empty in
   bcc-claude-api.js) the module falls back to a built-in demo
   template so the UI still demonstrates the flow.

   Integration contract:
     1. Each tool's HTML adds an empty container <div id="bccGuideMount"></div>
        or relies on auto-mount which inserts the section before the
        legal-footer of <main class="main">.
     2. Tool init code calls BCCActionGuide.attach({ toolName, toolTitle }).
     3. After analysis renders, the tool calls
        BCCActionGuide.update(toolName, dataObject).
     4. To expose the generated guide for PDF inclusion, callers can
        read window.BCCLastGuide after generation.
   ============================================================ */
(function () {
  'use strict';

  // Reuse the same Google Apps Script lead URL for deep-usage logging.
  const LEAD_GAS_URL = 'https://script.google.com/macros/s/AKfycbxzW84zXGAr8WSKdKhvZ-QK7hPBKgxySNvHapGaAalBSzGapAIjz6wL1bbpwzbomho/exec';

  // ---- BCC system prompt for Claude ----
  const SYSTEM_PROMPT =
    '당신은 비즈니스커리어컨설팅(BCC)의 콘텐츠 전략 컨설턴트입니다.\n' +
    '1인 사업자(주로 부산 기반, AI 시대 콘텐츠·마케팅 분야)가 BCC 분석 도구를 사용한 결과를 받았습니다.\n' +
    '이 사용자에게 5단계 액션 가이드를 제공하세요.\n\n' +
    '톤: 전문적이면서도 친근하게. 존댓말. 1인 사업자가 바로 실행할 수 있도록 구체적·실용적으로.\n' +
    '형식: 반드시 아래 JSON 스키마로만 출력. 다른 텍스트나 마크다운 코드펜스 없이 JSON만.\n\n' +
    '{\n' +
    '  "step1": { "title": "핵심 성공 요인 분석", "body": "이 분석에서 발견한 가장 중요한 성공 패턴 2~3가지를 짧게 (3~4문장)" },\n' +
    '  "step2": { "title": "우리 적용 포인트", "body": "사용자가 자신의 채널/콘텐츠에 어떻게 적용할지 (3~4문장)" },\n' +
    '  "step3": { "title": "첫 콘텐츠 제안", "body": "지금 바로 만들 수 있는 첫 콘텐츠 1개의 구체 제안: 제목 예시 2~3개, 썸네일 키워드, 첫 5초 후킹 멘트. 줄바꿈으로 가독성 있게." },\n' +
    '  "step4": { "title": "7~30일 실행 계획", "body": "Day 1~7 / Day 8~14 / Day 15~30 단계별 실행 계획. 줄바꿈으로 구분." },\n' +
    '  "step5": { "title": "다음 추천", "body": "BCC의 다른 도구로 다음에 검증해볼 만한 키워드·채널·영상 추천 (2~3가지)" }\n' +
    '}';

  // ---- Per-tool context builders ----
  const TOOL_CONTEXTS = {
    'finder': {
      label: '키워드 영상 검색',
      describe: function (d) {
        return '키워드 "' + (d.keyword || '') + '" 검색 결과 ' + (d.total || 0) + '개. '
          + '평균 바이럴 지수 ' + (d.avgViral != null ? d.avgViral : '-') + ', '
          + '숏폼 비중 ' + (d.shortRatio != null ? d.shortRatio + '%' : '-') + ', '
          + '채널 다양성 ' + (d.uniqueChannels != null ? d.uniqueChannels + '개' : '-') + ', '
          + '진입 난이도 ' + (d.difficulty || '-') + '.';
      }
    },
    'competitor-analyzer': {
      label: '경쟁채널 분석',
      describe: function (d) {
        return '채널 "' + (d.channelName || '') + '" (구독자 ' + (d.subscribers || 0).toLocaleString('ko-KR') + '명). '
          + '최근 ' + (d.recentN || 0) + '개 영상 평균 조회수 ' + (d.avgViews || 0).toLocaleString('ko-KR') + ', '
          + '평균 좋아요 ' + (d.avgLikes || 0).toLocaleString('ko-KR') + ', '
          + '평균 영상 길이 ' + (d.avgDuration || '-') + ', '
          + '주요 업로드 요일 ' + (d.dominantDay || '-') + ', '
          + '업로드 주기 ' + (d.cycleDays != null ? d.cycleDays.toFixed(1) + '일' : '-') + ', '
          + '활성도 ' + (d.activity || '-') + ', '
          + '도달률 ' + (d.reachRate != null ? d.reachRate.toFixed(1) + '%' : '-') + '.';
      }
    },
    'video-analyzer': {
      label: '영상 분석',
      describe: function (d) {
        return '영상 "' + (d.title || '') + '" (채널: ' + (d.channel || '') + '). '
          + '조회수 ' + (d.views || 0).toLocaleString('ko-KR') + ', '
          + '좋아요 ' + (d.likes || 0).toLocaleString('ko-KR') + ', '
          + '댓글 ' + (d.comments || 0).toLocaleString('ko-KR') + ', '
          + '좋아요 비율 ' + (d.likeRatio != null ? d.likeRatio.toFixed(2) + '%' : '-') + ', '
          + '채널 평균 대비 ' + (d.ratioVsAvg != null ? d.ratioVsAvg.toFixed(2) + '배' : '비교 불가') + ', '
          + '판정 ' + (d.rating || '-') + '. '
          + '후킹 패턴: ' + ((d.hooks && d.hooks.length) ? d.hooks.join(', ') : '감지 없음') + '. '
          + '영상 길이 ' + (d.duration || '-') + ', '
          + '카테고리 ' + (d.category || '-') + '.';
      }
    },
    'keyword-finder': {
      label: '황금키워드 발견',
      describe: function (d) {
        return '키워드 "' + (d.keyword || '') + '" 검색 결과. '
          + '상위 50개 평균 조회수 ' + (d.avgViews || 0).toLocaleString('ko-KR') + ', '
          + '평균 구독자 ' + (d.avgSubs || 0).toLocaleString('ko-KR') + ', '
          + '소형 채널(1만 미만) 비율 ' + (d.smallRatio != null ? Math.round(d.smallRatio*100) + '%' : '-') + ', '
          + '대형 채널(100만+) 비율 ' + (d.bigRatio != null ? Math.round(d.bigRatio*100) + '%' : '-') + ', '
          + '경쟁도 ' + (d.competition || '-') + ', '
          + '트렌드 ' + (d.trend || '-') + '. '
          + '최근 90일 영상 비율 ' + (d.recent90Ratio != null ? Math.round(d.recent90Ratio*100) + '%' : '-') + '.';
      }
    }
  };

  // ---- Demo fallback ----
  function buildDemoGuide(toolName, d) {
    const ctx = TOOL_CONTEXTS[toolName] || { label: '분석' };
    let s3Body = '- 제목 예시:\n    · 본인 관점·경험을 명확히 드러내는 1줄\n    · 분석에서 발견된 후킹 패턴을 활용한 1줄\n- 썸네일 키워드: 시선 끄는 단어 1개 + 본인/제품 이미지\n- 첫 5초 후킹: 핵심 가치 제시 + 다음 장면 예고';
    let s5Body = '본 분석과 인접한 토픽으로 1~2개 추가 분석을 진행하세요. 영상 분석 도구로 잘 된 콘텐츠의 메타 패턴을 추출해보세요.';
    if (toolName === 'finder') {
      s5Body = '발견된 빈출 키워드를 황금키워드 발견 도구로 재검증해보세요. 상위 채널 한두 곳은 경쟁채널 분석 도구로 운영 패턴을 추가 분석할 수 있습니다.';
    } else if (toolName === 'competitor-analyzer') {
      s5Body = '이 채널의 가장 인기 있는 영상을 영상 분석 도구로 자세히 진단해보세요. 채널 주력 키워드는 황금키워드 발견 도구로 진입 가능성을 검증하세요.';
    } else if (toolName === 'video-analyzer') {
      s5Body = '이 영상의 채널 전체 운영 패턴을 경쟁채널 분석 도구로 분석해보세요. 영상 제목의 핵심 키워드를 황금키워드 발견 도구로 시장 크기를 검증하세요.';
    } else if (toolName === 'keyword-finder') {
      s5Body = '경쟁도 등급에 맞춰 변형 키워드를 추가 검색하거나, TOP 10 채널 한두 곳을 경쟁채널 분석 도구로 운영 패턴까지 살펴보세요.';
    }
    return {
      step1: { title: '핵심 성공 요인 분석', body: '이 ' + ctx.label + ' 결과에서 주목할 패턴을 정리합니다. 상위 콘텐츠들의 공통점(주제·길이·형식)을 먼저 파악하고, 데이터로 드러난 차별화 포인트를 명확히 하세요. 평균과 상위권의 격차가 큰 항목이 곧 진입 레버입니다.' },
      step2: { title: '우리 적용 포인트', body: '본인 채널의 강점과 분석 결과를 교차로 검토하세요. 자신만의 관점·경험·산업 지식을 어떤 각도로 녹일지 결정하면 차별화가 만들어집니다. 데이터에 본인 색을 입히는 것이 핵심입니다.' },
      step3: { title: '첫 콘텐츠 제안', body: s3Body },
      step4: { title: '7~30일 실행 계획', body: 'Day 1~7: 첫 콘텐츠 1개 제작·업로드 + 클릭률·조회수 측정\nDay 8~14: 첫 영상 데이터 기반 2~3개 변형 제작 (제목/썸네일/포맷 중 1개 변수만 변경)\nDay 15~30: 잘 된 변형은 시리즈화, 안 된 변형은 폐기. 4번째 영상부터는 누적 학습 데이터 활용.' },
      step5: { title: '다음 추천', body: s5Body },
      _demo: true
    };
  }

  // ---- Parsing ----
  function safeParseJSON(text) {
    if (!text) return null;
    try { return JSON.parse(text); } catch (e) {}
    // Try first {...} block
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]); } catch (e) {}
    }
    return null;
  }

  function normalizeGuide(parsed, toolName, ctxData) {
    if (!parsed || typeof parsed !== 'object') {
      return buildDemoGuide(toolName, ctxData);
    }
    const out = {};
    const keys = ['step1','step2','step3','step4','step5'];
    const fallbackTitles = {
      step1: '핵심 성공 요인 분석',
      step2: '우리 적용 포인트',
      step3: '첫 콘텐츠 제안',
      step4: '7~30일 실행 계획',
      step5: '다음 추천'
    };
    keys.forEach(function (k) {
      const v = parsed[k];
      if (v && typeof v === 'object') {
        out[k] = {
          title: String(v.title || fallbackTitles[k]),
          body: String(v.body || '')
        };
      } else if (typeof v === 'string') {
        out[k] = { title: fallbackTitles[k], body: v };
      } else {
        out[k] = { title: fallbackTitles[k], body: '' };
      }
    });
    return out;
  }

  // ---- Deep usage logging to GAS ----
  function logDeepUsage(toolName, action, extra) {
    try {
      const payload = Object.assign({
        name: localStorage.getItem('bcc_lead_name') || '',
        tool: 'BCC 유튜브 분석기',
        subtool: toolName,
        activity: action,
        timestamp: new Date().toISOString()
      }, extra || {});
      fetch(LEAD_GAS_URL, {
        method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      }).catch(function () {});
    } catch (e) {}
  }

  function track(name, params) {
    try {
      if (typeof gtag === 'function') gtag('event', name, params || {});
      if (window.dataLayer) window.dataLayer.push(Object.assign({ event: name }, params || {}));
    } catch (e) {}
  }

  function isLeadVerified() {
    try {
      const verified = localStorage.getItem('bcc_lead_verified');
      const at = localStorage.getItem('bcc_lead_verified_at');
      if (verified !== 'true' || !at) return false;
      const verifiedAt = new Date(at).getTime();
      if (isNaN(verifiedAt)) return false;
      const ageDays = (Date.now() - verifiedAt) / (1000 * 60 * 60 * 24);
      return ageDays < 30;
    } catch (e) { return false; }
  }

  function escapeHtml(s) {
    return (s == null ? '' : String(s))
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  // Light "**bold**" → <strong> conversion (Claude often uses md)
  function lightMarkdown(text) {
    return escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  // ---- Module state ----
  let _state = {
    attached: false,
    toolName: '',
    toolTitle: '',
    data: null,
    lastGuide: null,
    busy: false,
    sectionEl: null,
    bodyEl: null
  };

  function findMount() {
    // Preferred: explicit mount container
    let mount = document.getElementById('bccGuideMount');
    if (mount) return mount;
    // Auto-insert: before legal-footer inside main, else end of main
    const main = document.querySelector('main.main');
    if (main) {
      const legal = main.querySelector('.legal-footer');
      const wrap = document.createElement('div');
      wrap.id = 'bccGuideMount';
      if (legal) main.insertBefore(wrap, legal);
      else main.appendChild(wrap);
      return wrap;
    }
    // Fallback: body end
    const wrap2 = document.createElement('div');
    wrap2.id = 'bccGuideMount';
    document.body.appendChild(wrap2);
    return wrap2;
  }

  function renderShell() {
    const mount = findMount();
    mount.innerHTML = '';
    const sec = document.createElement('section');
    sec.className = 'bcc-guide-section';
    sec.id = 'bccGuideSection';
    sec.innerHTML =
      '<div class="bcc-guide-label">BCC INSIGHT — AI 액션 가이드</div>' +
      '<div id="bccGuideBody"></div>';
    mount.appendChild(sec);
    _state.sectionEl = sec;
    _state.bodyEl = sec.querySelector('#bccGuideBody');
  }

  function showWaitingForAnalysis() {
    if (!_state.bodyEl) return;
    _state.bodyEl.innerHTML =
      '<div class="bcc-guide-prompt">'
      + '<div class="bcc-guide-prompt-h">분석을 완료하면 AI 액션 가이드가 활성화됩니다.</div>'
      + '<div class="bcc-guide-prompt-p">상단에서 분석을 먼저 실행해주세요.</div>'
      + '</div>';
  }

  function showPromptToGenerate(reasonNote) {
    if (!_state.bodyEl) return;
    const remaining = window.BCCClaudeAPI ? window.BCCClaudeAPI.remainingQuota() : 0;
    const limit = window.BCCClaudeAPI ? window.BCCClaudeAPI.DAILY_LIMIT : 5;
    const exceeded = window.BCCClaudeAPI ? window.BCCClaudeAPI.isQuotaExceeded() : false;
    const proxyOk = window.BCCClaudeAPI ? window.BCCClaudeAPI.isProxyConfigured() : false;

    if (exceeded) {
      showUpsell();
      return;
    }

    const demoBadge = proxyOk
      ? ''
      : '<span class="demo-tag">DEMO 모드</span>';
    const note = reasonNote ? '<div class="bcc-guide-meta" style="margin-bottom:14px;color:#ff8484;">' + escapeHtml(reasonNote) + '</div>' : '';

    _state.bodyEl.innerHTML = note +
      '<div class="bcc-guide-prompt">'
      + '<div class="bcc-guide-prompt-h">🤖 Claude AI로 BCC 맞춤 액션 가이드를 받으세요</div>'
      + '<div class="bcc-guide-prompt-p">분석 결과를 바탕으로 5단계 실행 가이드를 자동 생성합니다.<br>핵심 성공 요인 · 적용 포인트 · 첫 콘텐츠 · 7~30일 실행 계획 · 다음 추천</div>'
      + '<button class="bcc-guide-cta" id="bccGuideGenerateBtn">AI 액션 가이드 받기</button>'
      + '<div class="bcc-guide-meta">오늘 무료 분석: <strong>' + remaining + '/' + limit + '</strong> 회 남음 ' + demoBadge + '</div>'
      + '</div>';

    const btn = document.getElementById('bccGuideGenerateBtn');
    if (btn) btn.addEventListener('click', generate);
  }

  function showLoading() {
    if (!_state.bodyEl) return;
    _state.bodyEl.innerHTML =
      '<div class="bcc-guide-loading">'
      + '<div class="bcc-guide-spinner"></div>'
      + '<div>Claude AI가 BCC 액션 가이드를 작성 중입니다... (최대 30초)</div>'
      + '</div>';
  }

  function showGuide(guide, meta) {
    if (!_state.bodyEl) return;
    const isDemo = !!(meta && (meta.fromDemo || meta.fallbackReason));
    const remaining = window.BCCClaudeAPI ? window.BCCClaudeAPI.remainingQuota() : 0;
    const limit = window.BCCClaudeAPI ? window.BCCClaudeAPI.DAILY_LIMIT : 5;

    const steps = ['step1','step2','step3','step4','step5'].map(function (k, i) {
      const v = guide[k] || {};
      return '<div class="bcc-guide-step">'
        + '<div class="bcc-guide-step-num">STEP ' + (i + 1).toString().padStart(2, '0') + '</div>'
        + '<div class="bcc-guide-step-title">' + escapeHtml(v.title || '') + '</div>'
        + '<div class="bcc-guide-step-body">' + lightMarkdown(v.body || '') + '</div>'
        + '</div>';
    }).join('');

    const reasonText = (meta && meta.fallbackReason)
      ? ('AI 서버 응답 이슈로 데모 가이드를 표시합니다. (' + escapeHtml(meta.fallbackReason) + ')')
      : (isDemo ? 'BCC AI 서버 미설정 — 데모 가이드를 표시합니다.' : null);
    const tag = isDemo ? '<span class="demo-tag">DEMO 모드</span>' : '';
    const meta_line = isDemo
      ? '<div class="bcc-guide-meta" style="margin-top:18px;">' + (reasonText ? escapeHtml(reasonText) + '<br>' : '') + tag + '</div>'
      : '<div class="bcc-guide-meta" style="margin-top:18px;">Claude AI 응답 · 오늘 남은 무료 분석 <strong>' + remaining + '/' + limit + '</strong> 회</div>';

    _state.bodyEl.innerHTML = '<div class="bcc-guide-steps">' + steps + '</div>' + meta_line;

    _state.lastGuide = guide;
    window.BCCLastGuide = guide;

    // Notify listeners (e.g. PDF module wants to pick up the latest guide)
    try { window.dispatchEvent(new CustomEvent('bcc:guide-ready', { detail: { guide: guide, toolName: _state.toolName, demo: isDemo } })); } catch (e) {}
  }

  function showUpsell() {
    if (!_state.bodyEl) return;
    _state.bodyEl.innerHTML =
      '<div class="bcc-upsell">'
      + '<div class="bcc-upsell-h">오늘 무료 분석 사용량을 모두 사용하셨습니다.</div>'
      + '<div class="bcc-upsell-p">BCC 무료 도구는 하루 5회까지 AI 액션 가이드를 제공합니다. 더 깊이 있는 분석과 콘텐츠 전략이 필요하시다면 BCC 1:1 컨설팅을 이용해주세요.<br>실행 단계까지 함께 설계해드립니다.</div>'
      + '<a class="bcc-upsell-cta" href="https://pf.kakao.com/_xbrxjxkxj/chat" target="_blank" rel="noopener" id="bccUpsellCta">카카오톡 채널로 1:1 컨설팅 문의 →</a>'
      + '</div>';
    const a = document.getElementById('bccUpsellCta');
    if (a) a.addEventListener('click', function () {
      track('bcc_consulting_cta_click', { tool_name: _state.toolName, source: 'guide_quota_exceeded' });
      track('kakao_consult_click', { source_page: _state.toolName, button_location: 'guide_upsell' });
    });
  }

  // ---- Public API ----
  function attach(opts) {
    opts = opts || {};
    _state.toolName = opts.toolName || '';
    _state.toolTitle = opts.toolTitle || '';
    if (_state.attached) return;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { _attachNow(); });
    } else {
      _attachNow();
    }
  }
  function _attachNow() {
    renderShell();
    showWaitingForAnalysis();
    _state.attached = true;
  }

  /**
   * Called by host tool after analysis completes.
   * @param {string} toolName
   * @param {Object} data - tool-specific context, see TOOL_CONTEXTS
   * @param {string} [analysisTarget] - human-readable target label
   */
  function update(toolName, data, analysisTarget) {
    if (!_state.attached) {
      _state.toolName = toolName;
      attach({ toolName: toolName, toolTitle: _state.toolTitle });
    }
    _state.toolName = toolName;
    _state.data = data || {};
    _state.data._analysisTarget = analysisTarget || _state.data._analysisTarget || '';
    if (_state.sectionEl) _state.sectionEl.classList.add('is-active');
    showPromptToGenerate();
    track('action_guide_view', {
      tool_name: toolName,
      analysis_target: _state.data._analysisTarget || ''
    });
  }

  async function generate() {
    if (_state.busy) return;
    if (!_state.data) {
      showPromptToGenerate('분석 데이터가 없습니다. 먼저 분석을 실행해주세요.');
      return;
    }
    if (!isLeadVerified()) {
      showPromptToGenerate('리드 등록이 필요합니다. 페이지를 새로고침해 등록을 완료해주세요.');
      return;
    }
    if (window.BCCClaudeAPI && window.BCCClaudeAPI.isQuotaExceeded()) {
      showUpsell();
      track('bcc_consulting_cta_click', { tool_name: _state.toolName, source: 'guide_quota_blocked' });
      return;
    }

    _state.busy = true;
    showLoading();
    const startedAt = Date.now();

    const ctx = TOOL_CONTEXTS[_state.toolName];
    const userText = ctx ? ctx.describe(_state.data) : JSON.stringify(_state.data);
    const userMsg = userText + '\n\n위 분석 결과를 바탕으로 5단계 액션 가이드를 JSON으로만 출력해주세요.';

    let result;
    try {
      result = await window.BCCClaudeAPI.call({
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMsg }],
        max_tokens: 2000,
        model: 'claude-sonnet-4-5'
      });
    } catch (err) {
      result = { ok: false, code: 'unexpected', message: err.message };
    }

    let guide = null;
    let meta = {};

    if (result.ok) {
      const parsed = safeParseJSON(result.text);
      if (parsed) {
        guide = normalizeGuide(parsed, _state.toolName, _state.data);
        meta = { fromDemo: false, elapsed: Date.now() - startedAt };
      } else {
        guide = buildDemoGuide(_state.toolName, _state.data);
        meta = { fromDemo: true, fallbackReason: 'parse_error' };
      }
    } else if (result.code === 'no_proxy') {
      guide = buildDemoGuide(_state.toolName, _state.data);
      meta = { fromDemo: true, fallbackReason: null }; // null = expected demo mode
    } else if (result.code === 'quota_exceeded') {
      _state.busy = false;
      showUpsell();
      return;
    } else {
      guide = buildDemoGuide(_state.toolName, _state.data);
      meta = { fromDemo: true, fallbackReason: result.code };
    }

    showGuide(guide, meta);
    _state.busy = false;

    const elapsed = Date.now() - startedAt;
    track('action_guide_generated', {
      tool_name: _state.toolName,
      generation_time_ms: elapsed,
      from_demo: !!meta.fromDemo,
      fallback_reason: meta.fallbackReason || ''
    });
    logDeepUsage(_state.toolName, 'guide_generated', {
      analysis_target: _state.data._analysisTarget || '',
      from_demo: !!meta.fromDemo
    });
  }

  function getLastGuide() { return _state.lastGuide; }

  window.BCCActionGuide = {
    attach: attach,
    update: update,
    generate: generate,
    getLastGuide: getLastGuide,
    TOOL_CONTEXTS: TOOL_CONTEXTS,
    buildDemoGuide: buildDemoGuide
  };
})();
