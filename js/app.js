/* ===== TEPS 트레이너 — 메인 앱 ===== */
(function () {
  'use strict';

  // ---------- 레벨 정의 ----------
  const LEVEL_META = {
    low: {
      label: '하', name: '기초',
      color: 'var(--low)', soft: 'var(--low-soft)',
      target: '목표 327점+ · 2급',
      desc: '텝스 입문 단계. 인증서 발급 기준이자 서울대 이공계 대학원 등 최소 요건인 327점(2급)을 목표로 합니다.',
    },
    mid: {
      label: '중', name: '중급',
      color: 'var(--mid)', soft: 'var(--mid-soft)',
      target: '목표 387점+ · 2+급',
      desc: '공무원·국가자격시험 기준(340점)을 여유 있게 넘기고, 387~452점(2+급) 구간을 목표로 합니다.',
    },
    high: {
      label: '상', name: '고급',
      color: 'var(--high)', soft: 'var(--high-soft)',
      target: '목표 453점+ · 1급',
      desc: '상위권 대학원·전문직 수준. 453점 이상(1급), 나아가 1+급(526점+)까지 노리는 단계입니다.',
    },
  };
  const LEVEL_ORDER = ['low', 'mid', 'high'];

  const GRADE_ROWS = [
    ['1+', '526 ~ 600', '최상급 (Near-Native)', 'high'],
    ['1',  '453 ~ 525', '고급 — 상 레벨 목표', 'high'],
    ['2+', '387 ~ 452', '중상급 — 중 레벨 목표', 'mid'],
    ['2',  '327 ~ 386', '중급 — 하 레벨 목표 · 인증서 기준', 'low'],
    ['3+', '268 ~ 326', '중하급', null],
    ['3',  '212 ~ 267', '기초', null],
    ['4+ ~ 5', '0 ~ 211', '입문', null],
  ];

  const PART_META = {
    vocab:   { name: '어휘', icon: '📚', color: 'var(--mid)',  soft: 'var(--mid-soft)' },
    grammar: { name: '문법', icon: '🔧', color: 'var(--amber)', soft: 'var(--amber-soft)' },
    reading: { name: '독해', icon: '📄', color: 'var(--high)', soft: 'var(--high-soft)' },
    all:     { name: '전체', icon: '✨', color: 'var(--brand)', soft: 'var(--brand-soft)' },
    listening: { name: '청해', icon: '🎧', color: 'var(--green)', soft: 'var(--green-soft)' },
  };

  const KIND_META = {
    all:      { name: '전체', icon: '🎧', desc: '골고루 랜덤 10문항' },
    response: { name: '응답 고르기', icon: '💬', desc: '이어질 응답 찾기' },
    dialogue: { name: '대화 듣기', icon: '🗣️', desc: '대화 듣고 질문에 답하기' },
    talk:     { name: '담화 듣기', icon: '📻', desc: '안내·뉴스·강의 듣기' },
  };

  // ---------- 데이터 접근 ----------
  function levelData(level) {
    const d = (window.TEPS_DATA || {})[level];
    return {
      words: (d && d.words) || [],
      sentences: (d && d.sentences) || [],
      questions: (d && d.questions) || [],
      listening: (d && d.listening) || [],
    };
  }

  // ---------- 저장소 ----------
  const STORE_KEY = 'tepsTrainerV1';
  function freshProgress() {
    return {
      words: { low: {}, mid: {}, high: {} },      // word -> 'known' | 'again'
      sents: { low: {}, mid: {}, high: {} },      // index -> 'o' | 'x'
      quizStats: { low: { attempted: 0, correct: 0 }, mid: { attempted: 0, correct: 0 }, high: { attempted: 0, correct: 0 } },
      listenStats: { low: { attempted: 0, correct: 0 }, mid: { attempted: 0, correct: 0 }, high: { attempted: 0, correct: 0 } },
      notes: { low: [], mid: [], high: [] },      // 문제 인덱스(숫자) 또는 청해 'L<인덱스>'(문자열)
    };
  }
  // localStorage가 차단된 환경(일부 샌드박스)에서도 앱이 동작하도록 안전하게 감싼다
  let storageBlocked = false;
  const storage = (function () {
    try {
      const t = '__teps_test__';
      localStorage.setItem(t, '1');
      localStorage.removeItem(t);
      return localStorage;
    } catch (e) {
      storageBlocked = true;
      const mem = {};
      return {
        getItem: k => (k in mem ? mem[k] : null),
        setItem: (k, v) => { mem[k] = String(v); },
        removeItem: k => { delete mem[k]; },
      };
    }
  })();
  let P;
  try {
    P = Object.assign(freshProgress(), JSON.parse(storage.getItem(STORE_KEY) || '{}'));
  } catch (e) { P = freshProgress(); }
  function save() { try { storage.setItem(STORE_KEY, JSON.stringify(P)); } catch (e) { /* 저장 실패해도 계속 진행 */ } }

  // ---------- 화면 상태 ----------
  const S = {
    view: 'home',
    level: null,
    // 단어
    wordTab: 'card',
    wordQueue: [], wordPos: 0, flipped: false, sessionLearned: 0,
    wordHistory: [],   // {wi, prev, requeued, learnedDelta} — 이전 카드로 되돌리기용
    wordQuiz: null,   // { qs:[{wi,choices,answer}], pos, picked }
    // 예문
    sentFilter: 'all', sentList: [], sentPos: 0, revealed: false,
    // 문제
    quizSet: null,    // { part, items:[qi], pos, picked, correctCount }
    // 청해
    listenSet: null,  // { kind, items:[li], pos, picked, correctCount, slow }
  };

  // ---------- 유틸 ----------
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function pct(n, d) { return d ? Math.round((n / d) * 100) : 0; }
  // ---------- TTS ----------
  // 크롬 계열의 고질적 버그들을 우회한다:
  //  1) cancel() 직후의 speak()가 조용히 무시됨 → 재생 중일 때만 cancel하고 잠깐 뒤에 speak
  //  2) 엔진이 paused 상태에 갇혀 아무 소리도 안 남 → speak 전에 항상 resume()
  //  3) 원격(네트워크) 음성이 소리 없이 실패함 → 로컬 음성 우선 + 실패 시 기본 음성으로 재시도
  function pickVoice(excludeName) {
    if (!window.speechSynthesis) return null;
    const en = speechSynthesis.getVoices().filter(v =>
      v.lang.replace('_', '-').toLowerCase().indexOf('en') === 0 && v.name !== excludeName);
    if (!en.length) return null;
    const score = v => {
      let s = 0;
      if (v.lang.replace('_', '-').toLowerCase() === 'en-us') s += 4;
      if (v.localService) s += 2;
      if (/aria|jenny|samantha|zira|david|guy|google us english/i.test(v.name)) s += 1;
      if (v.default) s += 1;
      return s;
    };
    let best = en[0], bestScore = score(best);
    for (let i = 1; i < en.length; i++) {
      const s = score(en[i]);
      if (s > bestScore) { best = en[i]; bestScore = s; }
    }
    return best;
  }
  if (window.speechSynthesis) {
    // 음성 목록은 비동기로 채워지므로 미리 요청해 둔다
    speechSynthesis.getVoices();
    speechSynthesis.onvoiceschanged = function () { speechSynthesis.getVoices(); };
  }
  function makeUtter(text, rate, voice) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    if (voice) u.voice = voice;
    u.rate = rate;
    u.pitch = 1;
    u.volume = 1;
    return u;
  }
  function speakAll(utters) {
    if (!window.speechSynthesis || !utters.length) return;
    const go = function () {
      try { speechSynthesis.resume(); } catch (err) {}
      utters.forEach(u => speechSynthesis.speak(u));
    };
    if (speechSynthesis.speaking || speechSynthesis.pending) {
      speechSynthesis.cancel();
      setTimeout(go, 100);
    } else {
      go();   // 사용자 제스처와 동기로 실행 (iOS 오디오 잠금 해제 유지)
    }
  }
  function speak(text, isWord) {
    if (!window.speechSynthesis) return;
    const rate = isWord ? 0.85 : 0.95;   // 단어는 또박또박, 문장은 자연스럽게
    const u = makeUtter(text, rate, pickVoice());
    u.onerror = function (e) {
      // 사용자가 끊은 게 아니라 음성 자체가 실패한 경우에만 기본 음성으로 재시도
      if (e && (e.error === 'canceled' || e.error === 'interrupted')) return;
      if (u.voice) speakAll([makeUtter(text, rate, null)]);
    };
    speakAll([u]);
  }

  // 긴 담화는 문장 단위로 쪼개서 읽는다 (크롬이 긴 발화를 중간에 끊는 문제 회피)
  function splitSentences(text) {
    return text.match(/[^.?!]+[.?!]+["')\]]?\s*|[^.?!]+$/g) || [text];
  }

  // 청해 스크립트 재생: A/B 화자를 다른 목소리(없으면 음높이)로 구분해 순서대로 읽는다
  function playScript(script, slow) {
    if (!window.speechSynthesis) return;
    const rate = slow ? 0.75 : 0.92;
    const voiceA = pickVoice();
    const voiceB = voiceA ? pickVoice(voiceA.name) : null;
    const utters = [];
    script.split('\n').map(s => s.trim()).filter(Boolean).forEach(line => {
      const m = line.match(/^([AB])\s*:\s*(.*)$/);
      const isB = !!m && m[1] === 'B';
      splitSentences(m ? m[2] : line).forEach(seg => {
        seg = seg.trim();
        if (!seg) return;
        const u = makeUtter(seg, rate, isB ? (voiceB || voiceA) : voiceA);
        if (isB && !voiceB) u.pitch = 1.25;
        utters.push(u);
      });
    });
    speakAll(utters);
  }

  // ---------- 통계 헬퍼 ----------
  function knownCount(level) {
    const map = P.words[level] || {};
    return levelData(level).words.filter(w => map[w.word] === 'known').length;
  }
  function sentDoneCount(level) {
    const map = P.sents[level] || {};
    return Object.values(map).filter(v => v === 'o').length;
  }
  function accuracy(level) {
    const s = P.quizStats[level];
    return s && s.attempted ? pct(s.correct, s.attempted) : null;
  }

  // ---------- 렌더링 ----------
  const app = document.getElementById('app');
  function render() {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    const views = { home: vHome, menu: vMenu, words: vWords, sentences: vSentences, quiz: vQuiz, listening: vListening, notes: vNotes };
    app.innerHTML = (views[S.view] || vHome)();
  }
  function go(view) { S.view = view; render(); window.scrollTo(0, 0); }

  function topbar(title, backView, chip) {
    const m = S.level ? LEVEL_META[S.level] : null;
    const chipHtml = (chip && m)
      ? `<span class="level-chip" style="background:${m.soft};color:${m.color}">${m.label} · ${esc(m.target)}</span>`
      : '';
    return `<div class="topbar">
      <button class="back-btn" data-act="nav" data-arg="${backView}">←</button>
      <h1>${esc(title)}</h1>${chipHtml}
    </div>`;
  }

  // ===== 홈 =====
  function vHome() {
    const cards = LEVEL_ORDER.map(lv => {
      const m = LEVEL_META[lv];
      const d = levelData(lv);
      const acc = accuracy(lv);
      return `<button class="level-card ${lv}" data-act="go-level" data-arg="${lv}">
        <div class="lv-head">
          <span class="pill" style="background:${m.soft};color:${m.color}">${m.label} · ${m.name}</span>
          <span class="lv-target" style="color:${m.color}">${esc(m.target)}</span>
        </div>
        <div class="lv-desc">${esc(m.desc)}</div>
        <div class="lv-stats">
          <span>단어 <b>${knownCount(lv)}/${d.words.length}</b></span>
          <span>예문 <b>${sentDoneCount(lv)}/${d.sentences.length}</b></span>
          <span>정답률 <b>${acc == null ? '-' : acc + '%'}</b></span>
        </div>
      </button>`;
    }).join('');

    const gradeRows = GRADE_ROWS.map(r => {
      const m = r[3] ? LEVEL_META[r[3]] : null;
      return `<tr>
        <td><b>${r[0]}급</b></td>
        <td>${r[1]}점</td>
        <td class="muted">${esc(r[2])}${m ? ` <span class="pill" style="background:${m.soft};color:${m.color};font-size:11px">${m.label}</span>` : ''}</td>
      </tr>`;
    }).join('');

    const storageWarn = storageBlocked ? `
      <div class="card" style="background:var(--red-soft);color:var(--red);font-size:13.5px;margin-bottom:14px">
        ⚠️ 지금 보고 있는 화면에서는 <b>학습 기록이 저장되지 않아요.</b><br>
        <a href="https://dlwnsdyd21-del.github.io/teps-trainer/" target="_blank" rel="noopener" style="color:inherit;font-weight:800">정식 주소(dlwnsdyd21-del.github.io/teps-trainer)</a>에서 열면 기록이 계속 저장됩니다.
      </div>` : '';
    return `
      ${storageWarn}
      <div class="hero">
        <div class="logo">🎯</div>
        <h1>TEPS 트레이너</h1>
        <p>목표 점수에 맞는 레벨로 단어 · 예문 · 문제를 정복하세요</p>
      </div>
      ${cards}
      <div class="section-title">📊 뉴텝스 등급표 <span class="tiny">(600점 만점)</span></div>
      <div class="card">
        <table class="grade-table">
          <tr><th>등급</th><th>점수</th><th>수준</th></tr>
          ${gradeRows}
        </table>
      </div>
      <div class="section-title">🏛️ 주요 활용 기준</div>
      <div class="card">
        <ul class="use-list">
          <li><span class="score">327점+</span><span>텝스 인증서 발급 · 서울대 이공계 대학원 등 최소 기준</span></li>
          <li><span class="score">340점+</span><span>5급·7급 공무원, 각종 국가자격시험 영어 대체 기준</span></li>
          <li><span class="score">387점+</span><span>상위권 대학원 · 로스쿨 등 경쟁력 있는 점수대</span></li>
          <li><span class="score">453점+</span><span>1급 — 전문 분야 업무에도 무리 없는 고급 수준</span></li>
        </ul>
      </div>`;
  }

  // ===== 레벨 메뉴 =====
  function vMenu() {
    const lv = S.level, m = LEVEL_META[lv], d = levelData(lv);
    const kc = knownCount(lv), sc = sentDoneCount(lv), acc = accuracy(lv);
    const st = P.quizStats[lv];
    const notes = P.notes[lv] || [];

    function modeCard(act, icon, iconBg, name, sub, prog) {
      return `<button class="mode-card" data-act="nav" data-arg="${act}">
        <div class="mode-icon" style="background:${iconBg}">${icon}</div>
        <div class="mode-body">
          <div class="mode-name">${name}</div>
          <div class="mode-sub">${sub}</div>
          ${prog}
        </div>
        <div class="arrow">›</div>
      </button>`;
    }

    return `
      ${topbar(`${m.label} · ${m.name} 레벨`, 'home', false)}
      <div class="target-banner" style="background:${m.soft};color:${m.color}">
        <b>${esc(m.target)}</b><br>
        <span style="color:var(--ink-soft)">${esc(m.desc)}</span>
      </div>
      <div class="stat-grid">
        <div class="stat-box"><div class="num" style="color:${m.color}">${kc}</div><div class="lbl">외운 단어</div></div>
        <div class="stat-box"><div class="num" style="color:${m.color}">${sc}</div><div class="lbl">해석한 예문</div></div>
        <div class="stat-box"><div class="num" style="color:${m.color}">${acc == null ? '-' : acc + '%'}</div><div class="lbl">문제 정답률</div></div>
      </div>
      <div class="section-title">학습 모드</div>
      ${modeCard('words', '🃏', 'var(--low-soft)', '단어 암기',
        `${d.words.length}개 단어 · 카드 학습 + 뜻 맞히기 퀴즈`,
        `<div class="progress-track"><div class="progress-fill" style="width:${pct(kc, d.words.length)}%;background:${m.color}"></div></div>`)}
      ${modeCard('sentences', '📖', 'var(--mid-soft)', '예문 해석',
        `${d.sentences.length}개 문장 · 해석 훈련 + 구문 포인트`,
        `<div class="progress-track"><div class="progress-fill" style="width:${pct(sc, d.sentences.length)}%;background:${m.color}"></div></div>`)}
      ${modeCard('listening', '🎧', 'var(--green-soft)', '청해 연습',
        `${d.listening.length}문항 · 듣고 푸는 뉴텝스 청해 (응답·대화·담화)`,
        `<div class="tiny">${P.listenStats[lv].attempted ? `지금까지 ${P.listenStats[lv].attempted}문항 중 ${P.listenStats[lv].correct}개 정답` : '스크립트 없이 듣고 풀어 보세요'}</div>`)}
      ${modeCard('quiz', '✍️', 'var(--high-soft)', '문제 풀기',
        `어휘 · 문법 · 독해 ${d.questions.length}문제 · 텝스 실전 유형`,
        `<div class="tiny">${st.attempted ? `지금까지 ${st.attempted}문제 중 ${st.correct}개 정답` : '아직 푼 문제가 없어요'}</div>`)}
      ${modeCard('notes', '🗂️', 'var(--red-soft)', '오답노트',
        notes.length ? `틀린 문제 ${notes.length}개 복습하기` : '틀린 문제가 여기에 쌓여요',
        '')}`;
  }

  // ===== 단어 암기 =====
  function buildWordQueue(includeKnown) {
    const lv = S.level, d = levelData(lv), map = P.words[lv];
    let idxs = d.words.map((w, i) => i);
    if (!includeKnown) idxs = idxs.filter(i => map[d.words[i].word] !== 'known');
    S.wordQueue = idxs;
    S.wordPos = 0;
    S.flipped = false;
    S.sessionLearned = 0;
    S.wordHistory = [];
  }

  function vWords() {
    const lv = S.level, m = LEVEL_META[lv], d = levelData(lv);
    const tabs = `<div class="tabs">
      <button class="${S.wordTab === 'card' ? 'active' : ''}" data-act="word-tab" data-arg="card">카드 학습</button>
      <button class="${S.wordTab === 'quiz' ? 'active' : ''}" data-act="word-tab" data-arg="quiz">단어 퀴즈</button>
    </div>`;
    const body = S.wordTab === 'card' ? vWordCards() : vWordQuiz();
    return `${topbar('단어 암기', 'menu', true)}${tabs}${body}`;
  }

  function vWordCards() {
    const lv = S.level, m = LEVEL_META[lv], d = levelData(lv);
    if (!d.words.length) return emptyState('📦', '단어 데이터가 아직 없습니다.');

    if (S.wordPos >= S.wordQueue.length) {
      const kc = knownCount(lv);
      const remain = d.words.length - kc;
      return `<div class="card word-done">
        <div class="big">🎉</div>
        <h2>이번 세션 완료!</h2>
        <p>이번에 <b>${S.sessionLearned}개</b>를 외웠어요.<br>누적 암기 <b>${kc} / ${d.words.length}</b>${remain ? ` · 아직 ${remain}개 남았어요` : ' · 전부 외웠어요! 👑'}</p>
        ${S.wordHistory.length ? `<button class="btn btn-ghost btn-block" data-act="word-undo" style="margin-bottom:10px">↩ 마지막 카드 취소</button>` : ''}
        ${remain ? `<button class="btn btn-primary btn-block" data-act="restudy-unknown" style="margin-bottom:10px">미암기 단어 ${remain}개 다시 학습</button>` : ''}
        <button class="btn btn-ghost btn-block" data-act="restudy-all" style="margin-bottom:10px">전체 ${d.words.length}개 처음부터 복습</button>
        <button class="btn btn-red-soft btn-block" data-act="reset-words">암기 기록 초기화</button>
      </div>`;
    }

    const wi = S.wordQueue[S.wordPos];
    const w = d.words[wi];
    const syn = (w.syn && w.syn.length) ? `<div class="back-syn">유의어: ${esc(w.syn.join(', '))}</div>` : '';
    return `
      <div class="flash-meta">
        <span>남은 카드 <b>${S.wordQueue.length - S.wordPos}</b> · 누적 암기 <b>${knownCount(lv)}/${d.words.length}</b></span>
        <span style="display:flex;gap:6px">
          <button class="shuffle-btn" data-act="word-undo" ${S.wordHistory.length ? '' : 'disabled style="opacity:0.4"'}>↩ 이전 카드</button>
          <button class="shuffle-btn" data-act="word-shuffle">🔀 섞기</button>
        </span>
      </div>
      <div class="flip-scene">
        <div class="flip-card ${S.flipped ? 'flipped' : ''}" data-act="flip">
          <div class="flip-face front">
            <div class="flash-word">${esc(w.word)}</div>
            ${w.ipa ? `<div class="flash-ipa">${esc(w.ipa)}</div>` : ''}
            <div class="flash-pos"><span class="pill" style="background:${m.soft};color:${m.color}">${esc(w.pos)}</span></div>
            <div style="margin-top:16px"><button class="tts-btn" data-act="tts" data-word="1" data-tts="${esc(w.word)}">🔊</button></div>
            <div class="flash-hint">카드를 누르면 뜻이 보여요</div>
          </div>
          <div class="flip-face back">
            <div class="back-word-row">
              <span class="back-word">${esc(w.word)}</span>
              ${w.ipa ? `<span class="back-ipa">${esc(w.ipa)}</span>` : ''}
              <span class="tiny">${esc(w.pos)}</span>
              <button class="tts-btn" data-act="tts" data-word="1" data-tts="${esc(w.word)}" style="margin-left:auto">🔊</button>
            </div>
            <div class="back-ko">${esc(w.ko)}</div>
            ${syn}
            <div class="back-ex">
              <div class="en">${esc(w.ex_en)} <button class="tts-btn" data-act="tts" data-tts="${esc(w.ex_en)}" style="font-size:14px">🔊</button></div>
              <div class="ko">${esc(w.ex_ko)}</div>
            </div>
          </div>
        </div>
      </div>
      <div class="flash-actions">
        <button class="btn btn-red-soft" data-act="word-again">🤔 몰라요</button>
        <button class="btn btn-green" data-act="word-know">✅ 알아요</button>
      </div>`;
  }

  function startWordQuiz() {
    const d = levelData(S.level);
    if (d.words.length < 4) { S.wordQuiz = null; return; }
    const picks = shuffle(d.words.map((w, i) => i)).slice(0, Math.min(10, d.words.length));
    const qs = picks.map(wi => {
      const correct = d.words[wi].ko;
      const others = shuffle(d.words.filter((w, i) => i !== wi).map(w => w.ko)).slice(0, 3);
      const choices = shuffle([correct].concat(others));
      return { wi, choices, answer: choices.indexOf(correct) };
    });
    S.wordQuiz = { qs, pos: 0, picked: null, correctCount: 0 };
  }

  function vWordQuiz() {
    const lv = S.level, m = LEVEL_META[lv], d = levelData(lv);
    if (d.words.length < 4) return emptyState('📦', '단어 데이터가 아직 없습니다.');
    const Q = S.wordQuiz;

    if (!Q) {
      return `<div class="card word-done">
        <div class="big">🧠</div>
        <h2>단어 뜻 맞히기</h2>
        <p>지금까지 본 단어 중 <b>10개</b>를 랜덤으로 골라<br>알맞은 뜻을 고르는 퀴즈예요.</p>
        <button class="btn btn-primary btn-block" data-act="wq-start">퀴즈 시작</button>
      </div>`;
    }

    if (Q.pos >= Q.qs.length) {
      const score = Q.correctCount, total = Q.qs.length;
      return `<div class="card result-card">
        <p>단어 퀴즈 결과</p>
        <div class="score-big" style="color:${m.color}">${score}<small> / ${total}</small></div>
        <p>${score === total ? '완벽해요! 👑' : score >= total * 0.7 ? '좋아요, 조금만 더! 💪' : '틀린 단어는 카드 학습으로 복습해요 📚'}</p>
        <div class="result-actions">
          <button class="btn btn-ghost" data-act="wq-start">다시 풀기</button>
          <button class="btn btn-primary" data-act="word-tab" data-arg="card">카드 학습</button>
        </div>
      </div>`;
    }

    const q = Q.qs[Q.pos];
    const w = d.words[q.wi];
    const choices = q.choices.map((c, i) => {
      let cls = 'choice';
      if (Q.picked != null) {
        if (i === q.answer) cls += ' correct';
        else if (i === Q.picked) cls += ' wrong';
        else cls += ' dim';
      }
      return `<button class="${cls}" data-act="wq-pick" data-arg="${i}" ${Q.picked != null ? 'disabled' : ''}>
        <span class="letter">${'ABCD'[i]}</span><span>${esc(c)}</span>
      </button>`;
    }).join('');

    return `
      <div class="quiz-head">
        <span><b>${Q.pos + 1}</b> / ${Q.qs.length}</span>
        <div class="progress-track"><div class="progress-fill" style="width:${pct(Q.pos, Q.qs.length)}%;background:${m.color}"></div></div>
        <span>${Q.correctCount}개 정답</span>
      </div>
      <div class="card">
        <div style="text-align:center;padding:14px 0 20px">
          <div class="flash-word" style="font-size:30px">${esc(w.word)}</div>
          ${w.ipa ? `<div class="flash-ipa" style="font-size:14px">${esc(w.ipa)}</div>` : ''}
          <div class="tiny" style="margin-top:4px">${esc(w.pos)} · <button class="tts-btn" data-act="tts" data-word="1" data-tts="${esc(w.word)}" style="font-size:14px">🔊</button></div>
        </div>
        <div class="choice-list">${choices}</div>
        ${Q.picked != null ? `<button class="btn btn-primary btn-block quiz-next" data-act="wq-next">${Q.pos + 1 === Q.qs.length ? '결과 보기' : '다음 단어'} →</button>` : ''}
      </div>`;
  }

  // ===== 예문 해석 =====
  function buildSentList() {
    const lv = S.level, d = levelData(lv), map = P.sents[lv];
    let idxs = d.sentences.map((s, i) => i);
    if (S.sentFilter === 'todo') idxs = idxs.filter(i => !map[i]);
    else if (S.sentFilter === 'x') idxs = idxs.filter(i => map[i] === 'x');
    S.sentList = idxs;
    if (S.sentPos >= idxs.length) S.sentPos = 0;
    S.revealed = false;
  }

  function vSentences() {
    const lv = S.level, m = LEVEL_META[lv], d = levelData(lv), map = P.sents[lv];
    if (!d.sentences.length) return `${topbar('예문 해석', 'menu', true)}${emptyState('📦', '예문 데이터가 아직 없습니다.')}`;

    const total = d.sentences.length;
    const todoN = d.sentences.filter((s, i) => !map[i]).length;
    const xN = d.sentences.filter((s, i) => map[i] === 'x').length;
    const filters = `<div class="sent-filter">
      <button class="${S.sentFilter === 'all' ? 'active' : ''}" data-act="sent-filter" data-arg="all">전체 ${total}</button>
      <button class="${S.sentFilter === 'todo' ? 'active' : ''}" data-act="sent-filter" data-arg="todo">미학습 ${todoN}</button>
      <button class="${S.sentFilter === 'x' ? 'active' : ''}" data-act="sent-filter" data-arg="x">다시 볼 문장 ${xN}</button>
    </div>`;

    if (!S.sentList.length) {
      return `${topbar('예문 해석', 'menu', true)}${filters}
        ${emptyState('🎉', S.sentFilter === 'x' ? '다시 볼 문장이 없어요!' : '이 필터에 해당하는 문장이 없어요.')}`;
    }

    const si = S.sentList[S.sentPos];
    const s = d.sentences[si];
    const status = map[si] === 'o' ? '<span class="sent-status" style="color:var(--green)">● 해석 완료</span>'
      : map[si] === 'x' ? '<span class="sent-status" style="color:var(--red)">● 다시 보기</span>' : '';

    const kws = (s.keywords || []).map(k =>
      `<span class="kw-chip"><b>${esc(k.en)}</b> ${esc(k.ko)}</span>`).join('');

    const revealBlock = S.revealed ? `
      <div class="sent-reveal">
        <div class="sent-ko">${esc(s.ko)}</div>
        <div class="sent-point"><b>💡 해석 포인트</b><br>${esc(s.point)}</div>
        <div class="kw-chips">${kws}</div>
      </div>
      <div style="height:14px"></div>
      <div class="sent-mark">
        <button class="btn btn-red-soft" data-act="sent-mark" data-arg="x">🔁 다시 볼래요</button>
        <button class="btn btn-green" data-act="sent-mark" data-arg="o">⭕ 해석했어요</button>
      </div>` : `
      <button class="btn btn-ghost btn-block" data-act="sent-reveal">🔍 해석 보기</button>`;

    return `${topbar('예문 해석', 'menu', true)}${filters}
      <div class="card sent-card">
        <div class="flash-meta" style="margin-bottom:12px">
          <span><b>${S.sentPos + 1}</b> / ${S.sentList.length}${status}</span>
          <button class="tts-btn" data-act="tts" data-tts="${esc(s.en)}">🔊</button>
        </div>
        <div class="sent-en">${esc(s.en)}</div>
        ${revealBlock}
      </div>
      <div class="sent-nav">
        <button class="btn btn-ghost" data-act="sent-move" data-arg="-1" ${S.sentPos === 0 ? 'disabled' : ''}>← 이전</button>
        <button class="btn btn-ghost" data-act="sent-move" data-arg="1" ${S.sentPos + 1 >= S.sentList.length ? 'disabled' : ''}>다음 →</button>
      </div>`;
  }

  // ===== 문제 풀기 =====
  function startQuizSet(part) {
    const d = levelData(S.level);
    let pool = d.questions.map((q, i) => i);
    if (part !== 'all') pool = pool.filter(i => d.questions[i].part === part);
    if (!pool.length) { S.quizSet = null; return; }
    const items = shuffle(pool).slice(0, Math.min(10, pool.length));
    S.quizSet = { part, items, pos: 0, picked: null, correctCount: 0 };
  }

  function vQuiz() {
    const lv = S.level, m = LEVEL_META[lv], d = levelData(lv);
    if (!d.questions.length) return `${topbar('문제 풀기', 'menu', true)}${emptyState('📦', '문제 데이터가 아직 없습니다.')}`;
    const Q = S.quizSet;

    if (!Q) {
      const counts = { all: d.questions.length };
      ['vocab', 'grammar', 'reading'].forEach(p => { counts[p] = d.questions.filter(q => q.part === p).length; });
      const cards = ['all', 'vocab', 'grammar', 'reading'].map(p => {
        const pm = PART_META[p];
        return `<button class="part-card" data-act="quiz-part" data-arg="${p}">
          <div class="p-icon">${pm.icon}</div>
          <div class="p-name" style="color:${pm.color}">${pm.name}</div>
          <div class="p-sub">${p === 'all' ? '골고루 랜덤 10문제' : counts[p] + '문제 중 랜덤 10'}</div>
        </button>`;
      }).join('');
      return `${topbar('문제 풀기', 'menu', true)}
        <div class="card" style="margin-bottom:16px;font-size:13.5px" >
          <b>텝스 실전 유형 연습</b><br>
          <span class="muted">유형을 고르면 10문제 세트가 시작돼요. 틀린 문제는 오답노트에 자동 저장!</span>
        </div>
        <div class="part-grid">${cards}</div>`;
    }

    if (Q.pos >= Q.items.length) {
      const score = Q.correctCount, total = Q.items.length;
      const perc = pct(score, total);
      return `${topbar('문제 풀기', 'menu', true)}
        <div class="card result-card">
          <p>${PART_META[Q.part].name} 세트 결과</p>
          <div class="score-big" style="color:${m.color}">${score}<small> / ${total}</small></div>
          <p>정답률 ${perc}% · ${perc === 100 ? '완벽해요! 👑' : perc >= 70 ? '합격권이 보여요! 💪' : '오답노트로 복습하고 다시 도전! 🔥'}</p>
          <div class="result-actions">
            <button class="btn btn-ghost" data-act="quiz-part" data-arg="${Q.part}">다시 풀기</button>
            <button class="btn btn-primary" data-act="quiz-exit">다른 유형</button>
          </div>
          ${(total - score) ? `<button class="btn btn-red-soft btn-block" style="margin-top:10px" data-act="nav" data-arg="notes">🗂️ 오답노트 보기</button>` : ''}
        </div>`;
    }

    const qi = Q.items[Q.pos];
    const q = d.questions[qi];
    const pm = PART_META[q.part] || PART_META.all;
    const choices = q.choices.map((c, i) => {
      let cls = 'choice';
      if (Q.picked != null) {
        if (i === q.answer) cls += ' correct';
        else if (i === Q.picked) cls += ' wrong';
        else cls += ' dim';
      }
      return `<button class="${cls}" data-act="quiz-pick" data-arg="${i}" ${Q.picked != null ? 'disabled' : ''}>
        <span class="letter">${'ABCD'[i]}</span><span>${esc(c)}</span>
      </button>`;
    }).join('');

    const explain = Q.picked != null ? `
      <div class="q-explain">
        <div class="verdict ${Q.picked === q.answer ? 'ok' : 'no'}">
          ${Q.picked === q.answer ? '⭕ 정답입니다!' : `❌ 아쉬워요! 정답은 ${'ABCD'[q.answer]}`}
        </div>
        ${esc(q.explanation)}
      </div>
      <button class="btn btn-primary btn-block quiz-next" data-act="quiz-next">${Q.pos + 1 === Q.items.length ? '결과 보기' : '다음 문제'} →</button>` : '';

    return `${topbar('문제 풀기', 'menu', true)}
      <div class="quiz-head">
        <span><b>${Q.pos + 1}</b> / ${Q.items.length}</span>
        <div class="progress-track"><div class="progress-fill" style="width:${pct(Q.pos, Q.items.length)}%;background:${m.color}"></div></div>
        <span>${Q.correctCount}개 정답</span>
      </div>
      <div class="card">
        <div class="q-part-tag"><span class="pill" style="background:${pm.soft};color:${pm.color}">${pm.icon} ${pm.name}</span></div>
        ${q.passage ? `<div class="q-passage">${esc(q.passage)}</div>` : ''}
        <div class="q-stem">${esc(q.stem)}</div>
        <div class="choice-list">${choices}</div>
        ${explain}
      </div>`;
  }

  // ===== 청해 연습 =====
  function startListenSet(kind) {
    const d = levelData(S.level);
    let pool = d.listening.map((x, i) => i);
    if (kind !== 'all') pool = pool.filter(i => d.listening[i].kind === kind);
    if (!pool.length) { S.listenSet = null; return; }
    const items = shuffle(pool).slice(0, Math.min(10, pool.length));
    S.listenSet = { kind, items, pos: 0, picked: null, correctCount: 0, slow: false };
  }

  function vListening() {
    const lv = S.level, m = LEVEL_META[lv], d = levelData(lv);
    if (!d.listening.length) return `${topbar('청해 연습', 'menu', true)}${emptyState('📦', '청해 데이터가 아직 없습니다.')}`;
    const L = S.listenSet;

    if (!L) {
      const counts = { all: d.listening.length };
      ['response', 'dialogue', 'talk'].forEach(k => { counts[k] = d.listening.filter(x => x.kind === k).length; });
      const cards = ['all', 'response', 'dialogue', 'talk'].map(k => {
        const km = KIND_META[k];
        return `<button class="part-card" data-act="listen-kind" data-arg="${k}">
          <div class="p-icon">${km.icon}</div>
          <div class="p-name">${km.name}</div>
          <div class="p-sub">${km.desc}${k === 'all' ? '' : ` · ${counts[k]}문항`}</div>
        </button>`;
      }).join('');
      return `${topbar('청해 연습', 'menu', true)}
        <div class="card" style="margin-bottom:16px;font-size:13.5px">
          <b>🎧 스크립트 없이 듣고 푸세요</b><br>
          <span class="muted">▶ 버튼을 누르면 음성이 나옵니다. 몇 번이든 다시 들을 수 있고, 스크립트와 해석은 정답을 고른 뒤 공개돼요. 소리를 켜 두세요!</span>
        </div>
        <div class="part-grid">${cards}</div>`;
    }

    if (L.pos >= L.items.length) {
      const score = L.correctCount, total = L.items.length;
      const perc = pct(score, total);
      return `${topbar('청해 연습', 'menu', true)}
        <div class="card result-card">
          <p>${KIND_META[L.kind].name} 세트 결과</p>
          <div class="score-big" style="color:${m.color}">${score}<small> / ${total}</small></div>
          <p>정답률 ${perc}% · ${perc === 100 ? '완벽한 귀! 👑' : perc >= 70 ? '좋아요, 감이 잡혀요! 💪' : '스크립트를 소리 내어 따라 읽어 보세요 🔁'}</p>
          <div class="result-actions">
            <button class="btn btn-ghost" data-act="listen-kind" data-arg="${L.kind}">다시 풀기</button>
            <button class="btn btn-primary" data-act="listen-exit">다른 유형</button>
          </div>
        </div>`;
    }

    const li = L.items[L.pos];
    const item = d.listening[li];
    const km = KIND_META[item.kind] || KIND_META.all;
    const choices = item.choices.map((c, i) => {
      let cls = 'choice';
      if (L.picked != null) {
        if (i === item.answer) cls += ' correct';
        else if (i === L.picked) cls += ' wrong';
        else cls += ' dim';
      }
      return `<button class="${cls}" data-act="listen-pick" data-arg="${i}" ${L.picked != null ? 'disabled' : ''}>
        <span class="letter">${'ABCD'[i]}</span><span>${esc(c)}</span>
      </button>`;
    }).join('');

    const afterPick = L.picked != null ? `
      <div class="script-box">
        <div class="script-label">📜 스크립트</div>
        <div class="script-en">${esc(item.script)}</div>
        <div class="script-ko">${esc(item.script_ko)}</div>
      </div>
      <div class="q-explain">
        <div class="verdict ${L.picked === item.answer ? 'ok' : 'no'}">
          ${L.picked === item.answer ? '⭕ 정답입니다!' : `❌ 아쉬워요! 정답은 ${'ABCD'[item.answer]}`}
        </div>
        ${esc(item.explanation)}
      </div>
      <button class="btn btn-primary btn-block quiz-next" data-act="listen-next">${L.pos + 1 === L.items.length ? '결과 보기' : '다음 문항'} →</button>` : '';

    return `${topbar('청해 연습', 'menu', true)}
      <div class="quiz-head">
        <span><b>${L.pos + 1}</b> / ${L.items.length}</span>
        <div class="progress-track"><div class="progress-fill" style="width:${pct(L.pos, L.items.length)}%;background:${m.color}"></div></div>
        <span>${L.correctCount}개 정답</span>
      </div>
      <div class="card">
        <div class="q-part-tag"><span class="pill" style="background:var(--green-soft);color:var(--green)">${km.icon} ${km.name}</span></div>
        <div class="listen-player">
          <button class="listen-play" data-act="listen-play">▶</button>
          <div class="listen-tools">
            <button class="listen-tool" data-act="listen-play">🔁 다시 듣기</button>
            <button class="listen-tool ${L.slow ? 'active' : ''}" data-act="listen-speed">🐢 천천히${L.slow ? ' 켜짐' : ''}</button>
          </div>
          ${L.picked == null ? '<div class="tiny" style="margin-top:8px">스크립트와 해석은 정답을 고르면 공개돼요</div>' : ''}
        </div>
        <div class="q-stem">${esc(item.question)}</div>
        <div class="choice-list">${choices}</div>
        ${afterPick}
      </div>`;
  }

  // ===== 오답노트 =====
  function vNotes() {
    const lv = S.level, d = levelData(lv);
    const notes = P.notes[lv] || [];
    if (!notes.length) {
      return `${topbar('오답노트', 'menu', true)}${emptyState('🗂️', '아직 틀린 문제가 없어요.<br>문제를 풀면 틀린 문제가 자동으로 쌓여요.')}`;
    }
    const items = notes.map(ref => {
      const isListen = typeof ref === 'string' && ref.charAt(0) === 'L';
      const q = isListen ? d.listening[parseInt(ref.slice(1), 10)] : d.questions[ref];
      if (!q) return '';
      const pm = isListen ? PART_META.listening : (PART_META[q.part] || PART_META.all);
      const body = isListen
        ? `<div class="ri-passage">${esc(q.script)}</div>
           <div class="ri-passage" style="color:var(--ink-faint)">${esc(q.script_ko)}</div>
           <div class="ri-stem">${esc(q.question)}</div>`
        : `${q.passage ? `<div class="ri-passage">${esc(q.passage)}</div>` : ''}
           <div class="ri-stem">${esc(q.stem)}</div>`;
      return `<div class="review-item">
        <div class="ri-head">
          <span class="pill" style="background:${pm.soft};color:${pm.color}">${pm.icon} ${pm.name}</span>
          ${isListen ? `<button class="tts-btn" data-act="note-listen" data-arg="${esc(ref)}" style="font-size:14px">🔊</button>` : ''}
          <button class="ri-del" data-act="note-del" data-arg="${esc(String(ref))}">외웠어요 ✓</button>
        </div>
        ${body}
        <div class="ri-answer">정답: <b>${'ABCD'[q.answer]}. ${esc(q.choices[q.answer])}</b></div>
        <div class="ri-explain">${esc(q.explanation)}</div>
      </div>`;
    }).join('');
    return `${topbar('오답노트', 'menu', true)}
      <div class="tiny" style="margin-bottom:12px">복습을 끝낸 문제는 "외웠어요 ✓"를 눌러 지워주세요.</div>
      ${items}
      <button class="btn btn-red-soft btn-block" data-act="notes-clear" style="margin-top:6px">오답노트 전체 비우기</button>`;
  }

  function emptyState(icon, html) {
    return `<div class="empty-state"><div class="big">${icon}</div><div>${html}</div></div>`;
  }

  // ---------- 이벤트 ----------
  app.addEventListener('click', function (e) {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    const arg = el.dataset.arg;
    const lv = S.level;
    const d = lv ? levelData(lv) : null;

    switch (act) {
      // 내비게이션
      case 'nav':
        if (arg === 'words') { buildWordQueue(false); S.wordTab = 'card'; S.wordQuiz = null; }
        if (arg === 'sentences') { S.sentFilter = 'all'; S.sentPos = 0; buildSentList(); }
        if (arg === 'quiz') S.quizSet = null;
        if (arg === 'listening') S.listenSet = null;
        go(arg);
        break;
      case 'go-level':
        S.level = arg;
        go('menu');
        break;

      // TTS
      case 'tts':
        e.stopPropagation();
        speak(el.dataset.tts, el.dataset.word === '1');
        break;

      // 단어 카드
      case 'word-tab':
        S.wordTab = arg;
        if (arg === 'quiz') S.wordQuiz = null;
        if (arg === 'card' && S.wordPos >= S.wordQueue.length) buildWordQueue(false);
        render();
        break;
      case 'flip':
        S.flipped = !S.flipped;
        render();
        break;
      case 'word-know': {
        const wi = S.wordQueue[S.wordPos];
        const w = d.words[wi];
        const delta = P.words[lv][w.word] !== 'known' ? 1 : 0;
        S.wordHistory.push({ wi, prev: P.words[lv][w.word], requeued: false, learnedDelta: delta });
        S.sessionLearned += delta;
        P.words[lv][w.word] = 'known';
        save();
        S.wordPos++; S.flipped = false;
        render();
        break;
      }
      case 'word-again': {
        const wi = S.wordQueue[S.wordPos];
        const w = d.words[wi];
        const delta = P.words[lv][w.word] === 'known' ? -1 : 0;
        S.wordHistory.push({ wi, prev: P.words[lv][w.word], requeued: true, learnedDelta: delta });
        S.sessionLearned += delta;
        P.words[lv][w.word] = 'again';
        save();
        S.wordQueue.push(wi);   // 이번 세션 뒤쪽에서 한 번 더
        S.wordPos++; S.flipped = false;
        render();
        break;
      }
      case 'word-undo': {
        const rec = S.wordHistory.pop();
        if (!rec) break;
        if (rec.requeued) S.wordQueue.pop();          // 뒤에 다시 넣었던 카드 제거
        S.wordPos = Math.max(0, S.wordPos - 1);
        const w = d.words[rec.wi];
        if (rec.prev === undefined) delete P.words[lv][w.word];
        else P.words[lv][w.word] = rec.prev;
        S.sessionLearned -= rec.learnedDelta;
        save();
        S.flipped = false;
        render();
        break;
      }
      case 'word-shuffle': {
        const rest = shuffle(S.wordQueue.slice(S.wordPos));
        S.wordQueue = S.wordQueue.slice(0, S.wordPos).concat(rest);
        S.wordHistory = [];   // 순서가 바뀌면 되돌리기 기록은 무효
        S.flipped = false;
        render();
        break;
      }
      case 'restudy-unknown': buildWordQueue(false); render(); break;
      case 'restudy-all': buildWordQueue(true); render(); break;
      case 'reset-words':
        if (confirm('이 레벨의 단어 암기 기록을 모두 지울까요?')) {
          P.words[lv] = {};
          save();
          buildWordQueue(false);
          render();
        }
        break;

      // 단어 퀴즈
      case 'wq-start': startWordQuiz(); render(); break;
      case 'wq-pick': {
        const Q = S.wordQuiz;
        if (Q.picked != null) break;
        Q.picked = parseInt(arg, 10);
        if (Q.picked === Q.qs[Q.pos].answer) Q.correctCount++;
        render();
        break;
      }
      case 'wq-next':
        S.wordQuiz.pos++;
        S.wordQuiz.picked = null;
        render();
        break;

      // 예문
      case 'sent-filter':
        S.sentFilter = arg;
        S.sentPos = 0;
        buildSentList();
        render();
        break;
      case 'sent-reveal': S.revealed = true; render(); break;
      case 'sent-mark': {
        const si = S.sentList[S.sentPos];
        P.sents[lv][si] = arg;
        save();
        if (S.sentPos + 1 < S.sentList.length) S.sentPos++;
        S.revealed = false;
        buildSentListKeepPos();
        render();
        break;
      }
      case 'sent-move':
        S.sentPos = Math.max(0, Math.min(S.sentList.length - 1, S.sentPos + parseInt(arg, 10)));
        S.revealed = false;
        render();
        break;

      // 문제 풀기
      case 'quiz-part': startQuizSet(arg); go('quiz'); break;
      case 'quiz-exit': S.quizSet = null; render(); break;
      case 'quiz-pick': {
        const Q = S.quizSet;
        if (Q.picked != null) break;
        Q.picked = parseInt(arg, 10);
        const qi = Q.items[Q.pos];
        const q = d.questions[qi];
        const ok = Q.picked === q.answer;
        if (ok) Q.correctCount++;
        P.quizStats[lv].attempted++;
        if (ok) P.quizStats[lv].correct++;
        if (!ok && !P.notes[lv].includes(qi)) P.notes[lv].push(qi);
        save();
        render();
        break;
      }
      case 'quiz-next':
        S.quizSet.pos++;
        S.quizSet.picked = null;
        render();
        window.scrollTo(0, 0);
        break;

      // 청해
      case 'listen-kind': startListenSet(arg); go('listening'); break;
      case 'listen-exit': S.listenSet = null; render(); break;
      case 'listen-play': {
        const L = S.listenSet;
        if (!L) break;
        const item = d.listening[L.items[L.pos]];
        if (item) playScript(item.script, L.slow);
        break;
      }
      case 'listen-speed': {
        const L = S.listenSet;
        if (!L) break;
        L.slow = !L.slow;
        render();
        break;
      }
      case 'listen-pick': {
        const L = S.listenSet;
        if (L.picked != null) break;
        if (window.speechSynthesis) speechSynthesis.cancel();
        L.picked = parseInt(arg, 10);
        const li = L.items[L.pos];
        const item = d.listening[li];
        const ok = L.picked === item.answer;
        if (ok) L.correctCount++;
        P.listenStats[lv].attempted++;
        if (ok) P.listenStats[lv].correct++;
        const ref = 'L' + li;
        if (!ok && !P.notes[lv].includes(ref)) P.notes[lv].push(ref);
        save();
        render();
        break;
      }
      case 'listen-next':
        S.listenSet.pos++;
        S.listenSet.picked = null;
        render();
        window.scrollTo(0, 0);
        break;

      // 오답노트
      case 'note-listen': {
        const item = d.listening[parseInt(arg.slice(1), 10)];
        if (item) playScript(item.script, false);
        break;
      }
      case 'note-del':
        P.notes[lv] = P.notes[lv].filter(i => String(i) !== arg);
        save();
        render();
        break;
      case 'notes-clear':
        if (confirm('오답노트를 전부 비울까요?')) {
          P.notes[lv] = [];
          save();
          render();
        }
        break;
    }
  });

  // 필터 유지한 채 목록 재계산 (마킹 직후: 현재 항목이 필터에서 빠질 수 있음)
  function buildSentListKeepPos() {
    const keep = S.sentList[S.sentPos];
    const lv = S.level, d = levelData(lv), map = P.sents[lv];
    let idxs = d.sentences.map((s, i) => i);
    if (S.sentFilter === 'todo') idxs = idxs.filter(i => !map[i]);
    else if (S.sentFilter === 'x') idxs = idxs.filter(i => map[i] === 'x');
    S.sentList = idxs;
    const at = idxs.indexOf(keep);
    S.sentPos = at >= 0 ? at : Math.min(S.sentPos, Math.max(0, idxs.length - 1));
  }

  // ---------- 시작 ----------
  render();
})();
