// ---------------------------------------------------------------------------
// appearance.js
// 테마 · 배경 · 글꼴을 고르는 카드. 엄마 화면이 쓴다.
//
// 딸 화면은 이 모듈이 아니라 rewards.js가 같은 일을 한다 — 거기서는 스티커 판·
// 연속 달성과 한 덩어리이기 때문이다. 여기서 그 코드를 떼어오지 않는 이유는,
// rewards.js가 디자인 핸드오프 때마다 **파일 통째로 덮어써지는 파일**이라서다.
// 설정 코드를 옮겨두면 다음 덮어쓰기 때 되살아나 둘이 충돌한다.
// 그래서 목록(THEMES/BGS/FONTS)만 빌려 쓰고, 그리는 코드만 여기 따로 둔다.
//
//   import { initAppearance } from "./appearance.js";
//   const look = initAppearance("hw.appearance.mom");
//   host.appendChild(look.card);
// ---------------------------------------------------------------------------
import { THEMES, BGS, FONTS } from "./rewards.js";

/** 엄마 화면 기본값. 지금 쓰던 색(코랄=딸기우유)이라 켜자마자 달라 보이지 않는다. */
export const DEFAULT_LOOK = { theme: "strawberry", bg: "sky", font: "neat" };

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/** 저장된 값이 목록에 없으면(예전 값이 남아 있으면) 기본값으로 되돌린다. */
function load(key, defaults) {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(key)) || {}; } catch (e) { saved = {}; }
  const pick = (list, value, fallback) =>
    list.some((x) => x.id === value) ? value : fallback;
  return {
    theme: pick(THEMES, saved.theme, defaults.theme),
    bg: pick(BGS, saved.bg, defaults.bg),
    font: pick(FONTS, saved.font, defaults.font),
  };
}

function save(key, state) {
  try { localStorage.setItem(key, JSON.stringify(state)); }
  catch (e) { /* 사파리 프라이빗 모드 등 — 저장 실패는 무시 */ }
}

/**
 * 배경 그림 span을 만들어 둔다. 어떤 걸 보여줄지는 CSS(`[data-bg=...]`)가 정하므로
 * 전부 만들어 두면 된다. 딸 화면은 rewards.js가 같은 것을 만들기 때문에,
 * 이미 있으면 아무 일도 하지 않는다.
 */
function ensureBackground() {
  if (document.querySelector(".bg-art")) return;
  const art = el("div", "bg-art");
  art.setAttribute("aria-hidden", "true");
  art.innerHTML =
    '<span class="bg-top"></span>' +
    '<span class="bg-grid"></span><span class="bg-grid-top"></span>' +
    '<span class="bg-dots"></span>' +
    '<span class="bg-cloud bg-cloud--1"></span><span class="bg-cloud bg-cloud--2"></span>' +
    '<span class="bg-twinkle bg-twinkle--1"></span><span class="bg-twinkle bg-twinkle--2"></span>' +
    '<span class="bg-twinkle bg-twinkle--3"></span>' +
    '<span class="bg-blob bg-blob--1"></span><span class="bg-blob bg-blob--2"></span>' +
    '<span class="bg-blob bg-blob--3"></span>' +
    '<span class="bg-stripe"></span><span class="bg-checker"></span>' +
    '<span class="bg-warm-bottom"></span>';
  document.body.prepend(art);
}

function optButton(label, on, onClick, inner) {
  const btn = el("button", "opt" + (on ? " is-on" : ""));
  btn.type = "button";
  btn.setAttribute("aria-pressed", String(on));
  if (inner) btn.appendChild(inner);
  btn.appendChild(el("span", "opt-name", label));
  btn.addEventListener("click", onClick);
  return btn;
}

/**
 * 설정 카드를 만들고 저장된 값을 화면에 바로 적용한다.
 * @param {string} key localStorage 키. 화면마다 달라야 한다 (엄마 = "hw.appearance.mom")
 * @param {{theme: string, bg: string, font: string}} [defaults]
 * @returns {{card: HTMLElement, state: object}} card를 원하는 자리에 붙이면 된다
 */
export function initAppearance(key, defaults) {
  const state = load(key, defaults || DEFAULT_LOOK);
  const card = el("section", "card card--settings");

  function apply() {
    const root = document.documentElement;
    root.dataset.theme = state.theme;
    root.dataset.bg = state.bg;
    root.dataset.font = state.font;
  }

  function pickAndRedraw(changes) {
    Object.assign(state, changes);
    save(key, state);
    apply();
    render();
  }

  function render() {
    card.textContent = "";
    card.appendChild(el("h2", null, "꾸미기"));

    card.appendChild(el("p", "settings-label", "테마"));
    const themeRow = el("div", "opt-row");
    for (const t of THEMES) {
      const sw = el("span", "opt-swatches");
      for (const c of t.sw) { const i = el("i"); i.style.background = c; sw.appendChild(i); }
      // 테마를 고르면 그 테마의 기본 배경으로 함께 바꾼다 (그 뒤 배경만 따로 바꿀 수 있다)
      themeRow.appendChild(optButton(t.label, state.theme === t.id,
        () => pickAndRedraw({ theme: t.id, bg: t.bg }), sw));
    }
    card.appendChild(themeRow);

    card.appendChild(el("p", "settings-label", "배경화면"));
    const bgRow = el("div", "opt-row");
    for (const b of BGS) {
      bgRow.appendChild(optButton(b.label, state.bg === b.id,
        () => pickAndRedraw({ bg: b.id }), el("span", "opt-bg opt-bg--" + b.id)));
    }
    card.appendChild(bgRow);

    card.appendChild(el("p", "settings-label", "글꼴"));
    const fontRow = el("div", "opt-row opt-row--4");
    for (const f of FONTS) {
      const sample = el("span", "opt-font", "가나다");
      sample.style.fontFamily = f.family;   // 미리보기는 그 글꼴 그대로 보여준다
      fontRow.appendChild(optButton(f.label, state.font === f.id,
        () => pickAndRedraw({ font: f.id }), sample));
    }
    card.appendChild(fontRow);
  }

  ensureBackground();
  apply();
  render();

  return { card, state };
}
