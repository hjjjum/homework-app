// ---------------------------------------------------------------------------
// tools/test-academy.mjs — 학원 메시지 파서(영역 나누기)와 보기 순서 회귀 테스트
//
//   node tools/test-academy.mjs
//
// 캡쳐가 표로 인식되지 않을 때(사진으로 찍은 표 등)는 읽은 글이 입력칸으로 가고,
// "숙제로 만들기"를 누르면 이 파서가 영역(Reading/Novel/IB/단어/Grammar/Listening)마다
// 숙제 하나로 나눈다.
// ---------------------------------------------------------------------------

import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// todo-logic.js는 db.js의 상수(CATEGORIES)만 쓰는데, db.js는 Firebase를 CDN에서 불러와
// Node에서 열 수 없다. 테스트에서는 상수만 든 가짜 db.js로 바꿔 끼운다.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "./db.js" && context.parentURL.endsWith("/todo-logic.js")) {
      const stub =
        'export const CATEGORIES=["숙제","개인스케줄","공부"];' +
        'export const SUBJECTS=["수학","영어","과학","국어","사회","기타"];';
      return { url: "data:text/javascript," + encodeURIComponent(stub), shortCircuit: true };
    }
    return next(specifier, context);
  },
});

const { parseAcademyMessage, canonicalSection } = await import("../js/sources/academy-message.js");
const { arrangeTodos, sortByDeadline, nextClassDate, daysForSubject, effectiveDue, dueLabel, selectToday, suggestAhead,
  weekStart, weeklyReview } = await import("../js/todo-logic.js");
const { advanceStreak, visibleStreak, dayBefore } = await import("../js/rewards.js");

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

test("영역 이름 맞추기 (OCR 오타 포함)", () => {
  assert.equal(canonicalSection("READING"), "Reading");
  assert.equal(canonicalSection("Novel"), "Novel");
  assert.equal(canonicalSection("18"), "IB");
  assert.equal(canonicalSection("단어 (Vocabulary)"), "단어");
  assert.equal(canonicalSection("GRAMMER"), "Grammar");
  assert.equal(canonicalSection("LISTENlNG"), "Listening");
  assert.equal(canonicalSection("1교시"), "");
  assert.equal(canonicalSection("암기테스트"), "");
});

// 표 인식이 안 됐을 때 OCR이 통째로 읽은 글 (칸 경계가 사라진 모양)
const ocrText = `5T의대-C1 9월 10일 수업 숙제 (Homework) 제출 날짜
READING
[HACKERS APEX READING for the TOEFL iBT Advanced]
1. pg. 36-41 지문 분석, 문제 풀이 후 채점
(틀린 문제 옆에 답의 근거 쓰기)
2. Vocab Review p44 풀고 채점하기
9/15
주어 동사 끊어서 읽기, 문단별 요약
NOVEL
[The Wild Robot]
1. Read Ch. 9-16 (pg. 21-39)
2. Handbook: Vocabulary, Sentences,
conflict analysis (pg.14-16)
• Finish Creative Activity 1 pg. 44
9/17
IB
Day 2 Be Creative & After Reading Activities pg. 33
Day 1 Pre-reading & note taking pg. 36
단어 (Vocabulary)
[능률보카 고등 고난도 +핸드북]
DAY 4+ HB CH. 4
GRAMMAR
1. Ch.3 p.40-45
LISTENING 9/15
Unit 5 받아쓰기`;

test("영역 6개가 각각 숙제 하나가 된다", () => {
  const list = parseAcademyMessage(ocrText);
  assert.deepEqual(list.map((x) => x.title), ["Reading", "Novel", "IB", "단어", "Grammar", "Listening"]);
  for (const x of list) assert.equal(x.subject, "영어");
});

test("영역 안: 번호 항목, 이어진 줄, 교재, 안내, 제출일", () => {
  const [reading, novel, ib, word, grammar, listening] = parseAcademyMessage(ocrText);
  assert.deepEqual(reading.items, [
    "pg. 36-41 지문 분석, 문제 풀이 후 채점 (틀린 문제 옆에 답의 근거 쓰기)",
    "Vocab Review p44 풀고 채점하기",
  ]);
  assert.equal(reading.due, "9/15");
  assert.equal(reading.memo, "교재: HACKERS APEX READING for the TOEFL iBT Advanced\n주어 동사 끊어서 읽기, 문단별 요약");
  assert.deepEqual(novel.items, [
    "Read Ch. 9-16 (pg. 21-39)",
    "Handbook: Vocabulary, Sentences, conflict analysis (pg.14-16)",
  ]);
  assert.match(novel.memo, /Finish Creative Activity 1 pg\. 44$/);
  assert.equal(novel.due, "9/17");
  assert.deepEqual(ib.items, [
    "Day 2 Be Creative & After Reading Activities pg. 33",
    "Day 1 Pre-reading & note taking pg. 36",
  ]);
  assert.deepEqual(word.items, ["DAY 4+ HB CH. 4"]);
  assert.equal(word.memo, "교재: 능률보카 고등 고난도 +핸드북");
  assert.deepEqual(grammar.items, ["Ch.3 p.40-45"]);
  assert.deepEqual(listening.items, ["Unit 5 받아쓰기"]);
  assert.equal(listening.due, "9/15");
});

test("캡쳐 표를 글로 옮긴 모양(sectionsToText)도 다시 나눌 수 있다", () => {
  const text = "Reading (제출 9/15)\n1. Vocab Review p44\n※ 교재: HACKERS\n\nIB (제출 9/15)\n1. Day 2 pg. 33";
  const list = parseAcademyMessage(text);
  assert.deepEqual(list.map((x) => [x.title, x.due, x.items.length, x.memo]), [
    ["Reading", "9/15", 1, "교재: HACKERS"],
    ["IB", "9/15", 1, ""],
  ]);
});

test("영역이 하나뿐인 보통 학원 카톡은 예전처럼 하나로 읽는다", () => {
  const list = parseAcademyMessage("☑09/02 김은지T 대수\n△ 과제\n① 쎈 p.30-35\n② 오답노트");
  assert.equal(list.length, 1);
  assert.equal(list[0].subject, "수학");
  assert.deepEqual(list[0].items, ["쎈 p.30-35", "오답노트"]);
});

// ---------------------------------------------------------------------------
// 보기 순서
// ---------------------------------------------------------------------------
const todos = [
  { id: "a", subject: "영어", date: "" },
  { id: "b", subject: "수학", date: "2026-09-20" },
  { id: "c", subject: "영어", date: "2026-09-15" },
  { id: "d", subject: "과학", date: "", urgent: true },
  { id: "e", subject: "없는과목", date: "2026-09-13" },
];

test("급한 순: 급한 일 → 마감 이른 순 → 날짜 없는 것", () => {
  assert.deepEqual(sortByDeadline(todos).map((t) => t.id), ["d", "e", "c", "b", "a"]);
});

test("과목별: 과목 순서대로 묶고, 묶음 안은 급한 순", () => {
  const groups = arrangeTodos(todos, "subject");
  assert.deepEqual(
    groups.map((g) => [g.subject, g.todos.map((t) => t.id)]),
    [["수학", ["b"]], ["영어", ["c", "a"]], ["과학", ["d"]], ["기타", ["e"]]]
  );
  assert.deepEqual(arrangeTodos(todos, "urgent").map((g) => g.subject), [null]);
  assert.deepEqual(arrangeTodos([], "subject"), []);
});

// ---------------------------------------------------------------------------
// 학원 요일 → "다음 수업까지"를 실제 날짜로
// ---------------------------------------------------------------------------
const 화목 = [2, 4];
const schedule = [
  { subject: "영어", name: "영어학원", days: 화목 },
  { subject: "수학", name: "황소수학", days: [3, 5] },
];
/** createdAt 흉내 (Firestore Timestamp 처럼 toDate()를 준다) */
const madeOn = (iso) => ({ toDate: () => new Date(iso + "T10:00:00") });
const 숙제 = (extra) => ({ id: "t", category: "숙제", subject: "영어", date: "", ...extra });

test("다음 수업일: 기준일 다음 날부터 찾는다", () => {
  // 2026-09-15는 화요일 — 그날 받은 영어 숙제는 다음 목요일(9/17)까지
  assert.equal(nextClassDate(화목, new Date("2026-09-15T10:00:00")), "2026-09-17");
  // 목요일에 받았으면 다음 화요일(9/22)
  assert.equal(nextClassDate(화목, new Date("2026-09-17T10:00:00")), "2026-09-22");
  assert.equal(nextClassDate([], new Date("2026-09-15T10:00:00")), "");
});

test("한 과목에 학원이 둘이면 요일을 합친다", () => {
  assert.deepEqual(daysForSubject(schedule, "영어"), [2, 4]);
  assert.deepEqual(
    daysForSubject([...schedule, { subject: "영어", name: "회화", days: [6] }], "영어"),
    [2, 4, 6]
  );
  assert.deepEqual(daysForSubject(schedule, "과학"), []);
});

test("날짜 없는 학원 숙제의 실제 기한 = 받은 날의 다음 수업일", () => {
  const todo = 숙제({ createdAt: madeOn("2026-09-15") });
  assert.equal(effectiveDue(todo, schedule, new Date("2026-09-15T20:00:00")), "2026-09-17");
  // 적힌 날짜가 있으면 그게 이긴다
  assert.equal(effectiveDue(숙제({ date: "2026-09-30" }), schedule), "2026-09-30");
  // 학원 요일을 모르는 과목은 예전처럼 빈 값
  assert.equal(effectiveDue(숙제({ subject: "사회", createdAt: madeOn("2026-09-15") }), schedule), "");
  // 숙제가 아닌 것은 계산하지 않는다
  assert.equal(effectiveDue(숙제({ category: "공부", createdAt: madeOn("2026-09-15") }), schedule), "");
});

test("마감 뱃지: 먼 날은 요일로, 가까운 날은 오늘/내일로", () => {
  const todo = 숙제({ createdAt: madeOn("2026-09-15") });   // 기한 9/17(목)
  assert.deepEqual(dueLabel(todo, new Date("2026-09-15T20:00:00"), schedule), { text: "목요일까지", tone: "next" });
  assert.deepEqual(dueLabel(todo, new Date("2026-09-16T20:00:00"), schedule), { text: "내일", tone: "soon" });
  assert.deepEqual(dueLabel(todo, new Date("2026-09-17T08:00:00"), schedule), { text: "오늘", tone: "today" });
  assert.deepEqual(dueLabel(todo, new Date("2026-09-18T08:00:00"), schedule), { text: "지났어요", tone: "past" });
  // 학원 요일을 모르면 예전 그대로
  assert.deepEqual(dueLabel(todo, new Date("2026-09-15T20:00:00"), []), { text: "다음 수업까지", tone: "next" });
});

test("오늘 몫: 학원 요일로 계산한 기한이 오면 들어온다", () => {
  const todo = 숙제({ createdAt: madeOn("2026-09-15") });   // 기한 9/17
  assert.equal(selectToday([todo], new Date("2026-09-16T09:00:00"), schedule).length, 0);
  assert.equal(selectToday([todo], new Date("2026-09-17T09:00:00"), schedule).length, 1);
});

// ---------------------------------------------------------------------------
// 미리 해두면 좋은 숙제
// ---------------------------------------------------------------------------
const items = (n, done = 0) =>
  Array.from({ length: n }, (_, i) => ({ text: "항목" + (i + 1), done: i < done }));

test("미리 하기: 하루에 해야 할 몫이 크면 권한다", () => {
  const 많은숙제 = 숙제({ id: "big", createdAt: madeOn("2026-09-15"), items: items(6) }); // 기한 9/17
  const [ahead] = suggestAhead([많은숙제], new Date("2026-09-15T20:00:00"), schedule);
  assert.equal(ahead.todo.id, "big");
  assert.equal(ahead.남은항목, 6);
  assert.equal(ahead.남은날, 2);
  assert.equal(ahead.오늘몫, 3);
});

test("미리 하기: 여유 있는 숙제·오늘 몫·끝난 것은 권하지 않는다", () => {
  const today = new Date("2026-09-15T20:00:00");
  const 여유 = 숙제({ id: "small", createdAt: madeOn("2026-09-15"), items: items(2) });    // 2개/2일
  const 오늘것 = 숙제({ id: "today", date: "2026-09-15", items: items(8) });
  const 끝남 = 숙제({ id: "done", createdAt: madeOn("2026-09-15"), items: items(6, 6), completed: true });
  assert.deepEqual(suggestAhead([여유, 오늘것, 끝남], today, schedule), []);
});

test("미리 하기: 급한 것부터 (하루 몫이 큰 순)", () => {
  const today = new Date("2026-09-15T20:00:00");
  const a = 숙제({ id: "a", createdAt: madeOn("2026-09-15"), items: items(6) });              // 3개/일
  const b = 숙제({ id: "b", subject: "수학", createdAt: madeOn("2026-09-15"), items: items(9) }); // 기한 9/16 → 9개/일
  assert.deepEqual(suggestAhead([a, b], today, schedule).map((x) => x.todo.id), ["b", "a"]);
});

// ---------------------------------------------------------------------------
// 주간 돌아보기 (엄마 화면)
// ---------------------------------------------------------------------------
const at = (iso) => ({ toDate: () => new Date(iso) });

test("이번 주 시작은 월요일", () => {
  // 2026-09-12는 토요일 → 그 주 월요일은 9/7
  assert.equal(weekStart(new Date("2026-09-12T15:00:00")).getDate(), 7);
  // 월요일이면 그날이 시작
  assert.equal(weekStart(new Date("2026-09-07T01:00:00")).getDate(), 7);
  // 일요일은 아직 그 주에 속한다 (월요일 시작이므로 9/7)
  assert.equal(weekStart(new Date("2026-09-13T23:00:00")).getDate(), 7);
});

test("이번 주: 받은 것·끝낸 것·남은 항목·밀린 것·과목별", () => {
  const today = new Date("2026-09-12T20:00:00");   // 토
  const list = [
    // 이번 주에 받아 이번 주에 끝냄
    { id: "a", subject: "영어", category: "숙제", completed: true, date: "2026-09-10",
      createdAt: at("2026-09-08T10:00:00"), updatedAt: at("2026-09-11T20:00:00") },
    // 이번 주에 받았고 아직 남음 — 기한이 지났다 (밀림)
    { id: "b", subject: "영어", category: "숙제", completed: false, date: "2026-09-11",
      createdAt: at("2026-09-09T10:00:00"), items: [{ text: "1", done: true }, { text: "2" }, { text: "3" }] },
    // 지난주에 받았고 아직 남음 — 기한은 아직
    { id: "c", subject: "수학", category: "숙제", completed: false, date: "2026-09-20",
      createdAt: at("2026-09-01T10:00:00") },
    // 날짜 없는 영어 숙제: 9/9(수)에 받음 → 다음 영어 수업 9/10(목)이 기한 → 밀림
    { id: "d", subject: "영어", category: "숙제", completed: false, date: "",
      createdAt: at("2026-09-09T10:00:00") },
  ];
  const r = weeklyReview(list, today, schedule);
  assert.equal(r.받음, 3);
  assert.equal(r.끝냄, 1);
  assert.equal(r.남음, 4);                       // b 2개 + c 1개 + d 1개
  assert.deepEqual(r.밀림.map((x) => [x.todo.id, x.due]), [["d", "2026-09-10"], ["b", "2026-09-11"]]);
  assert.deepEqual(r.과목별, [{ subject: "영어", 남은: 3 }, { subject: "수학", 남은: 1 }]);
});

// ---------------------------------------------------------------------------
// 연속 달성
// ---------------------------------------------------------------------------
test("연속: 어제 했으면 이어지고, 걸렀으면 1부터", () => {
  assert.equal(dayBefore("2026-09-12"), "2026-09-11");
  assert.equal(dayBefore("2026-09-01"), "2026-08-31");
  assert.equal(advanceStreak(4, "2026-09-11", "2026-09-12"), 5);   // 어제 → 이어짐
  assert.equal(advanceStreak(4, "2026-09-10", "2026-09-12"), 1);   // 하루 걸렀다 → 처음부터
  assert.equal(advanceStreak(0, null, "2026-09-12"), 1);           // 첫날
  assert.equal(advanceStreak(4, "2026-09-12", "2026-09-12"), 4);   // 오늘 이미 받았으면 그대로
});

test("연속 표시: 끊겼으면 0으로 보여 준다", () => {
  assert.equal(visibleStreak(5, "2026-09-12", "2026-09-12"), 5);   // 오늘 했다
  assert.equal(visibleStreak(5, "2026-09-11", "2026-09-12"), 5);   // 어제까지 했다 (오늘 하면 6)
  assert.equal(visibleStreak(5, "2026-09-10", "2026-09-12"), 0);   // 끊겼다
  assert.equal(visibleStreak(0, null, "2026-09-12"), 0);
});

console.log(failed ? "\n" + failed + "개 실패" : "\n모두 통과");
process.exit(failed ? 1 : 0);
