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

/** 요일 이름 (0=일) */
const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * 그 과목 학원이 다음에 언제 있는지. 기준일 **다음 날부터** 찾는다 —
 * 오늘 수업에서 받아온 숙제는 오늘이 아니라 다음 수업까지가 기한이기 때문이다.
 * @param {number[]} days 0=일 … 6=토
 * @param {Date} from 기준일 (보통 숙제를 받은 날)
 * @returns {string} "YYYY-MM-DD" — 요일이 없으면 빈 문자열
 */
export function nextClassDate(days, from = new Date()) {
  if (!Array.isArray(days) || days.length === 0) return "";
  const base = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (let i = 1; i <= 7; i++) {
    const day = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    if (days.includes(day.getDay())) return toDateValue(day);
  }
  return "";
}

/** 그 과목 학원의 요일들 (한 과목에 학원이 둘이면 합친다) */
export function daysForSubject(schedule, subject) {
  const days = (schedule || [])
    .filter((a) => a && a.subject === subject && Array.isArray(a.days))
    .flatMap((a) => a.days);
  return [...new Set(days)].sort();
}

/**
 * 그 숙제가 실제로 언제까지인지.
 * 날짜가 적혀 있으면 그대로, 비어 있는 숙제("다음 수업까지")는 학원 요일로 계산한다.
 * 받은 날(createdAt)을 기준으로 그 **다음 수업일**이 기한이다.
 * @returns {string} "YYYY-MM-DD" — 알 수 없으면 빈 문자열
 */
export function effectiveDue(todo, schedule, today = new Date()) {
  if (!todo) return "";
  if (typeof todo.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(todo.date)) return todo.date;
  if (todo.category !== "숙제") return "";
  const days = daysForSubject(schedule, todo.subject);
  if (days.length === 0) return "";
  const made = todo.createdAt && typeof todo.createdAt.toDate === "function"
    ? todo.createdAt.toDate()
    : today;
  return nextClassDate(days, made);
}

/**
 * 화면에 붙일 마감 뱃지를 정한다.
 * 날짜가 있으면 formatDue 그대로. 날짜가 없는 숙제는 학원 요일을 알면 "화요일까지",
 * 모르면 예전처럼 "다음 수업까지".
 * (개인스케줄·공부는 날짜가 없으면 뱃지도 없다)
 * @param {Array} [schedule] 학원 요일 (없으면 예전과 같이 동작한다)
 * @returns {{text: string, tone: "past"|"today"|"soon"|"later"|"next"}|null}
 */
export function dueLabel(todo, today = new Date(), schedule) {
  const due = formatDue(todo && todo.date, today);
  if (due) return due;
  if (!todo || todo.category !== "숙제") return null;
  const guess = effectiveDue(todo, schedule, today);
  if (guess) {
    const label = formatDue(guess, today);
    const [, m, d] = guess.split("-").map(Number);
    const weekday = DAY_NAMES[new Date(guess.slice(0, 4), m - 1, d).getDay()];
    // "오늘"·"내일"·"지났어요"는 그대로 두고, 먼 날짜만 요일로 바꿔 준다
    if (label && label.tone === "later") return { text: weekday + "요일까지", tone: "next" };
    if (label) return label;
  }
  return { text: NEXT_CLASS, tone: "next" };
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
 * 오늘 이후로 가장 가까운 그 요일의 "YYYY-MM-DD".
 * 오늘이 그 요일이면 오늘이 아니라 **다음 주**를 준다 — [오늘] 칩이 따로 있으므로
 * 토요일에 누른 [토]가 오늘을 뜻하면 두 칩이 같은 날이 되어 헷갈린다.
 * @param {number} dow 0=일 … 6=토
 */
export function nextWeekday(dow, base = new Date()) {
  const diff = (dow - base.getDay() + 7) % 7;
  return shiftDate(diff === 0 ? 7 : diff, base);
}

/** "2026-09-05" → "9/5" (칩에 날짜를 병기할 때 쓴다). 형식이 아니면 빈 문자열. */
export function shortDate(dateStr) {
  if (typeof dateStr !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return "";
  const [, m, d] = dateStr.split("-").map(Number);
  return m + "/" + d;
}

/**
 * "오늘 해야 할 몫"을 고른다. 진행 링과 스티커 판정의 분모가 되는 목록이다.
 *
 * 숙제는 계속 쌓이기 때문에 전체를 분모로 삼으면 100%가 영영 오지 않는다.
 * 그래서 오늘 치를 것만 센다:
 *   - 마감이 오늘이거나 지난 것
 *   - 급한 일(urgent) — 마감이 언제든 오늘 몫이다
 * 날짜가 없는 것("다음 수업까지")은 **넣지 않는다.** 오늘 하고 싶으면
 * 마감일을 [오늘]로 옮기면 되고, 그것이 아이가 하루 목표를 정하는 방법이다.
 *
 * (원본 배열은 건드리지 않는다)
 */
export function selectToday(todos, today = new Date(), schedule) {
  const limit = toDateValue(today instanceof Date && !isNaN(today) ? today : new Date());
  return (todos || []).filter((todo) => {
    if (!todo) return false;
    if (todo.urgent === true) return true;
    // 날짜가 비어 있어도 학원 요일을 알면 그날이 기한이다
    const date = effectiveDue(todo, schedule, today);
    if (!date) return false;
    return date <= limit;   // "YYYY-MM-DD"는 문자열 비교로도 날짜순이 맞는다
  });
}

/**
 * "미리 해두면 좋은 숙제"를 고른다.
 *
 * 학원 숙제는 항목이 여러 개인데 마감 전날 몰아서 하면 버겁다. 남은 항목 수를
 * 남은 날수로 나눠, **오늘 몫을 채우고도 남을 만큼 큰 숙제**만 골라 권한다.
 * 오늘 몫(selectToday)에 이미 든 것과 마감이 지난 것은 제외한다 — 그건 "미리"가 아니다.
 *
 * @returns {Array<{todo: object, 남은항목: number, 남은날: number, 오늘몫: number}>}
 *          권할 게 없으면 빈 배열. 급한 순서(하루에 해야 할 몫이 큰 순)로 돌려준다.
 */
export function suggestAhead(todos, today = new Date(), schedule, options) {
  // 항목이 3개 이상이고, 하루에 1개보다 많이 해야 하면 권한다.
  // (실제 숙제로 맞춰 본 값 — 2개/일로 두면 "4개를 3일 안에" 같은 흔한 경우가 빠진다)
  const minPerDay = (options && options.minPerDay) || 1.2;
  const minItems = (options && options.minItems) || 3;
  const limit = toDateValue(today);
  const todayIds = new Set(selectToday(todos, today, schedule).map((t) => t.id));

  const out = [];
  for (const todo of todos || []) {
    if (!todo || todo.completed || todayIds.has(todo.id)) continue;
    const due = effectiveDue(todo, schedule, today);
    if (!due || due <= limit) continue;
    const counts = countTodo(todo);
    const 남은항목 = counts.총 - counts.완료;
    if (남은항목 < minItems) continue;
    const [y, m, d] = due.split("-").map(Number);
    const 남은날 = Math.max(
      1,
      Math.round(
        (new Date(y, m - 1, d) - new Date(today.getFullYear(), today.getMonth(), today.getDate())) /
          86400000
      )
    );
    const perDay = 남은항목 / 남은날;
    if (perDay < minPerDay) continue;
    out.push({ todo, 남은항목, 남은날, 오늘몫: Math.ceil(perDay) });
  }
  return out.sort((a, b) => b.남은항목 / b.남은날 - a.남은항목 / a.남은날);
}

// --- 주간 돌아보기 ------------------------------------------------------------
// 엄마 화면에서 "이번 주에 뭐가 오갔는지"를 한 줄로 보기 위한 계산.
// 항목(items) 단위로 세는 것은 나머지 화면과 같다 — 학원 숙제 1건에 4개면 4개로 센다.

/** Firestore Timestamp든 Date든 Date로 */
function toDate(value) {
  if (value && typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

/** 이번 주 시작(월요일) 0시 */
export function weekStart(today = new Date()) {
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const back = (base.getDay() + 6) % 7;   // 월=0 이 되도록
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() - back);
}

/**
 * 이번 주 돌아보기.
 *   받음   — 이번 주에 새로 들어온 숙제 수
 *   끝냄   — 이번 주에 끝낸 숙제 수 (마지막으로 움직인 시각 기준)
 *   남음   — 아직 안 끝난 항목 수
 *   밀림   — 기한이 지났는데 아직 안 끝난 것들 (학원 요일로 계산한 기한 포함)
 *   과목별 — 과목마다 남은 항목 수 (많은 순)
 */
export function weeklyReview(todos, today = new Date(), schedule) {
  const from = weekStart(today);
  const limit = toDateValue(today);
  const review = { 받음: 0, 끝냄: 0, 남음: 0, 밀림: [], 과목별: [] };
  const bySubject = new Map();

  for (const todo of todos || []) {
    if (!todo) continue;
    const made = toDate(todo.createdAt);
    if (made && made >= from) review.받음 += 1;

    const counts = countTodo(todo);
    if (todo.completed) {
      const moved = toDate(todo.updatedAt) || made;
      if (moved && moved >= from) review.끝냄 += 1;
      continue;
    }

    const 남은 = counts.총 - counts.완료;
    review.남음 += 남은;
    const subject = todo.subject || "기타";
    bySubject.set(subject, (bySubject.get(subject) || 0) + 남은);

    const due = effectiveDue(todo, schedule, today);
    if (due && due < limit) review.밀림.push({ todo, due, 남은 });
  }

  review.밀림.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
  review.과목별 = [...bySubject.entries()]
    .map(([subject, 남은]) => ({ subject, 남은 }))
    .sort((a, b) => b.남은 - a.남은);
  return review;
}

/**
 * 엄마가 방금 보낸 할일만 골라낸다. 화면에 "숙제가 왔어요" 배너를 띄울 때 쓴다.
 *
 * @param {Set<string>|null} seen 직전 구독에서 보고 있던 id들.
 *   **null이면 첫 구독**이라 아무것도 새 것이 아니다 — 앱을 열 때마다 예전 숙제까지
 *   전부 "새로 왔다"고 알리면 안 되기 때문이다.
 * @param {Array} todos 이번에 온 목록
 */
export function newFromMom(seen, todos) {
  if (!(seen instanceof Set)) return [];
  return (todos || []).filter((t) => t && t.addedBy === "mom" && !seen.has(t.id));
}

// --- 보기 순서 ----------------------------------------------------------------
// 목록을 "급한 순" 또는 "과목별"로 볼 수 있다. 딸 화면과 엄마 현황이 같은 규칙을 쓴다.

export const SORT_MODES = [
  { id: "urgent", label: "급한 순" },
  { id: "subject", label: "과목별" },
];

/** 과목 순서 (과목별 보기의 묶음 순서). db.js의 SUBJECTS와 같다. */
const SUBJECT_ORDER = ["수학", "영어", "과학", "국어", "사회", "기타"];

/**
 * 급한 순: 급한 일 → 마감이 이른 것 → 날짜 없는 것("다음 수업까지").
 * 같으면 원래 순서(최신순) 그대로. (원본 배열은 건드리지 않는다)
 */
export function sortByDeadline(todos) {
  const rank = (t) =>
    typeof t.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? t.date : "9999-99-99";
  return (todos || [])
    .map((t, i) => ({ t, i }))
    .sort(
      (a, b) =>
        (b.t.urgent === true) - (a.t.urgent === true) ||
        (rank(a.t) < rank(b.t) ? -1 : rank(a.t) > rank(b.t) ? 1 : 0) ||
        a.i - b.i
    )
    .map((x) => x.t);
}

/**
 * 보기 방식대로 묶는다. 화면은 묶음마다 머리글(과목 이름)을 붙여 그린다.
 * @param {"urgent"|"subject"} mode
 * @returns {Array<{subject: string|null, todos: object[]}>} 급한 순이면 묶음 하나(subject=null)
 */
export function arrangeTodos(todos, mode) {
  const sorted = sortByDeadline(todos);
  if (mode !== "subject") return sorted.length ? [{ subject: null, todos: sorted }] : [];
  const groups = [];
  for (const subject of SUBJECT_ORDER) {
    const inGroup = sorted.filter((t) => (SUBJECT_ORDER.includes(t.subject) ? t.subject : "기타") === subject);
    if (inGroup.length) groups.push({ subject, todos: inGroup });
  }
  return groups;
}
