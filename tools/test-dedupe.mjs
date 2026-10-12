// ---------------------------------------------------------------------------
// tools/test-dedupe.mjs — 중복 입력 막기(js/dedupe.js) 회귀 테스트
//
//   node tools/test-dedupe.mjs
//
// 엄마가 같은 캡쳐·같은 카톡 메시지를 두 번 넣었을 때를 잡아내는지 본다.
// DOM도 Firestore도 쓰지 않는 순수 함수라 그냥 import 해서 돌린다.
// ---------------------------------------------------------------------------

import assert from "node:assert/strict";
import {
  normalizeTitle, batchFingerprint, findSentRecord, rememberSent, duplicateStudents, sentDateLabel,
} from "../js/dedupe.js";

let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log("  ok  " + name);
  } catch (err) {
    failed++;
    console.log("  FAIL  " + name + "\n        " + err.message);
  }
}

const DAY = 86400000;
const now = Date.parse("2026-10-12T20:00:00+09:00");

console.log("\n제목 다듬기");
test("띄어쓰기·기호·번호를 무시한다", () => {
  assert.equal(normalizeTitle("① Reading p.12~15"), normalizeTitle("reading  p 12 15"));
  assert.equal(normalizeTitle("[영어] 단어 시험"), normalizeTitle("영어 단어시험"));
  assert.equal(normalizeTitle(""), "");
  assert.equal(normalizeTitle(null), "");
});
test("내용이 다르면 다르게 본다", () => {
  assert.notEqual(normalizeTitle("수학 36쪽"), normalizeTitle("수학 37쪽"));
});

console.log("\n원본 지문");
const 캡쳐 = [
  { title: "Reading p.12~15", items: [{ text: "단어 외우기" }, { text: "문제 풀기" }] },
  { title: "Novel 3장", items: [] },
];
test("같은 사진·같은 글에서 나온 카드들은 지문이 같다", () => {
  assert.equal(batchFingerprint(캡쳐), batchFingerprint(캡쳐.map((d) => ({ ...d }))));
});
test("카드 순서가 바뀌어도 같은 지문", () => {
  assert.equal(batchFingerprint(캡쳐), batchFingerprint(캡쳐.slice().reverse()));
});
test("세부 항목이 문자열로 와도 같은 지문 (파서마다 모양이 다르다)", () => {
  const 문자열항목 = [{ title: "Reading p.12~15", items: ["단어 외우기", "문제 풀기"] }, { title: "Novel 3장" }];
  assert.equal(batchFingerprint(캡쳐), batchFingerprint(문자열항목));
});
test("내용이 하나라도 다르면 다른 지문", () => {
  const 다른캡쳐 = [{ title: "Reading p.12~15", items: [{ text: "단어 외우기" }] }, { title: "Novel 4장" }];
  assert.notEqual(batchFingerprint(캡쳐), batchFingerprint(다른캡쳐));
});
test("빈 내용으로는 지문을 만들지 않는다", () => {
  assert.equal(batchFingerprint([]), "");
  assert.equal(batchFingerprint([{ title: "   ", items: [] }]), "");
});

console.log("\n보낸 지문 기억하기");
test("보낸 지문을 찾아낸다", () => {
  const log = rememberSent({}, "abc", { at: now - 2 * DAY, titles: ["Reading p.12~15"] });
  const found = findSentRecord(log, "abc");
  assert.equal(found.at, now - 2 * DAY);
  assert.deepEqual(found.titles, ["Reading p.12~15"]);
  assert.equal(findSentRecord(log, "zzz"), null);
  assert.equal(findSentRecord(log, ""), null);
});
test("60일이 지난 기록은 버린다 — 한 달 뒤 같은 범위는 새 숙제다", () => {
  const old = { 오래된: { at: now - 70 * DAY, titles: [] }, 최근: { at: now - 10 * DAY, titles: [] } };
  const log = rememberSent(old, "새것", { at: now });
  assert.equal(findSentRecord(log, "오래된"), null);
  assert.ok(findSentRecord(log, "최근"));
  assert.ok(findSentRecord(log, "새것"));
});
test("망가진 기록이 섞여 있어도 터지지 않는다", () => {
  const log = rememberSent({ 이상한: null, 또이상한: { at: "어제" } }, "ok", { at: now });
  assert.deepEqual(Object.keys(log), ["ok"]);
});

console.log("\n제목 대조");
const kids = {
  daughter1: [
    { title: "Reading p.12~15", createdAt: now - 1 * DAY },
    { title: "수학 36쪽", createdAt: now - 30 * DAY },      // 오래된 것
  ],
  daughter2: [{ title: "피아노 연습", createdAt: now - 2 * DAY, completed: true }],
};
test("이미 받은 아이만 중복으로 본다", () => {
  assert.deepEqual(duplicateStudents({ title: "① Reading p.12~15" }, kids, now), ["daughter1"]);
});
test("아무도 안 받았으면 빈 배열", () => {
  assert.deepEqual(duplicateStudents({ title: "과학 실험 보고서" }, kids, now), []);
});
test("완료한 숙제도 중복으로 본다 — 하고 있는 숙제가 또 들어오면 제일 헷갈린다", () => {
  assert.deepEqual(duplicateStudents({ title: "피아노 연습" }, kids, now), ["daughter2"]);
});
test("14일보다 오래된 숙제는 중복으로 보지 않는다", () => {
  assert.deepEqual(duplicateStudents({ title: "수학 36쪽" }, kids, now), []);
});
test("제목이 비면 비교하지 않는다", () => {
  assert.deepEqual(duplicateStudents({ title: "" }, kids, now), []);
});
test("서버 시간이 아직 안 온 숙제는 방금 것으로 본다", () => {
  const 방금 = { daughter1: [{ title: "새 숙제", createdAt: null }] };
  assert.deepEqual(duplicateStudents({ title: "새 숙제" }, 방금, now), ["daughter1"]);
});
test("Firestore Timestamp 모양도 읽는다", () => {
  const ts = { daughter1: [{ title: "영어 숙제", createdAt: { seconds: (now - DAY) / 1000 } }] };
  assert.deepEqual(duplicateStudents({ title: "영어 숙제" }, ts, now), ["daughter1"]);
});

console.log("\n날짜 문구");
test("보낸 날을 사람이 읽는 말로", () => {
  assert.equal(sentDateLabel(Date.parse("2026-09-28T10:00:00+09:00")), "9월 28일");
});

console.log(failed ? "\n" + failed + "개 실패" : "\n모두 통과");
process.exit(failed ? 1 : 0);
