// ---------------------------------------------------------------------------
// todo-logic.js
// 딸 화면(app.js)과 엄마 화면(mom.js)이 함께 쓰는 순수 함수 모음.
// DOM도 Firestore도 건드리지 않으므로 Node에서 그대로 테스트할 수 있다.
// ---------------------------------------------------------------------------
import { CATEGORIES } from "./db.js";

export const ALL = "전체";
export const FILTERS = [ALL, ...CATEGORIES];

/** 카테고리 → CSS에서 쓸 영문 키. 뱃지 색상은 style.css의 --cat-* 토큰이 정한다. */
export const CATEGORY_KEY = {
  숙제: "homework",
  개인스케줄: "schedule",
  공부: "study",
};

/** 과목 → CSS에서 쓸 영문 키. 색상은 style.css의 --sub-* 토큰이 정한다. */
export const SUBJECT_KEY = {
  수학: "math",
  영어: "english",
  과학: "science",
  국어: "korean",
  사회: "social",
  기타: "etc",
};

/** 카테고리로 거른다. "전체"면 그대로 통과. 원본 배열은 건드리지 않는다. */
export function filterByCategory(todos, category) {
  if (!category || category === ALL) return todos.slice();
  return todos.filter((t) => t.category === category);
}

/**
 * 미완료/완료로 나눈다. 각 그룹 안의 순서는 들어온 순서(최신순)를 그대로 유지한다.
 * 오늘 날짜 같은 기준으로 거르지 않는다 — 삭제하기 전까지 모든 항목이 계속 남는다.
 */
export function splitByCompleted(todos) {
  return {
    active: todos.filter((t) => !t.completed),
    completed: todos.filter((t) => t.completed),
  };
}

/**
 * 할일 하나가 진행률에서 차지하는 몫을 센다.
 * 세부 항목이 있으면 항목 하나하나를 세고, 없으면 할일 자체를 1개로 센다.
 * (학원 숙제 1건 안에 4개가 들어있는데 1개로 세면 체감과 맞지 않는다)
 * @returns {{총: number, 완료: number}}
 */
export function countTodo(todo) {
  const items = Array.isArray(todo?.items) ? todo.items : [];
  if (items.length > 0) {
    return { 총: items.length, 완료: items.filter((i) => i && i.done).length };
  }
  return { 총: 1, 완료: todo?.completed ? 1 : 0 };
}

/** 세부 항목이 모두 끝났는지 (모두 끝나면 그 숙제는 완료로 본다) */
export function allItemsDone(todo) {
  const items = Array.isArray(todo?.items) ? todo.items : [];
  return items.length > 0 && items.every((i) => i && i.done);
}

/**
 * 전체 + 카테고리별 진행률을 계산한다.
 * 예) { 전체: {완료: 8, 총: 15, 비율: 53}, 숙제: {완료: 3, 총: 5, 비율: 60}, ... }
 * 항목이 없는 카테고리도 0으로 채워서 항상 같은 모양을 돌려준다.
 */
export function calcProgress(todos) {
  const empty = () => ({ 완료: 0, 총: 0, 비율: 0 });
  const result = { [ALL]: empty() };
  for (const c of CATEGORIES) result[c] = empty();

  for (const todo of todos || []) {
    const buckets = [result[ALL]];
    // 알 수 없는 카테고리는 전체에만 반영한다.
    if (result[todo.category]) buckets.push(result[todo.category]);
    const { 총, 완료 } = countTodo(todo);
    for (const b of buckets) {
      b.총 += 총;
      b.완료 += 완료;
    }
  }

  for (const key of Object.keys(result)) {
    const b = result[key];
    b.비율 = b.총 === 0 ? 0 : Math.round((b.완료 / b.총) * 100);
  }
  return result;
}

/**
 * "2026-09-05" 같은 마감일을 화면에 보여줄 짧은 문구로 바꾼다.
 * today를 인자로 받으므로 오늘 날짜와 무관하게 테스트할 수 있다.
 * @returns {{text: string, tone: "past"|"today"|"soon"|"later"}|null}
 */
export function formatDue(dateStr, today = new Date()) {
  if (typeof dateStr !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;

  const [y, m, d] = dateStr.split("-").map(Number);
  const due = new Date(y, m - 1, d);
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((due - base) / 86400000);

  if (days < 0) return { text: "지났어요", tone: "past" };
  if (days === 0) return { text: "오늘", tone: "today" };
  if (days === 1) return { text: "내일", tone: "soon" };
  return { text: m + "월 " + d + "일", tone: "later" };
}

/**
 * 두 날짜가 같은 날인가 (그 사람이 사는 곳의 날짜 기준).
 * toISOString()으로 비교하면 UTC라서 한국(UTC+9)에서는 자정~오전 9시가
 * 어제로 잡힌다. 아침에 보낸 응원이 안 보이는 걸 막기 위한 것이다.
 */
export function sameDay(a, b) {
  if (!(a instanceof Date) || !(b instanceof Date)) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// --- 마감일 ------------------------------------------------------------------
// 숙제는 날짜를 비워두는 게 기본이고, 그 뜻은 "다음 수업 시간까지"다.
// 학원 숙제는 대부분 그렇기 때문에, 엄마가 매번 날짜를 고르지 않아도 되게 했다.
// date에 값이 있으면 그 날짜가 이긴다.

export const NEXT_CLASS = "다음 수업까지";

/**
 * 화면에 붙일 마감 뱃지를 정한다.
 * 날짜가 있으면 formatDue 그대로, 없으면 숙제에 한해 "다음 수업까지".
 * (개인스케줄·공부는 날짜가 없으면 뱃지도 없다)
 * @returns {{text: string, tone: "past"|"today"|"soon"|"later"|"next"}|null}
 */
export function dueLabel(todo, today = new Date()) {
  const due = formatDue(todo && todo.date, today);
  if (due) return due;
  if (todo && todo.category === "숙제") return { text: NEXT_CLASS, tone: "next" };
  return null;
}

/** Date → "YYYY-MM-DD" (그 사람이 사는 곳 기준. toISOString은 UTC라 하루가 밀린다) */
export function toDateValue(d) {
  if (!(d instanceof Date) || isNaN(d)) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

/** 오늘로부터 days일 뒤의 "YYYY-MM-DD" */
export function shiftDate(days, base = new Date()) {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
  return toDateValue(d);
}

/**
 * 긴급 → 나머지 순으로 정렬한다. 같은 급 안의 순서는 그대로 둔다.
 * (원본 배열은 건드리지 않는다)
 */
export function sortByUrgency(todos) {
  const list = (todos || []).slice();
  return list
    .map((t, i) => ({ t, i }))
    .sort((a, b) => (b.t.urgent === true) - (a.t.urgent === true) || a.i - b.i)
    .map((x) => x.t);
}
