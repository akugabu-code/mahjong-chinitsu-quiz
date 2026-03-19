// generator.js - 問題生成＋難易度フィルター

const Generator = (() => {

  const MAX_ATTEMPTS = 500;

  // 難易度フィルター定義（待ち種類数 / 有効打種類数）
  const DIFFICULTY = {
    easy:   { minWaits: 1, maxWaits: 2, minDiscards: 1, maxDiscards: 2 },
    medium: { minWaits: 3, maxWaits: 4, minDiscards: 3, maxDiscards: 4 },
    hard:   { minWaits: 5, maxWaits: 9, minDiscards: 5, maxDiscards: 9 }
  };

  // ========== 赤五の割り当て ==========

  function assignRedFives(tiles, meld) {
    const handFives = tiles[4];
    let meldFives = 0;
    if (meld) {
      for (const t of meld.tiles) {
        if (t === 4) meldFives++;
      }
    }
    const totalFives = handFives + meldFives;
    if (totalFives === 0) return { redFives: 0, meldRedFive: false };

    // 4枚の五の中に1枚赤がある
    const hasRed = Math.random() < (totalFives / 4);
    if (!hasRed) return { redFives: 0, meldRedFive: false };

    const redPos = Math.floor(Math.random() * totalFives);
    return {
      redFives: redPos < handFives ? 1 : 0,
      meldRedFive: redPos >= handFives
    };
  }

  // ========== ランダム状況生成 ==========

  function generateSituation(tiles, meld, forceSuit) {
    const suit = forceSuit || Tile.randomSuit();
    const isTsumo = Math.random() < 0.5;
    const isDealer = Math.random() < 0.25; // 親は25%

    // ドラ表示牌: 手牌+副露で4枚使い切っている牌は除外
    const usedCounts = Tile.copy(tiles);
    if (meld) {
      for (const t of meld.tiles) usedCounts[t]++;
    }
    const doraCandidates = [];
    for (let i = 0; i < 9; i++) {
      if (usedCounts[i] < 4) doraCandidates.push(i);
    }
    const doraIndicator = doraCandidates[Math.floor(Math.random() * doraCandidates.length)];
    const doraIndex = Tile.getDoraIndex(doraIndicator);
    const doraCount = Tile.countDora(tiles, doraIndex, meld || null);
    const red = assignRedFives(tiles, meld);

    return {
      suit,
      isTsumo,
      isDealer,
      isOpen: !!meld,
      doraIndicator,
      doraIndex,
      doraCount,
      meld: meld || null,
      redFives: red.redFives,
      meldRedFive: red.meldRedFive,
      redDoraCount: red.redFives + (red.meldRedFive ? 1 : 0)
    };
  }

  // ========== 和了形のランダム構築 ==========

  // 面子手の和了形14枚をランダム構築
  function buildRandomAgari14() {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const tiles = Tile.createEmpty();

      // 雀頭
      const head = Math.floor(Math.random() * 9);
      tiles[head] += 2;

      // 4面子
      let valid = true;
      for (let m = 0; m < 4; m++) {
        if (Math.random() < 0.3) {
          // 刻子
          const t = Math.floor(Math.random() * 9);
          if (tiles[t] + 3 > 4) { valid = false; break; }
          tiles[t] += 3;
        } else {
          // 順子
          const t = Math.floor(Math.random() * 7); // 0-6
          if (tiles[t] + 1 > 4 || tiles[t + 1] + 1 > 4 || tiles[t + 2] + 1 > 4) {
            valid = false; break;
          }
          tiles[t]++;
          tiles[t + 1]++;
          tiles[t + 2]++;
        }
      }

      if (valid && Tile.count(tiles) === 14 && Tile.isValid(tiles)) {
        return tiles;
      }
    }
    return null;
  }

  // 七対子の和了形14枚をランダム構築
  function buildRandomChitoitsu14() {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const tiles = Tile.createEmpty();
      const indices = [];

      // 7種を選んで各2枚
      const available = [0, 1, 2, 3, 4, 5, 6, 7, 8];
      for (let i = available.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [available[i], available[j]] = [available[j], available[i]];
      }

      for (let i = 0; i < 7; i++) {
        tiles[available[i]] = 2;
      }

      if (Tile.count(tiles) === 14 && Tile.isValid(tiles)) {
        return tiles;
      }
    }
    return null;
  }

  // ========== 門前テンパイ問題生成 ==========

  function generateTenpaiProblem(difficulty, forceSuit) {
    const diff = DIFFICULTY[difficulty];

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      // 面子手 or 七対子をランダムに選ぶ
      const useChitoitsu = Math.random() < 0.15;
      const agari14 = useChitoitsu ? buildRandomChitoitsu14() : buildRandomAgari14();
      if (!agari14) continue;

      // ランダムに1枚除去して13枚テンパイ
      const expanded = Tile.expand(agari14);
      const removeIdx = Math.floor(Math.random() * expanded.length);
      const tiles13 = Tile.copy(agari14);
      tiles13[expanded[removeIdx]]--;

      const waits = Hand.getTenpaiWaits(tiles13);
      if (waits.length < diff.minWaits || waits.length > diff.maxWaits) continue;

      const situation = generateSituation(tiles13, null, forceSuit);

      // 残り枚数が0の待ちは除外（手牌で4枚使い切り＋ドラ表示牌）
      const remaining = Tile.getRemainingCounts(tiles13, null, situation.doraIndicator);
      const validWaits = waits.filter(w => remaining[w.tile] > 0);
      if (validWaits.length < diff.minWaits || validWaits.length > diff.maxWaits) continue;

      return {
        type: 'tenpai',
        isOpen: false,
        tiles: tiles13,
        meld: null,
        waits: validWaits,
        allWaits: waits,
        remaining,
        situation,
        difficulty
      };
    }
    return null;
  }

  // ========== 門前イーシャンテン問題生成 ==========

  function generateIishantenProblem(difficulty, forceSuit) {
    const diff = DIFFICULTY[difficulty];

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      // まずテンパイ手牌を作る
      const agari14 = buildRandomAgari14();
      if (!agari14) continue;

      const expanded = Tile.expand(agari14);
      const removeIdx = Math.floor(Math.random() * expanded.length);
      const tiles13 = Tile.copy(agari14);
      tiles13[expanded[removeIdx]]--;

      // テンパイであることを確認
      const waits = Hand.getTenpaiWaits(tiles13);
      if (waits.length === 0) continue;

      // 13枚に1枚追加して14枚のイーシャンテン候補を作る
      const candidates = [];
      for (let addTile = 0; addTile < 9; addTile++) {
        if (tiles13[addTile] >= 4) continue;

        const tiles14 = Tile.copy(tiles13);
        tiles14[addTile]++;

        // 和了していないことを確認
        if (Hand.isAgari(tiles14)) continue;

        // 有効打を探索
        const discards = Hand.findIishantenDiscards(tiles14);
        if (discards.length >= diff.minDiscards && discards.length <= diff.maxDiscards) {
          candidates.push({ tiles: tiles14, discards });
        }
      }

      if (candidates.length === 0) continue;

      const chosen = candidates[Math.floor(Math.random() * candidates.length)];
      const situation = generateSituation(chosen.tiles, null, forceSuit);

      return {
        type: 'iishanten',
        isOpen: false,
        tiles: chosen.tiles,
        meld: null,
        discards: chosen.discards,
        situation,
        difficulty
      };
    }
    return null;
  }

  // ========== 副露テンパイ問題生成 ==========

  function buildRandomAgari11WithMeld(meld) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const tiles = Tile.createEmpty();

      // 副露面子の牌をカウント（4枚制限チェック用）
      const meldCount = Tile.createEmpty();
      for (const t of meld.tiles) meldCount[t]++;

      // 雀頭
      const head = Math.floor(Math.random() * 9);
      if (tiles[head] + meldCount[head] + 2 > 4) continue;
      tiles[head] += 2;

      // 3面子（+副露1面子で計4面子+雀頭）→ 合計11枚
      let valid = true;
      for (let m = 0; m < 3; m++) {
        if (Math.random() < 0.3) {
          const t = Math.floor(Math.random() * 9);
          if (tiles[t] + meldCount[t] + 3 > 4) { valid = false; break; }
          tiles[t] += 3;
        } else {
          const t = Math.floor(Math.random() * 7);
          if (tiles[t] + meldCount[t] + 1 > 4 ||
              tiles[t + 1] + meldCount[t + 1] + 1 > 4 ||
              tiles[t + 2] + meldCount[t + 2] + 1 > 4) {
            valid = false; break;
          }
          tiles[t]++;
          tiles[t + 1]++;
          tiles[t + 2]++;
        }
      }

      if (valid && Tile.count(tiles) === 11 && Tile.isValidWithMeld(tiles, meld)) {
        return tiles;
      }
    }
    return null;
  }

  function generateRandomMeld() {
    if (Math.random() < 0.5) {
      // ポン
      const t = Math.floor(Math.random() * 9);
      return { type: 'pon', tiles: [t, t, t] };
    } else {
      // チー
      const t = Math.floor(Math.random() * 7);
      return { type: 'chi', tiles: [t, t + 1, t + 2] };
    }
  }

  function generateTenpaiProblemWithMeld(difficulty, forceSuit) {
    const diff = DIFFICULTY[difficulty];

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const meld = generateRandomMeld();
      const agari11 = buildRandomAgari11WithMeld(meld);
      if (!agari11) continue;

      // 和了確認
      if (!Hand.isAgariWithMeld(agari11, meld)) continue;

      // ランダムに1枚除去して10枚テンパイ
      const expanded = Tile.expand(agari11);
      const removeIdx = Math.floor(Math.random() * expanded.length);
      const tiles10 = Tile.copy(agari11);
      tiles10[expanded[removeIdx]]--;

      const waits = Hand.getTenpaiWaitsWithMeld(tiles10, meld);
      if (waits.length < diff.minWaits || waits.length > diff.maxWaits) continue;

      const situation = generateSituation(tiles10, meld, forceSuit);

      const remaining = Tile.getRemainingCounts(tiles10, meld, situation.doraIndicator);
      const validWaits = waits.filter(w => remaining[w.tile] > 0);
      if (validWaits.length < diff.minWaits || validWaits.length > diff.maxWaits) continue;

      return {
        type: 'tenpai',
        isOpen: true,
        tiles: tiles10,
        meld,
        waits: validWaits,
        allWaits: waits,
        remaining,
        situation,
        difficulty
      };
    }
    return null;
  }

  // ========== 副露イーシャンテン問題生成 ==========

  function generateIishantenProblemWithMeld(difficulty, forceSuit) {
    const diff = DIFFICULTY[difficulty];

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const meld = generateRandomMeld();
      const agari11 = buildRandomAgari11WithMeld(meld);
      if (!agari11) continue;

      if (!Hand.isAgariWithMeld(agari11, meld)) continue;

      // 10枚テンパイを作る
      const expanded = Tile.expand(agari11);
      const removeIdx = Math.floor(Math.random() * expanded.length);
      const tiles10 = Tile.copy(agari11);
      tiles10[expanded[removeIdx]]--;

      const waits = Hand.getTenpaiWaitsWithMeld(tiles10, meld);
      if (waits.length === 0) continue;

      // 10枚に1枚追加して11枚イーシャンテン候補を作る
      const meldCount = Tile.createEmpty();
      for (const t of meld.tiles) meldCount[t]++;

      const candidates = [];
      for (let addTile = 0; addTile < 9; addTile++) {
        if (tiles10[addTile] + meldCount[addTile] >= 4) continue;

        const tiles11 = Tile.copy(tiles10);
        tiles11[addTile]++;

        if (Hand.isAgariWithMeld(tiles11, meld)) continue;

        const discards = Hand.findIishantenDiscardsWithMeld(tiles11, meld);
        if (discards.length >= diff.minDiscards && discards.length <= diff.maxDiscards) {
          candidates.push({ tiles: tiles11, discards });
        }
      }

      if (candidates.length === 0) continue;

      const chosen = candidates[Math.floor(Math.random() * candidates.length)];
      const situation = generateSituation(chosen.tiles, meld, forceSuit);

      return {
        type: 'iishanten',
        isOpen: true,
        tiles: chosen.tiles,
        meld,
        discards: chosen.discards,
        situation,
        difficulty
      };
    }
    return null;
  }

  // ========== 統合API ==========

  function generate(mode, openMode, difficulty, suit) {
    const forceSuit = (suit && suit !== 'random') ? suit : null;
    if (mode === 'tenpai') {
      if (openMode === 'open') {
        return generateTenpaiProblemWithMeld(difficulty, forceSuit);
      } else {
        return generateTenpaiProblem(difficulty, forceSuit);
      }
    } else {
      if (openMode === 'open') {
        return generateIishantenProblemWithMeld(difficulty, forceSuit);
      } else {
        return generateIishantenProblem(difficulty, forceSuit);
      }
    }
  }

  return {
    DIFFICULTY,
    generate,
    generateSituation,
    generateTenpaiProblem,
    generateIishantenProblem,
    generateTenpaiProblemWithMeld,
    generateIishantenProblemWithMeld
  };
})();
