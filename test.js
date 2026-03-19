// test.js - ロジックの動作テスト（Node.js実行用）

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = __dirname;
const sandbox = { Math, console, Set, Object, Array, process, parseInt, alert: () => {} };
const ctx = vm.createContext(sandbox);
const files = ['tile.js', 'hand.js', 'yaku.js', 'score.js', 'generator.js'];
for (const f of files) {
  let code = fs.readFileSync(path.join(dir, 'js', f), 'utf-8');
  // const Xxx = ... → var Xxx = ... に変換してコンテキストに露出させる
  code = code.replace(/^const (\w+) = /m, 'var $1 = ');
  vm.runInContext(code, ctx);
}

const { Tile, Hand, Yaku, Score, Generator } = sandbox;

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error('FAIL:', msg);
  }
}

// ===== Test 1: 基本的な和了判定 =====
console.log('--- Test 1: 和了判定 ---');

// 九蓮宝燈: 1112345678999+1 = [4,1,1,1,1,1,1,1,3] (14枚)
const churenTiles = [4, 1, 1, 1, 1, 1, 1, 1, 3];
assert(Tile.count(churenTiles) === 14, 'churen count=14');
assert(Hand.isAgari(churenTiles), 'churen is agari');

// 七対子: 11223344556677 (14枚)
const chitoitsuTiles = [2, 2, 2, 2, 2, 2, 2, 0, 0];
assert(Tile.count(chitoitsuTiles) === 14, 'chitoitsu count=14');
assert(Hand.isAgari(chitoitsuTiles), 'chitoitsu is agari');
assert(Hand.isChitoitsu(chitoitsuTiles), 'is chitoitsu');

// 22334455667788 = 七対子+清一色 (14枚)
const chitoitsu2 = [0, 2, 2, 2, 2, 2, 2, 2, 0];
assert(Hand.isAgari(chitoitsu2), 'chitoitsu2 is agari');
assert(Hand.isChitoitsu(chitoitsu2), 'chitoitsu2 is chitoitsu');

// 不正な手牌（和了でない）: 4,0,4,0,4,0,2,0,0 → 14枚、面子分解不可
const notAgari = [4, 0, 4, 0, 4, 0, 2, 0, 0];
assert(!Hand.isAgari(notAgari), 'notAgari is not agari');

// ===== Test 2: テンパイ判定 =====
console.log('--- Test 2: テンパイ判定 ---');

// 九蓮宝燈テンパイ: 1112345678999 (13枚) = [3,1,1,1,1,1,1,1,3]
const churenTenpai13 = [3, 1, 1, 1, 1, 1, 1, 1, 3];
assert(Tile.count(churenTenpai13) === 13, 'churen tenpai count=13');
const churenWaits = Hand.getTenpaiWaits(churenTenpai13);
console.log(`Churen tenpai waits: ${churenWaits.length} kinds (${churenWaits.map(w => w.tile + 1).join(',')})`);
// 純正九蓮宝燈テンパイは9面張
assert(churenWaits.length === 9, 'churen tenpai = 9 men machi');

// ===== Test 3: 面子分解 =====
console.log('--- Test 3: 面子分解 ---');

// 11 123 123 456 789 = [4,2,2,1,1,1,1,1,1] = 14枚
const ittsuHand = [4, 2, 2, 1, 1, 1, 1, 1, 1];
assert(Tile.count(ittsuHand) === 14, 'ittsu count=14');
const ittsuDecomps = Hand.allDecompositions(ittsuHand);
console.log(`Ittsu decomps: ${ittsuDecomps.length}`);
assert(ittsuDecomps.length > 0, 'ittsu has decompositions');

// ===== Test 4: 九蓮宝燈 役判定 =====
console.log('--- Test 4: 九蓮宝燈 ---');

assert(Yaku.isChuurenPoutou(churenTiles), 'churen detected: [4,1,1,1,1,1,1,1,3]');
assert(!Yaku.isChuurenPoutou(chitoitsuTiles), 'chitoitsu is not churen');

// 1112345678999 + 5 = [3,1,1,1,2,1,1,1,3] = 14枚 → 九蓮宝燈
const churen5 = [3, 1, 1, 1, 2, 1, 1, 1, 3];
assert(Yaku.isChuurenPoutou(churen5), 'churen+5 detected');

// ===== Test 5: 断么九 =====
console.log('--- Test 5: 断么九 ---');
// 22 234 345 678 678 = [0,2,1,2,2,1,1,2,1] → 12.. no
// 55 234 234 678 678 = [0,1,2,2,2,1,1,2,1] → 12 no
// Let me compute: head(55) + 4 mentsu. 55 234 234 678 678
// idx: 0,0 1,1 2,2,2,2 3,3 4,4 5,5 6,6 7,7
// Actually: 55 = [0,0,0,0,2,0,0,0,0]
// 234 = +[0,1,1,1,0,0,0,0,0] x2 = [0,2,2,2,0,0,0,0,0]
// 678 = +[0,0,0,0,0,1,1,1,0] x2 = [0,0,0,0,0,2,2,2,0]
// total: [0,2,2,2,2,2,2,2,0] = 14 ✓
const tanyaoHand = [0, 2, 2, 2, 2, 2, 2, 2, 0];
assert(Tile.count(tanyaoHand) === 14, 'tanyao count=14');
assert(Hand.isAgari(tanyaoHand), 'tanyao is agari');
assert(Yaku.isTanyao(tanyaoHand, null), 'tanyao detected');

// ===== Test 6: 一気通貫 =====
console.log('--- Test 6: 一気通貫 ---');
// Use the ittsuHand from test 3: [4,2,2,1,1,1,1,1,1] has ittsu decomp
if (Hand.isAgari(ittsuHand)) {
  const decomps = Hand.allDecompositions(ittsuHand);
  let foundIttsu = false;
  for (const d of decomps) {
    if (Yaku.isIttsu(d)) foundIttsu = true;
  }
  assert(foundIttsu, 'ittsu found in decomps');
  console.log(`Ittsu decomps with ittsu: ${foundIttsu}`);
}

// ===== Test 7: 点数計算 =====
console.log('--- Test 7: 点数計算 ---');

// 清一色6翻 = 跳満 子ロン12000
const score1 = Score.calculateScore(6, false, { isDealer: false, isTsumo: false });
assert(score1.total === 12000, 'chinitsu 6han ko ron = 12000');
assert(score1.rank === '跳満', 'chinitsu 6han = haneman');

// 清一色5翻(副露) = 満貫 子ロン8000
const score2 = Score.calculateScore(5, false, { isDealer: false, isTsumo: false });
assert(score2.total === 8000, 'chinitsu open 5han ko ron = 8000');

// 役満 子ロン32000
const score3 = Score.calculateScore(-1, true, { isDealer: false, isTsumo: false });
assert(score3.total === 32000, 'yakuman ko ron = 32000');

// 清一色7翻 = 跳満 親ツモ 6000all
const score4 = Score.calculateScore(7, false, { isDealer: true, isTsumo: true });
assert(score4.total === 18000, 'chinitsu 7han oya tsumo total = 18000');
assert(score4.payments.each === 6000, 'chinitsu 7han oya tsumo each = 6000');

// ===== Test 8: 問題生成 =====
console.log('--- Test 8: 問題生成 ---');

let genSuccess = 0;
let genAttempts = 20;
for (let i = 0; i < genAttempts; i++) {
  const p = Generator.generateTenpaiProblem('medium');
  if (p) {
    genSuccess++;
    assert(Tile.count(p.tiles) === 13, `tenpai gen ${i}: 13 tiles`);
    assert(p.waits.length >= 3 && p.waits.length <= 4, `tenpai gen ${i}: medium waits=${p.waits.length}`);
  }
}
console.log(`Tenpai generation: ${genSuccess}/${genAttempts} succeeded`);
assert(genSuccess > 0, 'at least some tenpai generated');

// 副露テンパイ
let genOpenSuccess = 0;
for (let i = 0; i < genAttempts; i++) {
  const p = Generator.generateTenpaiProblemWithMeld('easy');
  if (p) {
    genOpenSuccess++;
    assert(Tile.count(p.tiles) === 10, `open tenpai gen ${i}: 10 tiles`);
  }
}
console.log(`Open tenpai generation: ${genOpenSuccess}/${genAttempts} succeeded`);
assert(genOpenSuccess > 0, 'at least some open tenpai generated');

// イーシャンテン (まずeasyで確認)
let genIshSuccessEasy = 0;
for (let i = 0; i < genAttempts; i++) {
  const p = Generator.generateIishantenProblem('easy');
  if (p) {
    genIshSuccessEasy++;
    assert(Tile.count(p.tiles) === 14, `iishanten gen easy ${i}: 14 tiles`);
  }
}
console.log(`Iishanten generation (easy): ${genIshSuccessEasy}/${genAttempts} succeeded`);

let genIshSuccess = 0;
for (let i = 0; i < genAttempts; i++) {
  const p = Generator.generateIishantenProblem('medium');
  if (p) {
    genIshSuccess++;
    assert(Tile.count(p.tiles) === 14, `iishanten gen ${i}: 14 tiles`);
    assert(p.discards.length >= 3 && p.discards.length <= 4, `iishanten gen ${i}: medium discards=${p.discards.length}`);
  }
}
console.log(`Iishanten generation (medium): ${genIshSuccess}/${genAttempts} succeeded`);
assert(genIshSuccessEasy > 0 || genIshSuccess > 0, 'at least some iishanten generated');

// 副露イーシャンテン
let genOpenIshSuccess = 0;
for (let i = 0; i < genAttempts; i++) {
  const p = Generator.generateIishantenProblemWithMeld('medium');
  if (p) {
    genOpenIshSuccess++;
    assert(Tile.count(p.tiles) === 11, `open iishanten gen ${i}: 11 tiles`);
  }
}
console.log(`Open iishanten generation: ${genOpenIshSuccess}/${genAttempts} succeeded`);
assert(genOpenIshSuccess > 0, 'at least some open iishanten generated');

// ===== Test 9: 副露あり和了判定 =====
console.log('--- Test 9: 副露あり ---');

// ポン 333 + 手牌 11 123 456 789 = [3,1,1,1,1,1,1,1,1] = 11枚
const ponMeld = { type: 'pon', tiles: [2, 2, 2] };
const ponHand = [3, 1, 1, 1, 1, 1, 1, 1, 1]; // 11枚
assert(Tile.count(ponHand) === 11, 'pon hand count=11');
const ponAgari = Hand.isAgariWithMeld(ponHand, ponMeld);
assert(ponAgari, 'pon hand is agari with meld');
console.log(`Pon hand agari: ${ponAgari}`);

// チー 123 + 手牌 55 234 234 678 = [0,2,2,2,2,0,1,1,1] = 11枚
const chiMeld = { type: 'chi', tiles: [0, 1, 2] };
const chiHand = [0, 2, 2, 2, 2, 0, 1, 1, 1];
assert(Tile.count(chiHand) === 11, 'chi hand count=11');
const chiAgari = Hand.isAgariWithMeld(chiHand, chiMeld);
console.log(`Chi hand agari: ${chiAgari}`);
assert(chiAgari, 'chi hand is agari with meld');

// ===== Test 10: 食い下がり =====
console.log('--- Test 10: 食い下がり ---');

// 一気通貫 + 副露 = 1翻
if (chiAgari) {
  // チー 123 + 55 234 234 678 → 一気通貫ではない（456がない）
  // チー 123 + 55 456 789 456 ... 枚数調整
  // One that has ittsu: チー 123 + 55 456 789 + koutsu
  // head 55 + 456 + 789 + meld 123 = ittsu
  // head 55 + 456 + 789 = [0,0,0,0,1,2,1,1,1] = 7枚 foot =  need 11
  // + 456 more = [0,0,0,0,2,3,2,1,1] = 10 枚. 一つ足りない.
  // + additional 4: = [0,0,0,1,2,3,2,1,1] = 11枚
  // head(55) + 345 + 456 + 789 + meld(123)
  // [0,0,0,1,2,3,2,1,1] → head=4(idx4は5) × 各カウント確認
  // idx: 0 1 2 3 4 5 6 7 8
  //      0 0 0 1 2 3 2 1 1 = 10? 0+0+0+1+2+3+2+1+1=10. Need 11.
  // OK Let me try: head 88 + 456 + 456 + 789 + meld(123)
  // [0,0,0,0,1,2,1,1,3] = 8? 0+0+0+0+1+2+1+1+3=8. Need 11
  // head 88 + 456 + 789 + 345 + meld(123). Count: h(2)+s(3)+s(3)+s(3)=11.
  // [0,0,0,1,1,2,1,1,3] = 10. no...
  // I keep miscounting. Let me be explicit:
  // head 8,8 → idx7: +2
  // 456 → idx3:+1, idx4:+1, idx5:+1
  // 789 → idx6:+1, idx7:+1, idx8:+1
  // 345 → idx2:+1, idx3:+1, idx4:+1
  // Totals: [0,0,1,2,2,1,1,3,1] → sum = 0+0+1+2+2+1+1+3+1 = 11 ✓
  const ittsuChiHand = [0, 0, 1, 2, 2, 1, 1, 3, 1];
  assert(Tile.count(ittsuChiHand) === 11, 'ittsu chi hand count=11');

  const chiMeld123 = { type: 'chi', tiles: [0, 1, 2] };
  if (Hand.isAgariWithMeld(ittsuChiHand, chiMeld123)) {
    const decomps = Hand.allDecompositionsWithMeld(ittsuChiHand, chiMeld123);
    let foundIttsu = false;
    for (const d of decomps) {
      if (Yaku.isIttsu(d)) foundIttsu = true;
    }
    console.log(`Ittsu in open hand: ${foundIttsu}`);
    if (foundIttsu) {
      // 食い下がりで1翻になるか
      const d = decomps.find(d => Yaku.isIttsu(d));
      if (d) {
        const yakuResult = Yaku.detectYaku(d, 'ryanmen', 0, ittsuChiHand, { isOpen: true, isTsumo: false, doraCount: 0, meld: chiMeld123 });
        const ittsuYaku = yakuResult.yakuList.find(y => y.name === '一気通貫');
        assert(ittsuYaku && ittsuYaku.han === 1, 'ittsu open = 1 han');
        console.log(`Ittsu open han: ${ittsuYaku ? ittsuYaku.han : 'not found'}`);
      }
    }
  }
}

// ===== Summary =====
console.log('\n========================================');
console.log(`Tests: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log('All tests passed!');
} else {
  console.log('Some tests failed!');
  process.exit(1);
}
