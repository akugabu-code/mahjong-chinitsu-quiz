// quiz.js - クイズUIロジック

const Quiz = (() => {

  const SUIT_LABELS = {
    man: { numbers: ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'], suffix: '萬' },
    pin: { numbers: ['', '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'], suffix: '' },
    sou: { numbers: ['', '１', '２', '３', '４', '５', '６', '７', '８', '９'], suffix: '' }
  };

  const WAIT_TYPE_NAMES = {
    ryanmen: '両面',
    kanchan: '嵌張',
    penchan: '辺張',
    shanpon: '双碰',
    tanki: '単騎'
  };

  let currentProblem = null;
  let selectedWaits = new Set();
  let selectedDiscard = -1;
  let answered = false;

  // ========== 牌画像パス ==========
  const SUIT_PREFIX = { man: 'm', pin: 'p', sou: 's' };

  function tileImgSrc(tileIndex, suit, isRed) {
    const num = isRed ? 0 : Tile.toNumber(tileIndex);
    return 'img/tiles/' + SUIT_PREFIX[suit] + num + '.png';
  }

  // ========== 牌DOM生成 ==========

  function createTileElement(tileIndex, suit, options = {}) {
    const el = document.createElement('div');
    el.className = 'tile ' + suit;
    if (options.small) el.classList.add('tile-small');
    if (options.sideways) el.classList.add('sideways');
    if (options.clickable) el.classList.add('clickable');
    if (options.className) el.classList.add(options.className);

    const img = document.createElement('img');
    img.src = tileImgSrc(tileIndex, suit, options.isRed);
    img.alt = tileText(tileIndex, suit);
    img.draggable = false;
    el.appendChild(img);

    el.dataset.tileIndex = tileIndex;
    if (options.isRed) el.dataset.isRed = '1';
    return el;
  }

  function createMiniTileElement(tileIndex, suit, isRed) {
    const el = document.createElement('div');
    el.className = 'tile-mini ' + suit;
    const img = document.createElement('img');
    img.src = tileImgSrc(tileIndex, suit, isRed);
    img.alt = tileText(tileIndex, suit);
    img.draggable = false;
    el.appendChild(img);
    return el;
  }

  // 牌のテキスト表示（結果表示用）
  function tileText(tileIndex, suit) {
    const num = Tile.toNumber(tileIndex);
    const labels = SUIT_LABELS[suit];
    return labels.numbers[num] + labels.suffix;
  }

  // ========== 状況表示 ==========

  function renderSituation(problem) {
    const bar = document.getElementById('situation-bar');
    bar.innerHTML = '';

    const suit = problem.situation.suit;

    // あがり
    const agariEl = document.createElement('div');
    agariEl.className = 'situation-item';
    agariEl.innerHTML = `<span class="situation-label">あがり:</span><span class="situation-value">${problem.situation.isTsumo ? 'ツモ' : 'ロン'}</span>`;
    bar.appendChild(agariEl);

    // 副露（ある場合）
    if (problem.isOpen) {
      const openEl = document.createElement('div');
      openEl.className = 'situation-item';
      openEl.innerHTML = `<span class="situation-label">副露:</span><span class="situation-value">${problem.meld.type === 'pon' ? 'ポン' : 'チー'}</span>`;
      bar.appendChild(openEl);
    }

    // 自分
    const selfEl = document.createElement('div');
    selfEl.className = 'situation-item';
    selfEl.innerHTML = `<span class="situation-label">自分:</span><span class="situation-value">${problem.situation.isDealer ? '親' : '子'}</span>`;
    bar.appendChild(selfEl);

    // ドラ表示（牌画像）
    const doraEl = document.createElement('div');
    doraEl.className = 'situation-item';
    doraEl.innerHTML = '<span class="situation-label">ドラ表示:</span>';
    const doraValEl = document.createElement('span');
    doraValEl.className = 'situation-value situation-dora-tile';
    doraValEl.appendChild(createMiniTileElement(problem.situation.doraIndicator, suit));
    doraEl.appendChild(doraValEl);
    bar.appendChild(doraEl);
  }

  // ========== 手牌表示 ==========

  function renderHand(problem) {
    const area = document.getElementById('hand-area');
    area.innerHTML = '';

    const suit = problem.situation.suit;
    const isIishanten = problem.type === 'iishanten';
    const expanded = Tile.expand(problem.tiles);

    // 手牌を表示（赤五の追跡）
    let redFiveCount = problem.situation.redFives || 0;
    for (const tileIdx of expanded) {
      const isRed = (tileIdx === 4 && redFiveCount > 0);
      if (isRed) redFiveCount--;
      const el = createTileElement(tileIdx, suit, {
        clickable: isIishanten && !answered,
        isRed
      });

      if (isIishanten && !answered) {
        el.addEventListener('click', () => handleDiscardClick(tileIdx, el));
      }

      area.appendChild(el);
    }

    // 副露面子がある場合、区切り＋副露面子を表示
    if (problem.meld) {
      const sep = document.createElement('div');
      sep.className = 'meld-separator';
      area.appendChild(sep);

      const meldTiles = problem.meld.tiles.slice();
      let meldRedFive = problem.situation.meldRedFive || false;
      for (let i = 0; i < meldTiles.length; i++) {
        const isRed = (meldTiles[i] === 4 && meldRedFive);
        if (isRed) meldRedFive = false;
        const el = createTileElement(meldTiles[i], suit, {
          sideways: i === 0,
          isRed
        });
        area.appendChild(el);
      }
    }
  }

  // ========== テンパイモード: 待ち選択 ==========

  function renderWaitSelection(problem) {
    const section = document.getElementById('wait-selection');
    const container = document.getElementById('wait-tiles');
    container.innerHTML = '';

    if (problem.type !== 'tenpai') {
      section.style.display = 'none';
      return;
    }

    section.style.display = 'block';
    const suit = problem.situation.suit;

    for (let i = 0; i < 9; i++) {
      const el = createTileElement(i, suit, { small: true, clickable: !answered });

      if (!answered) {
        el.addEventListener('click', () => {
          if (answered) return;
          const idx = i;
          if (selectedWaits.has(idx)) {
            selectedWaits.delete(idx);
            el.classList.remove('selected-wait');
          } else {
            selectedWaits.add(idx);
            el.classList.add('selected-wait');
          }
        });
      }

      container.appendChild(el);
    }
  }

  // ========== イーシャンテンモード: 打牌選択 ==========

  function handleDiscardClick(tileIndex, clickedEl) {
    if (answered) return;

    const area = document.getElementById('hand-area');
    const tiles = area.querySelectorAll('.tile.clickable');

    // 同じ牌をもう一度クリックで解除
    if (selectedDiscard === tileIndex && clickedEl.classList.contains('selected-discard')) {
      clickedEl.classList.remove('selected-discard');
      selectedDiscard = -1;
      return;
    }

    // 全選択解除
    tiles.forEach(t => t.classList.remove('selected-discard'));

    // 新しい選択
    clickedEl.classList.add('selected-discard');
    selectedDiscard = tileIndex;
  }

  // ========== 答え合わせ ==========

  function checkAnswer() {
    if (answered) return null;
    if (!currentProblem) return null;

    let result;
    if (currentProblem.type === 'tenpai') {
      result = checkTenpaiAnswer();
    } else {
      result = checkIishantenAnswer();
    }

    answered = true;
    document.getElementById('btn-check').style.display = 'none';
    document.getElementById('btn-next').style.display = 'block';
    return result;
  }

  function checkTenpaiAnswer() {
    const problem = currentProblem;
    const suit = problem.situation.suit;
    const correctWaits = new Set(problem.waits.map(w => w.tile));
    const resultArea = document.getElementById('result-area');
    resultArea.innerHTML = '';
    resultArea.classList.add('visible');

    // 正誤判定
    let correct = 0;
    let total = correctWaits.size;
    const wrongSelections = [];
    const missedSelections = [];

    for (const w of selectedWaits) {
      if (correctWaits.has(w)) {
        correct++;
      } else {
        wrongSelections.push(w);
      }
    }
    for (const w of correctWaits) {
      if (!selectedWaits.has(w)) {
        missedSelections.push(w);
      }
    }

    // サマリー
    const summaryDiv = document.createElement('div');
    summaryDiv.className = 'result-summary';
    if (correct === total && wrongSelections.length === 0) {
      const line = document.createElement('div');
      line.className = 'perfect';
      line.textContent = `完璧！ 全${total}種の待ちを正解！`;
      summaryDiv.appendChild(line);
    } else {
      const line = document.createElement('div');
      line.className = 'score-line';
      line.textContent = `正解: ${correct}/${total}種`
        + (wrongSelections.length > 0 ? ` (誤選択: ${wrongSelections.length}種)` : '');
      summaryDiv.appendChild(line);
    }
    // 正解牌を画像で並べて表示
    const correctTilesRow = document.createElement('div');
    correctTilesRow.className = 'result-correct-tiles';
    for (const w of problem.waits) {
      correctTilesRow.appendChild(createMiniTileElement(w.tile, suit));
    }
    summaryDiv.appendChild(correctTilesRow);
    resultArea.appendChild(summaryDiv);

    // 待ち選択エリアの牌に色付け
    const waitTileEls = document.getElementById('wait-tiles').querySelectorAll('.tile');
    waitTileEls.forEach(el => {
      const idx = parseInt(el.dataset.tileIndex);
      el.classList.remove('clickable');
      if (correctWaits.has(idx) && selectedWaits.has(idx)) {
        el.classList.add('result-correct');
      } else if (selectedWaits.has(idx) && !correctWaits.has(idx)) {
        el.classList.add('result-wrong');
      } else if (correctWaits.has(idx) && !selectedWaits.has(idx)) {
        el.classList.add('result-missed');
      }
    });

    // 詳細タブ
    const detailToggle = document.createElement('button');
    detailToggle.className = 'detail-toggle-btn';
    detailToggle.textContent = '▶ 詳細を見る';
    resultArea.appendChild(detailToggle);

    const detailDiv = document.createElement('div');
    detailDiv.className = 'result-detail';
    detailDiv.style.display = 'none';

    detailToggle.addEventListener('click', () => {
      const visible = detailDiv.style.display !== 'none';
      detailDiv.style.display = visible ? 'none' : 'block';
      detailToggle.textContent = visible ? '▶ 詳細を見る' : '▼ 詳細を閉じる';
    });

    const remaining = problem.remaining;

    for (const wait of problem.waits) {
      const item = document.createElement('div');
      item.className = 'wait-result-item';

      const wasSelected = selectedWaits.has(wait.tile);
      const mark = wasSelected ? '✅' : '⚠️';

      // 役判定
      const yakuResult = Yaku.getBestYaku(
        problem.tiles, problem.waits, wait.tile,
        problem.situation, problem.meld
      );

      let scoreText = '';
      let yakuLines = '';
      if (yakuResult) {
        if (yakuResult.isYakuman) {
          scoreText = '役満';
          yakuLines = '<div class="yaku-line">九蓮宝燈 (役満)</div>';
        } else {
          const scoreResult = Score.calculateScore(
            yakuResult.totalHan,
            false,
            { isDealer: problem.situation.isDealer, isTsumo: problem.situation.isTsumo }
          );
          scoreText = Score.formatScore(scoreResult);
          yakuLines = yakuResult.yakuList
            .map(y => `<div class="yaku-line">${y.name} ${y.han}翻</div>`)
            .join('');
          if (yakuResult.doraCount > 0) {
            yakuLines += `<div class="yaku-line">ドラ ${yakuResult.doraCount}</div>`;
          }
          if (yakuResult.redDoraCount > 0) {
            yakuLines += `<div class="yaku-line">赤ドラ ${yakuResult.redDoraCount}</div>`;
          }
          yakuLines += `<div class="yaku-line">合計 ${yakuResult.totalHan}翻</div>`;
        }
      }

      const waitType = yakuResult ? WAIT_TYPE_NAMES[yakuResult.waitType] || '' : '';

      // ヘッダーをDOM構築（牌画像使用）
      const header = document.createElement('div');
      header.className = 'wait-result-header';
      const markSpan = document.createElement('span');
      markSpan.className = 'mark';
      markSpan.textContent = mark;
      header.appendChild(markSpan);
      header.appendChild(createMiniTileElement(wait.tile, suit));
      const remSpan = document.createElement('span');
      remSpan.className = 'remaining-count';
      remSpan.textContent = `(残り${remaining[wait.tile]}枚)`;
      header.appendChild(remSpan);
      if (waitType) {
        const wtSpan = document.createElement('span');
        wtSpan.className = 'remaining-count';
        wtSpan.textContent = waitType;
        header.appendChild(wtSpan);
      }

      item.appendChild(header);

      const body = document.createElement('div');
      body.className = 'wait-result-body';
      body.innerHTML = yakuLines + `<div class="score-text">${scoreText}</div>`;
      item.appendChild(body);

      // 分解表示
      if (yakuResult && yakuResult.decomposition && !yakuResult.decomposition.isChitoitsu) {
        const decompEl = renderDecomposition(yakuResult.decomposition, wait.tile, suit);
        body.appendChild(decompEl);
      }

      detailDiv.appendChild(item);
    }

    resultArea.appendChild(detailDiv);

    return { isCorrect: correct === total && wrongSelections.length === 0 };
  }

  function checkIishantenAnswer() {
    const problem = currentProblem;
    const suit = problem.situation.suit;
    const resultArea = document.getElementById('result-area');
    resultArea.innerHTML = '';
    resultArea.classList.add('visible');

    const correctDiscards = problem.discards;
    const allDiscardSet = new Set(correctDiscards.map(d => d.discard));

    // 最大受入枚数を計算
    let maxAcceptance = 0;
    const discardInfos = correctDiscards.map(d => {
      const di = problem.situation.doraIndicator;
      const remaining = problem.isOpen
        ? Tile.getRemainingCounts((() => { const t = Tile.copy(problem.tiles); t[d.discard]--; return t; })(), problem.meld, di)
        : Tile.getRemainingCounts((() => { const t = Tile.copy(problem.tiles); t[d.discard]--; return t; })(), null, di);
      const totalAcceptance = d.waits.reduce((sum, w) => sum + Math.max(0, remaining[w.tile]), 0);
      maxAcceptance = Math.max(maxAcceptance, totalAcceptance);
      return { ...d, remaining, totalAcceptance };
    });

    // 最大受入の打牌のみ正解
    const bestDiscardSet = new Set(
      discardInfos.filter(d => d.totalAcceptance === maxAcceptance).map(d => d.discard)
    );
    const isCorrect = bestDiscardSet.has(selectedDiscard);
    const isTenpaiButNotBest = !isCorrect && allDiscardSet.has(selectedDiscard);

    // サマリー
    const summaryDiv = document.createElement('div');
    summaryDiv.className = 'result-summary';

    if (selectedDiscard < 0) {
      summaryDiv.innerHTML = '<div class="score-line">牌を選択していません</div>';
    } else {
      const msgDiv = document.createElement('div');
      msgDiv.style.cssText = 'display:flex;align-items:center;gap:4px;flex-wrap:wrap;';
      if (isCorrect) {
        msgDiv.className = 'perfect';
        msgDiv.append('正解！');
        msgDiv.appendChild(createMiniTileElement(selectedDiscard, suit));
        msgDiv.append('切りは最大受入！');
      } else if (isTenpaiButNotBest) {
        msgDiv.className = 'score-line';
        msgDiv.style.color = 'var(--warning)';
        msgDiv.appendChild(createMiniTileElement(selectedDiscard, suit));
        msgDiv.append('切りでテンパイできますが、最大受入ではありません');
      } else {
        msgDiv.className = 'score-line';
        msgDiv.style.color = 'var(--error)';
        msgDiv.appendChild(createMiniTileElement(selectedDiscard, suit));
        msgDiv.append('切りではテンパイになりません');
      }
      summaryDiv.appendChild(msgDiv);
    }
    resultArea.appendChild(summaryDiv);

    // 手牌のclickable解除
    const handTiles = document.getElementById('hand-area').querySelectorAll('.tile.clickable');
    handTiles.forEach(el => {
      el.classList.remove('clickable');
      const idx = parseInt(el.dataset.tileIndex);
      if (bestDiscardSet.has(idx)) {
        el.classList.add('result-correct');
      }
    });

    // サマリーに最大受入の打牌を画像で表示
    const bestTilesRow = document.createElement('div');
    bestTilesRow.className = 'result-correct-tiles';
    const bestDiscards = discardInfos.filter(d => d.totalAcceptance === maxAcceptance);
    for (const d of bestDiscards) {
      bestTilesRow.appendChild(createMiniTileElement(d.discard, suit));
    }
    summaryDiv.appendChild(bestTilesRow);

    // 詳細タブ
    const detailToggle = document.createElement('button');
    detailToggle.className = 'detail-toggle-btn';
    detailToggle.textContent = '▶ 詳細を見る';
    resultArea.appendChild(detailToggle);

    const detailDiv = document.createElement('div');
    detailDiv.className = 'result-detail';
    detailDiv.style.display = 'none';

    detailToggle.addEventListener('click', () => {
      const visible = detailDiv.style.display !== 'none';
      detailDiv.style.display = visible ? 'none' : 'block';
      detailToggle.textContent = visible ? '▶ 詳細を見る' : '▼ 詳細を閉じる';
    });

    for (const info of discardInfos) {
      const item = document.createElement('div');
      item.className = 'discard-result-item';
      if (info.totalAcceptance === maxAcceptance) {
        item.classList.add('best-discard');
      }

      // ヘッダー
      const headerEl = document.createElement('div');
      headerEl.className = 'discard-header';
      headerEl.appendChild(createMiniTileElement(info.discard, suit));
      headerEl.append(' 切り');
      const acceptEl = document.createElement('span');
      acceptEl.className = 'discard-acceptance';
      acceptEl.textContent = `${info.totalAcceptance}枚 (${info.waits.length}種)`;
      headerEl.appendChild(acceptEl);
      if (info.totalAcceptance === maxAcceptance) {
        const badge = document.createElement('span');
        badge.className = 'best-badge';
        badge.textContent = '最大受入';
        headerEl.appendChild(badge);
      }
      item.appendChild(headerEl);

      // テンパイ手牌（切り後）のミニ表示
      const tiles13 = Tile.copy(problem.tiles);
      tiles13[info.discard]--;
      const tenpaiHandEl = document.createElement('div');
      tenpaiHandEl.className = 'discard-tenpai-hand';
      let rfCount = problem.situation.redFives || 0;
      if (info.discard === 4 && rfCount > 0 && tiles13[4] === 0) rfCount = 0;
      for (const t of Tile.expand(tiles13)) {
        const isR = (t === 4 && rfCount > 0);
        if (isR) rfCount--;
        tenpaiHandEl.appendChild(createMiniTileElement(t, suit, isR));
      }
      item.appendChild(tenpaiHandEl);

      // 待ち牌ごとに: チップ + 面子分解を縦に並べる
      const waitsLabelEl = document.createElement('div');
      waitsLabelEl.className = 'discard-wait-label';
      waitsLabelEl.textContent = '待ち:';
      item.appendChild(waitsLabelEl);
      const waitsListEl = document.createElement('div');
      waitsListEl.className = 'discard-waits-list';
      for (const w of info.waits) {
        const rem = Math.max(0, info.remaining[w.tile]);
        const waitEntryEl = document.createElement('div');
        waitEntryEl.className = 'discard-wait-entry';
        // チップ（牌画像 + 残り枚数）
        const chip = document.createElement('div');
        chip.className = 'discard-wait-chip';
        chip.appendChild(createMiniTileElement(w.tile, suit));
        const countEl = document.createElement('span');
        countEl.className = 'discard-wait-count';
        countEl.textContent = `×${rem}`;
        chip.appendChild(countEl);
        waitEntryEl.appendChild(chip);
        // 面子分解（最初の非七対子分解）
        if (w.decompositions && w.decompositions.length > 0) {
          const decomp = w.decompositions.find(d => !d.isChitoitsu) || null;
          if (decomp) {
            const decompEl = renderDecomposition(decomp, w.tile, suit);
            decompEl.classList.add('discard-wait-decomp');
            waitEntryEl.appendChild(decompEl);
          }
        }
        waitsListEl.appendChild(waitEntryEl);
      }
      item.appendChild(waitsListEl);

      detailDiv.appendChild(item);
    }

    resultArea.appendChild(detailDiv);
    return { isCorrect };
  }

  // ========== 面子分解の表示 ==========

  function renderDecomposition(decomp, winTile, suit) {
    const container = document.createElement('div');
    container.className = 'decomp-display';

    // 雀頭
    const headGroup = document.createElement('div');
    headGroup.className = 'decomp-group head-group';
    const h1 = createMiniTileElement(decomp.head, suit);
    const h2 = createMiniTileElement(decomp.head, suit);
    if (decomp.head === winTile) {
      // 単騎待ちの場合、雀頭の一枚をハイライト
      const headCount = 2;
      const needHighlight = true;
      if (needHighlight) h2.classList.add('decomp-win-tile');
    }
    headGroup.appendChild(h1);
    headGroup.appendChild(h2);
    container.appendChild(headGroup);

    // 面子
    let winHighlighted = false;
    for (const m of decomp.mentsu) {
      const group = document.createElement('div');
      group.className = 'decomp-group';
      if (m.isOpen) group.style.borderBottom = '2px solid #3498db';

      const tiles = [];
      if (m.type === 'koutsu') {
        tiles.push(m.tile, m.tile, m.tile);
      } else {
        tiles.push(m.tile, m.tile + 1, m.tile + 2);
      }

      for (const t of tiles) {
        const el = createMiniTileElement(t, suit);
        if (!winHighlighted && t === winTile) {
          el.classList.add('decomp-win-tile');
          winHighlighted = true;
        }
        group.appendChild(el);
      }
      container.appendChild(group);
    }

    return container;
  }

  // ========== 手牌プレビュー（ブックマーク用） ==========

  function renderHandPreview(tiles, meld, suit, redFives, meldRedFive) {
    const container = document.createElement('div');
    container.className = 'bm-preview';

    let rfCount = redFives || 0;
    for (const t of Tile.expand(tiles)) {
      const isR = (t === 4 && rfCount > 0);
      if (isR) rfCount--;
      container.appendChild(createMiniTileElement(t, suit, isR));
    }

    if (meld) {
      const sep = document.createElement('span');
      sep.className = 'bm-preview-sep';
      container.appendChild(sep);
      let mrf = meldRedFive || false;
      for (let i = 0; i < meld.tiles.length; i++) {
        const isR = (meld.tiles[i] === 4 && mrf);
        if (isR) mrf = false;
        const el = createMiniTileElement(meld.tiles[i], suit, isR);
        if (i === 0) el.classList.add('bm-preview-sideways');
        container.appendChild(el);
      }
    }

    return container;
  }

  // ========== 公開API ==========

  function startProblem(problem) {
    currentProblem = problem;
    selectedWaits = new Set();
    selectedDiscard = -1;
    answered = false;

    document.getElementById('quiz-area').classList.add('visible');
    document.getElementById('result-area').classList.remove('visible');
    document.getElementById('result-area').innerHTML = '';
    document.getElementById('btn-check').style.display = 'block';
    document.getElementById('btn-next').style.display = 'none';
    const btnBm = document.getElementById('btn-bookmark');
    if (btnBm) { btnBm.style.display = 'none'; btnBm.disabled = false; btnBm.textContent = '★ 保存する'; }

    renderSituation(problem);
    renderHand(problem);
    renderWaitSelection(problem);
  }

  function reset() {
    currentProblem = null;
    selectedWaits = new Set();
    selectedDiscard = -1;
    answered = false;
    document.getElementById('quiz-area').classList.remove('visible');
  }

  function getCurrentProblem() {
    return currentProblem;
  }

  return {
    startProblem,
    checkAnswer,
    reset,
    getCurrentProblem,
    renderHandPreview,
    tileText,
    WAIT_TYPE_NAMES
  };
})();
