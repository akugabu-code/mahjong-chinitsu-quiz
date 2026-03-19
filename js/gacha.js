// gacha.js - ガチャエンジン・コレクション管理

const Gacha = (() => {
  // ========== 定数 ==========
  const POINTS_KEY = 'chinitsu_gacha_points';
  const COLLECTION_KEY = 'chinitsu_gacha_collection';
  const SHOWCASE_KEY = 'chinitsu_gacha_showcase';

  const SINGLE_COST = 50;
  const MULTI_COST = 450;
  const MULTI_COUNT = 10;

  // 34牌の並び順 (スプライトシートと一致)
  const TILE_ORDER = [
    '1p','2p','3p','4p','5p','6p','7p','8p','9p',
    '1s','2s','3s','4s','5s','6s','7s','8s','9s',
    '1m','2m','3m','4m','5m','6m','7m','8m','9m',
    'ton','nan','sha','pei','haku','hatsu','chun'
  ];

  const TILE_NAMES = {
    '1p':'一筒','2p':'二筒','3p':'三筒','4p':'四筒','5p':'五筒',
    '6p':'六筒','7p':'七筒','8p':'八筒','9p':'九筒',
    '1s':'一索','2s':'二索','3s':'三索','4s':'四索','5s':'五索',
    '6s':'六索','7s':'七索','8s':'八索','9s':'九索',
    '1m':'一萬','2m':'二萬','3m':'三萬','4m':'四萬','5m':'五萬',
    '6m':'六萬','7m':'七萬','8m':'八萬','9m':'九萬',
    'ton':'東','nan':'南','sha':'西','pei':'北',
    'haku':'白','hatsu':'發','chun':'中'
  };

  // レアリティ設定
  const RARITY_CONFIG = {
    secret: { label: 'Secret', prob: 0.01, colors: 1,  cssClass: 'rarity-secret',
      colorNames: ['ネオンサイバー'] },
    ssr:    { label: 'SSR',    prob: 0.07, colors: 2,  cssClass: 'rarity-ssr',
      colorNames: ['虹', '漆黒'] },
    sr:     { label: 'SR',     prob: 0.15, colors: 3,  cssClass: 'rarity-sr',
      colorNames: ['金', '銀', 'オブシディアン'] },
    r:      { label: 'R',      prob: 0.30, colors: 5,  cssClass: 'rarity-r',
      colorNames: ['銅', 'ルビー', 'サファイア', 'ロイヤルパープル', 'スカイシアン'] },
    n:      { label: 'N',      prob: 0.47, colors: 7,  cssClass: 'rarity-n',
      colorNames: ['黒', '赤', '青', '黄色', '紫', 'ピンク', '緑'] }
  };

  const RARITY_ORDER = ['secret', 'ssr', 'sr', 'r', 'n'];

  // スプライトシートファイル名: {rarity}{colorIndex}.png  (e.g. n1.png, secret1.png)
  // 各ファイルは34牌が横に並ぶ

  // ========== ポイント管理 ==========

  function getPoints() {
    try { return parseInt(localStorage.getItem(POINTS_KEY), 10) || 0; }
    catch { return 0; }
  }

  function setPoints(n) {
    localStorage.setItem(POINTS_KEY, String(Math.max(0, Math.floor(n))));
  }

  function addPoints(n) {
    const cur = getPoints();
    setPoints(cur + n);
    return cur + n;
  }

  // ========== コレクション管理 ==========
  // コレクション形式: { "secret_1_1p": count, "n_3_ton": count, ... }
  // キー: {rarity}_{colorIndex}_{tileId}

  function getCollection() {
    try { return JSON.parse(localStorage.getItem(COLLECTION_KEY)) || {}; }
    catch { return {}; }
  }

  function saveCollection(col) {
    localStorage.setItem(COLLECTION_KEY, JSON.stringify(col));
  }

  function addToCollection(items) {
    const col = getCollection();
    for (const item of items) {
      const key = itemKey(item);
      col[key] = (col[key] || 0) + 1;
    }
    saveCollection(col);
    return col;
  }

  function itemKey(item) {
    return `${item.rarity}_${item.colorIndex}_${item.tileId}`;
  }

  function parseItemKey(key) {
    const parts = key.split('_');
    const rarity = parts[0];
    const colorIndex = parseInt(parts[1], 10);
    const tileId = parts.slice(2).join('_');
    return { rarity, colorIndex, tileId };
  }

  // ========== 飾り棚 ==========
  // 14スロットの配列。各スロットはitemKeyまたはnull

  function getShowcase() {
    try {
      const data = JSON.parse(localStorage.getItem(SHOWCASE_KEY));
      if (Array.isArray(data) && data.length === 14) return data;
      return new Array(14).fill(null);
    } catch { return new Array(14).fill(null); }
  }

  function setShowcase(slots) {
    localStorage.setItem(SHOWCASE_KEY, JSON.stringify(slots.slice(0, 14)));
  }

  // ========== ガチャ抽選 ==========

  function pullOne() {
    const rand = Math.random();
    let cumulative = 0;
    let rarity = 'n';
    for (const r of RARITY_ORDER) {
      cumulative += RARITY_CONFIG[r].prob;
      if (rand < cumulative) { rarity = r; break; }
    }
    const colorCount = RARITY_CONFIG[rarity].colors;
    const colorIndex = Math.floor(Math.random() * colorCount) + 1;
    const tileId = TILE_ORDER[Math.floor(Math.random() * TILE_ORDER.length)];
    return { rarity, colorIndex, tileId };
  }

  function pull(count) {
    const cost = count === 1 ? SINGLE_COST : MULTI_COST;
    const pts = getPoints();
    if (pts < cost) return null;
    setPoints(pts - cost);

    const results = [];
    for (let i = 0; i < count; i++) {
      results.push(pullOne());
    }
    addToCollection(results);
    return results;
  }

  // ========== スプライトシート ==========
  // 画像レイアウト: 4行 × 9列 (各行180px, 各列110.2px)
  //   行0: 筒子 1p-9p
  //   行1: 索子 1s-9s
  //   行2: 萬子 1m-9m
  //   行3: 字牌 東南西北白發中 (7枚)
  // TILE_ORDER のインデックスと対応

  const SPRITE_COLS = 9;  // 行あたり最大列数
  const SPRITE_ROWS = 4;  // 行数

  function getSpriteStyle(item, tileWidth, tileHeight) {
    const idx = TILE_ORDER.indexOf(item.tileId);
    if (idx < 0) return {};

    let row, col;
    if (idx < 9)  { row = 0; col = idx; }       // 筒子
    else if (idx < 18) { row = 1; col = idx - 9; }  // 索子
    else if (idx < 27) { row = 2; col = idx - 18; } // 萬子
    else               { row = 3; col = idx - 27; } // 字牌

    const bgW = SPRITE_COLS * tileWidth;
    const bgH = SPRITE_ROWS * tileHeight;

    return {
      backgroundImage: `url('img/gacha/${item.rarity}${item.colorIndex}.png')`,
      backgroundPosition: `-${col * tileWidth}px -${row * tileHeight}px`,
      backgroundSize: `${bgW}px ${bgH}px`,
      width: `${tileWidth}px`,
      height: `${tileHeight}px`
    };
  }

  // ========== 全アイテムリスト生成 ==========

  function getAllItems() {
    const items = [];
    for (const rarity of RARITY_ORDER) {
      const colorCount = RARITY_CONFIG[rarity].colors;
      for (let c = 1; c <= colorCount; c++) {
        for (const tileId of TILE_ORDER) {
          items.push({ rarity, colorIndex: c, tileId });
        }
      }
    }
    return items;
  }

  function getTotalItemCount() {
    let total = 0;
    for (const r of RARITY_ORDER) {
      total += RARITY_CONFIG[r].colors * TILE_ORDER.length;
    }
    return total;
  }

  // ========== 公開API ==========

  return {
    POINTS_KEY,
    SINGLE_COST,
    MULTI_COST,
    MULTI_COUNT,
    TILE_ORDER,
    TILE_NAMES,
    RARITY_CONFIG,
    RARITY_ORDER,
    getPoints,
    setPoints,
    addPoints,
    getCollection,
    saveCollection,
    addToCollection,
    itemKey,
    parseItemKey,
    getShowcase,
    setShowcase,
    pull,
    getSpriteStyle,
    getAllItems,
    getTotalItemCount
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Gacha;
}
