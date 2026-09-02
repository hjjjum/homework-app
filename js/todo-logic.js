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
    for (const b of buckets) {
      b.총 += 1;
      if (todo.completed) b.완료 += 1;
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
