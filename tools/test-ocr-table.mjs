// ---------------------------------------------------------------------------
// tools/test-ocr-table.mjs — 숙제표 해석(js/ocr-table.js) 회귀 테스트
//
//   node tools/test-ocr-table.mjs
//
// 실제로 받은 숙제표 3종을 브라우저 OCR로 읽었을 때 나온 "칸별 줄"(글자·위치·색)을
// 그대로 옮겨 적었다. 이미지·Tesseract 없이 해석 규칙만 검증한다.
// 새 학원 표가 안 맞으면 여기에 그 표를 하나 더 적고, 통과할 때까지 ocr-table.js를 고친다.
// ---------------------------------------------------------------------------

import assert from "node:assert/strict";
import { interpretTable, parseCell, cleanName } from "../js/ocr-table.js";

let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log("  ok  " + name);
  } catch (err) {
    failed++;
    console.log("  FAIL " + name + "\n" + err.message);
  }
}

/** 칸 하나. lines: [text, x0, x1, y0, y1, colored?] */
const cell = (x0, x1, y0, y1, lines = []) => ({
  x0, x1, y0, y1,
  lines: lines.map(([text, lx0, lx1, ly0, ly1, colored]) => ({
    text, x0: lx0, x1: lx1, y0: ly0, y1: ly1, colored: !!colored,
  })),
});

// ---------------------------------------------------------------------------
// 1. 둘째 영어학원 (가로형): 영역 | [교재] 번호 항목 + 색글씨 안내 | 제출 날짜
//    단어 행의 날짜 칸은 카톡 버튼에 가려져 있다.
// ---------------------------------------------------------------------------
const C = { label: [47, 507], body: [520, 2719], date: [2734, 3077] };
const row = (y0, y1, label, body, date) => [
  cell(4, 33, y0, y1),                               // 왼쪽 테두리 바깥 틈
  cell(C.label[0], C.label[1], y0, y1, label),
  cell(C.body[0], C.body[1], y0, y1, body),
  cell(C.date[0], C.date[1], y0, y1, date),
];
const daughter2 = [
  row(27, 198,
    [["5T의대-C1", 157, 396, 88, 137]],
    [["9월 10일 수업 숙제 (Homework)", 1235, 2008, 88, 142]],
    [["제출 날짜", 2808, 3018, 53, 102], ["(Due Date)", 2779, 3045, 128, 177]]),
  row(212, 818,
    [["READING", 159, 399, 491, 531]],
    [
      ["(HACKERS APEX READING for the TOEFL iBT Advanced]", 529, 2004, 221, 270, true],
      ["1. pg. 36-41 지문 분석, 문제 풀이 후 채점", 531, 1470, 282, 338],
      ["(들린 문제 옆에 답의 근거 쓰기)", 528, 1234, 348, 404],
      ["2. Vocab Review p44 풀고 채점하기", 529, 1380, 416, 470],
      ["3. 핸드북 CH 2_3-5번 문장 중 남은 문장 스스로 직독직해", 529, 1816, 482, 537],
      ["4. 밴드에서 핸드북 숙제 답지 확인 후 틀린 부분과 부족한 부분 그대로 필기 하기", 528, 2305, 548, 598],
      ["주어 동사 끊어서 읽기, 문단별 요약, 모르는 단어 밑줄 치고 찾아보기, 틀린 문제는 지문에서 근거", 534, 2667, 683, 730, true],
      ["찾아서 밑줄 치고 간단한 해석 쓰기", 535, 1290, 749, 797, true],
    ],
    [["9/15", 2861, 2962, 491, 532]]),
  row(832, 1163,
    [["NOVEL", 190, 369, 974, 1014]],
    [
      ["[The Wild Robot]", 530, 955, 841, 890, true],
      ["1. Read Ch. 9-16 (pg. 21-39)", 531, 1229, 907, 957],
      ["2. Handbook: Vocabulary, Sentences, Plot Summary, Comprehension Questions,", 529, 2593, 973, 1023],
      ["conflict analysis (pg.14-16)", 529, 1216, 1040, 1091],
      ["« Finish Creative Activity 1 pg. 44 (If not completed in class.)", 534, 2075, 1107, 1156, true],
    ],
    [["9/17", 2861, 2963, 973, 1014]]),
  row(1178, 1619,
    [["IB", 255, 304, 1376, 1417]],
    [
      ["Day 2 Be Creative & After Reading Activities pg. 33", 532, 1979, 1190, 1249],
      ["Day 1 Pre-reading & note taking pg. 36", 532, 1631, 1269, 1328],
      ["Project quest Pg. 44-45 Choose 1 research topic and memorize 4 facts, 1", 532, 2595, 1345, 1405],
      ["thing you learned and 1 question you still have. Also, make a ppt about your", 527, 2674, 1426, 1485],
      ["research topic. (this part doesn't need to be memorized).", 530, 2123, 1501, 1559],
    ],
    [["9/15", 2855, 2969, 1364, 1420]]),
  row(1634, 1832,
    [["단어 (Vocabulary)", 63, 495, 1708, 1762]],
    [
      ["[능률보카 고등 고난도 +핸드북]", 529, 1233, 1638, 1692, true],
      ["DAY 4+ HB CH. 4", 531, 958, 1708, 1749],
      ["매일 밴드 단어 녹음은 필수! 부족하면 추가 숙제 나가요!!!", 548, 1955, 1771, 1818, true],
    ],
    []),
];

test("둘째 표: 영역 4개, 머리글 행은 버린다", () => {
  const s = interpretTable(daughter2);
  assert.deepEqual(s.map((x) => x.name), ["READING", "NOVEL", "IB", "단어"]);
});

test("둘째 표: READING 번호 항목 4개, 접힌 줄은 앞 항목에 붙는다", () => {
  const [reading] = interpretTable(daughter2);
  assert.equal(reading.items.length, 4);
  assert.equal(reading.items[0], "pg. 36-41 지문 분석, 문제 풀이 후 채점 (틀린 문제 옆에 답의 근거 쓰기)");
  assert.equal(reading.items[1], "Vocab Review p44 풀고 채점하기");
  assert.equal(reading.date, "9/15");
});

test("둘째 표: 갈색 [교재명]과 분홍 안내문은 참고로 간다", () => {
  const [reading] = interpretTable(daughter2);
  const memo = reading.memo.split("\n");
  assert.equal(memo[0], "교재: HACKERS APEX READING for the TOEFL iBT Advanced");
  assert.match(memo[1], /^주어 동사 끊어서 읽기.*간단한 해석 쓰기$/);
  assert.equal(memo.length, 2);
});

test("둘째 표: NOVEL 항목 2개 + • 안내는 참고", () => {
  const novel = interpretTable(daughter2)[1];
  assert.deepEqual(novel.items, [
    "Read Ch. 9-16 (pg. 21-39)",
    "Handbook: Vocabulary, Sentences, Plot Summary, Comprehension Questions, conflict analysis (pg.14-16)",
  ]);
  assert.match(novel.memo, /Finish Creative Activity 1 pg\. 44 \(If not completed in class\.\)/);
  assert.equal(novel.date, "9/17");
});

test("둘째 표: 번호 없는 IB 는 줄이 칸 끝까지 찼을 때만 이어 붙인다", () => {
  const ib = interpretTable(daughter2)[2];
  assert.equal(ib.items.length, 3);
  assert.equal(ib.items[0], "Day 2 Be Creative & After Reading Activities pg. 33");
  assert.equal(ib.items[1], "Day 1 Pre-reading & note taking pg. 36");
  assert.match(ib.items[2], /^Project quest .* \(this part doesn't need to be memorized\)\.$/);
});

test("둘째 표: 가려진 제출일은 표에서 가장 많이 나온 날짜(9/15)로 채우고 표시한다", () => {
  const word = interpretTable(daughter2)[3];
  assert.equal(word.name, "단어");
  assert.deepEqual(word.items, ["DAY 4+ HB CH. 4"]);
  assert.equal(word.date, "9/15");
  assert.equal(word.dateGuessed, true);
});

test("둘째 표: 과목은 영어", () => {
  for (const s of interpretTable(daughter2)) assert.equal(s.subject, "영어");
});

// ---------------------------------------------------------------------------
// 2. 첫째 영어학원 정규반 (세로형): 구분/진도/과제 × 단어/1교시/2교시/3교시
// ---------------------------------------------------------------------------
const cols2 = [[33, 134], [152, 605], [622, 1570], [1584, 2429], [2442, 3388]];
const rows2 = [[15, 77], [90, 587], [600, 1088]];
const daughter1Regular = [
  [
    [["구분", 50, 118, 25, 61]],
    [["단어", 348, 413, 23, 61, true]],
    [["1교시", 680, 829, 15, 78], ["박은아R", 979, 1107, 24, 60], ["선생님", 1368, 1465, 24, 60]],
    [["2교시 | MIA 선생님", 1638, 2378, 10, 78]],
    [["3교시 | 박지혜G 선생님", 2501, 3289, 15, 78]],
  ],
  [
    [["진도", 51, 119, 319, 356]],
    [["Day 25~26 (2회독)", 229, 534, 319, 362, true]],
    [["실전 모의고사 2회, 3회", 907, 1291, 319, 362]],
    [],
    [["특수구문", 2846, 2994, 320, 359]],
  ],
  [
    [["과제", 50, 117, 829, 866]],
    [["문장듣기시험", 279, 482, 829, 867, true]],
    [
      ["1) 124~139% 문풀 + 키워드 표시 + 오답과 정답의 근거 +", 654, 1547, 806, 849],
      ["한글로 한줄 요약 + 채점 및 오답 + 단어 암기", 757, 1438, 850, 887],
    ],
    [],
    [
      ["1) 문.풀 + 채 + 오", 2772, 3069, 780, 826],
      ["2) 노트: 개념 + 오답", 2751, 3090, 830, 875],
      ["3) 부교재: 역삼중", 2773, 3068, 879, 924],
    ],
  ],
].map((cells, r) => cells.map((lines, c) =>
  cell(cols2[c][0], cols2[c][1], rows2[r][0], rows2[r][1], lines)));

test("첫째 정규: '과제' 행만 숙제, 열 머리글이 제목", () => {
  const s = interpretTable(daughter1Regular);
  assert.deepEqual(s.map((x) => x.name), ["단어", "1교시", "3교시"]);
});

test("첫째 정규: 빨간 글씨뿐인 칸은 그 자체가 숙제", () => {
  assert.deepEqual(interpretTable(daughter1Regular)[0].items, ["문장듣기시험"]);
});

test("첫째 정규: 1교시 '1)' 한 항목, + 로 끝난 줄은 이어진다", () => {
  assert.deepEqual(interpretTable(daughter1Regular)[1].items, [
    "124~139쪽 문풀 + 키워드 표시 + 오답과 정답의 근거 + 한글로 한줄 요약 + 채점 및 오답 + 단어 암기",
  ]);
});

test("첫째 정규: 2교시는 과제가 없어서 빠지고, 3교시는 3개", () => {
  const s = interpretTable(daughter1Regular);
  assert.equal(s.length, 3);
  assert.deepEqual(s[2].items, ["문.풀 + 채 + 오", "노트: 개념 + 오답", "부교재: 역삼중"]);
  for (const x of s) assert.equal(x.date, "");
});

// ---------------------------------------------------------------------------
// 3. 첫째 영어학원 내신반 (세로형, 가운데 정렬): 구분 | 암기테스트 | 담당 김은지 선생님
// ---------------------------------------------------------------------------
const cols3 = [[15, 124], [144, 651], [670, 3502]];
const rows3 = [[17, 90], [103, 663], [676, 1222]];
const daughter1School = [
  [
    [["구분", 32, 107, 32, 72]],
    [["암기테스트", 307, 497, 31, 71, true]],
    [["김은지 선생님", 1794, 2028, 31, 71], ["담당 _ |", 808, 1020, 17, 91]],
  ],
  [
    [["진도", 33, 107, 360, 400]],
    [["1. 5과 추가지문 2개", 203, 600, 357, 405]],
    [["5과 추가지문 1 & 2", 1897, 2288, 357, 405]],
  ],
  [
    [["과제", 31, 105, 933, 974]],
    [
      ["1. 단어/영영풀이시험", 192, 610, 872, 920],
      ["(학교프린트 기준)", 224, 580, 930, 983],
      ["2. 5과 본문(빈칸시험)", 182, 621, 987, 1040],
    ],
    [
      ["1. p12-18, 120-125, 165-166 문제 풀어오기 (앞의 이론 보지 않고 푸세요)", 1343, 2843, 815, 869],
      ["2. 위의 문제 푼 페이지 채점하고 오답 근거 찾기", 1616, 2563, 872, 920],
      ["3. 이전 숙제 중 마무리 안된 부분 문제 풀고 채점/오답 근거 찾기 (앞의 이론 보지 않고 푸세요)", 1162, 3023, 930, 983],
      // OCR이 앞의 ** 를 = 로 읽은 경우 — 그래도 숙제가 아니라 안내로 가야 한다
      ["= 개인적으로 암기 연습 더 하시고 싶은 분들은 p182~ 파트의 자료들 활용하시면 됩니다 :)", 1185, 2998, 987, 1040],
      ["**다음시간에 5과 프린트1 자료 꼭 지참해주세요~!", 1588, 2593, 1043, 1091],
    ],
  ],
].map((cells, r) => cells.map((lines, c) =>
  cell(cols3[c][0], cols3[c][1], rows3[r][0], rows3[r][1], lines)));

test("첫째 내신: 암기테스트 2개, 괄호 줄은 앞 항목에 붙는다", () => {
  const [memorize] = interpretTable(daughter1School);
  assert.equal(memorize.name, "암기테스트");
  assert.deepEqual(memorize.items, ["단어/영영풀이시험 (학교프린트 기준)", "5과 본문(빈칸시험)"]);
});

test("첫째 내신: 수업 칸 번호 3개 + ** 안내 2개는 참고", () => {
  const lesson = interpretTable(daughter1School)[1];
  assert.equal(lesson.name, "김은지 선생님 수업");
  assert.equal(lesson.items.length, 3);
  assert.match(lesson.items[2], /^이전 숙제 중 .*\(앞의 이론 보지 않고 푸세요\)$/);
  assert.deepEqual(lesson.memo.split("\n"), [
    "개인적으로 암기 연습 더 하시고 싶은 분들은 p182~ 파트의 자료들 활용하시면 됩니다 :)",
    "다음시간에 5과 프린트1 자료 꼭 지참해주세요~!",
  ]);
});

// ---------------------------------------------------------------------------
// 작은 규칙들
// ---------------------------------------------------------------------------
test("칸 이름 다듬기", () => {
  assert.equal(cleanName("단어 (Vocabulary)"), "단어");
  assert.equal(cleanName("READING"), "READING");
  assert.equal(cleanName("담당 _ 김은지 선생님"), "김은지 선생님");
});

test("번호 없는 칸: 짧게 끝난 줄 다음은 새 항목", () => {
  const p = parseCell(cell(0, 1000, 0, 200, [
    ["첫째 할 일", 10, 300, 0, 40],
    ["둘째 할 일", 10, 320, 50, 90],
  ]));
  assert.deepEqual(p.items, ["첫째 할 일", "둘째 할 일"]);
});

console.log(failed ? "\n" + failed + "개 실패" : "\n모두 통과");
process.exit(failed ? 1 : 0);
