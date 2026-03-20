// app.js - アプリ初期化 + 統計 + ブックマーク + ゲームモード

document.addEventListener('DOMContentLoaded', () => {
  // ========== ガチャ拡大モーダル ==========
  const gachaZoomModal = document.getElementById('gacha-zoom-modal');
  if (gachaZoomModal) {
    const closeModal = () => gachaZoomModal.classList.add('hidden');
    gachaZoomModal.querySelector('.gacha-zoom-close').addEventListener('click', closeModal);
    gachaZoomModal.querySelector('.gacha-zoom-backdrop').addEventListener('click', closeModal);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  }
  let currentMode = 'tenpai';
  let currentOpen = 'closed';
  let currentDifficulty = 'medium';
  let currentSuit = 'random';
  let currentGameType = 'free';
  let gameState = null;
  let gameTimerInterval = null;

  // ========== ストレージキー ==========
  const STATS_KEY = 'chinitsu_stats';
  const BOOKMARKS_KEY = 'chinitsu_bookmarks';
  const LEADERBOARD_KEY = 'chinitsu_leaderboard';
  const ANSWER_LOG_KEY = 'chinitsu_answer_log';
  const MAX_BOOKMARKS = 100;
  const MAX_LEADERBOARD = 10;
  const MAX_ANSWER_LOG = 500;

  let problemStartTime = null;

  // ========== 統計 ==========

  function loadStats() {
    try { return JSON.parse(localStorage.getItem(STATS_KEY)) || {}; }
    catch { return {}; }
  }

  function saveStats(stats) {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  }

  function recordResult(mode, openMode, difficulty, isCorrect) {
    const stats = loadStats();
    const key = `${mode}-${openMode}-${difficulty}`;
    if (!stats[key]) stats[key] = { total: 0, correct: 0 };
    stats[key].total++;
    if (isCorrect) stats[key].correct++;
    saveStats(stats);
    renderStats();
  }

  function renderStats() {
    const el = document.getElementById('stats-bar');
    if (!el) return;
    const stats = loadStats();
    const diffs = ['easy', 'medium', 'hard'];
    const configs = [
      { mode: 'tenpai',     open: 'closed', label: 'テンパイ門前' },
      { mode: 'tenpai',     open: 'open',   label: 'テンパイ副露' },
      { mode: 'iishanten',  open: 'closed', label: 'イーシャンテン門前' },
      { mode: 'iishanten',  open: 'open',   label: 'イーシャンテン副露' },
    ];
    const diffLabels = { easy: '初', medium: '中', hard: '上' };

    const parts = [];
    for (const c of configs) {
      let tot = 0, cor = 0;
      for (const d of diffs) {
        const s = stats[`${c.mode}-${c.open}-${d}`] || { total: 0, correct: 0 };
        tot += s.total;
        cor += s.correct;
      }
      if (tot > 0) {
        parts.push(`<span class="stats-item"><strong>${c.label}</strong> ${cor}/${tot}問</span>`);
      }
    }

    const bookmarks = loadBookmarks();
    const bmCount = bookmarks.length;
    el.innerHTML = parts.length > 0
      ? parts.join('') + `<span class="stats-item stats-points">🪙 ${Gacha.getPoints()}pt</span>`
      : `<span class="stats-empty">出題ボタンを押して始めましょう</span>`;

    const btnReview = document.querySelector('#gametype-group button[data-value="review"]');
    if (btnReview) btnReview.textContent = `★ 振り返る (${bmCount}件)`;
  }

  // ========== 回答ログ（苦手分析用） ==========

  function loadAnswerLog() {
    try { return JSON.parse(localStorage.getItem(ANSWER_LOG_KEY)) || []; }
    catch { return []; }
  }

  function saveAnswerLog(log) {
    localStorage.setItem(ANSWER_LOG_KEY, JSON.stringify(log));
  }

  function logAnswer(problem, isCorrect, timeMs) {
    const log = loadAnswerLog();
    const waitCount = problem.type === 'tenpai'
      ? problem.waits.length
      : problem.discards.length;

    // 追加メタデータ
    let hasTerminal = false;
    let hasEntotsu = false;
    const waitTypesSet = new Set();
    let totalAcceptance = 0;

    if (problem.type === 'tenpai') {
      hasTerminal = problem.waits.some(w => w.tile === 0 || w.tile === 8);
      totalAcceptance = problem.waits.reduce((s, w) =>
        s + Math.max(0, (problem.remaining || [])[w.tile] || 0), 0);
      for (const w of problem.waits) {
        if (w.decompositions && w.decompositions.length > 0) {
          const decomp = w.decompositions.find(d => !d.isChitoitsu) || w.decompositions[0];
          const wt = Hand.getWaitType(problem.tiles, w.tile, decomp);
          if (wt) waitTypesSet.add(wt);
        }
      }
    } else if (problem.type === 'iishanten') {
      let maxAcc = 0;
      for (const d of problem.discards) {
        const tiles13 = Tile.copy(problem.tiles);
        tiles13[d.discard]--;
        const remaining = problem.isOpen
          ? Tile.getRemainingCounts(tiles13, problem.meld, problem.situation.doraIndicator)
          : Tile.getRemainingCounts(tiles13, null, problem.situation.doraIndicator);
        const acc = d.waits.reduce((s, w) => s + Math.max(0, remaining[w.tile]), 0);
        maxAcc = Math.max(maxAcc, acc);
      }
      totalAcceptance = maxAcc;
    }

    // 煙突形: 3枚+隣接1枚 (3334型, 6777型など)
    const ti = problem.tiles;
    for (let i = 0; i < 8; i++) {
      if ((ti[i] >= 3 && ti[i + 1] >= 1) || (ti[i] >= 1 && ti[i + 1] >= 3)) {
        hasEntotsu = true;
        break;
      }
    }

    log.push({
      mode: problem.type,
      isOpen: problem.isOpen,
      difficulty: problem.difficulty,
      waitCount: waitCount,
      isCorrect: isCorrect,
      timeMs: timeMs,
      timestamp: Date.now(),
      hasTerminal: hasTerminal,
      hasEntotsu: hasEntotsu,
      waitTypes: Array.from(waitTypesSet),
      totalAcceptance: totalAcceptance
    });
    if (log.length > MAX_ANSWER_LOG) {
      log.splice(0, log.length - MAX_ANSWER_LOG);
    }
    saveAnswerLog(log);
  }

  function analyzeWeaknesses() {
    const log = loadAnswerLog();
    if (log.length < 10) return null;

    const overallCorrect = log.filter(e => e.isCorrect).length;
    const overallRate = overallCorrect / log.length;
    const validTimeLogs = log.filter(e => e.timeMs != null && e.timeMs > 0);
    const overallAvgTime = validTimeLogs.length > 0
      ? validTimeLogs.reduce((s, e) => s + e.timeMs, 0) / validTimeLogs.length : 0;

    const categories = [];
    const MIN_SAMPLES = 3;

    function calcStats(entries) {
      if (entries.length === 0) return null;
      const correct = entries.filter(e => e.isCorrect).length;
      const rate = correct / entries.length;
      const timeLogs = entries.filter(e => e.timeMs != null && e.timeMs > 0);
      const avgTime = timeLogs.length > 0
        ? timeLogs.reduce((s, e) => s + e.timeMs, 0) / timeLogs.length : 0;
      return { count: entries.length, rate, avgTime, rateGap: overallRate - rate };
    }

    function addCategory(label, entries) {
      if (entries.length < MIN_SAMPLES) return;
      const s = calcStats(entries);
      if (s) categories.push({ label, ...s });
    }

    // === 待ち数別の詳細データ（棒グラフ用）===
    const tenpaiLog = log.filter(e => e.mode === 'tenpai');
    const waitCountChart = [];
    for (let wc = 1; wc <= 9; wc++) {
      const entries = tenpaiLog.filter(e => wc < 9 ? e.waitCount === wc : e.waitCount >= 9);
      const label = wc < 9 ? `${wc}種` : '9種+';
      const s = calcStats(entries);
      waitCountChart.push({ label, wc, count: entries.length, rate: s ? s.rate : null, avgTime: s ? s.avgTime : null });
    }

    // === 壁検出: 正解率が最も急落するポイント ===
    let wall = null;
    for (let i = 0; i < waitCountChart.length - 1; i++) {
      const cur = waitCountChart[i];
      const nxt = waitCountChart[i + 1];
      if (cur.rate != null && nxt.rate != null && cur.count >= MIN_SAMPLES && nxt.count >= MIN_SAMPLES) {
        const drop = cur.rate - nxt.rate;
        if (drop >= 0.10 && (!wall || drop > wall.drop)) {
          wall = {
            fromLabel: cur.label, toLabel: nxt.label,
            fromRate: Math.round(cur.rate * 100), toRate: Math.round(nxt.rate * 100),
            drop: drop
          };
        }
      }
    }

    // === 待ち形タイプ別（テンパイ）===
    const WAIT_TYPE_LABELS = {
      ryanmen: '両面', kanchan: '嵌張', penchan: '辺張', shanpon: '双碰', tanki: '単騎'
    };
    const waitTypeStats = {};
    for (const wt of ['ryanmen', 'kanchan', 'penchan', 'shanpon', 'tanki']) {
      const entries = tenpaiLog.filter(e => e.waitTypes && e.waitTypes.includes(wt));
      if (entries.length >= MIN_SAMPLES) {
        waitTypeStats[wt] = { ...calcStats(entries), label: WAIT_TYPE_LABELS[wt] };
      }
    }

    // === 端牌・煙突形のスポット分析 ===
    const terminalStats = calcStats(tenpaiLog.filter(e => e.hasTerminal === true));
    const noTerminalStats = calcStats(tenpaiLog.filter(e => e.hasTerminal === false));
    const entotsuStats = calcStats(log.filter(e => e.hasEntotsu === true));
    const noEntotsuStats = calcStats(log.filter(e => e.hasEntotsu === false));

    // === カテゴリ別成績（テーブル）===
    addCategory('少面待ち (1-2種)', tenpaiLog.filter(e => e.waitCount <= 2));
    addCategory('中面待ち (3-4種)', tenpaiLog.filter(e => e.waitCount >= 3 && e.waitCount <= 4));
    addCategory('多面待ち (5種以上)', tenpaiLog.filter(e => e.waitCount >= 5));
    const iishantenLog = log.filter(e => e.mode === 'iishanten');
    addCategory('有効打 少 (1-2種)', iishantenLog.filter(e => e.waitCount <= 2));
    addCategory('有効打 多 (3種以上)', iishantenLog.filter(e => e.waitCount >= 3));
    addCategory('副露あり', log.filter(e => e.isOpen));
    addCategory('門前', log.filter(e => !e.isOpen));
    addCategory('初級', log.filter(e => e.difficulty === 'easy'));
    addCategory('中級', log.filter(e => e.difficulty === 'medium'));
    addCategory('上級', log.filter(e => e.difficulty === 'hard'));
    addCategory('テンパイ', tenpaiLog);
    addCategory('イーシャンテン', iishantenLog);

    categories.sort((a, b) => b.rateGap - a.rateGap);

    // === 苦手パターン検出 (最大3件) ===
    const weaknesses = [];

    // 壁検出
    if (wall && wall.drop >= 0.15) {
      weaknesses.push({
        icon: '🧱',
        title: '多面張の壁',
        message: `${wall.fromLabel}→${wall.toLabel}で正解率が急落`,
        detail: `${wall.fromLabel}: ${wall.fromRate}% → ${wall.toLabel}: ${wall.toRate}% (-${Math.round(wall.drop * 100)}%)`,
        advice: `${wall.toLabel}以上の待ちを重点的に練習しましょう`
      });
    }

    // 待ち形タイプでの苦手
    const wtWeakest = Object.entries(waitTypeStats)
      .filter(([, s]) => s.rateGap > 0.08 && s.count >= MIN_SAMPLES)
      .sort((a, b) => b[1].rateGap - a[1].rateGap);
    if (wtWeakest.length > 0 && weaknesses.length < 3) {
      const [wt, s] = wtWeakest[0];
      const adviceMap = {
        kanchan: '数字の飛び（嵌張）に注意を払いましょう',
        penchan: '端の筋（辺張）を見落とさないようにしましょう',
        tanki: '単騎待ちの可能性も忘れずに確認しましょう',
        shanpon: '双碰待ちのパターンを意識しましょう',
        ryanmen: '両面待ちの形を整理して覚えましょう'
      };
      weaknesses.push({
        icon: '🔍',
        title: `${s.label}の見落とし`,
        message: `${s.label}を含む問題の正解率が${Math.round(s.rateGap * 100)}%低い`,
        detail: `正解率: ${Math.round(s.rate * 100)}% (全体: ${Math.round(overallRate * 100)}%) / ${s.count}問`,
        advice: adviceMap[wt] || ''
      });
    }

    // 端牌の盲点
    if (terminalStats && noTerminalStats && terminalStats.count >= MIN_SAMPLES && noTerminalStats.count >= MIN_SAMPLES) {
      const gap = noTerminalStats.rate - terminalStats.rate;
      if (gap >= 0.08 && weaknesses.length < 3) {
        weaknesses.push({
          icon: '🎯',
          title: '端牌の盲点',
          message: `1・9が待ちに含む問題の正解率が${Math.round(gap * 100)}%低い`,
          detail: `端牌あり: ${Math.round(terminalStats.rate * 100)}% / 端牌なし: ${Math.round(noTerminalStats.rate * 100)}%`,
          advice: '端牌（1・9）の待ちを見落としやすい傾向があります'
        });
      }
    }

    // 煙突形の苦手
    if (entotsuStats && noEntotsuStats && entotsuStats.count >= MIN_SAMPLES && noEntotsuStats.count >= MIN_SAMPLES) {
      const gap = noEntotsuStats.rate - entotsuStats.rate;
      if (gap >= 0.08 && weaknesses.length < 3) {
        weaknesses.push({
          icon: '🏭',
          title: '煙突形の苦手',
          message: `煙突形 (3枚+隣接1枚) を含む問題の正解率が${Math.round(gap * 100)}%低い`,
          detail: `煙突形あり: ${Math.round(entotsuStats.rate * 100)}% / なし: ${Math.round(noEntotsuStats.rate * 100)}%`,
          advice: '3334型や6777型の複雑な形に注意しましょう'
        });
      }
    }

    // カテゴリからの補充（まだ枠があれば）
    for (const cat of categories) {
      if (weaknesses.length >= 3) break;
      if (cat.rateGap <= 0.05) break;
      weaknesses.push({
        icon: '⚠️',
        title: cat.label,
        message: `${cat.label}の正解率が${Math.round(cat.rateGap * 100)}%低い傾向`,
        detail: `正解率: ${Math.round(cat.rate * 100)}% (全体: ${Math.round(overallRate * 100)}%) / ${cat.count}問`,
        advice: ''
      });
    }

    return {
      totalAnswers: log.length,
      overallRate: Math.round(overallRate * 100),
      overallAvgTimeSec: Math.round(overallAvgTime / 1000),
      weaknesses,
      categories,
      waitCountChart,
      wall,
      waitTypeStats,
      terminalStats, noTerminalStats,
      entotsuStats, noEntotsuStats
    };
  }

  function renderWeaknessAnalysis() {
    const container = document.getElementById('weakness-content');
    if (!container) return;

    const analysis = analyzeWeaknesses();

    if (!analysis) {
      container.innerHTML = '<p class="bookmark-empty">まだデータが不足しています<br>'
        + '<small>10問以上解答すると苦手パターンを分析します</small></p>';
      return;
    }

    let html = '<div class="weakness-overview">';
    html += `<div class="weakness-stat">回答数: <strong>${analysis.totalAnswers}問</strong></div>`;
    html += `<div class="weakness-stat">全体正解率: <strong>${analysis.overallRate}%</strong></div>`;
    if (analysis.overallAvgTimeSec > 0) {
      html += `<div class="weakness-stat">平均回答時間: <strong>${analysis.overallAvgTimeSec}秒</strong></div>`;
    }
    html += '</div>';

    // === 待ち数別 棒グラフ ===
    if (analysis.waitCountChart && analysis.waitCountChart.some(d => d.count > 0)) {
      html += '<div class="weakness-chart-section"><h4>待ち数別 正解率</h4>';
      html += '<div class="weakness-bar-chart">';
      for (const d of analysis.waitCountChart) {
        if (d.count === 0) continue;
        const pct = d.rate != null ? Math.round(d.rate * 100) : 0;
        const isWall = analysis.wall && d.label === analysis.wall.toLabel;
        html += `<div class="wbc-row${isWall ? ' wbc-wall' : ''}">`;
        html += `<span class="wbc-label">${d.label}</span>`;
        html += `<span class="wbc-track"><span class="wbc-fill" style="width:${pct}%"></span></span>`;
        html += `<span class="wbc-value">${pct}%</span>`;
        html += `<span class="wbc-count">(${d.count}問)</span>`;
        html += '</div>';
      }
      html += '</div>';
      if (analysis.wall) {
        html += `<p class="wbc-wall-note">🧱 ${analysis.wall.fromLabel}→${analysis.wall.toLabel}で正解率が急落 (${analysis.wall.fromRate}%→${analysis.wall.toRate}%)</p>`;
      }
      html += '</div>';
    }

    // === 待ち形タイプ別 棒グラフ ===
    const wtKeys = Object.keys(analysis.waitTypeStats || {});
    if (wtKeys.length > 0) {
      html += '<div class="weakness-chart-section"><h4>待ち形タイプ別 正解率</h4>';
      html += '<div class="weakness-bar-chart">';
      for (const wt of wtKeys) {
        const s = analysis.waitTypeStats[wt];
        const pct = Math.round(s.rate * 100);
        html += '<div class="wbc-row">';
        html += `<span class="wbc-label">${s.label}</span>`;
        html += `<span class="wbc-track"><span class="wbc-fill" style="width:${pct}%"></span></span>`;
        html += `<span class="wbc-value">${pct}%</span>`;
        html += `<span class="wbc-count">(${s.count}問)</span>`;
        html += '</div>';
      }
      html += '</div></div>';
    }

    // === スポット分析テーブル ===
    const hasSpotData = analysis.terminalStats || analysis.entotsuStats;
    if (hasSpotData) {
      html += '<div class="weakness-chart-section"><h4>スポット分析</h4>';
      html += '<table class="weakness-table"><thead><tr>';
      html += '<th>パターン</th><th>あり</th><th>なし</th><th>差</th>';
      html += '</tr></thead><tbody>';
      if (analysis.terminalStats && analysis.noTerminalStats) {
        const tR = Math.round(analysis.terminalStats.rate * 100);
        const ntR = Math.round(analysis.noTerminalStats.rate * 100);
        const gap = ntR - tR;
        html += `<tr${gap >= 8 ? ' class="weakness-row-weak"' : ''}>`;
        html += `<td>端牌(1・9)</td>`;
        html += `<td>${tR}%<small> (${analysis.terminalStats.count}問)</small></td>`;
        html += `<td>${ntR}%<small> (${analysis.noTerminalStats.count}問)</small></td>`;
        html += `<td>${gap > 0 ? '-' : '+'}${Math.abs(gap)}%</td>`;
        html += '</tr>';
      }
      if (analysis.entotsuStats && analysis.noEntotsuStats) {
        const eR = Math.round(analysis.entotsuStats.rate * 100);
        const neR = Math.round(analysis.noEntotsuStats.rate * 100);
        const gap = neR - eR;
        html += `<tr${gap >= 8 ? ' class="weakness-row-weak"' : ''}>`;
        html += `<td>煙突形(3334型)</td>`;
        html += `<td>${eR}%<small> (${analysis.entotsuStats.count}問)</small></td>`;
        html += `<td>${neR}%<small> (${analysis.noEntotsuStats.count}問)</small></td>`;
        html += `<td>${gap > 0 ? '-' : '+'}${Math.abs(gap)}%</td>`;
        html += '</tr>';
      }
      html += '</tbody></table></div>';
    }

    // === 苦手パターン カード ===
    if (analysis.weaknesses.length > 0) {
      html += '<div class="weakness-messages"><h4>あなたの苦手パターン</h4>';
      for (const w of analysis.weaknesses) {
        html += '<div class="weakness-card">';
        html += `<div class="weakness-card-title">${w.icon} ${w.title}</div>`;
        html += `<div class="weakness-card-message">${w.message}</div>`;
        html += `<div class="weakness-card-detail">${w.detail}</div>`;
        if (w.advice) {
          html += `<div class="weakness-card-advice">💡 ${w.advice}</div>`;
        }
        html += '</div>';
      }
      html += '</div>';
    } else {
      html += '<div class="weakness-messages">';
      html += '<div class="weakness-card weakness-card-good">';
      html += '<div class="weakness-card-message">✅ 特に苦手なパターンは見つかりませんでした</div>';
      html += '<div class="weakness-card-detail">全体的にバランスよく正解できています</div>';
      html += '</div></div>';
    }

    // === カテゴリ別成績テーブル ===
    if (analysis.categories.length > 0) {
      html += '<div class="weakness-breakdown"><h4>カテゴリ別成績</h4>';
      html += '<table class="weakness-table"><thead><tr>';
      html += '<th>カテゴリ</th><th>正解率</th><th>平均時間</th><th>回答数</th>';
      html += '</tr></thead><tbody>';
      for (const cat of analysis.categories) {
        const ratePercent = Math.round(cat.rate * 100);
        const avgTimeSec = Math.round(cat.avgTime / 1000);
        const isWeak = cat.rateGap > 0.05;
        html += `<tr${isWeak ? ' class="weakness-row-weak"' : ''}>`;
        html += `<td>${cat.label}</td>`;
        html += `<td>${ratePercent}%</td>`;
        html += `<td>${avgTimeSec}秒</td>`;
        html += `<td>${cat.count}問</td>`;
        html += '</tr>';
      }
      html += '</tbody></table></div>';
    }

    container.innerHTML = html;
  }

  // ========== ブックマーク ==========

  function loadBookmarks() {
    try { return JSON.parse(localStorage.getItem(BOOKMARKS_KEY)) || []; }
    catch { return []; }
  }

  function saveBookmarks(bms) {
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bms));
  }

  function addBookmark(problem, isWrong, starred) {
    const bms = loadBookmarks();
    const entry = {
      id: Date.now(),
      type: problem.type,
      isOpen: problem.isOpen,
      tiles: problem.tiles,
      meld: problem.meld || null,
      situation: problem.situation,
      difficulty: problem.difficulty,
      savedAt: new Date().toLocaleDateString('ja-JP'),
      isWrong: !!isWrong,
      starred: !!starred
    };
    bms.unshift(entry);
    if (bms.length > MAX_BOOKMARKS) bms.pop();
    saveBookmarks(bms);
    renderStats();
    renderBookmarkList();
  }

  function removeBookmark(id) {
    const bms = loadBookmarks().filter(b => b.id !== id);
    saveBookmarks(bms);
    renderStats();
    renderBookmarkList();
  }

  function rehydrateProblem(stored) {
    const tiles = stored.tiles;
    const meld = stored.meld || null;
    const p = {
      type: stored.type,
      isOpen: stored.isOpen,
      tiles,
      meld,
      situation: stored.situation,
      difficulty: stored.difficulty
    };
    if (p.type === 'tenpai') {
      p.waits = p.isOpen
        ? Hand.getTenpaiWaitsWithMeld(tiles, meld)
        : Hand.getTenpaiWaits(tiles);
      const di = p.situation.doraIndicator;
      p.remaining = Tile.getRemainingCounts(tiles, meld, di);
      p.waits = p.waits.filter(w => p.remaining[w.tile] > 0);
    } else {
      p.discards = p.isOpen
        ? Hand.findIishantenDiscardsWithMeld(tiles, meld)
        : Hand.findIishantenDiscards(tiles);
    }
    return p;
  }

  function customHandToProblem(entry) {
    const tiles = entry.tiles.slice();
    const meld = entry.meld || null;
    const doraIndex = entry.doraIndicator != null ? Tile.getDoraIndex(entry.doraIndicator) : -1;
    const doraCount = doraIndex >= 0 ? Tile.countDora(tiles, doraIndex, meld) : 0;
    const situation = {
      suit: entry.suit, doraIndicator: entry.doraIndicator, doraIndex, doraCount,
      redDoraCount: 0, isTsumo: entry.isTsumo, isDealer: entry.isDealer,
      isOpen: !!meld, meld: meld || null, redFives: 0, meldRedFive: false
    };
    const p = { type: entry.inputMode || 'tenpai', isOpen: !!meld, tiles, meld, situation, difficulty: 'medium' };
    if (p.type === 'tenpai') {
      p.waits = meld ? Hand.getTenpaiWaitsWithMeld(tiles, meld) : Hand.getTenpaiWaits(tiles);
      const remaining = Tile.getRemainingCounts(tiles, meld, entry.doraIndicator);
      p.waits = p.waits.filter(w => remaining[w.tile] > 0);
      p.remaining = remaining;
    } else {
      p.discards = meld
        ? Hand.findIishantenDiscardsWithMeld(tiles, meld)
        : Hand.findIishantenDiscards(tiles);
    }
    return p;
  }

  // ========== ブックマークフィルター状態 ==========
  let filterKind = 'all';
  let filterMode = 'all';
  let filterDifficulty = 'all';
  let filterOpen = 'all';
  let bookmarkPage = 0;
  const BOOKMARKS_PER_PAGE = 10;
  let reviewSubTab = 'bookmark';
  let chFilterMode = 'all';
  let chFilterOpen = 'all';

  function renderBookmarkList() {
    const container = document.getElementById('bookmark-list');
    if (!container) return;

    const all = loadBookmarks();

    const bms = all.filter(b => {
      if (filterKind === 'wrong'   && !b.isWrong)  return false;
      if (filterKind === 'starred' && !b.starred)  return false;
      if (filterMode === 'tenpai'     && b.type !== 'tenpai')     return false;
      if (filterMode === 'iishanten'  && b.type !== 'iishanten')  return false;
      if (filterDifficulty !== 'all' && b.difficulty !== filterDifficulty) return false;
      if (filterOpen === 'closed' && b.isOpen) return false;
      if (filterOpen === 'open'   && !b.isOpen) return false;
      return true;
    });

    const countEl = document.getElementById('bookmark-count');
    if (countEl) countEl.textContent = `${bms.length} 件 / 合計 ${all.length} 件`;

    const totalPages = Math.max(1, Math.ceil(bms.length / BOOKMARKS_PER_PAGE));
    if (bookmarkPage >= totalPages) bookmarkPage = totalPages - 1;
    if (bookmarkPage < 0) bookmarkPage = 0;
    const start = bookmarkPage * BOOKMARKS_PER_PAGE;
    const pageBms = bms.slice(start, start + BOOKMARKS_PER_PAGE);

    container.innerHTML = '';

    if (bms.length === 0) {
      container.innerHTML = '<p class="bookmark-empty">該当する問題はありません<br>'
        + '<small>答え合わせ後に★ボタンで保存、不正解は自動保存されます</small></p>';
      renderBookmarkPagination(0, 0);
      return;
    }

    const modeLabels = { tenpai: 'テンパイ', iishanten: 'イーシャンテン' };
    const diffLabels  = { easy: '初', medium: '中', hard: '上' };
    const openLabels  = { true: '副露', false: '門前' };

    for (const b of pageBms) {
      const item = document.createElement('div');
      item.className = 'bookmark-item'
        + (b.isWrong  ? ' bookmark-wrong'   : '')
        + (b.starred  ? ' bookmark-starred' : '');

      const top = document.createElement('div');
      top.className = 'bookmark-top';

      const info = document.createElement('div');
      info.className = 'bookmark-info';

      if (b.isWrong)  info.innerHTML += '<span class="bm-badge bm-badge-wrong">不正解</span>';
      if (b.starred)  info.innerHTML += '<span class="bm-badge bm-badge-star">★</span>';

      const modeLabel = modeLabels[b.type] || b.type;
      const diffLabel = diffLabels[b.difficulty] || b.difficulty;
      const openLabel = openLabels[String(b.isOpen)] || '';

      const modeSpan = document.createElement('span');
      modeSpan.className = 'bm-mode';
      modeSpan.textContent = `${modeLabel} ${openLabel} ${diffLabel}`;
      info.appendChild(modeSpan);

      const dateSpan = document.createElement('span');
      dateSpan.className = 'bm-date';
      dateSpan.textContent = b.savedAt;
      info.appendChild(dateSpan);

      const actions = document.createElement('div');
      actions.className = 'bm-actions';

      const btnReplay = document.createElement('button');
      btnReplay.className = 'btn-bm-replay';
      btnReplay.textContent = '再挑戦';
      btnReplay.addEventListener('click', () => {
        const problem = rehydrateProblem(b);
        syncModeButtons(problem.type, problem.isOpen ? 'open' : 'closed', problem.difficulty);
        currentMode = problem.type;
        currentOpen = problem.isOpen ? 'open' : 'closed';
        currentDifficulty = problem.difficulty;
        gameState = { type: 'custom-practice' };
        document.getElementById('review-panel').classList.remove('visible');
        problemStartTime = Date.now();
        document.getElementById('btn-bookmark').style.display = 'none';
        const btnHome = document.getElementById('btn-home');
        if (btnHome) btnHome.style.display = '';
        Quiz.startProblem(problem);
      });

      const btnRemove = document.createElement('button');
      btnRemove.className = 'btn-bm-remove';
      btnRemove.textContent = '削除';
      btnRemove.addEventListener('click', () => removeBookmark(b.id));

      actions.appendChild(btnReplay);
      actions.appendChild(btnRemove);
      top.appendChild(info);
      top.appendChild(actions);
      item.appendChild(top);

      const preview = Quiz.renderHandPreview(b.tiles, b.meld, b.situation.suit, b.situation.redFives, b.situation.meldRedFive);
      item.appendChild(preview);

      container.appendChild(item);
    }

    renderBookmarkPagination(totalPages, bms.length);
  }

  function renderBookmarkPagination(totalPages, totalItems) {
    const pagEl = document.getElementById('bookmark-pagination');
    if (!pagEl) return;
    if (totalPages <= 1) {
      pagEl.innerHTML = '';
      return;
    }
    pagEl.innerHTML = '';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'pagination-btn';
    prevBtn.textContent = '◀ 前';
    prevBtn.disabled = bookmarkPage === 0;
    prevBtn.addEventListener('click', () => { bookmarkPage--; renderBookmarkList(); });
    pagEl.appendChild(prevBtn);

    const info = document.createElement('span');
    info.className = 'pagination-info';
    info.textContent = `${bookmarkPage + 1} / ${totalPages} ページ (${totalItems}件)`;
    pagEl.appendChild(info);

    const nextBtn = document.createElement('button');
    nextBtn.className = 'pagination-btn';
    nextBtn.textContent = '次 ▶';
    nextBtn.disabled = bookmarkPage >= totalPages - 1;
    nextBtn.addEventListener('click', () => { bookmarkPage++; renderBookmarkList(); });
    pagEl.appendChild(nextBtn);
  }

  function renderCustomHandReviewList() {
    const container = document.getElementById('custom-hand-review-list');
    if (!container) return;
    const allHands = loadCustomHands();
    const hands = getFilteredCustomHands(chFilterMode, chFilterOpen);
    if (hands.length === 0) {
      container.innerHTML = allHands.length === 0
        ? '<p class="bookmark-empty">\u4fdd\u5b58\u3057\u305f\u624b\u724c\u306f\u3042\u308a\u307e\u305b\u3093<br>'
          + '<small>\u624b\u724c\u5165\u529b\u30bf\u30d6\u3067\u89e3\u6790\u5f8c\u306b\u4fdd\u5b58\u30dc\u30bf\u30f3\u3067\u4fdd\u5b58\u3067\u304d\u307e\u3059</small></p>'
        : '<p class="bookmark-empty">\u8a72\u5f53\u3059\u308b\u914d\u724c\u306f\u3042\u308a\u307e\u305b\u3093</p>';
      return;
    }
    container.innerHTML = '';
    const SUIT_NAMES = { man: '\u842c\u5b50', pin: '\u7b52\u5b50', sou: '\u7d22\u5b50' };
    const MODE_NAMES = { tenpai: '\u30c6\u30f3\u30d1\u30a4', iishanten: '\u30a4\u30fc\u30b7\u30e3\u30f3\u30c6\u30f3' };
    for (const h of hands) {
      const item = document.createElement('div');
      item.className = 'bookmark-item';
      const top = document.createElement('div');
      top.className = 'bookmark-top';
      const info = document.createElement('div');
      info.className = 'bookmark-info';
      const modeStr = MODE_NAMES[h.inputMode || 'tenpai'];
      const meldStr = h.meld ? ` (${h.meld.type === 'pon' ? '\u30dd\u30f3' : '\u30c1\u30fc'})` : '';
      const modeSpan = document.createElement('span');
      modeSpan.className = 'bm-mode';
      modeSpan.textContent = `${SUIT_NAMES[h.suit]}${meldStr} ${modeStr}`;
      info.appendChild(modeSpan);
      const dateSpan = document.createElement('span');
      dateSpan.className = 'bm-date';
      dateSpan.textContent = h.savedAt;
      info.appendChild(dateSpan);
      const actions = document.createElement('div');
      actions.className = 'bm-actions';
      const practiceBtn = document.createElement('button');
      practiceBtn.className = 'btn-bm-replay';
      practiceBtn.textContent = '\u7df4\u7fd2\u3059\u308b';
      practiceBtn.addEventListener('click', () => {
        const problem = customHandToProblem(h);
        gameState = { type: 'custom-practice' };
        document.getElementById('review-panel').classList.remove('visible');
        problemStartTime = Date.now();
        document.getElementById('btn-bookmark').style.display = 'none';
        const btnHome = document.getElementById('btn-home');
        if (btnHome) btnHome.style.display = '';
        Quiz.startProblem(problem);
      });
      const delBtn = document.createElement('button');
      delBtn.className = 'btn-bm-remove';
      delBtn.textContent = '\u524a\u9664';
      delBtn.addEventListener('click', () => { deleteCustomHand(h.id); renderCustomHandReviewList(); });
      actions.appendChild(practiceBtn);
      actions.appendChild(delBtn);
      top.appendChild(info);
      top.appendChild(actions);
      item.appendChild(top);
      const preview = document.createElement('div');
      preview.className = 'ch-saved-preview';
      for (let i = 0; i < 9; i++) {
        for (let j = 0; j < h.tiles[i]; j++) preview.appendChild(chMakeTileMini(i, h.suit));
      }
      if (h.meld) {
        const sep = document.createElement('span');
        sep.className = 'bm-preview-sep';
        preview.appendChild(sep);
        for (const t of h.meld.tiles) preview.appendChild(chMakeTileMini(t, h.suit));
      }
      item.appendChild(preview);
      container.appendChild(item);
    }
  }

  function syncModeButtons(mode, openMode, difficulty) {
    ['mode-group', 'open-group', 'difficulty-group'].forEach((groupId, i) => {
      const val = [mode, openMode, difficulty][i];
      document.getElementById(groupId).querySelectorAll('button').forEach(b => {
        b.classList.toggle('active', b.dataset.value === val);
      });
    });
  }

  // ========== ゲームモード ==========

  function updateGameTypeUI() {
    const btn = document.getElementById('btn-generate');
    const trainingFilters = document.getElementById('training-filters');
    const trainingFiltersSub = document.getElementById('training-filters-sub');
    const isCustomHand = currentGameType === 'customhand';
    const isGacha = currentGameType === 'gacha';
    const isTraining = currentGameType === 'training';
    const isReview = currentGameType === 'review';
    const isLeaderboard = currentGameType === 'leaderboard';
    const isWeakness = currentGameType === 'weakness';
    const isPanelMode = isReview || isLeaderboard || isWeakness;
    document.querySelectorAll('.game-settings').forEach(el => {
      el.style.display = (isTraining || isCustomHand || isGacha || isPanelMode) ? 'none' : '';
    });
    if (trainingFilters) {
      trainingFilters.style.display = isTraining ? '' : 'none';
    }
    if (trainingFiltersSub) {
      trainingFiltersSub.style.display = isTraining ? '' : 'none';
      const tDiffGroup = document.getElementById('training-difficulty-group')?.parentElement;
      if (tDiffGroup) tDiffGroup.style.display = trainingKind === 'custom' ? 'none' : '';
    }

    // 手牌入力モード: パネルを自動開閉
    const customHandPanel = document.getElementById('custom-hand-panel');
    if (customHandPanel) {
      if (isCustomHand) {
        if (!customHandPanel.classList.contains('visible')) {
          customHandPanel.classList.add('visible');
          renderCustomHandPanel();
        }
      } else {
        customHandPanel.classList.remove('visible');
      }
    }

    // ガチャモード: パネルを自動開閉
    const gachaPanel = document.getElementById('gacha-panel');
    if (gachaPanel) {
      if (isGacha) {
        if (!gachaPanel.classList.contains('visible')) {
          gachaPanel.classList.add('visible');
          renderGachaPanel();
        }
      } else {
        gachaPanel.classList.remove('visible');
      }
    }

    // 振り返るパネル: パネルを自動開閉
    const reviewPanel = document.getElementById('review-panel');
    if (reviewPanel) {
      if (isReview) {
        if (!reviewPanel.classList.contains('visible')) {
          reviewPanel.classList.add('visible');
        }
        document.getElementById('btn-review-tab-bookmark')?.classList.toggle('active', reviewSubTab === 'bookmark');
        document.getElementById('btn-review-tab-custom')?.classList.toggle('active', reviewSubTab === 'custom');
        const bmSec = document.getElementById('bookmark-section');
        const chSec = document.getElementById('custom-hand-review-section');
        const clrBtn = document.getElementById('btn-clear-bookmarks');
        if (bmSec) bmSec.style.display = reviewSubTab === 'bookmark' ? '' : 'none';
        if (chSec) chSec.style.display = reviewSubTab === 'custom' ? '' : 'none';
        if (clrBtn) clrBtn.style.display = reviewSubTab === 'bookmark' ? '' : 'none';
        if (reviewSubTab === 'custom') renderCustomHandReviewList();
        else renderBookmarkList();
      } else {
        reviewPanel.classList.remove('visible');
      }
    }

    // ランキングパネル: パネルを自動開閉
    const lbPanel = document.getElementById('leaderboard-panel');
    if (lbPanel) {
      if (isLeaderboard) {
        if (!lbPanel.classList.contains('visible')) {
          lbPanel.classList.add('visible');
          renderHomeLeaderboard();
        }
      } else {
        lbPanel.classList.remove('visible');
      }
    }

    // 苦手分析パネル: パネルを自動開閉
    const weaknessPanel = document.getElementById('weakness-panel');
    if (weaknessPanel) {
      if (isWeakness) {
        if (!weaknessPanel.classList.contains('visible')) {
          weaknessPanel.classList.add('visible');
          renderWeaknessAnalysis();
        }
      } else {
        weaknessPanel.classList.remove('visible');
      }
    }

    const gametypeDescEl = document.getElementById('gametype-desc');
    if (gametypeDescEl) {
      const gametypeDescs = {
        free: 'モードや難易度を自由に設定して１問ずつ練習できます。連続するゲーム性はなく、マイペースで学べます。<br><span class="hint-pts">💰 難易度pt（初級10/中級15/上級20）',
        timeattack: '連続10問を出題し、正解するまでの合計時間を計測します。問題を考えている間はタイマーが経過しません。全問正解を最短時間で目指しましょう。<br><span class="hint-pts">💰 正解数×難易度pt（初級10/中級15/上級20）、全問正解+50pt、7問以上正解+50pt</span>',
        survival: '制限時間60秒以内に連続正解を目指します。問題の考え中はタイマーが進みませんが、<strong>１問でも間違えるとゲームオーバー</strong>になります。<br><span class="hint-pts">💰 正解数×難易度pt（初級10/中級15/上級20）＋3問正解ごとに+50pt</span>',
        training: '不正解だった問題やお気に入りの問題を練習します。<strong>間違えた問題を正解するとリストから自動削除</strong>されます。',
        customhand: '任意の手牌を入力して、テンパイの待ち牌・役・打点、またはイーシャンテンの最適打牌と受入枚数を解析します。',
        gacha: 'クイズで稼いだポイントでガチャを引いて、特別な牌タイルを集めましょう！1連<strong>50pt</strong>、10連<strong>450pt</strong>で引けます。'
      };
      gametypeDescEl.innerHTML = gametypeDescs[currentGameType] || '';
    }

    updateModeDesc();

    switch (currentGameType) {
      case 'free':
        btn.textContent = '出題';
        btn.style.display = '';
        break;
      case 'timeattack':
        btn.textContent = 'タイムアタック開始 (10問)';
        btn.style.display = '';
        break;
      case 'survival':
        btn.textContent = 'サバイバル開始 (制限時間60秒)';
        btn.style.display = '';
        break;
      case 'training': {
        const total = trainingKind === 'custom'
          ? getFilteredCustomHands(trainingMode, trainingOpen).length
          : getFilteredTrainingBookmarks().length;
        btn.textContent = total > 0
          ? `特訓スタート (${total}問)`
          : '特訓スタート (問題なし)';
        btn.style.display = '';
        break;
      }
      case 'customhand':
        btn.style.display = 'none';
        break;
      case 'gacha':
        btn.style.display = 'none';
        break;
      case 'review':
      case 'leaderboard':
      case 'weakness':
        btn.style.display = 'none';
        break;
    }
  }

  function updateModeDesc() {
    const modeDescEl = document.getElementById('mode-desc');
    if (!modeDescEl) return;
    if (currentGameType === 'training') {
      modeDescEl.innerHTML = '';
      return;
    }
    const modeDescs = {
      tenpai: 'テンパイしている手牌の<strong>あたり牌をすべて選択</strong>してください。1枚でも漏れや誤選択があると不正解になります。なお、5枚使いはあたり牌の候補から除外されます。',
      iishanten: 'イーシャンテンの手牌からテンパイになる打牌のうち、<strong>受入枚数が最大の打牌</strong>を選んでください。テンパイになる打牌でも受入枚数が最大でなければ不正解になります。'
    };
    modeDescEl.innerHTML = modeDescs[currentMode] || '';
  }

  // ========== 特訓フィルター ==========
  let trainingKind = 'wrong';
  let trainingMode = 'all';
  let trainingDifficulty = 'all';
  let trainingOpen = 'all';
  let trainingOrder = 'random';

  function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function getFilteredCustomHands(mode, openFilter) {
    return loadCustomHands().filter(h => {
      if (mode !== 'all' && (h.inputMode || 'tenpai') !== mode) return false;
      const isOpen = !!h.meld;
      if (openFilter === 'closed' && isOpen) return false;
      if (openFilter === 'open' && !isOpen) return false;
      return true;
    });
  }

  function getFilteredTrainingBookmarks() {
    return loadBookmarks().filter(b => {
      if (trainingKind === 'wrong'   && !b.isWrong) return false;
      if (trainingKind === 'starred' && !b.starred) return false;
      if (trainingMode !== 'all' && b.type !== trainingMode) return false;
      if (trainingDifficulty !== 'all' && b.difficulty !== trainingDifficulty) return false;
      if (trainingOpen === 'closed' && b.isOpen) return false;
      if (trainingOpen === 'open' && !b.isOpen) return false;
      return true;
    });
  }

  function startGame() {
    if (currentGameType === 'free') {
      gameState = {
        type: 'free',
        correctCount: 0,
        totalCount: 0
      };
      document.getElementById('settings-panel').classList.add('game-active');
      document.getElementById('game-hud').style.display = '';
      generateAndStart();
      return;
    }

    if (currentGameType === 'training') {
      if (trainingKind === 'custom') {
        const allCustomHands = loadCustomHands();
        if (allCustomHands.length === 0) {
          alert('作成した問題がありません。手牌入力タブで配牌を保存してください。');
          return;
        }
        const hands = getFilteredCustomHands(trainingMode, trainingOpen);
        if (hands.length === 0) {
          alert('条件に合う作成した問題がありません。フィルターを変更してください。');
          return;
        }
        const queue = hands.map(h => ({ problem: customHandToProblem(h) }));
        gameState = {
          type: 'training',
          kind: 'custom',
          queue: trainingOrder === 'random' ? shuffleArray(queue) : queue,
          currentIndex: 0,
          correctCount: 0,
          totalCount: queue.length
        };
      } else {
        const wrongBms = getFilteredTrainingBookmarks();
        if (wrongBms.length === 0) {
          const kindLabel = trainingKind === 'starred' ? 'お気に入り' : '間違えた';
          alert(`該当する${kindLabel}の問題がありません。`);
          return;
        }
        gameState = {
          type: 'training',
          kind: trainingKind,
          queue: trainingOrder === 'random'
            ? shuffleArray(wrongBms.map(b => ({ bookmark: b, problem: rehydrateProblem(b) })))
            : wrongBms.map(b => ({ bookmark: b, problem: rehydrateProblem(b) })),
          currentIndex: 0,
          correctCount: 0,
          totalCount: wrongBms.length
        };
      }
    } else if (currentGameType === 'timeattack') {
      gameState = {
        type: 'timeattack',
        difficulty: currentDifficulty,
        questionIndex: 0,
        totalQuestions: 10,
        correctCount: 0,
        totalSolveTime: 0,
        currentSolveStart: null
      };
    } else if (currentGameType === 'survival') {
      gameState = {
        type: 'survival',
        difficulty: currentDifficulty,
        timeLimit: 60,
        correctCount: 0,
        totalSolveTime: 0,
        currentSolveStart: null,
        gameOver: false
      };
    }

    document.getElementById('settings-panel').classList.add('game-active');
    document.getElementById('game-hud').style.display = '';
    startTimerDisplay();
    startGameQuestion();
  }

  function startGameQuestion() {
    if (!gameState) return;

    let problem;
    if (gameState.type === 'training') {
      if (gameState.currentIndex >= gameState.totalCount) {
        endGame();
        return;
      }
      const entry = gameState.queue[gameState.currentIndex];
      problem = entry.problem;
      currentMode = problem.type;
      currentOpen = problem.isOpen ? 'open' : 'closed';
      currentDifficulty = problem.difficulty;
    } else {
      if (gameState.type === 'timeattack' && gameState.questionIndex >= gameState.totalQuestions) {
        endGame();
        return;
      }
      problem = Generator.generate(currentMode, currentOpen, currentDifficulty, currentSuit);
      if (!problem) {
        alert('問題生成に失敗しました。');
        abortGame();
        return;
      }
    }

    if (gameState.type === 'survival' || gameState.type === 'timeattack') {
      gameState.currentSolveStart = Date.now();
    }

    problemStartTime = Date.now();
    updateGameHud();
    Quiz.startProblem(problem);
    document.getElementById('btn-bookmark').style.display = 'none';
    const btnHome = document.getElementById('btn-home');
    if (btnHome) btnHome.style.display = '';
  }

  function onGameAnswer(isCorrect) {
    if (!gameState) return;

    // 解答中タイマー一時停止
    if ((gameState.type === 'survival' || gameState.type === 'timeattack') && gameState.currentSolveStart) {
      gameState.totalSolveTime += Date.now() - gameState.currentSolveStart;
      gameState.currentSolveStart = null;
    }

    if (gameState.type === 'timeattack') {
      gameState.questionIndex++;
      if (isCorrect) gameState.correctCount++;
    } else if (gameState.type === 'survival') {
      if (isCorrect) {
        gameState.correctCount++;
      } else {
        gameState.gameOver = true;
      }
      // Check if solve time exceeded limit
      if (gameState.totalSolveTime >= gameState.timeLimit * 1000) {
        gameState.gameOver = true;
      }
    } else if (gameState.type === 'training') {
      if (isCorrect) {
        gameState.correctCount++;
        // ポイント付与（間違えた問題を正解した場合のみ）
        if (gameState.kind !== 'starred' && gameState.kind !== 'custom') {
          Gacha.addPoints(10);
          renderStats();
        }
        // 間違えた問題のみ正解後に自動削除（お気に入り・作成した問題は削除しない）
        if (gameState.kind !== 'starred' && gameState.kind !== 'custom') {
          const entry = gameState.queue[gameState.currentIndex];
          if (entry && entry.bookmark) {
            removeBookmark(entry.bookmark.id);
          }
        }
      }
      gameState.currentIndex++;
    } else if (gameState.type === 'free') {
      gameState.totalCount++;
      const btnBm = document.getElementById('btn-bookmark');
      if (isCorrect) {
        gameState.correctCount++;
        const DIFF_PTS = { easy: 10, medium: 15, hard: 20 };
        Gacha.addPoints(DIFF_PTS[currentDifficulty] || 10);
        renderStats();
        btnBm.textContent = '★ 保存する';
        btnBm.disabled = false;
        btnBm.style.display = 'block';
      } else {
        const p = Quiz.getCurrentProblem();
        if (p) addBookmark(p, true, false);
        btnBm.textContent = '★ 保存済み';
        btnBm.disabled = true;
        btnBm.style.display = 'block';
      }
    } else if (gameState.type === 'custom-practice') {
      const btnBm = document.getElementById('btn-bookmark');
      btnBm.textContent = '★ 保存する';
      btnBm.disabled = false;
      btnBm.style.display = 'block';
      // ptは付与しない
    }

    updateGameHud();

    // Update next button text
    const btnNext = document.getElementById('btn-next');
    if (shouldEndGame()) {
      btnNext.textContent = '結果を見る';
    } else if (gameState.type === 'free' || gameState.type === 'custom-practice') {
      btnNext.textContent = '次の問題';
    } else {
      btnNext.textContent = '次の問題';
    }
  }

  function shouldEndGame() {
    if (!gameState) return false;
    if (gameState.type === 'timeattack') return gameState.questionIndex >= gameState.totalQuestions;
    if (gameState.type === 'survival') return gameState.gameOver;
    if (gameState.type === 'training') return gameState.currentIndex >= gameState.totalCount;
    return false;
  }

  function endGame() {
    stopTimerDisplay();
    // ポイント付与
    const DIFF_PTS = { easy: 10, medium: 15, hard: 20 };
    const ptsPerQ = DIFF_PTS[gameState.difficulty] || DIFF_PTS[currentDifficulty] || 10;
    let earnedPts = 0;
    if (gameState.type === 'timeattack') {
      earnedPts = gameState.correctCount * ptsPerQ;
      if (gameState.correctCount === gameState.totalQuestions) earnedPts += 50;
      if (gameState.correctCount >= 7) earnedPts += 50;
      if (earnedPts > 0) { Gacha.addPoints(earnedPts); renderStats(); }
    } else if (gameState.type === 'survival') {
      earnedPts = gameState.correctCount * ptsPerQ + Math.floor(gameState.correctCount / 3) * 50;
      if (earnedPts > 0) { Gacha.addPoints(earnedPts); renderStats(); }
    }
    gameState.earnedPts = earnedPts;
    if (gameState.type === 'timeattack' || gameState.type === 'survival') {
      saveLeaderboardEntry();
    }
    showGameResult();
    document.getElementById('game-hud').style.display = 'none';
    document.getElementById('quiz-area').classList.remove('visible');
  }

  function abortGame() {
    stopTimerDisplay();
    document.getElementById('game-hud').style.display = 'none';
    document.getElementById('quiz-area').classList.remove('visible');
    document.getElementById('settings-panel').classList.remove('game-active');
    gameState = null;
    updateGameTypeUI();
  }

  function startTimerDisplay() {
    stopTimerDisplay();
    if (!gameState || gameState.type === 'training') return;

    gameTimerInterval = setInterval(() => {
      if (!gameState) { stopTimerDisplay(); return; }

      const timerEl = document.getElementById('game-timer-display');

      if (gameState.type === 'survival') {
        const elapsed = getSolveElapsed();
        const remaining = Math.max(0, gameState.timeLimit * 1000 - elapsed);
        timerEl.textContent = formatTime(remaining);
        timerEl.classList.toggle('timer-danger', remaining <= 15000);

        if (remaining <= 0 && gameState.currentSolveStart) {
          gameState.gameOver = true;
          gameState.totalSolveTime += Date.now() - gameState.currentSolveStart;
          gameState.currentSolveStart = null;
          endGame();
        }
      } else if (gameState.type === 'timeattack') {
        const elapsed = getSolveElapsed();
        timerEl.textContent = formatTime(elapsed);
      }
    }, 50);
  }

  function stopTimerDisplay() {
    if (gameTimerInterval) {
      clearInterval(gameTimerInterval);
      gameTimerInterval = null;
    }
    const el = document.getElementById('game-timer-display');
    if (el) el.classList.remove('timer-danger');
  }

  function getSolveElapsed() {
    if (!gameState) return 0;
    let total = gameState.totalSolveTime || 0;
    if (gameState.currentSolveStart) {
      total += Date.now() - gameState.currentSolveStart;
    }
    return total;
  }

  function formatTime(ms) {
    const total = Math.floor(ms / 1000);
    const min = Math.floor(total / 60);
    const sec = total % 60;
    const cs = Math.floor((ms % 1000) / 10);
    return `${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
  }

  function updateGameHud() {
    if (!gameState) return;
    const timerEl = document.getElementById('game-timer-display');
    const counterEl = document.getElementById('game-counter-display');

    timerEl.style.display = (gameState.type === 'training' || gameState.type === 'free') ? 'none' : '';

    if (gameState.type === 'timeattack') {
      const qNum = Math.min(gameState.questionIndex + 1, gameState.totalQuestions);
      counterEl.textContent = `${qNum} / ${gameState.totalQuestions} 問目`;
    } else if (gameState.type === 'survival') {
      counterEl.textContent = `正解: ${gameState.correctCount} 問`;
    } else if (gameState.type === 'training') {
      const qNum = Math.min(gameState.currentIndex + 1, gameState.totalCount);
      counterEl.textContent = `${qNum} / ${gameState.totalCount} 問目`;
    } else if (gameState.type === 'free') {
      counterEl.textContent = `正解: ${gameState.correctCount} / ${gameState.totalCount} 問`;
    }
  }

  function showGameResult() {
    const overlay = document.getElementById('game-result-overlay');
    const title = document.getElementById('game-result-title');
    const body = document.getElementById('game-result-body');
    let html = '';

    if (gameState.type === 'timeattack') {
      const elapsed = getSolveElapsed();
      title.textContent = 'タイムアタック結果';
      html = `
        <div class="game-result-stat">
          <span class="game-result-stat-label">タイム</span>
          <span class="game-result-stat-value game-result-time">${formatTime(elapsed)}</span>
        </div>
        <div class="game-result-stat">
          <span class="game-result-stat-label">正解数</span>
          <span class="game-result-stat-value">${gameState.correctCount} / ${gameState.totalQuestions}</span>
        </div>
        <div class="game-result-stat">
          <span class="game-result-stat-label">正解率</span>
          <span class="game-result-stat-value">${Math.round(gameState.correctCount / gameState.totalQuestions * 100)}%</span>
        </div>
        <div class="game-result-stat">
          <span class="game-result-stat-label">獲得ポイント</span>
          <span class="game-result-stat-value game-result-pts">+${gameState.earnedPts} pt</span>
        </div>`;
      if (gameState.correctCount === gameState.totalQuestions) {
        html += '<p class="game-result-perfect">全問正解！</p>';
      }
    } else if (gameState.type === 'survival') {
      const elapsed = getSolveElapsed();
      const remaining = Math.max(0, gameState.timeLimit * 1000 - elapsed);
      title.textContent = remaining <= 0 ? 'タイムアップ！' : 'ゲームオーバー！';
      html = `
        <div class="game-result-stat">
          <span class="game-result-stat-label">正解数</span>
          <span class="game-result-stat-value game-result-score">${gameState.correctCount} 問</span>
        </div>
        <div class="game-result-stat">
          <span class="game-result-stat-label">解答時間</span>
          <span class="game-result-stat-value">${formatTime(elapsed)}</span>
        </div>
        <div class="game-result-stat">
          <span class="game-result-stat-label">獲得ポイント</span>
          <span class="game-result-stat-value game-result-pts">+${gameState.earnedPts} pt</span>
        </div>`;
    } else if (gameState.type === 'training') {
      const rate = gameState.totalCount > 0
        ? Math.round(gameState.correctCount / gameState.totalCount * 100) : 0;
      title.textContent = '特訓結果';
      html = `
        <div class="game-result-stat">
          <span class="game-result-stat-label">正解数</span>
          <span class="game-result-stat-value">${gameState.correctCount} / ${gameState.totalCount}</span>
        </div>
        <div class="game-result-stat">
          <span class="game-result-stat-label">正解率</span>
          <span class="game-result-stat-value">${rate}%</span>
        </div>`;
      if (rate === 100) {
        html += '<p class="game-result-perfect">全問正解！素晴らしい！</p>';
      }
    }

    // ランキング表示（TA/サバイバルのみ）
    if (gameState.type === 'timeattack' || gameState.type === 'survival') {
      const currentSettings = `${currentMode}-${currentOpen}-${currentDifficulty}-${currentSuit}`;
      html += renderLeaderboardHtml(gameState.type, currentSettings);
    }

    body.innerHTML = html;
    overlay.style.display = '';
  }

  // ========== ランキング ==========

  function loadLeaderboard() {
    try { return JSON.parse(localStorage.getItem(LEADERBOARD_KEY)) || { timeattack: {}, survival: {} }; }
    catch { return { timeattack: {}, survival: {} }; }
  }

  function saveLeaderboard(lb) {
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(lb));
  }

  // 起動時に旧フォーマット（配列 or 3パーツ設定キー）を新フォーマット（設定別オブジェクト・4パーツキー）へ変換して保存
  function initLeaderboard() {
    try {
      const raw = localStorage.getItem(LEADERBOARD_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      let needsSave = false;

      const migrateObj = (val, sortFn) => {
        if (!val) return {};
        // 配列ならオブジェクトに変換
        const obj = Array.isArray(val) ? (() => {
          needsSave = true;
          const o = {};
          for (const e of val) {
            const s = e.settings || 'unknown';
            if (!o[s]) o[s] = [];
            o[s].push(e);
          }
          return o;
        })() : val;
        // 3パーツキーを4パーツキー（+'-random'）に昇格
        const result = {};
        for (const [key, entries] of Object.entries(obj)) {
          const parts = key.split('-');
          const newKey = parts.length === 3 ? key + '-random' : key;
          if (newKey !== key) needsSave = true;
          if (!result[newKey]) result[newKey] = [];
          result[newKey].push(...entries);
        }
        // 各キーをソート・上位10件に絞る
        for (const k of Object.keys(result)) {
          result[k].sort(sortFn);
          result[k] = result[k].slice(0, MAX_LEADERBOARD);
        }
        return result;
      };

      data.timeattack = migrateObj(data.timeattack, (a, b) => b.correct - a.correct || a.time - b.time);
      data.survival   = migrateObj(data.survival,   (a, b) => b.score   - a.score   || a.time - b.time);
      if (needsSave) saveLeaderboard(data);
    } catch { }
  }

  function saveLeaderboardEntry() {
    if (!gameState) return;
    const lb = loadLeaderboard();
    const settings = `${currentMode}-${currentOpen}-${currentDifficulty}-${currentSuit}`;

    if (gameState.type === 'timeattack') {
      const elapsed = getSolveElapsed();
      const entry = {
        time: elapsed,
        correct: gameState.correctCount,
        total: gameState.totalQuestions,
        settings,
        date: new Date().toLocaleDateString('ja-JP')
      };
      if (!lb.timeattack) lb.timeattack = {};
      if (!lb.timeattack[settings]) lb.timeattack[settings] = [];
      lb.timeattack[settings].push(entry);
      lb.timeattack[settings].sort((a, b) => b.correct - a.correct || a.time - b.time);
      lb.timeattack[settings] = lb.timeattack[settings].slice(0, MAX_LEADERBOARD);
    } else if (gameState.type === 'survival') {
      const elapsed = getSolveElapsed();
      const entry = {
        score: gameState.correctCount,
        time: elapsed,
        settings,
        date: new Date().toLocaleDateString('ja-JP')
      };
      if (!lb.survival) lb.survival = {};
      if (!lb.survival[settings]) lb.survival[settings] = [];
      lb.survival[settings].push(entry);
      lb.survival[settings].sort((a, b) => b.score - a.score || a.time - b.time);
      lb.survival[settings] = lb.survival[settings].slice(0, MAX_LEADERBOARD);
    }

    saveLeaderboard(lb);
  }

  function renderLeaderboardHtml(type, filterSettings) {
    const lb = loadLeaderboard();
    let entries;
    if (filterSettings) {
      // 設定別リストから取得（結果画面用）
      entries = (lb[type] && lb[type][filterSettings]) ? lb[type][filterSettings] : [];
    } else {
      // 全設定をフラット化してグローバル TOP10
      entries = Object.values(lb[type] || {}).flat();
      if (type === 'timeattack') {
        entries.sort((a, b) => b.correct - a.correct || a.time - b.time);
      } else {
        entries.sort((a, b) => b.score - a.score || a.time - b.time);
      }
      entries = entries.slice(0, MAX_LEADERBOARD);
    }
    if (entries.length === 0) return '';

    const settingsLabel = (s) => {
      const parts = s.split('-');
      const [mode, open, diff] = parts;
      const suit = parts[3] || 'random';
      const modeL = mode === 'tenpai' ? 'テンパイ' : 'イーシャンテン';
      const openL = open === 'open' ? '副露' : '門前';
      const diffL = { easy: '初', medium: '中', hard: '上' }[diff] || diff;
      const suitL = { random: '', man: '萬', sou: '索', pin: '筒' }[suit] || '';
      return `${modeL}${openL}${diffL}${suitL}`;
    };

    const title = filterSettings
      ? `ランキング (${settingsLabel(filterSettings)})`
      : 'ランキング TOP10';

    let html = `<div class="leaderboard"><h4 class="leaderboard-title">${title}</h4><table class="leaderboard-table"><thead><tr><th>#</th>`;
    if (type === 'timeattack') {
      html += '<th>タイム</th><th>正解</th>';
    } else {
      html += '<th>正解数</th><th>時間</th>';
    }
    // 設定列はフィルタ済みなら不要
    if (!filterSettings) html += '<th>設定</th>';
    html += '<th>日付</th></tr></thead><tbody>';

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const rank = i + 1;
      const rankClass = rank <= 3 ? ` class="rank-${rank}"` : '';
      html += `<tr${rankClass}>`;
      html += `<td>${rank}</td>`;
      if (type === 'timeattack') {
        html += `<td class="lb-time">${formatTime(e.time)}</td>`;
        html += `<td>${e.correct}/${e.total}</td>`;
      } else {
        html += `<td class="lb-score">${e.score}問</td>`;
        html += `<td>${formatTime(e.time)}</td>`;
      }
      if (!filterSettings) html += `<td class="lb-settings">${settingsLabel(e.settings)}</td>`;
      html += `<td class="lb-date">${e.date}</td>`;
      html += '</tr>';
    }
    html += '</tbody></table></div>';
    return html;
  }

  function hideGameResult() {
    document.getElementById('game-result-overlay').style.display = 'none';
    document.getElementById('settings-panel').classList.remove('game-active');
    gameState = null;
    updateGameTypeUI();
  }

  // ========== ボタングループ ==========

  function initButtonGroup(groupId, callback) {
    const group = document.getElementById(groupId);
    group.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        group.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        callback(btn.dataset.value);
      });
    });
  }

  initButtonGroup('mode-group', val => { currentMode = val; updateModeDesc(); });
  initButtonGroup('open-group', val => { currentOpen = val; });
  initButtonGroup('difficulty-group', val => { currentDifficulty = val; });
  initButtonGroup('suit-group', val => { currentSuit = val; });
  initButtonGroup('gametype-group', val => {
    currentGameType = val;
    updateGameTypeUI();
  });

  // ========== 問題生成 ==========

  function generateAndStart() {
    const problem = Generator.generate(currentMode, currentOpen, currentDifficulty, currentSuit);
    if (!problem) {
      alert('問題の生成に失敗しました。条件を変えて再度お試しください。');
      return;
    }
    if (gameState && gameState.type === 'free') {
      updateGameHud();
      const btnHome = document.getElementById('btn-home');
      if (btnHome) btnHome.style.display = '';
    }
    document.getElementById('btn-bookmark').style.display = 'none';
    problemStartTime = Date.now();
    Quiz.startProblem(problem);
  }

  document.getElementById('btn-generate').addEventListener('click', () => {
    startGame();
  });

  // ========== 答え合わせ ==========

  document.getElementById('btn-check').addEventListener('click', () => {
    const result = Quiz.checkAnswer();
    if (!result) return;

    // Record stats (for training mode, use problem's own settings)
    if (gameState && gameState.type === 'training') {
      const p = Quiz.getCurrentProblem();
      if (p) {
        recordResult(p.type, p.isOpen ? 'open' : 'closed', p.difficulty, result.isCorrect);
      }
    } else if (!(gameState && gameState.type === 'custom-practice')) {
      recordResult(currentMode, currentOpen, currentDifficulty, result.isCorrect);
    }

    // 苦手分析用ログ記録
    const answerTimeMs = problemStartTime ? Date.now() - problemStartTime : null;
    const logProblem = Quiz.getCurrentProblem();
    if (logProblem && !(gameState && gameState.type === 'custom-practice')) logAnswer(logProblem, result.isCorrect, answerTimeMs);
    problemStartTime = null;

    const p = Quiz.getCurrentProblem();
    if (p) {
      if (gameState) {
        // Game mode (including free): auto-bookmark wrong (but not in training — already bookmarked)
        if (!result.isCorrect && gameState.type !== 'training' && gameState.type !== 'free' && gameState.type !== 'custom-practice') {
          addBookmark(p, true, false);
        }
        if (gameState.type !== 'free' && gameState.type !== 'custom-practice') {
          document.getElementById('btn-bookmark').style.display = 'none';
        }
        onGameAnswer(result.isCorrect);
      } else {
        // フリーモード（gameStateなしのレガシー）
        if (!result.isCorrect) {
          addBookmark(p, true, false);
          const btnBm = document.getElementById('btn-bookmark');
          btnBm.textContent = '★ 保存済み';
          btnBm.disabled = true;
          btnBm.style.display = 'block';
        } else {
          Gacha.addPoints(10);
          renderStats();
          const btnBm = document.getElementById('btn-bookmark');
          btnBm.textContent = '★ 保存する';
          btnBm.disabled = false;
          btnBm.style.display = 'block';
        }
      }
    }
  });

  // ブックマークボタン（正解時に手動保存）
  document.getElementById('btn-bookmark').addEventListener('click', () => {
    const p = Quiz.getCurrentProblem();
    if (!p) return;
    addBookmark(p, false, true);
    const btn = document.getElementById('btn-bookmark');
    btn.textContent = '★ 保存済み';
    btn.disabled = true;
  });

  // ========== 次の問題 ==========

  document.getElementById('btn-next').addEventListener('click', () => {
    if (gameState) {
      if (shouldEndGame()) {
        endGame();
      } else if (gameState.type === 'free') {
        document.getElementById('btn-bookmark').style.display = 'none';
        generateAndStart();
      } else if (gameState.type === 'custom-practice') {
        gameState = null;
        Quiz.reset();
        reviewSubTab = 'custom';
        currentGameType = 'review';
        document.querySelectorAll('#gametype-group button').forEach(b => {
          b.classList.toggle('active', b.dataset.value === 'review');
        });
        updateGameTypeUI();
      } else {
        startGameQuestion();
      }
    } else {
      generateAndStart();
    }
    document.getElementById('btn-next').textContent = '次の問題';
  });

  // ========== ゲーム結果オーバーレイ ==========

  document.getElementById('btn-game-retry').addEventListener('click', () => {
    hideGameResult();
    startGame();
  });

  document.getElementById('btn-game-back').addEventListener('click', () => {
    hideGameResult();
  });

  document.getElementById('btn-home').addEventListener('click', () => {
    document.getElementById('btn-home').style.display = 'none';
    abortGame();
  });

  // ========== ホーム復帰 ==========

  document.getElementById('title-home').addEventListener('click', () => {
    // ゲーム中なら中断確認
    if (gameState) {
      if (!confirm('ゲームを中断してホームに戻りますか？')) return;
      abortGame();
    }
    // すべてのパネルを閉じてホームに戻る
    document.getElementById('quiz-area').classList.remove('visible');
    document.getElementById('review-panel').classList.remove('visible');
    document.getElementById('leaderboard-panel').classList.remove('visible');
    document.getElementById('weakness-panel').classList.remove('visible');
    document.getElementById('custom-hand-panel').classList.remove('visible');
    document.getElementById('gacha-panel').classList.remove('visible');
    document.getElementById('game-result-overlay').style.display = 'none';
    document.getElementById('settings-panel').classList.remove('game-active');
    document.getElementById('game-hud').style.display = 'none';
    gameState = null;
    updateGameTypeUI();
  });

  // ========== 復習パネル ==========

  document.getElementById('btn-review-tab-bookmark').addEventListener('click', () => {
    reviewSubTab = 'bookmark';
    document.getElementById('btn-review-tab-bookmark').classList.add('active');
    document.getElementById('btn-review-tab-custom').classList.remove('active');
    document.getElementById('bookmark-section').style.display = '';
    document.getElementById('custom-hand-review-section').style.display = 'none';
    document.getElementById('btn-clear-bookmarks').style.display = '';
    renderBookmarkList();
  });

  document.getElementById('btn-review-tab-custom').addEventListener('click', () => {
    reviewSubTab = 'custom';
    document.getElementById('btn-review-tab-bookmark').classList.remove('active');
    document.getElementById('btn-review-tab-custom').classList.add('active');
    document.getElementById('bookmark-section').style.display = 'none';
    document.getElementById('custom-hand-review-section').style.display = '';
    document.getElementById('btn-clear-bookmarks').style.display = 'none';
    renderCustomHandReviewList();
  });

  // ========== ランキングパネル（ホーム） ==========

  let lbType = 'timeattack';
  let lbMode = 'tenpai';
  let lbDifficulty = 'medium';
  let lbOpen = 'closed';
  let lbSuit = 'random';

  function renderHomeLeaderboard() {
    const container = document.getElementById('leaderboard-home-content');
    if (!container) return;
    const lb = loadLeaderboard();

    // 全設定のエントリをフラット化してソート
    let entries = Object.values(lb[lbType] || {}).flat();
    if (lbType === 'timeattack') {
      entries.sort((a, b) => b.correct - a.correct || a.time - b.time);
    } else {
      entries.sort((a, b) => b.score - a.score || a.time - b.time);
    }

    // フィルタリング
    entries = entries.filter(e => {
      const parts = e.settings.split('-');
      const [mode, open, diff] = parts;
      const suit = parts[3] || 'random';
      if (mode !== lbMode) return false;
      if (diff !== lbDifficulty) return false;
      if (open !== lbOpen) return false;
      if (suit !== lbSuit) return false;
      return true;
    });

    if (entries.length === 0) {
      container.innerHTML = '<p class="bookmark-empty">該当する記録はありません</p>';
      return;
    }

    const settingsLabel = (s) => {
      const parts = s.split('-');
      const [mode, open, diff] = parts;
      const suit = parts[3] || 'random';
      const modeL = mode === 'tenpai' ? 'テンパイ' : 'イーシャンテン';
      const openL = open === 'open' ? '副露' : '門前';
      const diffL = { easy: '初', medium: '中', hard: '上' }[diff] || diff;
      const suitL = { random: '', man: '萬', sou: '索', pin: '筒' }[suit] || '';
      return `${modeL}${openL}${diffL}${suitL}`;
    };

    let html = '<table class="leaderboard-table"><thead><tr><th>#</th>';
    if (lbType === 'timeattack') {
      html += '<th>タイム</th><th>正解</th>';
    } else {
      html += '<th>正解数</th><th>時間</th>';
    }
    html += '<th>設定</th><th>日付</th></tr></thead><tbody>';

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const rank = i + 1;
      const rankClass = rank <= 3 ? ` class="rank-${rank}"` : '';
      html += `<tr${rankClass}>`;
      html += `<td>${rank}</td>`;
      if (lbType === 'timeattack') {
        html += `<td class="lb-time">${formatTime(e.time)}</td>`;
        html += `<td>${e.correct}/${e.total}</td>`;
      } else {
        html += `<td class="lb-score">${e.score}問</td>`;
        html += `<td>${formatTime(e.time)}</td>`;
      }
      html += `<td class="lb-settings">${settingsLabel(e.settings)}</td>`;
      html += `<td class="lb-date">${e.date}</td>`;
      html += '</tr>';
    }
    html += '</tbody></table>';
    container.innerHTML = html;
  }

  document.querySelectorAll('[data-lb-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-lb-type]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      lbType = btn.dataset.lbType;
      renderHomeLeaderboard();
    });
  });

  document.querySelectorAll('[data-lb-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-lb-mode]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      lbMode = btn.dataset.lbMode;
      renderHomeLeaderboard();
    });
  });

  document.querySelectorAll('[data-lb-difficulty]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-lb-difficulty]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      lbDifficulty = btn.dataset.lbDifficulty;
      renderHomeLeaderboard();
    });
  });

  document.querySelectorAll('[data-lb-open]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-lb-open]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      lbOpen = btn.dataset.lbOpen;
      renderHomeLeaderboard();
    });
  });

  document.querySelectorAll('[data-lb-suit]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-lb-suit]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      lbSuit = btn.dataset.lbSuit;
      renderHomeLeaderboard();
    });
  });


  // ========== 苦手分析パネル ==========

  document.getElementById('btn-clear-bookmarks').addEventListener('click', () => {
    if (confirm('保存した問題を全て削除しますか？')) {
      localStorage.removeItem(BOOKMARKS_KEY);
      renderStats();
      renderBookmarkList();
    }
  });

  // フィルタータブ
  document.querySelectorAll('[data-filter-kind]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-filter-kind]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filterKind = btn.dataset.filterKind;
      bookmarkPage = 0;
      renderBookmarkList();
    });
  });

  document.querySelectorAll('[data-filter-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-filter-mode]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filterMode = btn.dataset.filterMode;
      bookmarkPage = 0;
      renderBookmarkList();
    });
  });

  document.querySelectorAll('[data-filter-difficulty]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-filter-difficulty]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filterDifficulty = btn.dataset.filterDifficulty;
      bookmarkPage = 0;
      renderBookmarkList();
    });
  });

  document.querySelectorAll('[data-filter-open]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-filter-open]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filterOpen = btn.dataset.filterOpen;
      bookmarkPage = 0;
      renderBookmarkList();
    });
  });

  document.querySelectorAll('[data-ch-filter-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-ch-filter-mode]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      chFilterMode = btn.dataset.chFilterMode;
      renderCustomHandReviewList();
    });
  });

  document.querySelectorAll('[data-ch-filter-open]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-ch-filter-open]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      chFilterOpen = btn.dataset.chFilterOpen;
      renderCustomHandReviewList();
    });
  });

  // ========== 特訓フィルタータブ ==========
  document.querySelectorAll('#training-kind-group button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#training-kind-group button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      trainingKind = btn.dataset.value;
      updateGameTypeUI();
    });
  });

  document.querySelectorAll('#training-mode-group button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#training-mode-group button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      trainingMode = btn.dataset.value;
      updateGameTypeUI();
    });
  });

  document.querySelectorAll('#training-open-group button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#training-open-group button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      trainingOpen = btn.dataset.value;
      updateGameTypeUI();
    });
  });

  document.querySelectorAll('#training-difficulty-group button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#training-difficulty-group button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      trainingDifficulty = btn.dataset.value;
      updateGameTypeUI();
    });
  });

  document.querySelectorAll('#training-order-group button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#training-order-group button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      trainingOrder = btn.dataset.value;
    });
  });

  // ========== ガチャパネル ==========

  const GACHA_TILE_W = 66;
  const GACHA_TILE_H = 98;   // 66 × (138/93) ≈ 98

  let gachaTab = 'pull'; // 'pull' | 'collection' | 'showcase'
  let gachaCollectionFilter = 'all'; // 'all' | rarity key
  let gachaShowcaseFilter = 'all';   // 'all' | rarity key

  function renderGachaPanel() {
    const container = document.getElementById('gacha-content');
    if (!container) return;

    const pts = Gacha.getPoints();

    let html = `
      <div class="gacha-tabs">
        <button class="gacha-tab${gachaTab === 'pull' ? ' active' : ''}" data-gacha-tab="pull">ガチャを引く</button>
        <button class="gacha-tab${gachaTab === 'collection' ? ' active' : ''}" data-gacha-tab="collection">コレクション</button>
        <button class="gacha-tab${gachaTab === 'showcase' ? ' active' : ''}" data-gacha-tab="showcase">飾り棚</button>
      </div>
      <div class="gacha-points-bar">🪙 <strong>${pts}</strong> pt</div>
    `;

    if (gachaTab === 'pull') {
      html += renderGachaPullTab(pts);
    } else if (gachaTab === 'collection') {
      html += renderGachaCollectionTab();
    } else if (gachaTab === 'showcase') {
      html += renderGachaShowcaseTab();
    }

    container.innerHTML = html;

    // タブイベント
    container.querySelectorAll('.gacha-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        gachaTab = btn.dataset.gachaTab;
        renderGachaPanel();
      });
    });

    // ガチャボタンイベント
    const btnSingle = container.querySelector('#btn-gacha-single');
    const btnMulti = container.querySelector('#btn-gacha-multi');
    if (btnSingle) {
      btnSingle.addEventListener('click', () => {
        const results = Gacha.pull(1);
        if (!results) return;
        renderGachaResults(results);
        renderStats();
      });
    }
    if (btnMulti) {
      btnMulti.addEventListener('click', () => {
        const results = Gacha.pull(10);
        if (!results) return;
        renderGachaResults(results);
        renderStats();
      });
    }

    // 飾り棚イベント
    if (gachaTab === 'showcase') {
      bindShowcaseEvents(container);
    }

    // コレクション フィルターイベント
    container.querySelectorAll('[data-col-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        gachaCollectionFilter = btn.dataset.colFilter;
        renderGachaPanel();
      });
    });

    // コレクション 牌タップ拡大
    container.querySelectorAll('.gacha-col-tile[data-rarity]').forEach(tile => {
      tile.addEventListener('click', () => {
        const { rarity, color, tile: tileId, count, name } = tile.dataset;
        const cfg = Gacha.RARITY_CONFIG[rarity];
        const colorName = cfg.colorNames[parseInt(color) - 1] || `#${color}`;
        const item = { rarity, colorIndex: parseInt(color), tileId };
        const ZOOM = 3;
        const style = Gacha.getSpriteStyle(item, 40 * ZOOM, 59 * ZOOM);
        const styleStr = Object.entries(style).map(([k,v]) => `${k.replace(/[A-Z]/g,m=>'-'+m.toLowerCase())}:${v}`).join(';');
        const modal = document.getElementById('gacha-zoom-modal');
        modal.querySelector('.gacha-zoom-img').setAttribute('style', styleStr);
        modal.querySelector('.gacha-zoom-name').textContent = name;
        modal.querySelector('.gacha-zoom-detail').textContent = `${cfg.label} / ${colorName} / ×${count}`;
        modal.querySelector('.gacha-zoom-rarity').className = `gacha-zoom-rarity ${cfg.cssClass}`;
        modal.classList.remove('hidden');
      });
    });

    // 飾り棚ピッカー フィルターイベント
    container.querySelectorAll('[data-showcase-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        gachaShowcaseFilter = btn.dataset.showcaseFilter;
        renderGachaPanel();
      });
    });
  }

  function renderGachaPullTab(pts) {
    return `
      <div class="gacha-pull-area">
        <div class="gacha-pull-buttons">
          <button class="btn-gacha-pull" id="btn-gacha-single" ${pts < Gacha.SINGLE_COST ? 'disabled' : ''}>
            1連ガチャ<span class="gacha-cost">${Gacha.SINGLE_COST}pt</span>
          </button>
          <button class="btn-gacha-pull btn-gacha-multi" id="btn-gacha-multi" ${pts < Gacha.MULTI_COST ? 'disabled' : ''}>
            10連ガチャ<span class="gacha-cost">${Gacha.MULTI_COST}pt</span>
          </button>
        </div>
        <div class="gacha-results" id="gacha-results"></div>
      </div>
    `;
  }

  function renderGachaResults(results) {
    const container = document.getElementById('gacha-results');
    if (!container) return;

    // ポイント・ボタン更新
    const pts = Gacha.getPoints();
    const ptsBar = document.querySelector('.gacha-points-bar');
    if (ptsBar) ptsBar.innerHTML = `🪙 <strong>${pts}</strong> pt`;
    const btnS = document.getElementById('btn-gacha-single');
    const btnM = document.getElementById('btn-gacha-multi');
    if (btnS) btnS.disabled = pts < Gacha.SINGLE_COST;
    if (btnM) btnM.disabled = pts < Gacha.MULTI_COST;

    // レアリティ順にソート (secret first)
    const sorted = [...results].sort((a, b) => {
      return Gacha.RARITY_ORDER.indexOf(a.rarity) - Gacha.RARITY_ORDER.indexOf(b.rarity);
    });

    let html = '<div class="gacha-result-cards">';
    for (const item of sorted) {
      const cfg = Gacha.RARITY_CONFIG[item.rarity];
      const name = Gacha.TILE_NAMES[item.tileId] || item.tileId;
      const colorName = cfg.colorNames[item.colorIndex - 1] || `#${item.colorIndex}`;
      const style = Gacha.getSpriteStyle(item, GACHA_TILE_W, GACHA_TILE_H);
      const styleStr = Object.entries(style).map(([k,v]) => `${k.replace(/[A-Z]/g,m=>'-'+m.toLowerCase())}:${v}`).join(';');

      html += `
        <div class="gacha-card ${cfg.cssClass}" style="width:${GACHA_TILE_W}px">
          <div class="gacha-card-rarity">${cfg.label}</div>
          <div class="gacha-card-tile" style="${styleStr}"></div>
          <div class="gacha-card-name">${name}</div>
        </div>`;
    }
    html += '</div>';
    container.innerHTML = html;
  }

  function renderGachaCollectionTab() {
    const col = Gacha.getCollection();
    const total = Gacha.getTotalItemCount();
    const owned = Object.keys(col).length;
    const pct = total > 0 ? (owned / total * 100).toFixed(1) : '0.0';

    // レアリティ別収集率を計算
    const rarityStats = {};
    for (const rarity of Gacha.RARITY_ORDER) {
      const cfg = Gacha.RARITY_CONFIG[rarity];
      const rarityTotal = cfg.colors * Gacha.TILE_ORDER.length;
      let rarityOwned = 0;
      for (let c = 1; c <= cfg.colors; c++) {
        for (const tileId of Gacha.TILE_ORDER) {
          if (col[`${rarity}_${c}_${tileId}`]) rarityOwned++;
        }
      }
      rarityStats[rarity] = { owned: rarityOwned, total: rarityTotal };
    }

    // フィルターボタン
    let html = '<div class="gacha-filter-row">';
    html += `<button class="filter-btn${gachaCollectionFilter === 'all' ? ' active' : ''}" data-col-filter="all">全て</button>`;
    for (const rarity of Gacha.RARITY_ORDER) {
      const cfg = Gacha.RARITY_CONFIG[rarity];
      html += `<button class="filter-btn${gachaCollectionFilter === rarity ? ' active' : ''}" data-col-filter="${rarity}">${cfg.label}</button>`;
    }
    html += '</div>';

    // 収集率表示
    html += '<div class="gacha-collection-header">';
    html += `<div class="gacha-rate-overall">全体: <strong>${owned}</strong> / ${total} 種 (${pct}%)</div>`;
    html += '<div class="gacha-rate-details">';
    for (const rarity of Gacha.RARITY_ORDER) {
      const cfg = Gacha.RARITY_CONFIG[rarity];
      const st = rarityStats[rarity];
      const rPct = st.total > 0 ? (st.owned / st.total * 100).toFixed(1) : '0.0';
      html += `<span class="gacha-rate-item ${cfg.cssClass}">${cfg.label}: ${st.owned}/${st.total} (${rPct}%)</span>`;
    }
    html += '</div></div>';

    html += '<div class="gacha-collection">';

    const displayRarities = gachaCollectionFilter === 'all'
      ? Gacha.RARITY_ORDER
      : [gachaCollectionFilter];

    for (const rarity of displayRarities) {
      const cfg = Gacha.RARITY_CONFIG[rarity];
      const colorCount = cfg.colors;
      const st = rarityStats[rarity];
      const rPct = st.total > 0 ? (st.owned / st.total * 100).toFixed(1) : '0.0';

      html += `<div class="gacha-rarity-section">`;
      html += `<h4 class="gacha-rarity-title ${cfg.cssClass}">${cfg.label} — ${st.owned}/${st.total} (${rPct}%)</h4>`;
      html += `<div class="gacha-rarity-tiles">`;

      for (let c = 1; c <= colorCount; c++) {
        html += `<div class="gacha-color-row">`;
        for (const tileId of Gacha.TILE_ORDER) {
          const key = `${rarity}_${c}_${tileId}`;
          const count = col[key] || 0;
          const name = Gacha.TILE_NAMES[tileId] || tileId;
          const item = { rarity, colorIndex: c, tileId };
          const style = Gacha.getSpriteStyle(item, 40, 59);
          const styleStr = Object.entries(style).map(([k,v]) => `${k.replace(/[A-Z]/g,m=>'-'+m.toLowerCase())}:${v}`).join(';');

          if (count > 0) {
            html += `<div class="gacha-col-tile ${cfg.cssClass}" title="${name} ×${count}"
              data-rarity="${rarity}" data-color="${c}" data-tile="${tileId}" data-count="${count}" data-name="${name}">
              <div class="gacha-col-img" style="${styleStr}"></div>
              <span class="gacha-col-count">${count}</span>
            </div>`;
          } else {
            html += `<div class="gacha-col-tile gacha-col-empty" title="${name} (未取得)">
              <div class="gacha-col-img gacha-col-silhouette" style="${styleStr}"></div>
            </div>`;
          }
        }
        html += `</div>`;
      }

      html += `</div></div>`;
    }

    html += '</div>';
    return html;
  }

  // ========== 飾り棚 ==========

  function renderGachaShowcaseTab() {
    const showcase = Gacha.getShowcase();
    const col = Gacha.getCollection();

    // 飾り棚での使用数カウント（牌keyごと）
    const usedCount = {};
    for (const key of showcase) {
      if (key) usedCount[key] = (usedCount[key] || 0) + 1;
    }

    const filledCount = showcase.filter(k => k).length;

    let html = '<div class="showcase-area">';
    html += `<div class="showcase-label-row">`;
    html += `<span class="showcase-label">${filledCount}/14 枚 · 配置済み牌をクリックで外す</span>`;
    if (filledCount > 0) {
      html += `<button class="btn-showcase-clear" id="btn-showcase-clear">すべてをはずす</button>`;
    }
    html += `</div>`;

    // 行1: 雀頭+1面子 (0-4), 行2: 3面子 (5-13)
    const rows = [[0,1,2,3,4],[5,6,7,8,9,10,11,12,13]];
    for (const rowIndices of rows) {
      html += '<div class="showcase-row">';
      for (const i of rowIndices) {
        const key = showcase[i];
        if (key) {
          const parsed = Gacha.parseItemKey(key);
          const idx = Gacha.TILE_ORDER.indexOf(parsed.tileId);
          let sRow, sCol;
          if (idx < 9)       { sRow = 0; sCol = idx; }
          else if (idx < 18) { sRow = 1; sCol = idx - 9; }
          else if (idx < 27) { sRow = 2; sCol = idx - 18; }
          else               { sRow = 3; sCol = idx - 27; }
          const bgPosX = sCol === 0 ? '0%' : `${(sCol / 8 * 100).toFixed(3)}%`;
          const bgPosY = sRow === 0 ? '0%' : `${(sRow / 3 * 100).toFixed(3)}%`;
          const styleStr = `background-image:url('img/gacha/${parsed.rarity}${parsed.colorIndex}.png');background-size:900% 400%;background-position:${bgPosX} ${bgPosY}`;
          const cfg = Gacha.RARITY_CONFIG[parsed.rarity];
          html += `<div class="showcase-slot showcase-slot-filled ${cfg.cssClass}" data-remove-slot="${i}" title="クリックで外す">
          <div class="showcase-slot-tile" style="${styleStr}"></div>
        </div>`;
        } else {
          html += `<div class="showcase-slot showcase-slot-empty">
          <span class="showcase-slot-plus">+</span>
        </div>`;
        }
      }
      html += '</div>';
    }

    // コレクションから追加するピッカー
    const hasAny = Object.values(col).some(v => v > 0);
    if (!hasAny) {
      html += '<p class="showcase-empty-msg">ガチャを引いて牌を集めましょう！</p>';
    } else if (filledCount >= 14) {
      html += '<p class="showcase-empty-msg">14枚配置済みです。牌を外してから追加してください。</p>';
    } else {
      html += '<div class="showcase-picker-title">➕ 追加する牌を選択（クリックで次の空きへ追加）：</div>';

      // フィルターボタン
      html += '<div class="gacha-filter-row">';
      html += `<button class="filter-btn${gachaShowcaseFilter === 'all' ? ' active' : ''}" data-showcase-filter="all">全て</button>`;
      for (const r of Gacha.RARITY_ORDER) {
        const c2 = Gacha.RARITY_CONFIG[r];
        html += `<button class="filter-btn${gachaShowcaseFilter === r ? ' active' : ''}" data-showcase-filter="${r}">${c2.label}</button>`;
      }
      html += '</div>';

      html += '<div class="showcase-bulk-picker">';

      const showcaseDisplayRarities = gachaShowcaseFilter === 'all'
        ? Gacha.RARITY_ORDER
        : [gachaShowcaseFilter];

      for (const rarity of showcaseDisplayRarities) {
        const cfg = Gacha.RARITY_CONFIG[rarity];
        let hasTiles = false;
        let section = `<div class="showcase-picker-section"><h5 class="${cfg.cssClass}">${cfg.label}</h5><div class="showcase-picker-tiles">`;

        for (let c = 1; c <= cfg.colors; c++) {
          const colorName = cfg.colorNames ? cfg.colorNames[c - 1] : `#${c}`;
          for (const tileId of Gacha.TILE_ORDER) {
            const key = `${rarity}_${c}_${tileId}`;
            const owned = col[key] || 0;
            if (owned <= 0) continue;
            hasTiles = true;
            const used = usedCount[key] || 0;
            const remaining = owned - used;
            const isMaxed = remaining <= 0;
            const item = { rarity, colorIndex: c, tileId };
            const style = Gacha.getSpriteStyle(item, 40, 59);
            const styleStr = Object.entries(style).map(([k,v]) => `${k.replace(/[A-Z]/g,m=>'-'+m.toLowerCase())}:${v}`).join(';');
            const name = Gacha.TILE_NAMES[tileId] || tileId;

            section += `<div class="showcase-picker-tile ${cfg.cssClass}${isMaxed ? ' tile-maxed' : ''}" ${isMaxed ? '' : `data-add-key="${key}"`} title="${colorName} ${name}（残り${remaining}/${owned}枚）">
              <div class="gacha-col-img" style="${styleStr}"></div>
              <span class="showcase-tile-remaining${remaining === 0 ? ' remaining-zero' : ''}">${remaining}</span>
            </div>`;
          }
        }
        section += '</div></div>';
        if (hasTiles) html += section;
      }
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  function bindShowcaseEvents(container) {
    // すべてをはずすボタン
    const clearBtn = container.querySelector('#btn-showcase-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        Gacha.setShowcase(new Array(14).fill(null));
        renderGachaPanel();
      });
    }

    // 配置済みスロットクリック → 外す
    container.querySelectorAll('[data-remove-slot]').forEach(slot => {
      slot.addEventListener('click', () => {
        const idx = parseInt(slot.dataset.removeSlot, 10);
        const showcase = Gacha.getShowcase();
        showcase[idx] = null;
        Gacha.setShowcase(showcase);
        renderGachaPanel();
      });
    });

    // ピッカー牌クリック → 次の空きスロットへ追加
    container.querySelectorAll('[data-add-key]').forEach(tile => {
      tile.addEventListener('click', () => {
        const showcase = Gacha.getShowcase();
        const nextEmpty = showcase.indexOf(null);
        if (nextEmpty === -1) return;
        showcase[nextEmpty] = tile.dataset.addKey;
        Gacha.setShowcase(showcase);
        renderGachaPanel();
      });
    });
  }

  // ========== 手牌入力 ==========

  const CUSTOM_HANDS_KEY = 'chinitsu_custom_hands';
  const MAX_CUSTOM_HANDS = 50;
  const CH_SUIT_PREFIX = { man: 'm', pin: 'p', sou: 's' };
  const CH_WAIT_NAMES = { ryanmen: '両面', kanchan: '嵌張', penchan: '辺張', shanpon: '双碰', tanki: '単騎' };

  let chSuit = 'man';
  let chTiles = Tile.createEmpty();
  let chMeldTiles = Tile.createEmpty();
  let chMeldType = 'none';
  let chInputMode = 'tenpai';   // 'tenpai' | 'iishanten'
  let chDoraIndicator = null;
  let chIsDealer = false;
  let chIsTsumo = false;

  function loadCustomHands() {
    try { return JSON.parse(localStorage.getItem(CUSTOM_HANDS_KEY)) || []; }
    catch { return []; }
  }
  function saveCustomHandsStore(hands) {
    localStorage.setItem(CUSTOM_HANDS_KEY, JSON.stringify(hands));
  }

  // テンパイ: 13枚(門前) / 10枚(副露)  イーシャンテン: 14枚(門前) / 11枚(副露)
  function chExpectedHandCount() {
    if (chInputMode === 'tenpai') return chMeldType === 'none' ? 13 : 10;
    return chMeldType === 'none' ? 14 : 11;
  }

  function chIsComplete() {
    return Tile.count(chTiles) === chExpectedHandCount() &&
      (chMeldType === 'none' || Tile.count(chMeldTiles) === 3);
  }

  function chCombinedAt(i) { return chTiles[i] + chMeldTiles[i]; }

  function chResetAll() {
    chTiles = Tile.createEmpty();
    chMeldTiles = Tile.createEmpty();
  }

  function chMakeTileMini(index, suit) {
    const div = document.createElement('div');
    div.className = `tile-mini ${suit}`;
    const img = document.createElement('img');
    img.src = `img/tiles/${CH_SUIT_PREFIX[suit]}${index + 1}.png`;
    img.alt = String(index + 1);
    img.draggable = false;
    div.appendChild(img);
    return div;
  }

  // quiz.js の renderDecomposition と同等（chMakeTileMini 使用）
  function chRenderDecomposition(decomp, winTile, suit) {
    const container = document.createElement('div');
    container.className = 'decomp-display';

    if (decomp.isChitoitsu) {
      for (const p of decomp.pairs) {
        const grp = document.createElement('div');
        grp.className = 'decomp-group';
        grp.appendChild(chMakeTileMini(p, suit));
        grp.appendChild(chMakeTileMini(p, suit));
        container.appendChild(grp);
      }
      return container;
    }

    // 雀頭
    const headGroup = document.createElement('div');
    headGroup.className = 'decomp-group head-group';
    const h1 = chMakeTileMini(decomp.head, suit);
    const h2 = chMakeTileMini(decomp.head, suit);
    if (winTile !== undefined && decomp.head === winTile) h2.classList.add('decomp-win-tile');
    headGroup.appendChild(h1);
    headGroup.appendChild(h2);
    container.appendChild(headGroup);

    // 面子
    let winHighlighted = false;
    for (const m of decomp.mentsu) {
      const group = document.createElement('div');
      group.className = 'decomp-group';
      if (m.isOpen) group.style.borderBottom = '2px solid #3498db';
      const ts = m.type === 'koutsu'
        ? [m.tile, m.tile, m.tile]
        : [m.tile, m.tile + 1, m.tile + 2];
      for (const t of ts) {
        const el = chMakeTileMini(t, suit);
        if (!winHighlighted && winTile !== undefined && t === winTile) {
          el.classList.add('decomp-win-tile');
          winHighlighted = true;
        }
        group.appendChild(el);
      }
      container.appendChild(group);
    }
    return container;
  }

  function chAddTile(index, toMeld) {
    const arr = toMeld ? chMeldTiles : chTiles;
    const expectedCount = toMeld ? 3 : chExpectedHandCount();
    if (Tile.count(arr) >= expectedCount) return false;
    if (chCombinedAt(index) >= 4) return false;
    arr[index]++;
    return true;
  }

  function chRemoveTile(index, fromMeld) {
    const arr = fromMeld ? chMeldTiles : chTiles;
    if (arr[index] <= 0) return false;
    arr[index]--;
    return true;
  }

  function chMakeBtnGroup(label, options, currentValue, onChange) {
    const group = document.createElement('div');
    group.className = 'setting-group';
    const lbl = document.createElement('label');
    lbl.textContent = label + ':';
    group.appendChild(lbl);
    const btnGrp = document.createElement('div');
    btnGrp.className = 'btn-group';
    for (const { v, l } of options) {
      const btn = document.createElement('button');
      btn.textContent = l;
      if (v === currentValue) btn.classList.add('active');
      btn.addEventListener('click', () => {
        btnGrp.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        onChange(v);
      });
      btnGrp.appendChild(btn);
    }
    group.appendChild(btnGrp);
    return group;
  }

  function chRenderPickerGrid(pid, targetTiles, expectedCount, toMeld) {
    const grid = document.createElement('div');
    grid.className = 'ch-tile-grid';
    grid.id = pid;
    const currentCount = Tile.count(targetTiles);
    for (let i = 0; i < 9; i++) {
      const cnt = targetTiles[i];
      const canAdd = currentCount < expectedCount && chCombinedAt(i) < 4;
      const cell = document.createElement('div');
      cell.className = 'ch-tile-cell';
      cell.dataset.tile = i;
      const addBtn = document.createElement('button');
      addBtn.className = 'ch-tile-btn' + (canAdd ? '' : ' disabled');
      addBtn.disabled = !canAdd;
      addBtn.appendChild(chMakeTileMini(i, chSuit));
      addBtn.addEventListener('click', () => { if (chAddTile(i, toMeld)) chUpdatePickerState(); });
      cell.appendChild(addBtn);
      const countRow = document.createElement('div');
      countRow.className = 'ch-count-row';
      const countEl = document.createElement('span');
      countEl.className = 'ch-tile-count' + (cnt > 0 ? ' has-tiles' : '');
      countEl.textContent = cnt;
      countRow.appendChild(countEl);
      const rmBtn = document.createElement('button');
      rmBtn.className = 'ch-tile-remove-btn';
      rmBtn.textContent = '−';
      rmBtn.style.visibility = cnt > 0 ? 'visible' : 'hidden';
      rmBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (chRemoveTile(i, toMeld)) chUpdatePickerState();
      });
      countRow.appendChild(rmBtn);
      cell.appendChild(countRow);
      grid.appendChild(cell);
    }
    return grid;
  }

  function chUpdatePickerState() {
    function updatePicker(pid, targetTiles, expectedCount) {
      const grid = document.getElementById(pid);
      if (!grid) return;
      const curCount = Tile.count(targetTiles);
      for (let i = 0; i < 9; i++) {
        const cell = grid.querySelector(`[data-tile="${i}"]`);
        if (!cell) continue;
        const cnt = targetTiles[i];
        const canAdd = curCount < expectedCount && chCombinedAt(i) < 4;
        const addBtn = cell.querySelector('.ch-tile-btn');
        if (addBtn) { addBtn.disabled = !canAdd; addBtn.classList.toggle('disabled', !canAdd); }
        const countEl = cell.querySelector('.ch-tile-count');
        if (countEl) { countEl.textContent = cnt; countEl.classList.toggle('has-tiles', cnt > 0); }
        const rmBtn = cell.querySelector('.ch-tile-remove-btn');
        if (rmBtn) rmBtn.style.visibility = cnt > 0 ? 'visible' : 'hidden';
      }
    }
    updatePicker('ch-hand-picker', chTiles, chExpectedHandCount());
    if (chMeldType !== 'none') updatePicker('ch-meld-picker', chMeldTiles, 3);
    const hc = document.getElementById('ch-hand-header-count');
    if (hc) hc.textContent = Tile.count(chTiles);
    const mc = document.getElementById('ch-meld-header-count');
    if (mc) mc.textContent = Tile.count(chMeldTiles);
    // 手牌プレビュー更新
    const display = document.getElementById('ch-hand-display-area');
    if (display) {
      display.innerHTML = '';
      for (let i = 0; i < 9; i++) {
        for (let j = 0; j < chTiles[i]; j++) {
          const el = chMakeTileMini(i, chSuit);
          el.classList.add('ch-preview-tile');
          el.title = 'クリックで削除';
          el.addEventListener('click', ((idx) => () => { chRemoveTile(idx, false); chUpdatePickerState(); })(i));
          display.appendChild(el);
        }
      }
      if (chMeldType !== 'none' && Tile.count(chMeldTiles) > 0) {
        const sep = document.createElement('span');
        sep.className = 'ch-hand-sep';
        display.appendChild(sep);
        for (let i = 0; i < 9; i++) {
          for (let j = 0; j < chMeldTiles[i]; j++) {
            const el = chMakeTileMini(i, chSuit);
            el.classList.add('ch-meld-tile', 'ch-preview-tile');
            el.title = 'クリックで削除';
            el.addEventListener('click', ((idx) => () => { chRemoveTile(idx, true); chUpdatePickerState(); })(i));
            display.appendChild(el);
          }
        }
      }
    }
    const btn = document.getElementById('ch-analyze-btn');
    if (btn) btn.disabled = !chIsComplete();
    const resultArea = document.getElementById('ch-result-area');
    if (resultArea) resultArea.innerHTML = '';
    const saveBtn = document.getElementById('ch-save-btn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '★ この配牌を保存する'; }
  }

  function chRunAnalysis() {
    const tiles = chTiles;
    const meld = chMeldType !== 'none'
      ? { type: chMeldType, tiles: Tile.expand(chMeldTiles) } : null;
    if (meld && meld.type === 'chi') {
      const sorted = meld.tiles.slice().sort((a, b) => a - b);
      if (sorted[1] !== sorted[0] + 1 || sorted[2] !== sorted[1] + 1) {
        return { type: 'invalid', reason: 'chi' };
      }
    }
    const doraIndex = chDoraIndicator != null ? Tile.getDoraIndex(chDoraIndicator) : -1;
    const doraCount = doraIndex >= 0 ? Tile.countDora(tiles, doraIndex, meld) : 0;
    const situation = {
      suit: chSuit, doraIndicator: chDoraIndicator, doraIndex, doraCount, redDoraCount: 0,
      isTsumo: chIsTsumo, isDealer: chIsDealer, isOpen: !!meld,
      meld: meld || null, redFives: 0, meldRedFive: false
    };

    if (chInputMode === 'tenpai') {
      // 13枚(門前) / 10枚(副露) → テンパイ待ち解析
      const waits = meld
        ? Hand.getTenpaiWaitsWithMeld(tiles, meld)
        : Hand.getTenpaiWaits(tiles);
      const remaining = Tile.getRemainingCounts(tiles, meld, chDoraIndicator);
      const filteredWaits = waits.filter(w => remaining[w.tile] > 0);
      if (filteredWaits.length > 0) {
        return { type: 'tenpai', tiles: Tile.copy(tiles), meld, waits: filteredWaits, remaining, situation };
      }
      return { type: 'invalid', reason: 'neither' };
    } else {
      // 14枚(門前) / 11枚(副露) → イーシャンテン打牌解析
      const isAgari = meld ? Hand.isAgariWithMeld(tiles, meld) : Hand.isAgari(tiles);
      if (isAgari) return { type: 'invalid', reason: 'agari' };
      const discards = meld
        ? Hand.findIishantenDiscardsWithMeld(tiles, meld)
        : Hand.findIishantenDiscards(tiles);
      if (discards && discards.length > 0) {
        const discardInfos = discards.map(d => {
          const t = Tile.copy(tiles);
          t[d.discard]--;
          const rem = Tile.getRemainingCounts(t, meld, chDoraIndicator);
          const totalAcc = d.waits.reduce((s, w) => s + Math.max(0, rem[w.tile]), 0);
          return { ...d, remaining: rem, totalAcceptance: totalAcc, tiles13: t };
        });
        discardInfos.sort((a, b) => b.totalAcceptance - a.totalAcceptance || a.discard - b.discard);
        return {
          type: 'iishanten', tiles: Tile.copy(tiles), meld,
          discards: discardInfos, maxAcceptance: discardInfos[0].totalAcceptance, situation
        };
      }
      return { type: 'invalid', reason: 'neither' };
    }
  }

  function renderChResult(result, area) {
    area.innerHTML = '';
    if (result.type === 'invalid') {
      const msgs = {
        chi: 'チーの牌が連続していません（例: 1-2-3, 5-6-7）',
        agari: 'この手牌はすでに和了形です',
        neither: chInputMode === 'tenpai'
          ? 'テンパイではありません。枚数や形を確認してください。'
          : 'この14枚からテンパイになる打牌がありません。'
      };
      area.innerHTML = `<div class="ch-result-error">⚠️ ${msgs[result.reason] || '解析できません'}</div>`;
      return;
    }
    const { situation } = result;
    const suit = chSuit;

    if (result.type === 'tenpai') {
      // ─── 上がり牌サマリー ───
      const summary = document.createElement('div');
      summary.className = 'ch-tile-summary';
      const summaryLabel = document.createElement('div');
      summaryLabel.className = 'ch-summary-label';
      summaryLabel.textContent = '上がり牌';
      summary.appendChild(summaryLabel);
      const summaryTiles = document.createElement('div');
      summaryTiles.className = 'ch-summary-tiles';
      for (const wait of result.waits) {
        const chip = document.createElement('div');
        chip.className = 'ch-summary-chip';
        chip.appendChild(chMakeTileMini(wait.tile, suit));
        const remSpan = document.createElement('span');
        remSpan.className = 'ch-summary-rem';
        remSpan.textContent = `×${result.remaining[wait.tile]}`;
        chip.appendChild(remSpan);
        summaryTiles.appendChild(chip);
      }
      summary.appendChild(summaryTiles);
      const totalRem = result.waits.reduce((s, w) => s + result.remaining[w.tile], 0);
      const totalEl = document.createElement('div');
      totalEl.className = 'ch-summary-total';
      totalEl.textContent = `${result.waits.length}種 ${totalRem}枚`;
      summary.appendChild(totalEl);
      area.appendChild(summary);

      // ─── テンパイ解析結果 ───
      const hdr = document.createElement('div');
      hdr.className = 'ch-result-header';
      const strong = document.createElement('strong');
      strong.textContent = 'テンパイ！';
      hdr.appendChild(strong);
      area.appendChild(hdr);

      for (const wait of result.waits) {
        const yakuResult = Yaku.getBestYaku(result.tiles, result.waits, wait.tile, situation, result.meld);
        const item = document.createElement('div');
        item.className = 'ch-wait-item';

        // ヘッダー: 待ち牌画像 + 残り + 待ち形
        const waitHdr = document.createElement('div');
        waitHdr.className = 'ch-wait-header';
        waitHdr.appendChild(chMakeTileMini(wait.tile, suit));
        const remSpan = document.createElement('span');
        remSpan.className = 'ch-wait-rem';
        remSpan.textContent = `残り${result.remaining[wait.tile]}枚`;
        waitHdr.appendChild(remSpan);
        if (yakuResult && yakuResult.waitType) {
          const wtSpan = document.createElement('span');
          wtSpan.className = 'ch-wait-type';
          wtSpan.textContent = CH_WAIT_NAMES[yakuResult.waitType] || '';
          waitHdr.appendChild(wtSpan);
        }
        item.appendChild(waitHdr);

        // 役・点数・分解（トグル）
        if (yakuResult) {
          const body = document.createElement('div');
          body.className = 'ch-wait-body';
          if (yakuResult.isYakuman) {
            body.innerHTML = '<div class="ch-yaku-line">九蓮宝燈 役満</div>';
          } else {
            for (const y of yakuResult.yakuList) {
              const d = document.createElement('div');
              d.className = 'ch-yaku-line';
              d.textContent = `${y.name} ${y.han}翻`;
              body.appendChild(d);
            }
            if (yakuResult.doraCount > 0) {
              const d = document.createElement('div');
              d.className = 'ch-yaku-line';
              d.textContent = `ドラ ${yakuResult.doraCount}`;
              body.appendChild(d);
            }
            const totEl = document.createElement('div');
            totEl.className = 'ch-yaku-line ch-yaku-total';
            totEl.textContent = `合計 ${yakuResult.totalHan}翻`;
            body.appendChild(totEl);
            const score = Score.calculateScore(yakuResult.totalHan, false,
              { isDealer: situation.isDealer, isTsumo: situation.isTsumo });
            const scoreEl = document.createElement('div');
            scoreEl.className = 'ch-score-text';
            scoreEl.textContent = Score.formatScore(score);
            body.appendChild(scoreEl);
          }
          item.appendChild(body);

          // 面子分解トグル
          const decomps = yakuResult.decomposition
            ? [yakuResult.decomposition]
            : (wait.decompositions
                ? Hand.uniqueDecompositions(wait.decompositions).filter(d => !d.isChitoitsu).slice(0, 3)
                : []);
          if (decomps.length > 0) {
            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'detail-toggle-btn';
            toggleBtn.textContent = '▶ 面子分解を見る';
            const decompArea = document.createElement('div');
            decompArea.style.display = 'none';
            for (const d of decomps) {
              decompArea.appendChild(chRenderDecomposition(d, wait.tile, suit));
            }
            toggleBtn.addEventListener('click', () => {
              const v = decompArea.style.display !== 'none';
              decompArea.style.display = v ? 'none' : 'block';
              toggleBtn.textContent = v ? '▶ 面子分解を見る' : '▼ 面子分解を閉じる';
            });
            item.appendChild(toggleBtn);
            item.appendChild(decompArea);
          }
        }
        area.appendChild(item);
      }

    } else if (result.type === 'iishanten') {
      // ─── テンパイ打牌サマリー ───
      const summary = document.createElement('div');
      summary.className = 'ch-tile-summary';
      const summaryLabel = document.createElement('div');
      summaryLabel.className = 'ch-summary-label';
      summaryLabel.textContent = 'テンパイ打牌';
      summary.appendChild(summaryLabel);
      const summaryTiles = document.createElement('div');
      summaryTiles.className = 'ch-summary-tiles';
      for (const info of result.discards) {
        const isBest = info.totalAcceptance === result.maxAcceptance;
        const chip = document.createElement('div');
        chip.className = 'ch-summary-chip' + (isBest ? ' ch-summary-best' : '');
        chip.appendChild(chMakeTileMini(info.discard, suit));
        const accSpan = document.createElement('span');
        accSpan.className = 'ch-summary-rem';
        accSpan.textContent = `${info.totalAcceptance}枚`;
        chip.appendChild(accSpan);
        summaryTiles.appendChild(chip);
      }
      summary.appendChild(summaryTiles);
      const totalEl = document.createElement('div');
      totalEl.className = 'ch-summary-total';
      totalEl.textContent = `最大受入 ${result.maxAcceptance}枚`;
      summary.appendChild(totalEl);
      area.appendChild(summary);

      // ─── イーシャンテン解析結果 ───
      const hdr = document.createElement('div');
      hdr.className = 'ch-result-header';
      const strong = document.createElement('strong');
      strong.textContent = 'イーシャンテン';
      hdr.appendChild(strong);
      area.appendChild(hdr);

      for (const info of result.discards) {
        const isBest = info.totalAcceptance === result.maxAcceptance;
        const item = document.createElement('div');
        item.className = 'ch-discard-item' + (isBest ? ' ch-discard-best' : '');

        // 打牌ヘッダー: 牌画像 + 受入 + バッジ
        const discardHdr = document.createElement('div');
        discardHdr.className = 'ch-discard-header';
        discardHdr.appendChild(chMakeTileMini(info.discard, suit));
        discardHdr.append(' 切り');
        const accSpan = document.createElement('span');
        accSpan.className = 'ch-discard-acc';
        accSpan.textContent = `${info.totalAcceptance}枚 ${info.waits.length}種`;
        discardHdr.appendChild(accSpan);
        if (isBest) {
          const badge = document.createElement('span');
          badge.className = 'ch-best-badge';
          badge.textContent = '最大受入';
          discardHdr.appendChild(badge);
        }
        item.appendChild(discardHdr);

        // 切り後の手牌ミニ表示
        if (info.tiles13) {
          const handEl = document.createElement('div');
          handEl.className = 'ch-discard-hand';
          for (const t of Tile.expand(info.tiles13)) handEl.appendChild(chMakeTileMini(t, suit));
          if (result.meld) {
            const sep = document.createElement('span');
            sep.className = 'ch-hand-sep';
            handEl.appendChild(sep);
            for (const t of result.meld.tiles) {
              const el = chMakeTileMini(t, suit);
              el.classList.add('ch-meld-tile');
              handEl.appendChild(el);
            }
          }
          item.appendChild(handEl);
        }

        // 待ち牌一覧（画像チップ）
        const waitsLabel = document.createElement('div');
        waitsLabel.className = 'ch-wait-chip-label';
        waitsLabel.textContent = '待ち:';
        item.appendChild(waitsLabel);
        const waitsRow = document.createElement('div');
        waitsRow.className = 'ch-discard-waits';
        for (const w of info.waits) {
          const rem = Math.max(0, info.remaining[w.tile]);
          const chip = document.createElement('div');
          chip.className = 'ch-wait-chip';
          chip.appendChild(chMakeTileMini(w.tile, suit));
          const cntEl = document.createElement('span');
          cntEl.textContent = `×${rem}`;
          chip.appendChild(cntEl);
          waitsRow.appendChild(chip);
        }
        item.appendChild(waitsRow);

        // 各待ち牌の面子分解トグル
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'detail-toggle-btn';
        toggleBtn.textContent = '▶ 詳細を見る';
        const detailDiv = document.createElement('div');
        detailDiv.style.display = 'none';
        for (const w of info.waits) {
          const rem = Math.max(0, info.remaining[w.tile]);
          const entry = document.createElement('div');
          entry.className = 'ch-decomp-entry';
          const entryHdr = document.createElement('div');
          entryHdr.className = 'ch-decomp-entry-hdr';
          entryHdr.appendChild(chMakeTileMini(w.tile, suit));
          const remLbl = document.createElement('span');
          remLbl.className = 'ch-wait-rem';
          remLbl.textContent = `×${rem}`;
          entryHdr.appendChild(remLbl);
          entry.appendChild(entryHdr);
          if (w.decompositions && w.decompositions.length > 0) {
            const decomp = w.decompositions.find(d => !d.isChitoitsu) || w.decompositions[0];
            entry.appendChild(chRenderDecomposition(decomp, w.tile, suit));
          }
          detailDiv.appendChild(entry);
        }
        toggleBtn.addEventListener('click', () => {
          const v = detailDiv.style.display !== 'none';
          detailDiv.style.display = v ? 'none' : 'block';
          toggleBtn.textContent = v ? '▶ 詳細を見る' : '▼ 詳細を閉じる';
        });
        item.appendChild(toggleBtn);
        item.appendChild(detailDiv);
        area.appendChild(item);
      }
    }
  }

  function saveCustomHand() {
    const hands = loadCustomHands();
    const entry = {
      id: Date.now(),
      suit: chSuit,
      inputMode: chInputMode,
      tiles: Tile.copy(chTiles),
      meld: chMeldType !== 'none' ? { type: chMeldType, tiles: Tile.expand(chMeldTiles) } : null,
      doraIndicator: chDoraIndicator,
      isDealer: chIsDealer,
      isTsumo: chIsTsumo,
      savedAt: new Date().toLocaleDateString('ja-JP')
    };
    hands.unshift(entry);
    if (hands.length > MAX_CUSTOM_HANDS) hands.pop();
    saveCustomHandsStore(hands);
    renderChSavedList();
  }

  function loadCustomHand(entry) {
    chSuit = entry.suit;
    chInputMode = entry.inputMode || 'tenpai';
    chTiles = entry.tiles.slice();
    chDoraIndicator = entry.doraIndicator;
    chIsDealer = entry.isDealer;
    chIsTsumo = entry.isTsumo;
    if (entry.meld) {
      chMeldType = entry.meld.type;
      chMeldTiles = Tile.compress(entry.meld.tiles);
    } else {
      chMeldType = 'none';
      chMeldTiles = Tile.createEmpty();
    }
    renderCustomHandPanel();
  }

  function deleteCustomHand(id) {
    saveCustomHandsStore(loadCustomHands().filter(h => h.id !== id));
    renderChSavedList();
  }

  function renderChSavedList() {
    const container = document.getElementById('ch-saved-list');
    if (!container) return;
    const hands = loadCustomHands();
    if (hands.length === 0) {
      container.innerHTML = '<p class="bookmark-empty">保存した配牌はありません<br>'
        + '<small>解析後に保存ボタンで保存できます</small></p>';
      return;
    }
    container.innerHTML = '';
    const SUIT_NAMES = { man: '萬子', pin: '筒子', sou: '索子' };
    const MODE_NAMES = { tenpai: 'テンパイ', iishanten: 'イーシャンテン' };
    for (const h of hands) {
      const item = document.createElement('div');
      item.className = 'ch-saved-item';
      const top = document.createElement('div');
      top.className = 'ch-saved-item-top';
      const info = document.createElement('span');
      info.className = 'ch-saved-info';
      const meldStr = h.meld ? ` (${h.meld.type === 'pon' ? 'ポン' : 'チー'})` : '';
      const modeStr = MODE_NAMES[h.inputMode || 'tenpai'];
      info.textContent = `${SUIT_NAMES[h.suit]}${meldStr} ${modeStr}　${h.isDealer ? '親' : '子'} ${h.isTsumo ? 'ツモ' : 'ロン'}　${h.savedAt}`;
      const actions = document.createElement('div');
      actions.className = 'ch-saved-actions';
      const loadBtn = document.createElement('button');
      loadBtn.className = 'btn-bm-replay';
      loadBtn.textContent = '読み込む';
      loadBtn.addEventListener('click', () => loadCustomHand(h));
      const delBtn = document.createElement('button');
      delBtn.className = 'btn-bm-remove';
      delBtn.textContent = '削除';
      delBtn.addEventListener('click', () => deleteCustomHand(h.id));
      actions.appendChild(loadBtn);
      actions.appendChild(delBtn);
      top.appendChild(info);
      top.appendChild(actions);
      item.appendChild(top);
      const preview = document.createElement('div');
      preview.className = 'ch-saved-preview';
      for (let i = 0; i < 9; i++) {
        for (let j = 0; j < h.tiles[i]; j++) preview.appendChild(chMakeTileMini(i, h.suit));
      }
      if (h.meld) {
        const sep = document.createElement('span');
        sep.className = 'bm-preview-sep';
        preview.appendChild(sep);
        for (const t of h.meld.tiles) preview.appendChild(chMakeTileMini(t, h.suit));
      }
      item.appendChild(preview);
      container.appendChild(item);
    }
  }

  function renderCustomHandPanel() {
    const container = document.getElementById('custom-hand-content');
    if (!container) return;
    container.innerHTML = '';

    // ─── 入力モード & 牌種 & 副露 設定 ───
    const settings = document.createElement('div');
    settings.className = 'ch-settings';
    settings.appendChild(chMakeBtnGroup('解析形',
      [{ v: 'tenpai', l: 'テンパイ形' }, { v: 'iishanten', l: 'イーシャンテン形' }],
      chInputMode, v => {
        chInputMode = v;
        chResetAll();
        renderCustomHandPanel();
      }));
    settings.appendChild(chMakeBtnGroup('牌種',
      [{ v: 'man', l: '萬子' }, { v: 'sou', l: '索子' }, { v: 'pin', l: '筒子' }],
      chSuit, v => { chSuit = v; chResetAll(); renderCustomHandPanel(); }));
    settings.appendChild(chMakeBtnGroup('副露',
      [{ v: 'none', l: 'なし' }, { v: 'pon', l: 'ポン' }, { v: 'chi', l: 'チー' }],
      chMeldType, v => {
        chMeldType = v;
        chMeldTiles = Tile.createEmpty();
        if (Tile.count(chTiles) > chExpectedHandCount()) chTiles = Tile.createEmpty();
        renderCustomHandPanel();
      }));
    settings.appendChild(chMakeBtnGroup('あがり',
      [{ v: 'ron', l: 'ロン' }, { v: 'tsumo', l: 'ツモ' }],
      chIsTsumo ? 'tsumo' : 'ron', v => { chIsTsumo = v === 'tsumo'; renderCustomHandPanel(); }));
    settings.appendChild(chMakeBtnGroup('自分',
      [{ v: 'ko', l: '子' }, { v: 'oya', l: '親' }],
      chIsDealer ? 'oya' : 'ko', v => { chIsDealer = v === 'oya'; renderCustomHandPanel(); }));
    container.appendChild(settings);

    // 説明文
    const modeHint = document.createElement('div');
    modeHint.className = 'mode-hint';
    const handCount = chExpectedHandCount();
    const meldCount = chMeldType !== 'none' ? ' + 副露3枚' : '';
    modeHint.textContent = chInputMode === 'tenpai'
      ? `テンパイ形: 手牌${handCount}枚${meldCount}を入力→待ち牌・役・打点を表示`
      : `イーシャンテン形: 手牌${handCount}枚${meldCount}を入力→最適打牌・受入枚数を表示`;
    container.appendChild(modeHint);

    // ─── ドラ表示牌 ───
    const doraSection = document.createElement('div');
    doraSection.className = 'ch-dora-section';
    const doraLabelRow = document.createElement('div');
    doraLabelRow.className = 'ch-dora-label-row';
    const doraLbl = document.createElement('span');
    doraLbl.textContent = 'ドラ表示牌:';
    doraLabelRow.appendChild(doraLbl);
    if (chDoraIndicator != null) {
      doraLabelRow.appendChild(chMakeTileMini(chDoraIndicator, chSuit));
    }
    doraSection.appendChild(doraLabelRow);
    const doraRow = document.createElement('div');
    doraRow.className = 'ch-dora-row';
    const noneDBtn = document.createElement('button');
    noneDBtn.className = 'ch-dora-btn' + (chDoraIndicator === null ? ' active' : '');
    noneDBtn.textContent = 'なし';
    noneDBtn.addEventListener('click', () => { chDoraIndicator = null; renderCustomHandPanel(); });
    doraRow.appendChild(noneDBtn);
    for (let i = 0; i < 9; i++) {
      const btn = document.createElement('button');
      btn.className = 'ch-dora-tile-btn' + (chDoraIndicator === i ? ' active' : '');
      btn.appendChild(chMakeTileMini(i, chSuit));
      btn.addEventListener('click', () => { chDoraIndicator = i; renderCustomHandPanel(); });
      doraRow.appendChild(btn);
    }
    doraSection.appendChild(doraRow);
    container.appendChild(doraSection);

    // ─── 手牌入力ピッカー ───
    const handSection = document.createElement('div');
    handSection.className = 'ch-input-section';
    const handHeader = document.createElement('div');
    handHeader.className = 'ch-input-header';
    const handCountSpan = document.createElement('span');
    handCountSpan.innerHTML = `手牌: <strong id="ch-hand-header-count">${Tile.count(chTiles)}</strong>/${chExpectedHandCount()}枚`;
    handHeader.appendChild(handCountSpan);
    const clearBtn = document.createElement('button');
    clearBtn.className = 'ch-clear-btn';
    clearBtn.textContent = 'リセット';
    clearBtn.addEventListener('click', () => { chResetAll(); chUpdatePickerState(); });
    handHeader.appendChild(clearBtn);
    handSection.appendChild(handHeader);
    handSection.appendChild(chRenderPickerGrid('ch-hand-picker', chTiles, chExpectedHandCount(), false));
    container.appendChild(handSection);

    // ─── 副露牌ピッカー ───
    if (chMeldType !== 'none') {
      const meldSection = document.createElement('div');
      meldSection.className = 'ch-input-section';
      const meldHeader = document.createElement('div');
      meldHeader.className = 'ch-input-header';
      const meldName = chMeldType === 'pon' ? 'ポン' : 'チー（連続3枚）';
      meldHeader.innerHTML = `副露牌 (${meldName}): <strong id="ch-meld-header-count">${Tile.count(chMeldTiles)}</strong>/3枚`;
      meldSection.appendChild(meldHeader);
      meldSection.appendChild(chRenderPickerGrid('ch-meld-picker', chMeldTiles, 3, true));
      container.appendChild(meldSection);
    }

    // ─── 手牌プレビュー ───
    const handDisplayWrapper = document.createElement('div');
    handDisplayWrapper.className = 'ch-hand-display-section';
    const handDisplayArea = document.createElement('div');
    handDisplayArea.id = 'ch-hand-display-area';
    handDisplayArea.className = 'ch-hand-display';
    for (let i = 0; i < 9; i++) {
      for (let j = 0; j < chTiles[i]; j++) {
        const el = chMakeTileMini(i, chSuit);
        el.classList.add('ch-preview-tile');
        el.title = 'クリックで削除';
        el.addEventListener('click', ((idx) => () => { chRemoveTile(idx, false); chUpdatePickerState(); })(i));
        handDisplayArea.appendChild(el);
      }
    }
    if (chMeldType !== 'none' && Tile.count(chMeldTiles) > 0) {
      const sep = document.createElement('span');
      sep.className = 'ch-hand-sep';
      handDisplayArea.appendChild(sep);
      for (let i = 0; i < 9; i++) {
        for (let j = 0; j < chMeldTiles[i]; j++) {
          const el = chMakeTileMini(i, chSuit);
          el.classList.add('ch-meld-tile', 'ch-preview-tile');
          el.title = 'クリックで削除';
          el.addEventListener('click', ((idx) => () => { chRemoveTile(idx, true); chUpdatePickerState(); })(i));
          handDisplayArea.appendChild(el);
        }
      }
    }
    handDisplayWrapper.appendChild(handDisplayArea);
    container.appendChild(handDisplayWrapper);

    // ─── 解析ボタン ───
    const analyzeBtn = document.createElement('button');
    analyzeBtn.id = 'ch-analyze-btn';
    analyzeBtn.className = 'btn-ch-analyze';
    analyzeBtn.disabled = !chIsComplete();
    analyzeBtn.textContent = '解析する';
    container.appendChild(analyzeBtn);

    // ─── 保存ボタン (解析ボタン直下に常時表示、解析前はdisabled) ───
    const saveBtn = document.createElement('button');
    saveBtn.id = 'ch-save-btn';
    saveBtn.className = 'ch-save-btn';
    saveBtn.textContent = '★ この配牌を保存する';
    saveBtn.disabled = true;
    saveBtn.addEventListener('click', () => {
      saveCustomHand();
      saveBtn.textContent = '✅ 保存しました';
      saveBtn.disabled = true;
    });
    container.appendChild(saveBtn);

    // ─── 結果エリア ───
    const resultArea = document.createElement('div');
    resultArea.id = 'ch-result-area';
    resultArea.className = 'ch-result-area';
    container.appendChild(resultArea);

    // 解析ボタン クリック
    analyzeBtn.addEventListener('click', () => {
      const result = chRunAnalysis();
      renderChResult(result, resultArea);
      if (result.type !== 'invalid') {
        saveBtn.textContent = '★ この配牌を保存する';
        saveBtn.disabled = false;
      }
    });
  }


  // ========== 初期化 ==========
  initLeaderboard();
  renderStats();
  updateGameTypeUI();
});
