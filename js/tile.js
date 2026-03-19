// tile.js - 牌データ構造・ユーティリティ
// 清一色専用: 1色(1-9)のみを扱う。tiles配列はインデックス0-8で牌1-9に対応。

const Tile = (() => {
  // 牌種定義
  const SUIT_NAMES = { man: '萬子', pin: '筒子', sou: '索子' };
  const SUITS = ['man', 'pin', 'sou'];

  // 萬子の漢数字
  const KANJI_NUMBERS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

  // 空の手牌配列を作成 (インデックス0=1の牌, ..., インデックス8=9の牌)
  function createEmpty() {
    return [0, 0, 0, 0, 0, 0, 0, 0, 0];
  }

  // 手牌をコピー
  function copy(tiles) {
    return tiles.slice();
  }

  // 合計枚数
  function count(tiles) {
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += tiles[i];
    return sum;
  }

  // 配列が有効か(各牌0-4枚、合計が指定枚数)
  function isValid(tiles, expectedCount) {
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      if (tiles[i] < 0 || tiles[i] > 4) return false;
      sum += tiles[i];
    }
    return expectedCount === undefined || sum === expectedCount;
  }

  // 副露面子で使われた牌を考慮した有効性チェック
  function isValidWithMeld(tiles, meld, expectedCount) {
    const combined = copy(tiles);
    for (const t of meld.tiles) {
      combined[t]++;
    }
    for (let i = 0; i < 9; i++) {
      if (combined[i] > 4) return false;
    }
    return expectedCount === undefined || count(tiles) === expectedCount;
  }

  // 牌のインデックス(0-8)から表示用の数値(1-9)に変換
  function toNumber(index) {
    return index + 1;
  }

  // 表示用の数値(1-9)からインデックス(0-8)に変換
  function toIndex(number) {
    return number - 1;
  }

  // 残り枚数の計算（手牌＋副露面子＋ドラ表示牌を考慮）
  function getRemainingCounts(tiles, meld, doraIndicator) {
    const remaining = [];
    for (let i = 0; i < 9; i++) {
      remaining[i] = 4 - tiles[i];
    }
    if (meld) {
      for (const t of meld.tiles) {
        remaining[t]--;
      }
    }
    if (doraIndicator != null && doraIndicator >= 0 && doraIndicator < 9) {
      remaining[doraIndicator]--;
    }
    return remaining;
  }

  // ドラ表示牌からドラ牌のインデックスを返す(9の次は1)
  function getDoraIndex(indicatorIndex) {
    return (indicatorIndex + 1) % 9;
  }

  // ドラ枚数を数える
  function countDora(tiles, doraIndex, meld) {
    let doraCount = tiles[doraIndex];
    if (meld) {
      for (const t of meld.tiles) {
        if (t === doraIndex) doraCount++;
      }
    }
    return doraCount;
  }

  // 手牌をソートされた牌番号(1-9)の配列として展開
  function expand(tiles) {
    const result = [];
    for (let i = 0; i < 9; i++) {
      for (let j = 0; j < tiles[i]; j++) {
        result.push(i);
      }
    }
    return result;
  }

  // 展開された牌配列からtiles配列に変換
  function compress(expanded) {
    const tiles = createEmpty();
    for (const t of expanded) {
      tiles[t]++;
    }
    return tiles;
  }

  // ランダムな牌種を返す
  function randomSuit() {
    return SUITS[Math.floor(Math.random() * 3)];
  }

  return {
    SUIT_NAMES,
    SUITS,
    KANJI_NUMBERS,
    createEmpty,
    copy,
    count,
    isValid,
    isValidWithMeld,
    toNumber,
    toIndex,
    getRemainingCounts,
    getDoraIndex,
    countDora,
    expand,
    compress,
    randomSuit
  };
})();
