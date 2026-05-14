/* ============================================================
   BCC 잇툴즈 공통 클라이언트 설정
   ------------------------------------------------------------
   본 파일은 GitHub 공개 레포에 푸시됩니다.
   여기 들어가는 값은 모두 "클라이언트가 알아야 동작하는 공개 식별자"
   입니다. 진짜 비밀(예: ANTHROPIC_API_KEY)은 절대 여기 두지 마세요 —
   백엔드 프록시(Cloudflare Worker / GAS)에 보관해야 합니다.

   업데이트 영향 범위:
     LEAD_GAS_URL 또는 LEAD_TOKEN 변경 시 → GAS 측 Script Property
     'BCC_LEAD_TOKEN' 와 새 배포 URL을 함께 갱신해야 함.
   ============================================================ */
(function () {
  'use strict';

  window.BCC_CONFIG = Object.freeze({
    // GAS Web App URL — 리드 수집 + deep usage 로깅
    LEAD_GAS_URL: 'https://script.google.com/macros/s/AKfycbzfq3fKnqJc3km-1UZIv1UMF-GwC5AZoouEhphpKWTSEF_q6SZD8l0fksMitsFtSpGQ/exec',

    // 봇 스팸 차단용 식별 토큰 — 비밀 아님(클라이언트에 노출됨).
    // GAS Script Property 'BCC_LEAD_TOKEN' 과 짝을 맞춰야 함.
    LEAD_TOKEN: 'e1b2ddd2819e47c0a4c9547f61495830',

    // 카카오톡 BCC 1:1 채널
    KAKAO_URL: 'https://pf.kakao.com/_xbrxjxkxj/chat',

    // BCC 홈페이지
    BCC_SITE_URL: 'https://ohdana08.github.io/bcc-homepage'
  });
})();
