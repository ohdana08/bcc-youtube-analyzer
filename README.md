# BCC 유튜브 분석기

비즈니스커리어컨설팅(BCC)이 YouTube Data API v3 기반으로 독자 개발한 유튜브 콘텐츠 분석 도구 모음입니다.

## 도구

- **잘 나가는 영상 찾기** (`/finder/`) — 키워드 기반 인기 영상 분석, 바이럴 지수, 콘텐츠 진단 카드, 키워드 패턴.
- **경쟁채널 분석** (`/competitor-analyzer/`) — 채널 URL 한 줄로 채널 기본 정보, 핵심 지표(평균 조회수·좋아요·댓글·영상 길이), 요일/시간대 업로드 패턴, TOP 5 영상, 운영 인사이트를 자동 생성.
- **영상 분석** (`/video-analyzer/`) — 영상 URL 한 줄로 성과 지표, 채널 평균 대비 히트작 판정, 콘텐츠 메타(제목·설명·태그·챕터), 후킹 패턴(리스티클·공포·권위·호기심·역설), BCC 인사이트 자동 추출.
- **황금키워드 발견** (`/keyword-finder/`) — 키워드 한 줄로 50개 영상 검색 → 평균 조회수·구독자 분포·트렌드 분석 → 경쟁도(황금/보통/레드오션)·트렌드(성장세/안정/하향) 자동 판정, 관련 확장 키워드 제안.

## 공통

- API Key는 사용자 브라우저에만 저장(`localStorage: bcc_yt_key`)되며 외부 전송 없음.
- 첫 사용 시 1회 리드 등록(30일 유지)으로 도구 사용 가능.
- 측정: GA4 `G-TYJSYWW5Q6`, GTM `GTM-K94NGCTP`.

## 공통 컴포넌트 (`/common/`)

모든 BCC 분석 도구에 자동 적용되는 공통 시스템.

- **`bcc-pdf-export.js`** — 분석 결과를 A4 PDF로 변환 (jsPDF + html2canvas 지연 로드). 표지/요약/상세/액션 가이드/CTA 페이지 자동 생성. 한글 폰트는 브라우저 렌더링 후 캡처 방식이라 임베딩 불필요.
- **`bcc-action-guide.js`** — Claude AI로 5단계 액션 가이드 자동 생성 (핵심 성공 요인 → 우리 적용 포인트 → 첫 콘텐츠 → 7~30일 실행 계획 → 다음 추천). 분석 완료 시 섹션 자동 노출 + 버튼 클릭으로 생성.
- **`bcc-claude-api.js`** — Claude API 프록시 호출 래퍼. 일일 5회/사용자 한도 (localStorage 기반). 한도 초과 시 BCC 1:1 컨설팅 카카오 채널 CTA 자동 표시 (유료 전환 미끼).
- **`bcc-pdf-styles.css`** — PDF 오프스크린 페이지 + 온페이지 UI 스타일.

### Claude API 프록시 설정 (필수)

`common/bcc-claude-api.js` 상단의 `BCC_CLAUDE_PROXY_URL` 상수를 비워둔 상태에서는 액션 가이드가 **데모 템플릿**으로 동작합니다. 실제 Claude 응답을 받으려면:

1. Cloudflare Worker 또는 Google Apps Script로 프록시 배포
2. 서버 측에 `ANTHROPIC_API_KEY` 환경변수 저장
3. POST `{ model, max_tokens, system, messages }` 받아 `https://api.anthropic.com/v1/messages`로 포워딩
4. 응답: Anthropic 원형(`{ content: [{ type: 'text', text: '...' }] }`) 또는 평탄화(`{ text: '...' }`)
5. 배포 URL을 `BCC_CLAUDE_PROXY_URL`에 입력

### 통합된 GA4 이벤트

- `action_guide_view` (분석 완료 시 가이드 섹션 노출)
- `action_guide_generated { tool_name, generation_time_ms, from_demo, fallback_reason }`
- `pdf_download_click`
- `pdf_download_complete { file_size_kb, page_count }`
- `bcc_consulting_cta_click { source }`

### 깊이 추적

PDF 다운로드/가이드 생성 시 기존 리드 수집 GAS URL로 활동 로그 전송 (`activity: 'pdf_downloaded' | 'guide_generated'`). 누가 어떤 도구를 얼마나 깊이 썼는지 추적해 영업 우선순위 산정.

© 2026 비즈니스커리어컨설팅
