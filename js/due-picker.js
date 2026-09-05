// ---------------------------------------------------------------------------
// due-picker.js
// 마감일 고르기 한 줄. 엄마 화면과 딸 화면이 같은 것을 쓴다.
//
// 값은 빈 문자열("다음 수업까지") 또는 "YYYY-MM-DD"다.
// 대부분의 학원 숙제는 "다음 수업까지"라서 그것이 기본값이고, 오늘/내일/모레는
// 한 번만 누르면 되게 뒀다. 그 밖의 날짜만 달력을 연다.
// ---------------------------------------------------------------------------
import { shiftDate, nextWeekday, shortDate } from "./todo-logic.js";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/**
 * @param {string} value 처음 값 ("" = 다음 수업까지)
 * @param {(value: string) => void} [onChange] 값이 바뀔 때
 * @returns {HTMLElement} dataset.value에 현재 값이 들어 있다
 */
export function createDuePicker(value, onChange) {
  const wrap = el("div", "due-picker");
  wrap.setAttribute("role", "group");
  wrap.setAttribute("aria-label", "마감일");
  wrap.dataset.value = typeof value === "string" ? value : "";

  const date = document.createElement("input");
  date.type = "date";
  date.className = "field due-picker-date";
  date.value = wrap.dataset.value;
  date.setAttribute("aria-label", "다른 날짜 고르기");

  // 요일 칩은 "이번 주말까지" 같은 숙제를 한 번에 고르라고 둔 것이다.
  // 날짜를 병기하는 이유: 토요일에 누른 [토]는 다음 주 토요일이라 병기가 없으면 오해한다.
  const weekday = (label, dow) => {
    const value = nextWeekday(dow);
    return [label + " " + shortDate(value), value];
  };

  const presets = [
    ["다음 수업까지", ""],
    ["오늘", shiftDate(0)],
    ["내일", shiftDate(1)],
    ["모레", shiftDate(2)],
    weekday("토", 6),
    weekday("일", 0),
  ]
    // 토/일이 내일·모레와 같은 날이면 그 칩은 뺀다 (같은 날짜 칩이 둘이면 헷갈린다)
    .filter(([, v], i, all) => all.findIndex(([, other]) => other === v) === i);
  const chips = [];

  function sync(next) {
    wrap.dataset.value = next;
    date.value = next;
    for (const chip of chips) {
      chip.setAttribute("aria-pressed", String(chip.dataset.value === next));
    }
    // 위 칩 중 어디에도 없는 날짜(=달력으로 고른 날)만 입력칸을 강조한다
    wrap.classList.toggle("has-custom", !!next && !presets.some(([, v]) => v === next));
    if (typeof onChange === "function") onChange(next);
  }

  const row = el("div", "due-chips");
  for (const [label, v] of presets) {
    const chip = el("button", "due-chip", label);
    chip.type = "button";
    chip.dataset.value = v;
    chip.addEventListener("click", (e) => {
      // 목록의 이벤트 위임에 잡히지 않도록 여기서 끊는다
      e.stopPropagation();
      sync(v);
    });
    chips.push(chip);
    row.appendChild(chip);
  }

  date.addEventListener("click", (e) => e.stopPropagation());
  date.addEventListener("change", (e) => {
    e.stopPropagation();
    sync(date.value);
  });
  date.addEventListener("input", (e) => e.stopPropagation());

  wrap.append(row, date);
  sync(wrap.dataset.value);
  return wrap;
}

/**
 * 급한 일 표시. 느낌표는 너무 딱딱해서, 둥근 번개(빨리 하자)로 그린다.
 * 색은 CSS가 정한다 (currentColor).
 */
export function urgentIcon() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", "urgent-mark");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(ns, "path");
  // 모서리를 둥글게 굴린 번개. 뾰족한 끝이 없어 부드럽게 보인다.
  path.setAttribute(
    "d",
    "M13.6 2.6a1 1 0 0 1 1.8.9l-1.7 5.3a.6.6 0 0 0 .6.8h3.1a1.2 1.2 0 0 1 .95 1.95l-7.9 10a1 1 0 0 1-1.77-.83l1.62-5.15a.6.6 0 0 0-.57-.78H6.6a1.2 1.2 0 0 1-.94-1.95Z"
  );
  path.setAttribute("fill", "currentColor");
  svg.appendChild(path);
  return svg;
}

/**
 * 급한 일 토글 단추.
 * @param {boolean} on
 * @param {(next: boolean) => void} [onChange]
 */
export function createUrgentToggle(on, onChange) {
  const btn = el("button", "urgent-btn");
  btn.type = "button";
  btn.append(urgentIcon(), el("span", null, "급해요"));
  btn.title = "급한 일로 표시";

  function sync(next) {
    btn.dataset.on = next ? "true" : "false";
    btn.setAttribute("aria-pressed", String(next));
    if (typeof onChange === "function") onChange(next);
  }
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    sync(btn.dataset.on !== "true");
  });
  sync(on === true);
  return btn;
}
