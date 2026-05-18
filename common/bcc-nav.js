/* ============================================================
   BCC 잇툴즈 — 공통 네비게이션 모듈 (2단 구조)
   ------------------------------------------------------------
   각 도구 페이지(finder/competitor-analyzer/video-analyzer/
   keyword-finder)에 다음을 자동 주입:

   1) 상단 sticky 글로벌 네비 (.bcc-topnav)
      - 🏠 잇툴즈 로고 → BCC_CONFIG.ITTOOLZ_HUB_URL
      - 4개 카테고리 메뉴 (현재 카테고리 골드 highlight)
      - Coming Soon 카테고리는 disabled (클릭 비활성)

   2) 그 아래 카테고리 내부 네비 (.bcc-subnav)
      - 현재 카테고리의 모든 도구를 가로 메뉴로 노출
      - 현재 도구는 골드 강조
      - currentCategory 가 없거나 매칭되는 도구가 없으면 미렌더

   3) 모바일(720px↓): 햄버거 메뉴 — 카테고리 + 도구를 한 패널에 결합

   4) 결과 페이지 하단 "다른 도구 사용해보기" 카드
      (같은 카테고리 내 도구만, 현재 도구 제외)

   5) 기존 사이드바의 sidebar-nav 블록은 런타임에 제거(중복 방지)

   도구 추가는 common/bcc-config.js 의 TOOLS 배열에만 한 줄 추가.
   카테고리 추가는 CATEGORIES 배열에만 한 줄 추가.

   GA4 events:
      - topnav_clicked      { source_tool, target_category }
      - subnav_clicked      { source_tool, target_tool }
      - cross_tool_clicked  { source_tool, target_tool }
      - mobile_nav_opened   { source_tool }
   ============================================================ */
(function () {
  'use strict';

  var NAV_H_TOP = 56;
  var NAV_H_SUB = 44;
  var CSS_ID = 'bcc-nav-styles';

  // ============================================================
  // BCCAuth (inline) — 어드민/사용자 인증 + 한도 체크 placeholder
  // ------------------------------------------------------------
  // 사용자가 admin 으로 로그인하는 방법:
  //   ① URL 한 번 방문:
  //      ?admin_login=ohdana08@gmail.com 을 어느 잇툴즈 페이지 끝에
  //      붙여 한 번 접속하면 localStorage 에 저장되고 URL 자동 정리.
  //   ② 콘솔에서:
  //      BCCAuth.loginAs('ohdana08@gmail.com')   → 자동 reload
  //   로그아웃:
  //      BCCAuth.logout() 또는 상단 nav 의 ADMIN 배지 클릭
  //
  // 보안 주의: 클라이언트 사이드 화이트리스트라 진짜 보안이 아닙니다.
  //   "Admin 모드"는 사용량 한도 우회·관리 UI 노출을 위한 UX 식별자.
  //   민감 권한이 생기면 백엔드 토큰 검증으로 교체 필요.
  // ============================================================
  var AUTH_KEY = 'bcc_user_email';

  function _safeStorage(action) {
    try { return action(); } catch (e) { return null; }
  }
  function _getEmail() {
    var v = _safeStorage(function () { return localStorage.getItem(AUTH_KEY); });
    return (v || '').toLowerCase().trim();
  }
  function _setEmail(email) {
    _safeStorage(function () {
      localStorage.setItem(AUTH_KEY, String(email).toLowerCase().trim());
    });
  }
  function _clearEmail() {
    _safeStorage(function () { localStorage.removeItem(AUTH_KEY); });
  }
  function _adminEmails() {
    return (window.BCC_CONFIG && window.BCC_CONFIG.ADMIN_EMAILS) || [];
  }
  function _isAdmin() {
    var em = _getEmail();
    if (!em) return false;
    var list = _adminEmails();
    for (var i = 0; i < list.length; i++) {
      if (String(list[i]).toLowerCase() === em) return true;
    }
    return false;
  }

  // URL ?admin_login=email 처리 (페이지 로드 즉시)
  try {
    if (window.location && window.history && window.history.replaceState) {
      var url = new URL(window.location.href);
      var p = url.searchParams.get('admin_login');
      if (p) {
        _setEmail(p);
        url.searchParams.delete('admin_login');
        var clean = url.pathname + (url.search || '') + (url.hash || '');
        window.history.replaceState(null, '', clean);
      }
    }
  } catch (e) { /* no-op */ }

  // 어드민이면 콘솔에 표시 (UX 보조 — 본인이 admin 상태인지 확인용)
  if (_isAdmin()) {
    try {
      console.info(
        '%c🔧 BCC ADMIN  %c ' + _getEmail() + ' · 한도 무시 / 전 기능 접근',
        'background:#C9A84C;color:#0a0a0a;padding:3px 8px;border-radius:3px 0 0 3px;font-weight:700;letter-spacing:0.5px;',
        'background:#1d1d22;color:#e6c869;padding:3px 10px;border-radius:0 3px 3px 0;'
      );
    } catch (e) {}
  }

  window.BCCAuth = {
    getEmail: _getEmail,
    setEmail: _setEmail,
    logout: function () {
      _clearEmail();
      try { console.info('[BCCAuth] Logged out.'); } catch (e) {}
    },
    isAdmin: _isAdmin,
    // 향후 결제 연동 시 BCC_CONFIG.PRO_EMAILS 같은 화이트리스트로 분기.
    isPro: function () { return _isAdmin(); },
    loginAs: function (email) {
      if (!email) { console.warn('[BCCAuth] email 인자가 필요합니다.'); return false; }
      _setEmail(email);
      var ok = _isAdmin();
      try {
        console.info('[BCCAuth] ' + (ok ? 'ADMIN' : 'user') + ' 로그인: ' + email + ' — reload 합니다.');
      } catch (e) {}
      setTimeout(function () { location.reload(); }, 250);
      return ok;
    },
    // 한도 시스템 추후 구현 시 도구 코드에서 호출.
    // 예: var r = BCCAuth.checkLimit(); if (r.blocked) BCCNav.openLimitModal();
    // 현재: 어드민 = 무제한 / 그 외 = 한도 미구현(통과).
    checkLimit: function () {
      return {
        blocked: false,
        reason: _isAdmin() ? 'admin' : 'no_limit_yet'
      };
    }
  };

  function tools() {
    return (window.BCC_CONFIG && window.BCC_CONFIG.TOOLS) || [];
  }
  function categories() {
    return (window.BCC_CONFIG && window.BCC_CONFIG.CATEGORIES) || [];
  }
  function hubUrl() {
    return (window.BCC_CONFIG && window.BCC_CONFIG.ITTOOLZ_HUB_URL) || '/';
  }
  function openchatUrl() {
    return (window.BCC_CONFIG && window.BCC_CONFIG.KAKAO_OPENCHAT_URL) || '#';
  }
  function kakaoUrl() {
    return (window.BCC_CONFIG && window.BCC_CONFIG.KAKAO_URL) || '#';
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
    var totalH = NAV_H_TOP + NAV_H_SUB;
    var css = ''
      // ----- Global top nav (카테고리) -----
      + '.bcc-topnav{position:sticky;top:0;left:0;right:0;z-index:101;'
      +   'height:' + NAV_H_TOP + 'px;background:#0a0a0a;color:#fff;'
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
      // Brand group (logo + optional admin badge)
      + '.bcc-topnav-brand{display:inline-flex;align-items:center;gap:10px;}'
      + '.bcc-admin-badge{font-family:Georgia,"Times New Roman",serif;'
      +   'font-size:10px;letter-spacing:1.4px;background:#C9A84C;color:#0a0a0a;'
      +   'padding:3px 8px;border-radius:3px;border:none;cursor:pointer;'
      +   'font-weight:700;text-transform:uppercase;line-height:1.2;'
      +   'transition:background .15s, transform .1s;}'
      + '.bcc-admin-badge:hover{background:#e6c869;}'
      + '.bcc-admin-badge:active{transform:scale(0.96);}'
      + '.bcc-topnav-menu{display:flex;gap:2px;list-style:none;margin:0;padding:0;}'
      + '.bcc-topnav-menu a,.bcc-topnav-menu span.is-disabled{'
      +   'display:inline-flex;align-items:center;gap:6px;padding:8px 14px;'
      +   'color:rgba(255,255,255,0.7);text-decoration:none;'
      +   'font-size:13px;font-weight:500;letter-spacing:-0.1px;'
      +   'border-radius:4px;transition:color .15s, background .15s;}'
      + '.bcc-topnav-menu a:hover{color:#fff;background:rgba(255,255,255,0.06);}'
      + '.bcc-topnav-menu a.is-current{color:#C9A84C;'
      +   'background:rgba(201,168,76,0.08);'
      +   'border-bottom:2px solid #C9A84C;border-radius:0;}'
      + '.bcc-topnav-menu span.is-disabled{color:rgba(255,255,255,0.32);'
      +   'cursor:not-allowed;}'
      + '.bcc-topnav-menu .bcc-soon-badge{font-family:Georgia,serif;font-size:9px;'
      +   'letter-spacing:1px;background:rgba(255,255,255,0.08);'
      +   'color:rgba(255,255,255,0.55);padding:2px 6px;border-radius:3px;'
      +   'text-transform:uppercase;}'
      + '.bcc-topnav-hamburger{display:none;background:transparent;'
      +   'border:1px solid rgba(255,255,255,0.2);color:#fff;'
      +   'padding:6px 10px;border-radius:4px;cursor:pointer;'
      +   'font-size:16px;line-height:1;}'
      + '.bcc-topnav-hamburger:hover{border-color:#C9A84C;color:#C9A84C;}'

      // 모바일 햄버거 패널 — 데스크톱 포함 모든 폭에서 기본 숨김.
      // (모바일 미디어 쿼리가 fixed 포지셔닝/배경/트랜지션을 덮어쓰고,
      //  .is-open 토글로 display:block 노출.)
      + '.bcc-mobile-panel{display:none;}'

      // ----- Category-internal sub nav (도구) -----
      + '.bcc-subnav{position:sticky;top:' + NAV_H_TOP + 'px;left:0;right:0;z-index:100;'
      +   'height:' + NAV_H_SUB + 'px;background:#141414;'
      +   'border-bottom:1px solid rgba(255,255,255,0.06);'
      +   'display:flex;align-items:center;padding:0 24px;overflow-x:auto;'
      +   'font-family:"Pretendard Variable",Pretendard,-apple-system,system-ui,sans-serif;}'
      + '.bcc-subnav-menu{display:flex;gap:2px;list-style:none;margin:0;padding:0;'
      +   'align-items:center;}'
      + '.bcc-subnav-label{font-family:Georgia,serif;font-size:10px;'
      +   'letter-spacing:2px;color:rgba(255,255,255,0.4);'
      +   'text-transform:uppercase;margin-right:14px;white-space:nowrap;}'
      + '.bcc-subnav-menu a{display:inline-block;padding:6px 12px;'
      +   'color:rgba(255,255,255,0.65);text-decoration:none;font-size:13px;'
      +   'font-weight:500;border-radius:4px;white-space:nowrap;'
      +   'transition:color .15s, background .15s;}'
      + '.bcc-subnav-menu a:hover{color:#fff;background:rgba(255,255,255,0.05);}'
      + '.bcc-subnav-menu a.is-current{color:#C9A84C;'
      +   'background:rgba(201,168,76,0.1);font-weight:600;}'

      // ----- Sidebar offset (도구 페이지) -----
      + '@media (min-width:901px){'
      +   'body.bcc-has-subnav .app .sidebar{top:' + totalH + 'px !important;'
      +   ' height:calc(100vh - ' + totalH + 'px) !important;}'
      +   'body.bcc-no-subnav .app .sidebar{top:' + NAV_H_TOP + 'px !important;'
      +   ' height:calc(100vh - ' + NAV_H_TOP + 'px) !important;}'
      + '}'

      // ----- Mobile: collapse into single dropdown -----
      + '@media (max-width:720px){'
      +   '.bcc-topnav{padding:0 16px;position:sticky;}'
      +   '.bcc-topnav-menu{display:none;}'
      +   '.bcc-subnav{display:none;}'
      +   '.bcc-topnav-hamburger{display:inline-flex;align-items:center;}'
      +   '.bcc-mobile-panel{display:none;position:fixed;top:' + NAV_H_TOP + 'px;'
      +   ' left:0;right:0;z-index:100;background:#0a0a0a;'
      +   ' border-bottom:1px solid rgba(201,168,76,0.3);'
      +   ' max-height:calc(100vh - ' + NAV_H_TOP + 'px);overflow-y:auto;'
      +   ' transform:translateY(-8px);opacity:0;'
      +   ' transition:transform .18s ease, opacity .18s ease;}'
      +   '.bcc-mobile-panel.is-open{display:block;transform:translateY(0);opacity:1;}'
      +   '.bcc-mobile-section{padding:14px 18px;border-top:1px solid rgba(255,255,255,0.06);}'
      +   '.bcc-mobile-section:first-child{border-top:none;}'
      +   '.bcc-mobile-section-label{font-family:Georgia,serif;font-size:10px;'
      +   ' letter-spacing:2px;color:#C9A84C;text-transform:uppercase;margin-bottom:8px;}'
      +   '.bcc-mobile-section ul{list-style:none;margin:0;padding:0;'
      +   ' display:flex;flex-direction:column;gap:2px;}'
      +   '.bcc-mobile-section a,.bcc-mobile-section span.is-disabled{'
      +   ' display:flex;align-items:center;justify-content:space-between;'
      +   ' padding:10px 12px;color:rgba(255,255,255,0.78);text-decoration:none;'
      +   ' font-size:14px;border-radius:4px;}'
      +   '.bcc-mobile-section a:hover{background:rgba(255,255,255,0.05);color:#fff;}'
      +   '.bcc-mobile-section a.is-current{color:#C9A84C;'
      +   ' background:rgba(201,168,76,0.1);border-left:2px solid #C9A84C;}'
      +   '.bcc-mobile-section span.is-disabled{color:rgba(255,255,255,0.32);}'
      + '}'

      // ----- Cross-tools section (results 하단) -----
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
      + '}'

      // ----- Footer contact strip (도구 페이지 main 하단) -----
      + '.bcc-footer-contact{margin-top:32px;padding:18px 22px;'
      +   'background:#fdfaf2;border:1px solid #ebe3cb;border-radius:6px;'
      +   'display:flex;flex-wrap:wrap;align-items:center;justify-content:center;'
      +   'gap:10px 18px;font-family:"Pretendard Variable",Pretendard,system-ui,sans-serif;}'
      + '.bcc-footer-contact-label{font-family:Georgia,serif;font-size:11px;'
      +   'letter-spacing:1.5px;color:#9a7f30;text-transform:uppercase;'
      +   'margin-right:6px;}'
      + '.bcc-footer-contact a{display:inline-flex;align-items:center;gap:6px;'
      +   'padding:8px 14px;background:#fff;border:1px solid #e3dcc7;border-radius:999px;'
      +   'color:#5a4a1f;font-size:13px;font-weight:600;text-decoration:none;'
      +   'transition:border-color .15s, color .15s, background .15s;}'
      + '.bcc-footer-contact a:hover{border-color:#C9A84C;color:#9a7f30;'
      +   'background:#fbf7e8;}'
      + '.bcc-footer-contact .bcc-fc-icon{font-size:15px;line-height:1;}'

      // ----- Limit modal placeholder (도구 페이지 전용, 기본 hidden) -----
      + '.bcc-limit-modal{display:none;}'
      + '.bcc-limit-modal.is-open{display:flex;position:fixed;inset:0;z-index:200;'
      +   'background:rgba(10,10,10,0.72);align-items:center;justify-content:center;'
      +   'padding:24px;animation:bccLimitFadeIn .18s ease;}'
      + '@keyframes bccLimitFadeIn{from{opacity:0}to{opacity:1}}'
      + '.bcc-limit-dialog{background:#fff;border-radius:10px;max-width:520px;width:100%;'
      +   'padding:28px 28px 24px;box-shadow:0 24px 60px rgba(0,0,0,0.4);'
      +   'font-family:"Pretendard Variable",Pretendard,system-ui,sans-serif;'
      +   'position:relative;}'
      + '.bcc-limit-close{position:absolute;top:12px;right:14px;background:transparent;'
      +   'border:none;font-size:22px;color:#888;cursor:pointer;line-height:1;}'
      + '.bcc-limit-close:hover{color:#0a0a0a;}'
      + '.bcc-limit-kicker{font-family:Georgia,serif;font-size:11px;letter-spacing:2px;'
      +   'color:#C9A84C;text-transform:uppercase;font-weight:700;margin-bottom:6px;}'
      + '.bcc-limit-title{font-size:20px;font-weight:800;color:#0a0a0a;'
      +   'letter-spacing:-0.3px;margin-bottom:6px;}'
      + '.bcc-limit-desc{font-size:13px;color:#555;line-height:1.6;margin-bottom:18px;}'
      + '.bcc-limit-options{display:grid;grid-template-columns:1fr 1fr;gap:12px;}'
      + '.bcc-limit-option{display:flex;flex-direction:column;border:1px solid #e8e5dd;'
      +   'border-radius:8px;padding:16px 14px;text-decoration:none;color:inherit;'
      +   'transition:border-color .15s, transform .15s, box-shadow .15s;}'
      + '.bcc-limit-option:hover{border-color:#C9A84C;transform:translateY(-2px);'
      +   'box-shadow:0 6px 16px rgba(0,0,0,0.08);}'
      + '.bcc-limit-option.is-soon{opacity:0.7;cursor:not-allowed;}'
      + '.bcc-limit-option.is-soon:hover{transform:none;border-color:#e8e5dd;'
      +   'box-shadow:none;}'
      + '.bcc-limit-opt-icon{font-size:24px;margin-bottom:8px;line-height:1;}'
      + '.bcc-limit-opt-title{font-size:14px;font-weight:700;color:#0a0a0a;'
      +   'margin-bottom:4px;}'
      + '.bcc-limit-opt-sub{font-size:12px;color:#666;line-height:1.55;flex:1;'
      +   'margin-bottom:10px;}'
      + '.bcc-limit-opt-cta{font-size:12px;font-weight:700;color:#9a7f30;'
      +   'letter-spacing:0.3px;}'
      + '.bcc-limit-option.is-soon .bcc-limit-opt-cta{color:#999;}'
      + '@media (max-width:560px){'
      +   '.bcc-limit-options{grid-template-columns:1fr;}'
      +   '.bcc-limit-dialog{padding:22px 20px 20px;}'
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

  function resolveCategory(currentTool, currentCategory) {
    if (currentCategory) return currentCategory;
    var TOOLS = tools();
    for (var i = 0; i < TOOLS.length; i++) {
      if (TOOLS[i].id === currentTool) return TOOLS[i].category;
    }
    return '';
  }

  function buildTopNav(currentTool, currentCategory) {
    var CATS = categories();
    if (!CATS.length) return null;

    var menuItems = CATS.map(function (c) {
      var isCurrent = c.id === currentCategory;
      var isSoon = c.status === 'soon' || !c.baseUrl;
      if (isSoon) {
        return '<li><span class="is-disabled" aria-disabled="true">'
          + escapeHtml(c.label)
          + ' <span class="bcc-soon-badge">soon</span></span></li>';
      }
      var cls = isCurrent ? ' class="is-current" aria-current="page"' : '';
      var href = isCurrent ? '#' : c.baseUrl;
      return '<li><a href="' + escapeHtml(href) + '"'
        + ' data-bcc-nav-cat="' + escapeHtml(c.id) + '"' + cls + '>'
        + escapeHtml(c.label) + '</a></li>';
    }).join('');

    var adminBadge = _isAdmin()
      ? '<button class="bcc-admin-badge" id="bccAdminBadge" type="button"'
        + ' aria-label="Admin 모드 — 클릭하여 로그아웃"'
        + ' title="Admin: ' + escapeHtml(_getEmail()) + ' — 클릭하여 로그아웃">ADMIN</button>'
      : '';

    var nav = document.createElement('nav');
    nav.className = 'bcc-topnav';
    nav.setAttribute('aria-label', '잇툴즈 글로벌 네비게이션');
    nav.innerHTML = ''
      + '<div class="bcc-topnav-brand">'
      +   '<a class="bcc-topnav-logo" href="' + escapeHtml(hubUrl()) + '"'
      +     ' data-bcc-nav-cat="hub" aria-label="잇툴즈 메인으로">'
      +     '<span class="bcc-topnav-logo-icon">🏠</span>'
      +     '<span>잇툴즈</span>'
      +   '</a>'
      +   adminBadge
      + '</div>'
      + '<ul class="bcc-topnav-menu" role="menubar">' + menuItems + '</ul>'
      + '<button class="bcc-topnav-hamburger" id="bccTopnavToggle"'
      +   ' aria-label="메뉴 열기/닫기" aria-controls="bccMobilePanel"'
      +   ' aria-expanded="false">☰</button>';

    document.body.insertBefore(nav, document.body.firstChild);

    nav.querySelectorAll('[data-bcc-nav-cat]').forEach(function (el) {
      el.addEventListener('click', function () {
        track('topnav_clicked', {
          source_tool: currentTool || '',
          target_category: el.getAttribute('data-bcc-nav-cat')
        });
      });
    });

    var badgeEl = document.getElementById('bccAdminBadge');
    if (badgeEl) {
      badgeEl.addEventListener('click', function () {
        if (window.confirm('Admin 모드를 로그아웃하시겠습니까?')) {
          _clearEmail();
          location.reload();
        }
      });
    }

    return nav;
  }

  function buildSubNav(currentTool, currentCategory, topNavEl) {
    if (!currentCategory) return false;
    var TOOLS = tools();
    var sameCat = TOOLS.filter(function (t) { return t.category === currentCategory; });
    if (!sameCat.length) return false;

    var items = sameCat.map(function (t) {
      var isCurrent = t.id === currentTool;
      var cls = isCurrent ? ' class="is-current" aria-current="page"' : '';
      var href = isCurrent ? '#' : '../' + t.path;
      var label = escapeHtml(t.navTitle || t.title);
      return '<li><a href="' + href + '" data-bcc-nav-tool="' + escapeHtml(t.id) + '"'
        + cls + '>' + label + '</a></li>';
    }).join('');

    var sub = document.createElement('nav');
    sub.className = 'bcc-subnav';
    sub.setAttribute('aria-label', '카테고리 내부 네비게이션');
    sub.innerHTML = ''
      + '<span class="bcc-subnav-label">Tools</span>'
      + '<ul class="bcc-subnav-menu" role="menubar">' + items + '</ul>';

    if (topNavEl && topNavEl.nextSibling) {
      document.body.insertBefore(sub, topNavEl.nextSibling);
    } else {
      document.body.appendChild(sub);
    }

    sub.querySelectorAll('[data-bcc-nav-tool]').forEach(function (el) {
      el.addEventListener('click', function () {
        track('subnav_clicked', {
          source_tool: currentTool || '',
          target_tool: el.getAttribute('data-bcc-nav-tool')
        });
      });
    });

    return true;
  }

  function buildMobilePanel(currentTool, currentCategory, topNavEl) {
    var CATS = categories();
    var TOOLS = tools();

    var catItems = CATS.map(function (c) {
      var isCurrent = c.id === currentCategory;
      var isSoon = c.status === 'soon' || !c.baseUrl;
      if (isSoon) {
        return '<li><span class="is-disabled">'
          + escapeHtml(c.label)
          + ' <span class="bcc-soon-badge">soon</span></span></li>';
      }
      var cls = isCurrent ? ' class="is-current" aria-current="page"' : '';
      var href = isCurrent ? '#' : c.baseUrl;
      return '<li><a href="' + escapeHtml(href) + '"'
        + ' data-bcc-nav-cat="' + escapeHtml(c.id) + '"' + cls + '>'
        + escapeHtml(c.label) + '</a></li>';
    }).join('');

    var sameCat = currentCategory
      ? TOOLS.filter(function (t) { return t.category === currentCategory; })
      : [];

    var toolItems = sameCat.map(function (t) {
      var isCurrent = t.id === currentTool;
      var cls = isCurrent ? ' class="is-current" aria-current="page"' : '';
      var href = isCurrent ? '#' : '../' + t.path;
      var label = escapeHtml(t.navTitle || t.title);
      return '<li><a href="' + href + '" data-bcc-nav-tool="' + escapeHtml(t.id) + '"'
        + cls + '>' + label + '</a></li>';
    }).join('');

    var html = ''
      + '<div class="bcc-mobile-section">'
      +   '<div class="bcc-mobile-section-label">카테고리</div>'
      +   '<ul>' + catItems + '</ul>'
      + '</div>';
    if (toolItems) {
      html += ''
        + '<div class="bcc-mobile-section">'
        +   '<div class="bcc-mobile-section-label">현재 카테고리 도구</div>'
        +   '<ul>' + toolItems + '</ul>'
        + '</div>';
    }

    var panel = document.createElement('div');
    panel.className = 'bcc-mobile-panel';
    panel.id = 'bccMobilePanel';
    panel.innerHTML = html;

    if (topNavEl && topNavEl.parentNode) {
      topNavEl.parentNode.insertBefore(panel, topNavEl.nextSibling);
    } else {
      document.body.appendChild(panel);
    }

    var toggle = document.getElementById('bccTopnavToggle');
    if (toggle) {
      toggle.addEventListener('click', function (e) {
        e.stopPropagation();
        var open = panel.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) track('mobile_nav_opened', { source_tool: currentTool || '' });
      });
      document.addEventListener('click', function (e) {
        if (!panel.contains(e.target) && !toggle.contains(e.target)) {
          panel.classList.remove('is-open');
          toggle.setAttribute('aria-expanded', 'false');
        }
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && panel.classList.contains('is-open')) {
          panel.classList.remove('is-open');
          toggle.setAttribute('aria-expanded', 'false');
        }
      });
    }

    panel.querySelectorAll('[data-bcc-nav-cat]').forEach(function (el) {
      el.addEventListener('click', function () {
        track('topnav_clicked', {
          source_tool: currentTool || '',
          target_category: el.getAttribute('data-bcc-nav-cat')
        });
      });
    });
    panel.querySelectorAll('[data-bcc-nav-tool]').forEach(function (el) {
      el.addEventListener('click', function () {
        track('subnav_clicked', {
          source_tool: currentTool || '',
          target_tool: el.getAttribute('data-bcc-nav-tool')
        });
      });
    });
  }

  function buildCrossTools(currentTool, currentCategory) {
    var TOOLS = tools();
    var others = TOOLS.filter(function (t) {
      return t.id !== currentTool
        && (!currentCategory || t.category === currentCategory);
    });
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
          + '<a class="bcc-cross-tool-card" href="../' + escapeHtml(t.path) + '"'
          +    ' data-bcc-cross="' + escapeHtml(t.id) + '">'
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
          source_tool: currentTool || '',
          target_tool: el.getAttribute('data-bcc-cross')
        });
      });
    });
  }

  function buildFooterContact(currentTool) {
    // 도구 페이지(main.main 가진 페이지)에만 작은 contact strip 삽입.
    // 허브(bcc-homepage/tools/)는 자체 contact-band + footer 보유하므로 스킵.
    var main = document.querySelector('main.main');
    if (!main) return;
    if (document.getElementById('bccFooterContact')) return;

    var oUrl = openchatUrl();
    var kUrl = kakaoUrl();

    var section = document.createElement('div');
    section.className = 'bcc-footer-contact';
    section.id = 'bccFooterContact';
    section.innerHTML = ''
      + '<span class="bcc-footer-contact-label">Need help?</span>'
      + '<a href="' + escapeHtml(kUrl) + '" target="_blank" rel="noopener noreferrer"'
      +   ' data-kakao="footer">'
      +   '<span class="bcc-fc-icon" aria-hidden="true">💛</span>'
      +   '<span>카톡 상담</span>'
      + '</a>'
      + '<a href="' + escapeHtml(oUrl) + '" target="_blank" rel="noopener noreferrer"'
      +   ' data-openchat="footer">'
      +   '<span class="bcc-fc-icon" aria-hidden="true">💬</span>'
      +   '<span>오픈채팅방</span>'
      + '</a>';

    var legal = main.querySelector('.legal-footer');
    if (legal && legal.nextSibling) {
      main.insertBefore(section, legal.nextSibling);
    } else {
      main.appendChild(section);
    }
  }

  function buildLimitModal(currentTool) {
    // 도구 페이지 전용 placeholder. 한도 시스템 추후 구현 시
    // BCCNav.openLimitModal() 호출로 노출.
    if (!currentTool) return;
    if (document.getElementById('bccLimitModal')) return;

    var oUrl = openchatUrl();
    var modal = document.createElement('div');
    modal.className = 'bcc-limit-modal';
    modal.id = 'bccLimitModal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'bccLimitTitle');
    modal.innerHTML = ''
      + '<div class="bcc-limit-dialog">'
      +   '<button class="bcc-limit-close" id="bccLimitClose" aria-label="닫기">×</button>'
      +   '<div class="bcc-limit-kicker">DAILY LIMIT</div>'
      +   '<h3 class="bcc-limit-title" id="bccLimitTitle">오늘 무료 사용량을 모두 쓰셨습니다</h3>'
      +   '<p class="bcc-limit-desc">두 가지 방법으로 계속 사용할 수 있어요.</p>'
      +   '<div class="bcc-limit-options">'
      +     '<a class="bcc-limit-option" href="' + escapeHtml(oUrl) + '"'
      +        ' target="_blank" rel="noopener noreferrer" data-openchat="limit_modal">'
      +       '<span class="bcc-limit-opt-icon" aria-hidden="true">💬</span>'
      +       '<div class="bcc-limit-opt-title">오픈채팅방에서 API 발급</div>'
      +       '<div class="bcc-limit-opt-sub">본인 키 발급법을 안내받고 무제한으로 사용하세요. (무료)</div>'
      +       '<div class="bcc-limit-opt-cta">참여하기 →</div>'
      +     '</a>'
      +     '<a class="bcc-limit-option is-soon" href="#" aria-disabled="true"'
      +        ' onclick="return false;">'
      +       '<span class="bcc-limit-opt-icon" aria-hidden="true">💎</span>'
      +       '<div class="bcc-limit-opt-title">Pro 구독 (월 9,900원)</div>'
      +       '<div class="bcc-limit-opt-sub">키 발급 없이 바로 무제한. 가격/일정 추후 확정.</div>'
      +       '<div class="bcc-limit-opt-cta">준비 중</div>'
      +     '</a>'
      +   '</div>'
      + '</div>';

    document.body.appendChild(modal);

    function close() {
      modal.classList.remove('is-open');
    }
    document.getElementById('bccLimitClose').addEventListener('click', close);
    modal.addEventListener('click', function (e) {
      if (e.target === modal) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('is-open')) close();
    });
  }

  function installOpenchatTracking() {
    // [data-openchat] 가진 모든 요소(JS-injected + 정적 HTML 모두)에서
    // 클릭 발생 시 openchat_clicked 이벤트 전송. 위임 처리라 늦게 추가된
    // 요소(예: 모달 옵션)도 자동 커버.
    if (window.__bccOpenchatTracked) return;
    window.__bccOpenchatTracked = true;
    document.addEventListener('click', function (e) {
      var el = e.target.closest && e.target.closest('[data-openchat]');
      if (!el) return;
      track('openchat_clicked', {
        location: el.getAttribute('data-openchat') || 'unknown'
      });
    }, true);
  }

  function doAttach(opts) {
    var currentTool = opts.currentTool || '';
    var currentCategory = resolveCategory(currentTool, opts.currentCategory);

    if (!categories().length) {
      console.warn('[BCCNav] BCC_CONFIG.CATEGORIES is empty. Define it in bcc-config.js.');
      return;
    }
    injectStyles();
    removeOldSidebarNav();
    var topEl = buildTopNav(currentTool, currentCategory);
    var hasSub = buildSubNav(currentTool, currentCategory, topEl);
    buildMobilePanel(currentTool, currentCategory, topEl);
    document.body.classList.add(hasSub ? 'bcc-has-subnav' : 'bcc-no-subnav');
    if (currentTool && opts.skipCrossTools !== true) {
      buildCrossTools(currentTool, currentCategory);
    }
    if (currentTool) {
      buildFooterContact(currentTool);
      buildLimitModal(currentTool);
    }
    installOpenchatTracking();
  }

  window.BCCNav = {
    attach: function (opts) {
      var o = opts || {};
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { doAttach(o); });
      } else {
        doAttach(o);
      }
    },
    // 한도 시스템 추후 구현 시 호출 (예: BCCNav.openLimitModal()).
    // 현재는 placeholder UI만 노출.
    openLimitModal: function () {
      var m = document.getElementById('bccLimitModal');
      if (m) m.classList.add('is-open');
    },
    closeLimitModal: function () {
      var m = document.getElementById('bccLimitModal');
      if (m) m.classList.remove('is-open');
    }
  };
})();
