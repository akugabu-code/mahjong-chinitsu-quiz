// yaku.js - 役判定ロジック（清一色専用）

const Yaku = (() => {

  // 役定義
  const YAKU = {
    chinitsu:    { name: '清一色',       hanClosed: 6, hanOpen: 5 },
    tsumo:       { name: '門前清自摸和', hanClosed: 1, hanOpen: 0 },
    pinfu:       { name: '平和',         hanClosed: 1, hanOpen: 0 },
    tanyao:      { name: '断么九',       hanClosed: 1, hanOpen: 1 },
    iipeiko:     { name: '一盃口',       hanClosed: 1, hanOpen: 0 },
    ittsu:       { name: '一気通貫',     hanClosed: 2, hanOpen: 1 },
    junchan:     { name: '純全帯么九',   hanClosed: 3, hanOpen: 2 },
    ryanpeiko:   { name: '二盃口',       hanClosed: 3, hanOpen: 0 },
    chitoitsu:   { name: '七対子',       hanClosed: 2, hanOpen: 0 },
    chuurenPoutou: { name: '九蓮宝燈',  hanClosed: -1, hanOpen: 0 } // 役満(-1で特別扱い)
  };

  // 九蓮宝燈判定: 1112345678999+任意1枚 (14枚)
  function isChuurenPoutou(tiles) {
    // 基本形: [3,1,1,1,1,1,1,1,3]
    const base = [3, 1, 1, 1, 1, 1, 1, 1, 3];
    // 各牌が基本形以上あり、余剰が正確に1枚
    let extra = 0;
    for (let i = 0; i < 9; i++) {
      if (tiles[i] < base[i]) return false;
      extra += tiles[i] - base[i];
    }
    return extra === 1;
  }

  // 断么九: 1と9を含まない
  function isTanyao(tiles, meld) {
    if (tiles[0] > 0 || tiles[8] > 0) return false;
    if (meld) {
      for (const t of meld.tiles) {
        if (t === 0 || t === 8) return false;
      }
    }
    return true;
  }

  // 一気通貫: 123+456+789 の順子が全て存在
  function isIttsu(decomp) {
    const shuntsuTiles = new Set();
    for (const m of decomp.mentsu) {
      if (m.type === 'shuntsu') {
        shuntsuTiles.add(m.tile);
      }
    }
    return shuntsuTiles.has(0) && shuntsuTiles.has(3) && shuntsuTiles.has(6);
  }

  // 純全帯么九: 全面子+雀頭に1(idx0)or9(idx8)含む
  function isJunchan(decomp) {
    if (decomp.isChitoitsu) return false;

    // 雀頭が1or9
    if (decomp.head !== 0 && decomp.head !== 8) return false;

    for (const m of decomp.mentsu) {
      if (m.type === 'koutsu') {
        if (m.tile !== 0 && m.tile !== 8) return false;
      } else { // shuntsu
        // 順子123(tile=0)は1を含む、順子789(tile=6)は9を含む
        if (m.tile !== 0 && m.tile !== 6) return false;
      }
    }
    return true;
  }

  // 平和: 全面子が順子 + 両面待ち（門前のみ）
  function isPinfu(decomp, waitType) {
    if (decomp.isChitoitsu) return false;
    // 全面子が順子
    for (const m of decomp.mentsu) {
      if (m.isOpen) continue;
      if (m.type !== 'shuntsu') return false;
    }
    return waitType === 'ryanmen';
  }

  // 一盃口: 同一順子が2組（門前のみ、二盃口でない場合）
  function countIipeiko(decomp) {
    if (decomp.isChitoitsu) return 0;
    const shuntsuCounts = {};
    for (const m of decomp.mentsu) {
      if (m.type === 'shuntsu' && !m.isOpen) {
        const key = m.tile;
        shuntsuCounts[key] = (shuntsuCounts[key] || 0) + 1;
      }
    }
    let pairs = 0;
    for (const count of Object.values(shuntsuCounts)) {
      pairs += Math.floor(count / 2);
    }
    return pairs; // 1=一盃口, 2=二盃口
  }

  // 役を全て列挙
  // decomp: 面子分解, waitType: 待ちの種類, winTile: あがり牌, situation: {isTsumo, isOpen, doraCount}
  // tiles14: 14枚(あがり牌含む)
  function detectYaku(decomp, waitType, winTile, tiles14, situation) {
    const isOpen = situation.isOpen || false;
    const result = [];

    // 九蓮宝燈チェック（門前のみ、役満→他無視）
    if (!isOpen && isChuurenPoutou(tiles14)) {
      return {
        yakuList: [{ ...YAKU.chuurenPoutou, han: -1 }],
        totalHan: -1, // 役満
        isYakuman: true
      };
    }

    // 清一色（常に適用）
    const chinitsuHan = isOpen ? YAKU.chinitsu.hanOpen : YAKU.chinitsu.hanClosed;
    result.push({ name: YAKU.chinitsu.name, han: chinitsuHan });

    // 門前清自摸和（門前＋ツモのみ）
    if (!isOpen && situation.isTsumo) {
      result.push({ name: YAKU.tsumo.name, han: YAKU.tsumo.hanClosed });
    }

    // 七対子（門前のみ）
    if (!isOpen && decomp.isChitoitsu) {
      result.push({ name: YAKU.chitoitsu.name, han: YAKU.chitoitsu.hanClosed });
      // 七対子は面子手の役と複合しないので、ここで翻数合計
      let totalHan = result.reduce((s, y) => s + y.han, 0);
      totalHan += situation.doraCount || 0;
      const redDora7 = situation.redDoraCount || 0;
      totalHan += redDora7;
      return {
        yakuList: result,
        totalHan,
        isYakuman: false,
        doraCount: situation.doraCount || 0,
        redDoraCount: redDora7
      };
    }

    // 平和（門前のみ）
    if (!isOpen && isPinfu(decomp, waitType)) {
      result.push({ name: YAKU.pinfu.name, han: YAKU.pinfu.hanClosed });
    }

    // 断么九
    const meld = situation.meld || null;
    if (isTanyao(tiles14, meld)) {
      const han = isOpen ? YAKU.tanyao.hanOpen : YAKU.tanyao.hanClosed;
      result.push({ name: YAKU.tanyao.name, han });
    }

    // 一盃口 / 二盃口（門前のみ）
    if (!isOpen) {
      const ipkCount = countIipeiko(decomp);
      if (ipkCount >= 2) {
        result.push({ name: YAKU.ryanpeiko.name, han: YAKU.ryanpeiko.hanClosed });
      } else if (ipkCount === 1) {
        result.push({ name: YAKU.iipeiko.name, han: YAKU.iipeiko.hanClosed });
      }
    }

    // 一気通貫
    if (isIttsu(decomp)) {
      const han = isOpen ? YAKU.ittsu.hanOpen : YAKU.ittsu.hanClosed;
      result.push({ name: YAKU.ittsu.name, han });
    }

    // 純全帯么九
    if (isJunchan(decomp)) {
      const han = isOpen ? YAKU.junchan.hanOpen : YAKU.junchan.hanClosed;
      result.push({ name: YAKU.junchan.name, han });
    }

    let totalHan = result.reduce((s, y) => s + y.han, 0);
    totalHan += situation.doraCount || 0;
    const redDora = situation.redDoraCount || 0;
    totalHan += redDora;

    return {
      yakuList: result,
      totalHan,
      isYakuman: false,
      doraCount: situation.doraCount || 0,
      redDoraCount: redDora
    };
  }

  // 全分解の中から最高翻数の役判定結果を返す
  function getBestYaku(tiles14OrHand, waits, winTile, situation, meld) {
    // waitsのdecompositionsから対象分解を取得
    const wait = waits.find(w => w.tile === winTile);
    if (!wait) return null;

    // 手牌13枚(門前) or 10枚(副露) を再構成
    let tiles14;
    if (meld) {
      tiles14 = Tile.copy(tiles14OrHand);
      tiles14[winTile]++;
    } else {
      tiles14 = Tile.copy(tiles14OrHand);
      tiles14[winTile]++;
    }

    let best = null;
    const decomps = Hand.uniqueDecompositions(wait.decompositions);
    for (const decomp of decomps) {
      // 13枚手牌を取得
      const tiles13 = Tile.copy(tiles14);
      tiles13[winTile]--;

      const waitType = Hand.getWaitType(tiles13, winTile, decomp);
      const yakuResult = detectYaku(decomp, waitType, winTile, tiles14, {
        ...situation,
        meld: meld || null
      });

      if (!best || comparYakuResult(yakuResult, best) > 0) {
        best = { ...yakuResult, waitType, decomposition: decomp };
      }
    }
    return best;
  }

  // 役判定結果の比較（翻数が高い方が良い、役満は最高）
  function comparYakuResult(a, b) {
    if (a.isYakuman && !b.isYakuman) return 1;
    if (!a.isYakuman && b.isYakuman) return -1;
    return a.totalHan - b.totalHan;
  }

  return {
    YAKU,
    isChuurenPoutou,
    isTanyao,
    isIttsu,
    isJunchan,
    isPinfu,
    countIipeiko,
    detectYaku,
    getBestYaku
  };
})();
