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
const { arrangeTodos, sortByDeadline } = await import("../js/todo-logic.js");

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

console.log(failed ? "\n" + failed + "개 실패" : "\n모두 통과");
process.exit(failed ? 1 : 0);
