// hand.js - 手牌評価エンジン（和了判定、面子分解、テンパイ判定、待ち形判定）
// 清一色専用: tiles[0..8] で牌1-9の枚数を表現

const Hand = (() => {

  // ========== 面子分解 ==========

  // tiles(12枚)を4面子に分解できる全パターンを返す
  // mentsu: [{type:'shuntsu'|'koutsu', tile: index}]
  function _findMentsuAll(tiles, startIdx, currentMentsu, results) {
    // 最初の牌があるインデックスを探す
    let idx = startIdx;
    while (idx < 9 && tiles[idx] === 0) idx++;

    // 全て使い切ったら成功
    if (idx >= 9) {
      results.push(currentMentsu.slice());
      return;
    }

    // 刻子を抜く
    if (tiles[idx] >= 3) {
      tiles[idx] -= 3;
      currentMentsu.push({ type: 'koutsu', tile: idx });
      _findMentsuAll(tiles, idx, currentMentsu, results);
      currentMentsu.pop();
      tiles[idx] += 3;
    }

    // 順子を抜く
    if (idx <= 6 && tiles[idx] >= 1 && tiles[idx + 1] >= 1 && tiles[idx + 2] >= 1) {
      tiles[idx]--;
      tiles[idx + 1]--;
      tiles[idx + 2]--;
      currentMentsu.push({ type: 'shuntsu', tile: idx });
      _findMentsuAll(tiles, idx, currentMentsu, results);
      currentMentsu.pop();
      tiles[idx]++;
      tiles[idx + 1]++;
      tiles[idx + 2]++;
    }
  }

  // 14枚の和了判定（面子手）: 全ての有効な分解を返す
  // 返り値: [{head: index, mentsu: [...]}]
  function allDecompositions(tiles) {
    const results = [];

    // 面子手: 雀頭候補を順に試す
    for (let h = 0; h < 9; h++) {
      if (tiles[h] < 2) continue;
      const work = Tile.copy(tiles);
      work[h] -= 2;
      const mentsuList = [];
      _findMentsuAll(work, 0, [], mentsuList);
      for (const mentsu of mentsuList) {
        results.push({ head: h, mentsu, isChitoitsu: false });
      }
    }

    // 七対子チェック
    if (isChitoitsu(tiles)) {
      const pairs = [];
      for (let i = 0; i < 9; i++) {
        if (tiles[i] === 2) pairs.push(i);
      }
      results.push({ head: -1, mentsu: [], isChitoitsu: true, pairs });
    }

    return results;
  }

  // 七対子判定: ちょうど7種が各2枚
  function isChitoitsu(tiles) {
    let pairCount = 0;
    for (let i = 0; i < 9; i++) {
      if (tiles[i] === 2) pairCount++;
      else if (tiles[i] !== 0) return false;
    }
    return pairCount === 7;
  }

  // 14枚の和了判定
  function isAgari(tiles) {
    return allDecompositions(tiles).length > 0;
  }

  // ========== 副露あり版 ==========

  // 副露あり版: 手牌(numTiles枚) + 副露面子1組 の面子分解
  // handTiles: 11枚(あがり牌込み) → 雀頭 + 面子2組 + 副露面子1組 = 4面子+雀頭
  // numMentsu: 手牌から抽出する面子数
  function allDecompositionsWithMeld(handTiles, meld) {
    const results = [];
    const meldMentsu = meldToMentsu(meld);

    for (let h = 0; h < 9; h++) {
      if (handTiles[h] < 2) continue;
      const work = Tile.copy(handTiles);
      work[h] -= 2;

      // 残り枚数が面子数×3に一致するか確認
      const remaining = Tile.count(work);
      if (remaining % 3 !== 0) continue;

      const mentsuList = [];
      _findMentsuAll(work, 0, [], mentsuList);
      for (const mentsu of mentsuList) {
        // 副露面子を追加
        results.push({
          head: h,
          mentsu: [...mentsu, meldMentsu],
          isChitoitsu: false,
          isOpen: true
        });
      }
    }

    return results;
  }

  // 副露データから面子オブジェクトに変換
  function meldToMentsu(meld) {
    if (meld.type === 'pon') {
      return { type: 'koutsu', tile: meld.tiles[0], isOpen: true };
    } else {
      // チー: tiles はソート済みと仮定
      return { type: 'shuntsu', tile: Math.min(...meld.tiles), isOpen: true };
    }
  }

  // 副露あり和了判定
  function isAgariWithMeld(handTiles, meld) {
    return allDecompositionsWithMeld(handTiles, meld).length > 0;
  }

  // ========== テンパイ判定 ==========

  // 門前13枚からテンパイ待ち牌の列挙
  // 返り値: [{ tile: index, decompositions: [...] }]
  function getTenpaiWaits(tiles13) {
    const waits = [];
    for (let i = 0; i < 9; i++) {
      if (tiles13[i] >= 4) continue; // 4枚使い切りは待てない
      const work = Tile.copy(tiles13);
      work[i]++;
      const decomps = allDecompositions(work);
      if (decomps.length > 0) {
        waits.push({ tile: i, decompositions: decomps });
      }
    }
    return waits;
  }

  // 副露あり10枚からテンパイ待ち牌の列挙
  function getTenpaiWaitsWithMeld(handTiles10, meld) {
    const remaining = Tile.getRemainingCounts(handTiles10, meld);
    const waits = [];
    for (let i = 0; i < 9; i++) {
      if (remaining[i] <= 0) continue;
      const work = Tile.copy(handTiles10);
      work[i]++;
      const decomps = allDecompositionsWithMeld(work, meld);
      if (decomps.length > 0) {
        waits.push({ tile: i, decompositions: decomps });
      }
    }
    return waits;
  }

  // ========== 待ち形判定 ==========

  // 待ちの形を判定
  // tiles13: テンパイ手牌(13枚), winTile: あがり牌index, decomp: 1つの分解
  function getWaitType(tiles13, winTile, decomp) {
    if (decomp.isChitoitsu) {
      return 'tanki'; // 七対子は常に単騎
    }

    // あがり牌が雀頭に使われている場合 → 単騎
    if (decomp.head === winTile) {
      // 雀頭に使われているか確認: 元の手牌でwinTileがhead分(2枚)未満なら雀頭完成に使った
      if (tiles13[winTile] < 2) {
        // ただし面子にも使われうるので、分解を見て判断
        return _analyzeWaitFromDecomp(tiles13, winTile, decomp);
      }
    }

    return _analyzeWaitFromDecomp(tiles13, winTile, decomp);
  }

  function _analyzeWaitFromDecomp(tiles13, winTile, decomp) {
    // tiles13にwinTileを加えた14枚からこの分解が成立する
    // winTileがどこに使われたかを特定する

    // 方法: tiles13からdecompの面子・雀頭を引いていき、残った1枚がwinTile
    const used = Tile.createEmpty();
    used[decomp.head] += 2;
    for (const m of decomp.mentsu) {
      if (m.isOpen) continue; // 副露面子はスキップ
      if (m.type === 'koutsu') {
        used[m.tile] += 3;
      } else {
        used[m.tile]++;
        used[m.tile + 1]++;
        used[m.tile + 2]++;
      }
    }

    // usedは14枚分、tiles13は13枚、差分がwinTileの使われ方
    // tiles13[i] - (used[i]からwinTileの1枚を除いたもの) で判定

    // winTileが雀頭に使われた場合
    if (tiles13[decomp.head] < 2 && decomp.head === winTile) {
      return 'tanki';
    }

    // winTileが刻子に使われた場合
    for (const m of decomp.mentsu) {
      if (m.isOpen) continue;
      if (m.type === 'koutsu' && m.tile === winTile) {
        if (tiles13[winTile] < 3) {
          // この刻子を完成させるためにwinTileが必要だった
          // 他にも対子待ちの可能性がある → 双碰
          // 雀頭が対子待ちでなければ双碰ではない
          return 'shanpon';
        }
      }
    }

    // winTileが順子に使われた場合
    for (const m of decomp.mentsu) {
      if (m.isOpen) continue;
      if (m.type !== 'shuntsu') continue;
      const s = m.tile; // 順子の開始インデックス
      if (winTile < s || winTile > s + 2) continue;

      // この順子にwinTileが含まれる
      // 元の手牌でこの順子が成立していたかチェック
      const pos = winTile - s; // 0, 1, 2

      // 順子内でのwinTileの位置で判定
      // この順子からwinTileを抜いた2枚が元の手牌にあったか
      const testTiles = Tile.copy(tiles13);
      // この分解の他の面子・雀頭を引く
      testTiles[decomp.head] -= 2;
      for (const m2 of decomp.mentsu) {
        if (m2 === m || m2.isOpen) continue;
        if (m2.type === 'koutsu') {
          testTiles[m2.tile] -= 3;
        } else {
          testTiles[m2.tile]--;
          testTiles[m2.tile + 1]--;
          testTiles[m2.tile + 2]--;
        }
      }

      // testTilesにはこの順子に使われた牌(winTile含む)が残る
      // winTileを引くと、元の手牌にあった2枚が残る
      if (pos === 1) {
        return 'kanchan'; // 嵌張: 真ん中待ち
      } else if (pos === 0 && s + 2 === 8) {
        return 'penchan'; // 辺張: 789で7待ち
      } else if (pos === 2 && s === 0) {
        return 'penchan'; // 辺張: 123で3待ち
      } else {
        return 'ryanmen'; // 両面
      }
    }

    // 到達しないはずだが安全策
    return 'tanki';
  }

  // ========== イーシャンテン有効打 ==========

  // 門前14枚から切ったらテンパイになる牌の列挙
  // 返り値: [{discard: index, waits: [{tile, decompositions}]}]
  function findIishantenDiscards(tiles14) {
    const discards = [];
    const seen = new Set();

    for (let i = 0; i < 9; i++) {
      if (tiles14[i] === 0 || seen.has(i)) continue;
      seen.add(i);

      const work = Tile.copy(tiles14);
      work[i]--;
      const waits = getTenpaiWaits(work);
      if (waits.length > 0) {
        discards.push({ discard: i, waits });
      }
    }
    return discards;
  }

  // 副露あり11枚から切ったらテンパイになる牌の列挙
  function findIishantenDiscardsWithMeld(handTiles11, meld) {
    const discards = [];
    const seen = new Set();

    for (let i = 0; i < 9; i++) {
      if (handTiles11[i] === 0 || seen.has(i)) continue;
      seen.add(i);

      const work = Tile.copy(handTiles11);
      work[i]--;
      const waits = getTenpaiWaitsWithMeld(work, meld);
      if (waits.length > 0) {
        discards.push({ discard: i, waits });
      }
    }
    return discards;
  }

  // ========== ユーティリティ ==========

  // 分解の重複を除去（正規化して比較）
  function normalizeDecomp(decomp) {
    if (decomp.isChitoitsu) {
      return 'chitoitsu:' + decomp.pairs.join(',');
    }
    const parts = decomp.mentsu
      .filter(m => !m.isOpen)
      .map(m => m.type[0] + m.tile)
      .sort()
      .join(',');
    return `h${decomp.head}:${parts}`;
  }

  function uniqueDecompositions(decomps) {
    const seen = new Set();
    const result = [];
    for (const d of decomps) {
      const key = normalizeDecomp(d);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(d);
      }
    }
    return result;
  }

  return {
    allDecompositions,
    allDecompositionsWithMeld,
    isAgari,
    isAgariWithMeld,
    isChitoitsu,
    getTenpaiWaits,
    getTenpaiWaitsWithMeld,
    getWaitType,
    findIishantenDiscards,
    findIishantenDiscardsWithMeld,
    meldToMentsu,
    normalizeDecomp,
    uniqueDecompositions
  };
})();
