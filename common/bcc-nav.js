/* ============================================================
   BCC 잇툴즈 — 공통 네비게이션 모듈
   ------------------------------------------------------------
   각 도구 페이지(finder/competitor-analyzer/video-analyzer/
   keyword-finder)에 다음을 자동 주입:

   1) 상단 sticky 네비게이션 바
      - 🏠 잇툴즈 로고 → ../ (잇툴즈 메인 = analyzer 랜딩)
      - 4개 도구 메뉴 (현재 페이지 골드 highlight)
      - 모바일(720px↓): 햄버거 메뉴 토글

   2) 결과 페이지 하단 "다른 도구 사용해보기" 카드 3개
      (현재 도구 제외)

   3) 기존 사이드바의 sidebar-nav 블록은 런타임에 제거
      (중복 방지)

   도구 추가는 common/bcc-config.js 의 TOOLS 배열에만 한 줄 추가.

   GA4 events:
      - topnav_clicked      { source_tool, target_tool }
      - cross_tool_clicked  { source_tool, target_tool }
      - mobile_nav_opened   { source_tool }
   ============================================================ */
(function () {
  'use strict';

  var NAV_HEIGHT = 56;
  var CSS_ID = 'bcc-nav-styles';

  function tools() {
    return (window.BCC_CONFIG && window.BCC_CONFIG.TOOLS) || [];
  }
  function escapeHtml(s) {
    return (s == null ? '' : String(s))
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function track(name, params) {
    try {
      if (typeof gtag === 'function') gtag('event', name, params || {});
      if (window.dataLayer) window.dataLayer.push(Object.assign({ event: name }, params || {}));
    } catch (e) {}
  }

  function injectStyles() {
    if (document.getElementById(CSS_ID)) return;
    var css = ''
      + '.bcc-topnav{position:sticky;top:0;left:0;right:0;z-index:100;'
      +   'height:' + NAV_HEIGHT + 'px;background:#0a0a0a;color:#fff;'
      +   'border-bottom:1px solid rgba(201,168,76,0.3);'
      +   'display:flex;align-items:center;justify-content:space-between;'
      +   'padding:0 24px;'
      +   'font-family:"Pretendard Variable",Pretendard,-apple-system,BlinkMacSystemFont,system-ui,sans-serif;}'
      + '.bcc-topnav-logo{display:inline-flex;align-items:center;gap:8px;'
      +   'color:#C9A84C;text-decoration:none;'
      +   'font-family:Georgia,"Times New Roman",serif;font-size:18px;'
      +   'letter-spacing:2px;font-weight:400;}'
      + '.bcc-topnav-logo .bcc-topnav-logo-icon{font-size:20px;line-height:1;}'
      + '.bcc-topnav-logo:hover{color:#e6c869;}'
      + '.bcc-topnav-menu{display:flex;gap:2px;list-style:none;margin:0;padding:0;}'
      + '.bcc-topnav-menu a{display:block;padding:8px 14px;'
      +   'color:rgba(255,255,255,0.7);text-decoration:none;'
      +   'font-size:13px;font-weight:500;letter-spacing:-0.1px;'
      +   'border-radius:4px;transition:color .15s, background .15s;}'
      + '.bcc-topnav-menu a:hover{color:#fff;background:rgba(255,255,255,0.06);}'
      + '.bcc-topnav-menu a.is-current{color:#C9A84C;'
      +   'background:rgba(201,168,76,0.08);'
      +   'border-bottom:2px solid #C9A84C;border-radius:0;}'
      + '.bcc-topnav-hamburger{display:none;background:transparent;'
      +   'border:1px solid rgba(255,255,255,0.2);color:#fff;'
      +   'padding:6px 10px;border-radius:4px;cursor:pointer;'
      +   'font-size:16px;line-height:1;}'
      + '.bcc-topnav-hamburger:hover{border-color:#C9A84C;color:#C9A84C;}'
      // Desktop: sidebar must stick below the nav
      + '@media (min-width:901px){'
      +   '.app .sidebar{top:' + NAV_HEIGHT + 'px !important;'
      +   ' height:calc(100vh - ' + NAV_HEIGHT + 'px) !important;}'
      + '}'
      // Mobile: collapse menu into dropdown
      + '@media (max-width:720px){'
      +   '.bcc-topnav{padding:0 16px;position:relative;}'
      +   '.bcc-topnav-menu{display:none;position:absolute;'
      +   ' top:' + NAV_HEIGHT + 'px;right:12px;'
      +   ' background:#0a0a0a;border:1px solid rgba(201,168,76,0.3);'
      +   ' border-radius:4px;flex-direction:column;padding:8px;'
      +   ' min-width:220px;box-shadow:0 8px 24px rgba(0,0,0,0.5);'
      +   ' gap:2px;z-index:100;}'
      +   '.bcc-topnav-menu.is-open{display:flex;}'
      +   '.bcc-topnav-hamburger{display:inline-flex;align-items:center;}'
      +   '.bcc-topnav-menu a{padding:10px 14px;font-size:14px;}'
      +   '.bcc-topnav-menu a.is-current{border-bottom:none;border-left:2px solid #C9A84C;}'
      +   '.bcc-topnav-logo{font-size:16px;letter-spacing:1.5px;}'
      + '}'
      // Cross-tools section (bottom of results)
      + '.bcc-cross-tools{margin-top:28px;padding-top:24px;'
      +   'border-top:1px solid #e8e5dd;}'
      + '.bcc-cross-tools-kicker{font-family:Georgia,serif;font-size:11px;'
      +   'letter-spacing:2.5px;color:#C9A84C;text-transform:uppercase;'
      +   'margin-bottom:6px;font-weight:700;}'
      + '.bcc-cross-tools-title{font-size:18px;font-weight:700;'
      +   'color:#0a0a0a;margin-bottom:18px;letter-spacing:-0.3px;}'
      + '.bcc-cross-tools-grid{display:grid;'
      +   'grid-template-columns:repeat(3,1fr);gap:14px;}'
      + '.bcc-cross-tool-card{display:flex;flex-direction:column;'
      +   'background:#fff;border:1px solid #e8e5dd;border-left:3px solid #C9A84C;'
      +   'border-radius:4px;padding:18px 20px;text-decoration:none;'
      +   'color:inherit;transition:transform .18s, box-shadow .18s, border-color .18s;}'
      + '.bcc-cross-tool-card:hover{transform:translateY(-2px);'
      +   'box-shadow:0 8px 20px rgba(0,0,0,0.08);border-left-color:#9a7f30;}'
      + '.bcc-cross-tool-card .bcc-ct-icon{font-size:28px;margin-bottom:10px;line-height:1;}'
      + '.bcc-cross-tool-card .bcc-ct-title{font-size:15px;font-weight:700;'
      +   'color:#0a0a0a;margin-bottom:6px;letter-spacing:-0.2px;}'
      + '.bcc-cross-tool-card .bcc-ct-desc{font-size:12px;color:#555;'
      +   'line-height:1.65;margin-bottom:14px;flex:1;}'
      + '.bcc-cross-tool-card .bcc-ct-cta{font-size:12px;color:#9a7f30;'
      +   'font-weight:700;letter-spacing:0.3px;}'
      + '@media (max-width:900px){'
      +   '.bcc-cross-tools-grid{grid-template-columns:1fr;}'
      + '}';
    var style = document.createElement('style');
    style.id = CSS_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  function removeOldSidebarNav() {
    var old = document.querySelector('.sidebar .sidebar-nav');
    if (old) old.parentNode.removeChild(old);
  }

  function buildTopNav(currentToolId) {
    var TOOLS = tools();
    if (!TOOLS.length) return;

    var menuItems = TOOLS.map(function (t) {
      var isCurrent = t.id === currentToolId;
      var cls = isCurrent ? ' class="is-current" aria-current="page"' : '';
      var href = isCurrent ? '#' : '../' + t.path;
      var label = escapeHtml(t.navTitle || t.title);
      return '<li><a href="' + href + '" data-bcc-nav="' + escapeHtml(t.id) + '"' + cls + '>' + label + '</a></li>';
    }).join('');

    var nav = document.createElement('nav');
    nav.className = 'bcc-topnav';
    nav.setAttribute('aria-label', '잇툴즈 메인 네비게이션');
    nav.innerHTML = ''
      + '<a class="bcc-topnav-logo" href="../" data-bcc-nav="logo" aria-label="잇툴즈 메인으로">'
      +   '<span class="bcc-topnav-logo-icon">🏠</span>'
      +   '<span>잇툴즈</span>'
      + '</a>'
      + '<ul class="bcc-topnav-menu" id="bccTopnavMenu" role="menubar">' + menuItems + '</ul>'
      + '<button class="bcc-topnav-hamburger" id="bccTopnavToggle" '
      +   'aria-label="메뉴 열기/닫기" aria-controls="bccTopnavMenu" aria-expanded="false">☰</button>';

    document.body.insertBefore(nav, document.body.firstChild);

    // Click tracking
    nav.querySelectorAll('[data-bcc-nav]').forEach(function (el) {
      el.addEventListener('click', function () {
        track('topnav_clicked', {
          source_tool: currentToolId,
          target_tool: el.getAttribute('data-bcc-nav')
        });
      });
    });

    // Mobile hamburger toggle
    var toggle = document.getElementById('bccTopnavToggle');
    var menu = document.getElementById('bccTopnavMenu');
    if (toggle && menu) {
      toggle.addEventListener('click', function (e) {
        e.stopPropagation();
        var open = menu.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) track('mobile_nav_opened', { source_tool: currentToolId });
      });
      document.addEventListener('click', function (e) {
        if (!menu.contains(e.target) && !toggle.contains(e.target)) {
          menu.classList.remove('is-open');
          toggle.setAttribute('aria-expanded', 'false');
        }
      });
      // Auto-close on escape
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && menu.classList.contains('is-open')) {
          menu.classList.remove('is-open');
          toggle.setAttribute('aria-expanded', 'false');
        }
      });
    }
  }

  function buildCrossTools(currentToolId) {
    var TOOLS = tools();
    var others = TOOLS.filter(function (t) { return t.id !== currentToolId; });
    if (!others.length) return;

    var section = document.createElement('section');
    section.className = 'bcc-cross-tools';
    section.id = 'bccCrossTools';
    section.innerHTML = ''
      + '<div class="bcc-cross-tools-kicker">OTHER ITTOOLS</div>'
      + '<h3 class="bcc-cross-tools-title">다른 도구 사용해보기</h3>'
      + '<div class="bcc-cross-tools-grid">'
      +   others.map(function (t) {
        return ''
          + '<a class="bcc-cross-tool-card" href="../' + escapeHtml(t.path) + '" '
          +    'data-bcc-cross="' + escapeHtml(t.id) + '">'
          +   '<span class="bcc-ct-icon" aria-hidden="true">' + escapeHtml(t.icon || '🔧') + '</span>'
          +   '<div class="bcc-ct-title">' + escapeHtml(t.title) + '</div>'
          +   '<div class="bcc-ct-desc">' + escapeHtml(t.desc || '') + '</div>'
          +   '<div class="bcc-ct-cta">바로 사용하기 →</div>'
          + '</a>';
      }).join('')
      + '</div>';

    var main = document.querySelector('main.main');
    if (!main) return;
    var legal = main.querySelector('.legal-footer');
    if (legal) main.insertBefore(section, legal);
    else main.appendChild(section);

    section.querySelectorAll('[data-bcc-cross]').forEach(function (el) {
      el.addEventListener('click', function () {
        track('cross_tool_clicked', {
          source_tool: currentToolId,
          target_tool: el.getAttribute('data-bcc-cross')
        });
      });
    });
  }

  function doAttach(currentTool) {
    if (!tools().length) {
      console.warn('[BCCNav] BCC_CONFIG.TOOLS is empty. Define it in bcc-config.js.');
      return;
    }
    injectStyles();
    removeOldSidebarNav();
    buildTopNav(currentTool);
    buildCrossTools(currentTool);
  }

  window.BCCNav = {
    attach: function (opts) {
      var currentTool = (opts && opts.currentTool) || '';
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { doAttach(currentTool); });
      } else {
        doAttach(currentTool);
      }
    }
  };
})();
