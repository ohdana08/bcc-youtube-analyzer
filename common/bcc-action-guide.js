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

  // ============================================================
  // Demo fallback guides — interpolate live analysis data so the
  // 5-step guide reads as if it was generated for THIS specific
  // analysis target, not a generic template. Used when the Claude
  // proxy is not configured (no_proxy) or when the proxy response
  // fails to parse.
  // ============================================================

  function _safeNum(n, fallback) {
    n = Number(n);
    return isFinite(n) ? n : (fallback != null ? fallback : 0);
  }
  function _fmtKo(n) { return _safeNum(n).toLocaleString('ko-KR'); }
  function _fmtCompact(n) {
    n = _safeNum(n);
    if (n >= 1e8) return (n / 1e8).toFixed(1).replace(/\.0$/, '') + '억';
    if (n >= 1e4) return (n / 1e4).toFixed(1).replace(/\.0$/, '') + '만';
    return _fmtKo(n);
  }

  // ---- video-analyzer demo ----
  function buildVideoDemoGuide(d) {
    const title = d.title || '이 영상';
    const channel = d.channel || '해당 채널';
    const views = _fmtKo(d.views);
    const rating = d.rating || '판정 미확정';
    const hasRatio = typeof d.ratioVsAvg === 'number' && d.ratioVsAvg > 0;
    const ratio = hasRatio ? d.ratioVsAvg.toFixed(2) + '배' : '평균 비교 불가';
    const hooks = (Array.isArray(d.hooks) && d.hooks.length) ? d.hooks.join(' · ') : '특별한 후킹 없음';
    const hasHooks = Array.isArray(d.hooks) && d.hooks.length > 0;
    const duration = d.duration || '-';
    const likeRatio = (typeof d.likeRatio === 'number' && d.views > 0) ? d.likeRatio.toFixed(2) + '%' : '-';
    let engagement = '판정 보류';
    if (typeof d.likeRatio === 'number' && d.views > 0) {
      if (d.likeRatio >= 5) engagement = '높음';
      else if (d.likeRatio >= 2) engagement = '보통';
      else engagement = '낮음';
    }

    return {
      step1: {
        title: '핵심 성공 요인 분석',
        body: '이 영상 "' + title + '"은 ' + channel + '의 채널 평균 대비 **' + ratio + '** 성과를 기록한 **' + rating + '**입니다. 조회수 **' + views + '회**, 참여도(좋아요/조회수) **' + likeRatio + '** (**' + engagement + '** 수준). 후킹 패턴: **' + hooks + '**. 이 영상이 평균을 상회/하회하게 만든 가장 강한 변수는 ' + (hasHooks ? '제목의 후킹 구조' : '주제·포맷 매칭') + '과 영상 길이(' + duration + ')의 합입니다. 같은 후킹을 다른 길이에 적용했을 때 어떻게 달라지는지 비교 분석할 가치가 있습니다.'
      },
      step2: {
        title: '우리 적용 포인트',
        body: '본인 채널과 "' + channel + '"의 차이를 3가지 축으로 점검하세요: ① 후킹(이 영상이 ' + hooks + '을 썼다면 본인은 어떤 후킹을 쓰는가) ② 영상 길이(' + duration + '이 통한 이 시장에서 본인은 비슷한 길이를 시도하는가) ③ 첫 5초 메시지(이 영상의 첫 5초와 본인 영상의 첫 5초를 직접 비교). 본인의 강점·관점을 ' + (hasHooks ? hooks + ' 후킹과 결합' : '명확한 콘셉트로 강화') + '하면 차별화 지점이 만들어집니다.'
      },
      step3: {
        title: '첫 콘텐츠 제안',
        body: '벤치마킹한 "' + title + '" 패턴을 참고해 1주 안에 만들 첫 콘텐츠:\n- 제목 예시:\n    · ' + (hasHooks ? '"' + hooks + '" 후킹을 본인 도메인에 적용한 1줄' : '강한 1줄 후킹(숫자·공포·권위·호기심·역설 중 1개)') + '\n    · 본인 경험·관점이 분명히 드러나는 1줄\n- 썸네일 키워드: 시선 끄는 단어 1개 + 본인 얼굴/제품 이미지\n- 영상 길이: ' + duration + '을 기준으로 ±20% 범위 시도\n- 첫 5초 후킹: ' + (hasHooks ? hooks + ' 패턴 변형 + 본인만의 가치 제안' : '핵심 메시지 즉시 제시 + 다음 장면 예고')
      },
      step4: {
        title: '7~30일 실행 계획',
        body: 'Day 1~7: 첫 영상 제작·업로드 (' + duration + ' 기준 길이) + 24시간 조회수·CTR 측정\nDay 8~14: 첫 영상 데이터 기반 2~3개 변형 제작 — 후킹 1개 변수만 바꿔서 ' + (hasHooks ? hooks + '와 다른 패턴 비교 실험' : '여러 후킹 패턴을 A/B 비교') + '\nDay 15~30: 잘 된 변형은 시리즈화, 안 된 변형은 폐기. 4번째 영상부터 본인 채널 평균이 이 영상의 **' + ratio + '** 성과를 얼마나 따라잡았는지 점검.'
      },
      step5: {
        title: '다음 추천',
        body: '① "' + channel + '" 채널 전체 운영 패턴을 BCC 경쟁채널 분석 도구로 분석 — 이 영상이 우연인지 채널의 일관된 패턴인지 검증\n② "' + title + '"의 핵심 키워드를 BCC 황금키워드 발견 도구로 시장 진입 가능성 검증\n③ 같은 ' + (hasHooks ? hooks + ' 후킹' : '주제') + '을 쓴 다른 영상 2~3개를 본 도구로 추가 분석해 이 패턴이 반복 가능한지 확인'
      },
      _demo: true
    };
  }

  // ---- competitor-analyzer demo ----
  function buildChannelDemoGuide(d) {
    const channel = d.channelName || '이 채널';
    const subs = _fmtKo(d.subscribers);
    const recentN = _safeNum(d.recentN, 0);
    const avgViews = _fmtKo(d.avgViews);
    const dominantDay = d.dominantDay || '주중';
    const cycle = (typeof d.cycleDays === 'number' && d.cycleDays > 0) ? d.cycleDays.toFixed(1) + '일' : '주기 미확정';
    const activity = d.activity || '운영 패턴 미확정';
    const reach = (typeof d.reachRate === 'number') ? d.reachRate.toFixed(1) + '%' : '-';

    return {
      step1: {
        title: '핵심 성공 요인 분석',
        body: '"' + channel + '"(구독자 **' + subs + '명**)의 최근 ' + recentN + '개 영상 평균 조회수는 **' + avgViews + '회**, 구독자 대비 도달률 **' + reach + '**입니다. 주요 업로드는 **' + dominantDay + '**, 업로드 주기 **' + cycle + '**으로 **' + activity + '** 운영 상태. 이 채널의 핵심 성공 요인은 ① 일관된 업로드 리듬(' + cycle + ') ② ' + dominantDay + ' 업로드 타이밍 ③ 구독자 대비 ' + reach + ' 도달률을 만드는 콘텐츠 매력도. 도달률이 10%를 넘으면 충성 시청층이 형성된 신호, 5% 미만이면 신규 유입 의존이 큼.'
      },
      step2: {
        title: '우리 적용 포인트',
        body: '본인 채널 운영을 "' + channel + '"과 3가지 축으로 비교하세요: ① 업로드 주기(이 채널은 ' + cycle + '마다 — 본인은 그보다 느린가 빠른가) ② 타이밍(' + dominantDay + ' 업로드 — 본인 채널의 주요 업로드 요일은) ③ 도달률(이 채널은 ' + reach + ' — 본인은 구독자 대비 몇 %인가). 가장 즉시 따라할 수 있는 건 업로드 리듬. 본인 채널의 주기를 ' + cycle + ' 기준으로 맞춰보는 실험부터 권장합니다.'
      },
      step3: {
        title: '첫 콘텐츠 제안',
        body: '벤치마킹 "' + channel + '" 패턴 기반 첫 콘텐츠:\n- 업로드 시점: 다가오는 ' + dominantDay + ' (이 채널의 주력 타이밍)\n- 영상 컨셉: 이 채널 TOP 5 영상의 공통 주제·포맷을 본인 도메인으로 변형\n- 제목: 본인 강점·관점을 명확히 드러내되, 이 채널 TOP 영상의 후킹 구조 참고\n- 길이: 이 채널 평균 영상 길이 기준 ±20%\n- 첫 5초: 본인 도메인에서 ' + avgViews + '회 평균 시청자가 가장 궁금해할 1가지 메시지'
      },
      step4: {
        title: '7~30일 실행 계획',
        body: 'Day 1~7: ' + dominantDay + '에 첫 영상 업로드 + 조회수/도달률 측정 → "' + channel + '"의 ' + reach + ' 도달률과 비교\nDay 8~14: 업로드 주기를 ' + cycle + '로 맞춰 2~3번째 영상 제작·업로드. 본인 채널이 ' + activity + ' 상태에 진입 가능한지 시도\nDay 15~30: 누적 4~6편의 데이터로 본인 채널의 "주요 업로드 요일"과 "평균 도달률"이 형성되기 시작. 잘 되는 패턴을 시리즈화.'
      },
      step5: {
        title: '다음 추천',
        body: '① "' + channel + '"의 TOP 5 인기 영상을 BCC 영상 분석 도구로 한 편씩 깊이 분석 — 평균 대비 어떤 영상이 왜 더 잘 됐는지 패턴 추출\n② 이 채널이 주로 다루는 키워드를 BCC 황금키워드 발견 도구로 검증 — 본인이 진입 가능한 황금 키워드인지 확인\n③ 인접 카테고리 채널 1~2개를 본 도구로 추가 분석해 시장의 일반 패턴 vs 이 채널만의 특이점을 분리'
      },
      _demo: true
    };
  }

  // ---- finder demo ----
  function buildFinderDemoGuide(d) {
    const keyword = d.keyword || '검색 키워드';
    const total = _safeNum(d.total, 0);
    const avgViral = _fmtKo(d.avgViral);
    const avgViewsRaw = _safeNum(d.avgViews, 0);
    const avgViews = avgViewsRaw > 0 ? _fmtKo(avgViewsRaw) : null;
    const shortRatio = (typeof d.shortRatio === 'number') ? d.shortRatio + '%' : '-';
    const shortRatioNum = _safeNum(d.shortRatio, 0);
    const uniqueChannels = _safeNum(d.uniqueChannels, 0);
    const difficulty = d.difficulty || '난이도 미확정';
    const topTitle = d.topVideoTitle || '';

    let strategy;
    if (difficulty === '낮음') strategy = '바로 진입 가능 — 본인 첫 영상을 빠르게 업로드하세요';
    else if (difficulty === '보통') strategy = '본인만의 관점·각도를 분명히 한 차별화 콘텐츠 필요';
    else if (difficulty === '높음') strategy = '직접 경쟁보다 변형 키워드 / 틈새 각도로 우회 권장';
    else strategy = '레드오션 — 본 키워드 단독 경쟁은 비효율적, 좁힌 틈새 키워드로 우회';

    const formatRec = shortRatioNum > 50 ? '숏폼(4분 미만) 우선' : (shortRatioNum < 20 ? '미디엄~롱폼 위주' : '숏폼·미디엄 혼합');

    return {
      step1: {
        title: '핵심 성공 요인 분석',
        body: '"' + keyword + '" 검색 결과 ' + total + '개 영상의 평균 바이럴 지수는 **' + avgViral + '/일**' + (avgViews ? ', 평균 조회수 **' + avgViews + '회**' : '') + ', 숏폼 비중 **' + shortRatio + '**, 고유 채널 **' + uniqueChannels + '개**, 시장 진입 난이도 **' + difficulty + '**입니다.' + (topTitle ? ' 1위 영상 "' + topTitle + '"이 시장의 모범 사례.' : '') + ' 이 시장의 핵심 패턴: ① 숏폼 ' + shortRatio + '이 시장의 주력 포맷인지 보조 포맷인지 ② 채널 ' + uniqueChannels + '개가 흩어져 있다면 진입 기회 / 소수 채널이 독점한다면 차별화 필수 ③ 평균 바이럴 ' + avgViral + '이 본인 채널의 최소 목표 수치.'
      },
      step2: {
        title: '우리 적용 포인트',
        body: '본인 콘텐츠를 "' + keyword + '" 시장에 진입시키는 3축: ① 포맷 결정(시장의 숏폼 비중 ' + shortRatio + '을 따라갈지 역으로 차별화할지) ② 차별화 각도(본인 도메인·경험·관점을 어떤 단어로 제목에 박을지) ③ 진입 깊이(' + difficulty + ' 난이도 → ' + strategy + '). 가장 빠른 실행: ' + (topTitle ? '"' + topTitle + '" 등 TOP 5 영상의 제목 패턴을 분석' : '본 검색 결과 TOP 5 영상의 제목 패턴을 분석') + '하고 그 중 1개 패턴을 본인 도메인으로 변형.'
      },
      step3: {
        title: '첫 콘텐츠 제안',
        body: '"' + keyword + '" 시장 진입용 첫 콘텐츠:\n- 제목 패턴: ' + (topTitle ? '1위 영상 "' + topTitle + '"의 후킹 구조 + 본인 관점 1단어' : '본 분석의 빈출 키워드 + 본인 관점 1단어') + '\n- 포맷: ' + formatRec + '\n- 후킹: 첫 5초에 "' + keyword + '"라는 단어 명시 + 본인이 다룰 구체적 각도 예고\n- 썸네일: ' + keyword + ' 관련 핵심 시각 요소 1개 + 본인 얼굴/제품\n- 목표 바이럴: ' + avgViral + '/일 도달'
      },
      step4: {
        title: '7~30일 실행 계획',
        body: 'Day 1~7: 첫 영상 업로드 + 24시간 바이럴 지수 측정 → ' + avgViral + '/일 시장 평균 대비 어디 위치인지 확인\nDay 8~14: 데이터 기반 2~3개 변형 제작. 잘 된 제목 패턴을 시리즈화, 안 된 패턴은 폐기\nDay 15~30: 4~6편 누적 시점에 본인 채널 평균 바이럴 vs 시장 평균(' + avgViral + ') 비교. 시장 평균에 근접하면 ' + difficulty + ' 시장에서 자리를 잡은 신호.'
      },
      step5: {
        title: '다음 추천',
        body: '① 본 분석에서 빈출 단어로 나온 키워드 1~2개를 BCC 황금키워드 발견 도구로 추가 분석 — 본 키워드 변형판이 더 황금일 수 있음\n② TOP 5 채널 중 1~2개를 BCC 경쟁채널 분석 도구로 깊이 분석 — 이 시장의 승자가 어떻게 운영하는지 패턴 추출\n③ ' + (topTitle ? '"' + topTitle + '"을 BCC 영상 분석 도구로 분석' : 'TOP 5 영상 중 1개를 BCC 영상 분석 도구로 분석') + ' — 단일 영상의 후킹·메타 패턴 파악'
      },
      _demo: true
    };
  }

  // ---- keyword-finder demo ----
  function buildKeywordDemoGuide(d) {
    const keyword = d.keyword || '검색 키워드';
    const avgViews = _fmtKo(d.avgViews);
    const avgSubs = _fmtCompact(d.avgSubs);
    const smallRatio = (typeof d.smallRatio === 'number') ? Math.round(d.smallRatio * 100) + '%' : '-';
    const bigRatio = (typeof d.bigRatio === 'number') ? Math.round(d.bigRatio * 100) + '%' : '-';
    const bigRatioNum = _safeNum(d.bigRatio, 0);
    const competition = d.competition || '경쟁도 미확정';
    const isGold = competition.indexOf('황금') !== -1;
    const isRed = competition.indexOf('레드') !== -1;
    const trend = d.trend || '트렌드 미확정';
    const isGrowing = trend.indexOf('성장') !== -1;
    const isDeclining = trend.indexOf('하향') !== -1;
    const recent90 = (typeof d.recent90Ratio === 'number') ? Math.round(d.recent90Ratio * 100) + '%' : '-';

    const signalText = isGold
      ? '소형 채널이 ' + smallRatio + ' 비율로 활동하며 평균 조회수 ' + avgViews + '회 → 진입 우호'
      : isRed
        ? '대형 채널이 ' + bigRatio + ' 비율로 시장 장악 → 직접 경쟁 회피 필요'
        : '적정 경쟁 시장 → 차별화 콘텐츠로 진입 가능';
    const trendAdvice = isGrowing
      ? '뜨고 있는 시장 — 빨리 진입해 선점'
      : isDeclining
        ? '식어가는 시장 — 회피 권장, 다른 키워드 모색'
        : '꾸준한 수요 — 안정적 시리즈화 가능';
    const fastAction = isGold
      ? '바로 1편 제작·테스트'
      : isRed
        ? '변형 키워드 추가 검색 또는 좁힌 틈새 각도'
        : '관련 확장 키워드 결합한 제목 시도';
    const thumbnailWarning = bigRatioNum >= 0.5
      ? '대형 채널(' + bigRatio + ')과 시각적 차별화 필수 — 비슷한 톤으로 경쟁 X'
      : '본인 색을 명확히 드러내는 톤으로 통일';

    return {
      step1: {
        title: '핵심 성공 요인 분석',
        body: '"' + keyword + '" 키워드는 **' + competition + '** · **' + trend + '** 시장입니다. 상위 50개 평균 조회수 **' + avgViews + '회**, 평균 구독자 **' + avgSubs + '명**, 소형 채널(1만 미만) 비율 **' + smallRatio + '**, 대형 채널(100만+) 비율 **' + bigRatio + '**. 최근 90일 영상 비율 **' + recent90 + '**. 이 시장의 핵심 신호: ' + signalText + '.'
      },
      step2: {
        title: '우리 적용 포인트',
        body: '"' + keyword + '" 시장 진입 결정의 3축: ① 본인 채널 규모가 시장의 ' + competition + ' 등급에 맞는가 (소형 채널이라면 황금/보통 시장이 유리) ② 트렌드 ' + trend + ' → ' + trendAdvice + ' ③ 본인이 ' + avgViews + '회 평균을 만들 콘텐츠 역량이 있는가. 가장 빠른 액션: ' + fastAction + '.'
      },
      step3: {
        title: '첫 콘텐츠 제안',
        body: '"' + keyword + '" 키워드 진입용 첫 콘텐츠:\n- 제목 패턴: "' + keyword + '"를 명시 + 본 분석의 관련 확장 키워드 1개 결합\n- 포맷: 시장 평균 길이 기준 (TOP 10 영상 평균 길이를 참고)\n- 후킹: 첫 5초에 "' + keyword + '" 명시 + 본인 도메인 각도 제시\n- 썸네일: "' + keyword + '" 시각 단서 + 본인 얼굴/제품. ' + thumbnailWarning + '\n- 목표: 시장 평균 ' + avgViews + '회의 50% 이상'
      },
      step4: {
        title: '7~30일 실행 계획',
        body: 'Day 1~7: 첫 영상 업로드 + 24시간 조회수 측정 → 시장 평균 ' + avgViews + '회 대비 어디 위치인지 확인\nDay 8~14: 본 분석에서 발견한 관련 확장 키워드로 2~3편 추가 제작. ' + competition + ' 시장에서 ' + trend + ' 흐름 활용\nDay 15~30: 4~6편 누적 후 본인 채널의 "' + keyword + '" 시리즈 평균 조회수 산정. 시장 평균(' + avgViews + ') 대비 50% 이상이면 본 시장에서 자리 잡은 신호.'
      },
      step5: {
        title: '다음 추천',
        body: '① 본 분석의 TOP 10 영상 중 성과가 가장 높은 1~2개를 BCC 영상 분석 도구로 깊이 분석 — 어떤 후킹·메타가 이 시장에서 통하는지 추출\n② TOP 10 채널 중 본인과 규모가 비슷한 채널 1~2개를 BCC 경쟁채널 분석 도구로 분석 — 진입 전략의 모범 사례 확보\n③ 관련 확장 키워드 1~2개를 본 도구로 재검색해 ' + (isGold ? '더 황금인 키워드' : isRed ? '진입 쉬운 변형 키워드' : '차별화 가능한 변형 키워드') + '를 추가 발굴'
      },
      _demo: true
    };
  }

  // Tool-specific demo dispatcher.
  function buildDemoGuide(toolName, d) {
    d = d || {};
    if (toolName === 'video-analyzer') return buildVideoDemoGuide(d);
    if (toolName === 'competitor-analyzer') return buildChannelDemoGuide(d);
    if (toolName === 'finder') return buildFinderDemoGuide(d);
    if (toolName === 'keyword-finder') return buildKeywordDemoGuide(d);
    // Generic fallback for unknown tools
    return {
      step1: { title: '핵심 성공 요인 분석', body: '이 분석 결과에서 주목할 패턴을 정리하세요. 상위 콘텐츠들의 공통점(주제·길이·형식)을 먼저 파악하고, 데이터로 드러난 차별화 포인트를 명확히 하세요.' },
      step2: { title: '우리 적용 포인트', body: '본인 채널의 강점과 분석 결과를 교차로 검토하세요. 자신만의 관점·경험·산업 지식을 어떤 각도로 녹일지 결정하면 차별화가 만들어집니다.' },
      step3: { title: '첫 콘텐츠 제안', body: '- 제목: 분석된 후킹 패턴을 활용한 명확한 1줄\n- 썸네일: 시선 끄는 단어 1개 + 본인/제품 이미지\n- 후킹: 첫 5초 안에 핵심 가치 제시' },
      step4: { title: '7~30일 실행 계획', body: 'Day 1~7: 첫 콘텐츠 1개 제작·업로드 + 데이터 측정\nDay 8~14: 첫 영상 데이터 기반 2~3개 변형 제작\nDay 15~30: 잘 된 변형의 시리즈화, 안 된 변형은 폐기' },
      step5: { title: '다음 추천', body: '본 분석과 인접한 토픽으로 1~2개 추가 분석을 진행하세요.' },
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
