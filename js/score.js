// score.js - 点数計算（清一色は常に5翻以上→定額テーブルのみ）

const Score = (() => {

  // 点数テーブル: [子ロン, 親ロン, 子ツモ子払い, 子ツモ親払い, 親ツモ各払い]
  const SCORE_TABLE = {
    mangan:     { name: '満貫',     koRon: 8000,  oyaRon: 12000, koTsumoKo: 2000, koTsumoOya: 4000, oyaTsumo: 4000 },
    haneman:    { name: '跳満',     koRon: 12000, oyaRon: 18000, koTsumoKo: 3000, koTsumoOya: 6000, oyaTsumo: 6000 },
    baiman:     { name: '倍満',     koRon: 16000, oyaRon: 24000, koTsumoKo: 4000, koTsumoOya: 8000, oyaTsumo: 8000 },
    sanbaiman:  { name: '三倍満',   koRon: 24000, oyaRon: 36000, koTsumoKo: 6000, koTsumoOya: 12000, oyaTsumo: 12000 },
    yakuman:    { name: '役満',     koRon: 32000, oyaRon: 48000, koTsumoKo: 8000, koTsumoOya: 16000, oyaTsumo: 16000 },
    kazoeYakuman: { name: '数え役満', koRon: 32000, oyaRon: 48000, koTsumoKo: 8000, koTsumoOya: 16000, oyaTsumo: 16000 }
  };

  // 翻数からランク名を返す
  function getRank(han, isYakuman) {
    if (isYakuman || han === -1) return 'yakuman';
    if (han >= 13) return 'kazoeYakuman';
    if (han >= 11) return 'sanbaiman';
    if (han >= 8) return 'baiman';
    if (han >= 6) return 'haneman';
    return 'mangan'; // 5翻
  }

  // 点数計算
  // situation: { isDealer, isTsumo }
  function calculateScore(han, isYakuman, situation) {
    const rank = getRank(han, isYakuman);
    const entry = SCORE_TABLE[rank];

    if (situation.isTsumo) {
      if (situation.isDealer) {
        return {
          rank: entry.name,
          total: entry.oyaTsumo * 3,
          payments: { each: entry.oyaTsumo },
          isDealer: true,
          isTsumo: true
        };
      } else {
        return {
          rank: entry.name,
          total: entry.koTsumoKo * 2 + entry.koTsumoOya,
          payments: { ko: entry.koTsumoKo, oya: entry.koTsumoOya },
          isDealer: false,
          isTsumo: true
        };
      }
    } else {
      if (situation.isDealer) {
        return {
          rank: entry.name,
          total: entry.oyaRon,
          isDealer: true,
          isTsumo: false
        };
      } else {
        return {
          rank: entry.name,
          total: entry.koRon,
          isDealer: false,
          isTsumo: false
        };
      }
    }
  }

  // 点数を日本語文字列にフォーマット
  function formatScore(scoreResult) {
    const total = scoreResult.total.toLocaleString();
    if (scoreResult.isTsumo) {
      if (scoreResult.isDealer) {
        return `${scoreResult.rank} ${total}点 (${scoreResult.payments.each.toLocaleString()}点ALL)`;
      } else {
        return `${scoreResult.rank} ${total}点 (${scoreResult.payments.ko.toLocaleString()}/${scoreResult.payments.oya.toLocaleString()}点)`;
      }
    } else {
      return `${scoreResult.rank} ${total}点`;
    }
  }

  return {
    SCORE_TABLE,
    getRank,
    calculateScore,
    formatScore
  };
})();
