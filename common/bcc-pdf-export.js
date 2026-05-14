/* ============================================================
   BCC Common — PDF Export Module
   ------------------------------------------------------------
   Mounts a "📄 BCC 분석 리포트 PDF로 받기" button at the top of
   each tool page. After analysis completes, host tool calls
     BCCPDFExport.update(payload)
   to enable the button. Click triggers lazy-loaded jsPDF +
   html2canvas pipeline that:
     1. Builds an off-screen DOM with cover/summary/section
        /guide/CTA pages (styled by bcc-pdf-styles.css).
     2. Captures each page to canvas (Korean text renders
        correctly through browser, then is rasterized).
     3. Embeds canvases as JPEG into A4 jsPDF.
     4. Saves the PDF and logs usage.

   payload shape:
     {
       analysisTarget: '...',  // shown on cover
       headline: '...',        // shown on summary page (HTML-safe text)
       summaryKpis: [{ label, value }, ...],   // shown on summary page
       sections: [
         { title, body }, OR
         { title, kvs: [{ k, v }, ...] }, OR
         { title, items: ['...', '...'] }
       ]
     }
   ============================================================ */
(function () {
  'use strict';

  const JSPDF_URL = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
  const HTML2CANVAS_URL = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
  // Reads from BCC_CONFIG (common/bcc-config.js loaded first).
  function _cfg(k, def) { return (window.BCC_CONFIG && window.BCC_CONFIG[k]) || def; }
  // QR encoder API (CORS-safe). Renders KAKAO_URL into a 220×220 PNG.
  const QR_API = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=2&data=';

  let _libsLoaded = false;
  let _state = {
    attached: false,
    toolName: '',
    toolTitle: '',
    payload: null,
    barEl: null,
    btnEl: null,
    busy: false
  };

  function escapeHtml(s) {
    return (s == null ? '' : String(s))
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function lightMarkdown(text) {
    return escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
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
      const ageDays = (Date.now() - new Date(at).getTime()) / (1000*60*60*24);
      return ageDays < 30;
    } catch (e) { return false; }
  }
  function logDeepUsage(toolName, action, extra) {
    try {
      const url = _cfg('LEAD_GAS_URL', '');
      if (!url) return;
      const payload = Object.assign({
        _token: _cfg('LEAD_TOKEN', ''),
        email: localStorage.getItem('bcc_lead_email') || '',
        name: localStorage.getItem('bcc_lead_name') || '',
        tool: 'BCC 유튜브 분석기',
        subtool: toolName,
        activity: action,
        timestamp: new Date().toISOString()
      }, extra || {});
      if (!payload.email) return;
      fetch(url, {
        method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      }).catch(function () {});
    } catch (e) {}
  }
  function todayLabel() {
    const d = new Date();
    return d.getFullYear() + '. ' + String(d.getMonth()+1).padStart(2,'0') + '. ' + String(d.getDate()).padStart(2,'0');
  }
  function fileDateLabel() {
    const d = new Date();
    return d.getFullYear() + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0');
  }
  function loadScript(url) {
    return new Promise(function (resolve, reject) {
      const existing = document.querySelector('script[data-bcc-pdflib="' + url + '"]');
      if (existing) { resolve(); return; }
      const s = document.createElement('script');
      s.src = url;
      s.async = true;
      s.dataset.bccPdflib = url;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('Failed to load ' + url)); };
      document.head.appendChild(s);
    });
  }
  async function loadLibs(onProgress) {
    if (_libsLoaded) return;
    if (onProgress) onProgress('PDF 라이브러리 로딩...');
    await loadScript(JSPDF_URL);
    await loadScript(HTML2CANVAS_URL);
    _libsLoaded = true;
  }

  // ---- DOM mount ----
  // Mount the prominent PDF download bar at the BOTTOM of results — right
  // before .legal-footer, AFTER the action guide section. Both buttons
  // (AI guide inside the guide section, PDF here) become visible together
  // at the bottom of the page after analysis completes.
  function findBarMount() {
    let mount = document.getElementById('bccExportBar');
    if (mount) return mount;
    const main = document.querySelector('main.main');
    if (main) {
      const legal = main.querySelector('.legal-footer');
      const bar = document.createElement('div');
      bar.id = 'bccExportBar';
      bar.className = 'bcc-export-bar bcc-export-bar-bottom';
      if (legal) main.insertBefore(bar, legal);
      else main.appendChild(bar);
      return bar;
    }
    return null;
  }

  function ensureBar() {
    if (_state.barEl) return _state.barEl;
    const bar = findBarMount();
    if (!bar) return null;
    bar.classList.add('bcc-export-bar', 'bcc-export-bar-bottom');
    if (!document.getElementById('bccPdfBtn')) {
      // Big gold primary button — visible at the bottom of results.
      // Demo mode is fully supported: PDF still generates whether or not
      // a guide has been Claude-generated.
      const btn = document.createElement('button');
      btn.id = 'bccPdfBtn';
      btn.type = 'button';
      btn.className = 'bcc-export-btn bcc-export-btn-primary';
      btn.disabled = true;
      btn.innerHTML = '<span class="bcc-export-icon">📄</span><span>분석 리포트 PDF 다운로드</span>';
      btn.addEventListener('click', triggerDownload);
      bar.appendChild(btn);

      const hint = document.createElement('div');
      hint.className = 'bcc-export-hint';
      hint.id = 'bccExportHint';
      hint.textContent = '표지 · 핵심 지표 · 상세 분석 · 액션 가이드 · BCC 1:1 컨설팅 안내까지 한 번에';
      bar.appendChild(hint);
    }
    _state.barEl = bar;
    _state.btnEl = document.getElementById('bccPdfBtn');
    return bar;
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
    ensureBar();
    _state.attached = true;
  }

  /**
   * Called by host tool after analysis renders.
   * Activates the bottom export bar and enables the PDF button.
   * (Action Guide button lives inside the guide section — see
   * bcc-action-guide.js — and is enabled separately by its own
   * update() call.)
   */
  function update(payload) {
    ensureBar();
    _state.payload = payload || {};
    if (_state.barEl) _state.barEl.classList.add('is-active');
    const pdfBtn = document.getElementById('bccPdfBtn');
    if (pdfBtn) pdfBtn.disabled = false;
  }

  async function triggerDownload() {
    if (_state.busy) return;
    if (!_state.payload) { alert('먼저 분석을 실행해주세요.'); return; }
    if (!isLeadVerified()) { alert('리드 등록이 필요합니다. 페이지를 새로고침해 등록을 완료해주세요.'); return; }

    _state.busy = true;
    const btn = document.getElementById('bccPdfBtn');
    const original = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.classList.add('is-loading');
      btn.innerHTML = '<span>📄</span><span>PDF 생성 중...</span>';
    }
    track('pdf_download_click', { tool_name: _state.toolName });

    try {
      await loadLibs(function (msg) {
        if (btn) btn.innerHTML = '<span>📄</span><span>' + escapeHtml(msg) + '</span>';
      });

      const guide = (window.BCCActionGuide && window.BCCActionGuide.getLastGuide && window.BCCActionGuide.getLastGuide()) || null;
      const shell = renderPDFShell(_state.payload, guide);
      const pages = Array.from(shell.querySelectorAll('.bcc-pdf-page'));

      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
      const A4_W = 210, A4_H = 297;

      for (let i = 0; i < pages.length; i++) {
        if (btn) btn.innerHTML = '<span>📄</span><span>페이지 ' + (i+1) + '/' + pages.length + ' 처리 중...</span>';
        const canvas = await window.html2canvas(pages[i], {
          scale: 2,
          backgroundColor: '#0a0a0a',
          useCORS: true,
          allowTaint: true,
          logging: false,
          width: 794,
          height: 1123
        });
        const imgData = canvas.toDataURL('image/jpeg', 0.85);
        const aspect = canvas.height / canvas.width;
        const w = A4_W;
        const h = Math.min(A4_H, w * aspect);
        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, 0, w, h, undefined, 'FAST');
      }

      document.body.removeChild(shell);

      const fileName = 'BCC_' + (_state.toolName || 'analyzer') + '_' + fileDateLabel() + '.pdf';
      const blob = pdf.output('blob');
      const sizeKb = Math.round(blob.size / 1024);

      // Trigger browser download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);

      track('pdf_download_complete', {
        tool_name: _state.toolName,
        file_size_kb: sizeKb,
        page_count: pages.length
      });
      logDeepUsage(_state.toolName, 'pdf_downloaded', {
        file_size_kb: sizeKb,
        page_count: pages.length,
        analysis_target: _state.payload.analysisTarget || ''
      });
    } catch (err) {
      console.error('[BCC PDF]', err);
      alert('PDF 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.\n\n' + (err && err.message ? err.message : ''));
    } finally {
      _state.busy = false;
      if (btn) {
        btn.classList.remove('is-loading');
        btn.disabled = false;
        btn.innerHTML = original;
      }
    }
  }

  // ---- Off-screen page builders ----
  function renderPDFShell(payload, guide) {
    const shell = document.createElement('div');
    shell.className = 'bcc-pdf-shell';
    shell.appendChild(buildCoverPage(payload));
    shell.appendChild(buildSummaryPage(payload));

    const sections = Array.isArray(payload.sections) ? payload.sections : [];
    // Split sections into chunks per page so they don't overflow A4.
    // Heuristic: ~2 sections per page (each with KV grid + body). If a section
    // has many items, render it alone on a page.
    const pages = splitSectionsToPages(sections);
    pages.forEach(function (sectionGroup, idx) {
      shell.appendChild(buildDetailPage({
        kicker: 'DETAIL ' + (idx + 1) + ' / ' + pages.length,
        title: idx === 0 ? '상세 분석' : ('상세 분석 (' + (idx + 1) + ')'),
        sections: sectionGroup
      }));
    });

    if (guide) shell.appendChild(buildGuidePage(guide));
    shell.appendChild(buildCTAPage(payload));

    document.body.appendChild(shell);
    return shell;
  }

  function splitSectionsToPages(sections) {
    const pages = [];
    let current = [];
    let currentCost = 0;
    const PAGE_BUDGET = 100; // arbitrary "lines" budget per page
    sections.forEach(function (sec) {
      let cost = 8; // title + base
      if (sec.body) cost += Math.ceil(String(sec.body).length / 80) * 2;
      if (Array.isArray(sec.kvs)) cost += Math.ceil(sec.kvs.length / 2) * 12;
      if (Array.isArray(sec.items)) cost += sec.items.length * 4;
      if (currentCost + cost > PAGE_BUDGET && current.length > 0) {
        pages.push(current);
        current = [sec];
        currentCost = cost;
      } else {
        current.push(sec);
        currentCost += cost;
      }
    });
    if (current.length) pages.push(current);
    if (pages.length === 0) pages.push([]);
    return pages;
  }

  function pdfFooter() {
    return '<div class="pdf-footer">'
      + '<span>© 2026 BCC | ' + _cfg('BCC_SITE_URL', 'https://ohdana08.github.io/bcc-homepage').replace(/^https?:\/\//, '') + '</span>'
      + '<span class="pdf-foot-brand">BCC</span>'
      + '</div>';
  }

  function buildCoverPage(payload) {
    const target = payload.analysisTarget || '';
    const p = document.createElement('div');
    p.className = 'bcc-pdf-page bcc-pdf-cover';
    p.innerHTML =
      '<div class="cover-inner">'
      + '<div class="cover-brand-logo">BCC</div>'
      + '<div class="cover-brand-line"></div>'
      + '<div class="cover-brand-sub">BUSINESS CAREER CONSULTING</div>'
      + '<div class="cover-kicker">' + escapeHtml(_state.toolTitle || 'ANALYSIS REPORT') + '</div>'
      + '<div class="cover-tool">' + escapeHtml(payload.coverTitle || _state.toolTitle || '분석 리포트') + '</div>'
      + '<div class="cover-target">' + (target ? '분석 대상: <strong>' + escapeHtml(target) + '</strong>' : '') + '</div>'
      + '<div class="cover-date">' + todayLabel() + '</div>'
      + '</div>'
      + pdfFooter();
    return p;
  }

  function buildSummaryPage(payload) {
    const p = document.createElement('div');
    p.className = 'bcc-pdf-page';
    const kpis = Array.isArray(payload.summaryKpis) ? payload.summaryKpis : [];
    const kpisHtml = kpis.length
      ? '<div class="pdf-kv-grid">' + kpis.map(function (k) {
          return '<div class="pdf-kv"><div class="k">' + escapeHtml(k.label || '') + '</div><div class="v">' + escapeHtml(k.value || '-') + '</div></div>';
        }).join('') + '</div>'
      : '';
    const headlineHtml = payload.headline
      ? '<div class="pdf-headline">' + lightMarkdown(payload.headline) + '</div>'
      : '';
    p.innerHTML =
      '<div class="pdf-page-kicker">EXECUTIVE SUMMARY</div>'
      + '<h2 class="pdf-page-title">한 줄 진단 · 핵심 지표</h2>'
      + headlineHtml
      + kpisHtml
      + pdfFooter();
    return p;
  }

  function renderSectionEl(sec) {
    let inner = '';
    if (Array.isArray(sec.kvs) && sec.kvs.length) {
      inner += '<div class="pdf-kv-grid">' + sec.kvs.map(function (k) {
        return '<div class="pdf-kv"><div class="k">' + escapeHtml(k.k || '') + '</div><div class="v">' + escapeHtml(k.v || '-') + '</div></div>';
      }).join('') + '</div>';
    }
    if (Array.isArray(sec.items) && sec.items.length) {
      inner += '<ul class="pdf-section-list">' + sec.items.map(function (it) {
        return '<li>' + lightMarkdown(it) + '</li>';
      }).join('') + '</ul>';
    }
    if (sec.body) {
      inner += '<div class="pdf-section-body">' + lightMarkdown(sec.body) + '</div>';
    }
    return '<div class="pdf-section">'
      + '<div class="pdf-section-title">' + escapeHtml(sec.title || '') + '</div>'
      + inner
      + '</div>';
  }

  function buildDetailPage({ kicker, title, sections }) {
    const p = document.createElement('div');
    p.className = 'bcc-pdf-page';
    const body = sections.map(renderSectionEl).join('');
    p.innerHTML =
      '<div class="pdf-page-kicker">' + escapeHtml(kicker) + '</div>'
      + '<h2 class="pdf-page-title">' + escapeHtml(title) + '</h2>'
      + body
      + pdfFooter();
    return p;
  }

  function buildGuidePage(guide) {
    const p = document.createElement('div');
    p.className = 'bcc-pdf-page';
    const stepKeys = ['step1','step2','step3','step4','step5'];
    const stepsHtml = stepKeys.map(function (k, i) {
      const v = guide[k] || {};
      return '<div class="pdf-step">'
        + '<div class="pdf-step-num">STEP ' + (i+1).toString().padStart(2,'0') + '</div>'
        + '<div class="pdf-step-title">' + escapeHtml(v.title || '') + '</div>'
        + '<div class="pdf-step-body">' + lightMarkdown(v.body || '') + '</div>'
        + '</div>';
    }).join('');
    p.innerHTML =
      '<div class="pdf-page-kicker">BCC ACTION GUIDE</div>'
      + '<h2 class="pdf-page-title">BCC 5단계 액션 가이드</h2>'
      + stepsHtml
      + pdfFooter();
    return p;
  }

  function buildCTAPage(payload) {
    const p = document.createElement('div');
    p.className = 'bcc-pdf-page bcc-pdf-cta';
    p.innerHTML =
      '<div class="bcc-pdf-cta-inner">'
      + '<div class="bcc-pdf-cta-pre">BCC 1:1 CONSULTING</div>'
      + '<h2 class="bcc-pdf-cta-h">데이터로만으로<br>충분하지 않을 때,<br><strong>BCC 1:1 컨설팅</strong></h2>'
      + '<p class="bcc-pdf-cta-p">무료 도구가 보여주는 것은 시장의 윤곽선입니다. 본인 채널의 강점·시장 포지셔닝·콘텐츠 시리즈화·수익 모델까지 한 번에 설계하시려면 BCC와 1:1 컨설팅으로 만나보세요.</p>'
      + '<div class="bcc-pdf-cta-card">'
      + '<h3>BCC 1:1 컨설팅 포함 사항</h3>'
      + '<ul>'
      + '<li>본인 채널·콘텐츠 1:1 진단 (분석 도구 결과 함께 검토)</li>'
      + '<li>3개월 콘텐츠 시리즈·키워드 로드맵</li>'
      + '<li>썸네일·제목·후킹 직접 피드백</li>'
      + '<li>수익 모델 설계 (강의·전자책·1:1·구독)</li>'
      + '<li>월 1회 진척 점검 + 피드백</li>'
      + '</ul>'
      + '<div class="bcc-pdf-cta-link">📱 카카오톡 채널: <strong>BCC 비즈니스커리어컨설팅</strong></div>'
      + '<div class="bcc-pdf-cta-link" style="margin-top:6px;">🌐 ' + _cfg('BCC_SITE_URL', 'https://ohdana08.github.io/bcc-homepage').replace(/^https?:\/\//, '') + '</div>'
      + '<div style="text-align:center;">'
      +   '<div class="bcc-pdf-qr"><img src="' + QR_API + encodeURIComponent(_cfg('KAKAO_URL', '')) + '" alt="QR" crossorigin="anonymous"></div>'
      +   '<div class="bcc-pdf-qr-cap">QR 스캔 → 카카오톡 1:1 채팅 바로 시작</div>'
      + '</div>'
      + '</div>'
      + '</div>'
      + pdfFooter();
    return p;
  }

  window.BCCPDFExport = {
    attach: attach,
    update: update,
    download: triggerDownload
  };
})();
