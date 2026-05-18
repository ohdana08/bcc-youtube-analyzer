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

  // 잇툴즈 허브(=메인) 절대 URL — 🏠 잇툴즈 로고/푸터에서 링크 대상
  // 별도 저장소(bcc-homepage)에 있어 절대 URL로 연결합니다.
  var ITTOOLZ_HUB_URL = 'https://ohdana08.github.io/bcc-homepage/tools/';

  // 잇툴즈 카테고리 레지스트리 — 글로벌(상단) 네비에 노출되는 분석기 카테고리
  // id       : 카테고리 식별자 (도구의 category 필드와 매칭, BCCNav.attach({currentCategory}))
  // label    : 글로벌 네비에 보이는 라벨
  // baseUrl  : 카테고리 랜딩 절대 URL (해당 카테고리 사이트의 루트)
  // status   : 'active' = 진입 가능, 'soon' = Coming Soon (클릭 비활성)
  var CATEGORIES = [
    {
      id: 'youtube',
      label: '유튜브 분석기',
      baseUrl: 'https://ohdana08.github.io/bcc-youtube-analyzer/',
      status: 'active'
    },
    {
      id: 'blog',
      label: '블로그 분석기',
      baseUrl: '',
      status: 'soon'
    },
    {
      id: 'smartstore',
      label: '스마트스토어 분석기',
      baseUrl: '',
      status: 'soon'
    },
    {
      id: 'instagram',
      label: '인스타그램 분석기',
      baseUrl: '',
      status: 'soon'
    }
  ];

  // 잇툴즈 도구 레지스트리 — 새 도구 추가는 이 배열에만 한 줄 추가하면
  // 모든 도구 페이지의 카테고리 내부 네비 + cross-tools 카드에 자동 반영됩니다.
  // id          : 디렉토리 이름과 동일 (BCCNav.attach의 currentTool 값과 매칭)
  // category    : 위 CATEGORIES 중 하나의 id (도구가 속한 카테고리)
  // path        : 카테고리 baseUrl 기준 상대 경로 (다른 도구 페이지의 ../{path}/ 로도 동작)
  // title       : 정식 명칭 (cross-tools 카드 및 SEO에 사용)
  // navTitle    : 네비 짧은 라벨 (공간 절약, 생략 시 title 사용)
  // icon        : 카드 이모지
  // desc        : cross-tools 카드 한 줄 설명
  // 사용자 워크플로우 순서: 발굴 → 분석 → 다음 콘텐츠 키워드 → (고난이도) 경쟁사
  var TOOLS = [
    {
      id: 'finder', category: 'youtube', path: 'finder/',
      title: '잘 나가는 영상 찾기', navTitle: '잘나가는 영상 찾기',
      icon: '🔥', desc: '키워드로 인기 영상 + 바이럴 지수 분석'
    },
    {
      id: 'video-analyzer', category: 'youtube', path: 'video-analyzer/',
      title: '영상 분석', navTitle: '영상분석',
      icon: '🎬', desc: '영상 URL로 성과·후킹·콘텐츠 메타 진단'
    },
    {
      id: 'keyword-finder', category: 'youtube', path: 'keyword-finder/',
      title: '황금키워드 발견', navTitle: '황금키워드 찾기',
      icon: '💎', desc: '키워드 경쟁도·트렌드·관련 키워드 발굴'
    },
    {
      id: 'competitor-analyzer', category: 'youtube', path: 'competitor-analyzer/',
      title: '경쟁채널 분석', navTitle: '경쟁채널 분석',
      icon: '🎯', desc: '채널 URL로 운영 패턴·TOP5 영상 진단'
    }
  ];

  window.BCC_CONFIG = Object.freeze({
    // GAS Web App URL — 리드 수집 + deep usage 로깅
    LEAD_GAS_URL: 'https://script.google.com/macros/s/AKfycbzfq3fKnqJc3km-1UZIv1UMF-GwC5AZoouEhphpKWTSEF_q6SZD8l0fksMitsFtSpGQ/exec',

    // 봇 스팸 차단용 식별 토큰 — 비밀 아님(클라이언트에 노출됨).
    // GAS Script Property 'BCC_LEAD_TOKEN' 과 짝을 맞춰야 함.
    LEAD_TOKEN: 'e1b2ddd2819e47c0a4c9547f61495830',

    // 카카오톡 BCC 1:1 채널
    KAKAO_URL: 'https://pf.kakao.com/_xbrxjxkxj/chat',

    // BCC 홈페이지
    BCC_SITE_URL: 'https://ohdana08.github.io/bcc-homepage',

    // 잇툴즈 허브 절대 URL (위에 정의)
    ITTOOLZ_HUB_URL: ITTOOLZ_HUB_URL,

    // 잇툴즈 카테고리 레지스트리 (위에 정의)
    CATEGORIES: Object.freeze(CATEGORIES.map(function (c) { return Object.freeze(c); })),

    // 잇툴즈 도구 레지스트리 (위에 정의)
    TOOLS: Object.freeze(TOOLS.map(function (t) { return Object.freeze(t); }))
  });
})();
