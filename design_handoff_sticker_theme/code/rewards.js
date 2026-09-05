/* ---------------------------------------------------------------------------
 * rewards.js — 성취 연출 + 설정
 *   · 진행 링 / 연속 달성 / 스티커 판 / 완주 축하 / 체크할 때 터지는 조각
 *   · 설정: 테마 5종 · 배경 3종 · 글꼴 4종 · 스티커 골라 담기
 * Firestore를 건드리지 않는다. 전부 그 아이 기기의 localStorage에만 저장된다.
 *
 * app.js에서:
 *   import { initRewards } from "./rewards.js";
 *   const rewards = initRewards(studentId);              // initApp() 안, render() 전
 *   rewards.setProgress(calcProgress(state.todos)[ALL]); // renderProgress() 끝
 *   rewards.onCompleted(trigger);                        // 체크가 완료로 바뀔 때
 *   rewards.stickerFor(index)                            // 완료 도장에 쓸 스티커 id
 * --------------------------------------------------------------------------- */

import { STICKERS, GROUPS, PICK_CUTE, PICK_CALM, createSticker, getSticker } from "./stickers.js";

const BOARD_GOAL = 8;
const KEY = (id) => "hw.rewards." + id;
const today = () => new Date().toISOString().slice(0, 10);

export const THEMES = [
  { id: "strawberry", label: "딸기우유", bg: "sky", sw: ["#FF5B3E", "#FF7FAE", "#FFC93C"] },
  { id: "mint", label: "민트소다", bg: "dots", sw: ["#1FA98F", "#7FD8C4", "#FFD75E"] },
  { id: "lemon", label: "레몬버터", bg: "grid", sw: ["#E8802A", "#FFB35C", "#FFD230"] },
  { id: "lavender", label: "라벤더밤", bg: "dots", sw: ["#6C63C4", "#A79BE8", "#F7C948"] },
  { id: "matcha", label: "말차라떼", bg: "grid", sw: ["#6E8F3C", "#A8C46A", "#E8B04B"] }
];
export const BGS = [
  { id: "sky", label: "하늘" }, { id: "grid", label: "모눈" }, { id: "dots", label: "물방울" }
];
export const FONTS = [
  { id: "round", label: "동글", family: "'Jua',sans-serif" },
  { id: "neat", label: "또박", family: "'Gowun Batang',serif" },
  { id: "yache", label: "야체", family: "'YanoljaYache',sans-serif" },
  { id: "story", label: "즐거운이야기", family: "'JeulgeounIyagi',sans-serif" }
];

const BIT_COLORS = ["#FF5B3E", "#FF7FAE", "#FFC93C", "#8FD9EE", "#3FA86B", "#B9A7F0"];
const STAR_CLIP = "polygon(50% 0,60% 40%,100% 50%,60% 60%,50% 100%,40% 60%,0 50%,40% 40%)";

function load(studentId) {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY(studentId))) || {}; } catch (e) { saved = {}; }
  const teen = studentId === "daughter1";
  return {
    picked: Array.isArray(saved.picked) && saved.picked.length ? saved.picked
      : (teen ? PICK_CALM.slice() : PICK_CUTE.slice()),
    board: Array.isArray(saved.board) ? saved.board : [],
    streak: Number(saved.streak) || 0,
    lastClearDate: saved.lastClearDate || null,
    theme: saved.theme || (teen ? "lavender" : "strawberry"),
    bg: saved.bg || (teen ? "dots" : "sky"),
    font: saved.font || (teen ? "neat" : "round")
  };
}

function save(studentId, s) {
  try {
    localStorage.setItem(KEY(studentId), JSON.stringify({
      picked: s.picked, board: s.board, streak: s.streak,
      lastClearDate: s.lastClearDate, theme: s.theme, bg: s.bg, font: s.font
    }));
  } catch (e) { /* 사파리 프라이빗 모드 등 — 저장 실패는 무시 */ }
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function buzz(pattern) {
  if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) {} }
}

function reduced() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** 누른 자리에서 색종이 조각이 터진다. 체크 하나하나마다 호출한다. */
export function burstAt(anchor) {
  if (reduced()) return;
  const r = anchor && anchor.getBoundingClientRect
    ? anchor.getBoundingClientRect()
    : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };

  const burst = el("div", "burst");
  burst.setAttribute("aria-hidden", "true");
  burst.style.left = (r.left + r.width / 2) + "px";
  burst.style.top = (r.top + r.height / 2) + "px";
  burst.appendChild(el("span", "burst-wave"));

  for (let i = 0; i < 11; i++) {
    const arm = el("span", "burst-arm");
    arm.style.transform = "rotate(" + Math.round(i * (360 / 11)) + "deg)";
    const bit = el("i", "burst-bit");
    const size = i % 3 === 0 ? 9 : 6;
    bit.style.width = size + "px";
    bit.style.height = size + "px";
    bit.style.left = (-size / 2) + "px";
    bit.style.background = BIT_COLORS[i % BIT_COLORS.length];
    bit.style.borderRadius = i % 3 === 1 ? "50%" : "2px";
    if (i % 3 === 0) bit.style.clipPath = STAR_CLIP;
    bit.style.animationDelay = ((i % 4) * 0.035) + "s";
    arm.appendChild(bit);
    burst.appendChild(arm);
  }
  document.body.appendChild(burst);
  setTimeout(() => burst.remove(), 800);
}

export function initRewards(studentId, options) {
  const opts = options || {};
  const state = load(studentId);
  const host = document.querySelector(opts.panelSelector || "#reward-panel");
  const ringHost = document.querySelector(opts.ringSelector || "#progress-ring");
  let lastRatio = null;

  function applySettings() {
    const root = document.documentElement;
    root.dataset.theme = state.theme;
    root.dataset.bg = state.bg;
    root.dataset.font = state.font;
  }
  applySettings();

  /* --- 배경 그림: span만 만들어 두고 어떤 걸 보여줄지는 CSS(data-bg)가 정한다 --- */
  if (!document.querySelector(".bg-art")) {
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

  /* --- 진행 링 --- */
  function renderRing(ratio) {
    if (!ringHost) return;
    const C = 270.2; // 2πr, r=43
    if (!ringHost.querySelector("svg")) {
      ringHost.innerHTML =
        '<svg viewBox="0 0 104 104" aria-hidden="true">' +
        '<circle class="ring-track" cx="52" cy="52" r="43"></circle>' +
        '<circle class="ring-fill" cx="52" cy="52" r="43" stroke-dasharray="' + C + '" ' +
        'stroke-dashoffset="' + C + '" transform="rotate(-90 52 52)"></circle>' +
        "</svg>" +
        '<span class="ring-label"><b class="ring-pct">0%</b><i class="ring-count"></i></span>';
    }
    ringHost.querySelector(".ring-fill").setAttribute("stroke-dashoffset", String(C * (1 - ratio / 100)));
    ringHost.querySelector(".ring-pct").textContent = ratio + "%";
  }

  /* --- 보상 패널: 연속 달성 + 스티커 판 + 설정 --- */
  function optButton(cls, label, on, onClick, inner) {
    const btn = el("button", "opt" + (on ? " is-on" : ""));
    btn.type = "button";
    btn.setAttribute("aria-pressed", String(on));
    if (inner) btn.appendChild(inner);
    btn.appendChild(el("span", "opt-name", label));
    btn.addEventListener("click", onClick);
    if (cls) btn.classList.add(cls);
    return btn;
  }

  function renderPanel() {
    if (!host) return;
    host.textContent = "";
    host.className = "reward-panel";

    const streakRow = el("div", "streak");
    streakRow.append(el("span", "streak-star"), el("b", null, state.streak + "일 연속"));
    host.appendChild(streakRow);

    /* 스티커 판 */
    const board = el("section", "card card--board");
    const head = el("div", "board-head");
    head.append(el("h2", null, "스티커 판"), el("span", "board-count", state.board.length + " / " + BOARD_GOAL));
    board.appendChild(head);

    const grid = el("div", "board");
    for (let i = 0; i < BOARD_GOAL; i++) {
      const slot = el("div", "board-slot");
      const id = state.board[i];
      if (id) {
        slot.classList.add("is-filled");
        slot.appendChild(createSticker(id, 46, [-8, 6, -4, 9, -6, 4, -9, 7][i % 8]));
      }
      grid.appendChild(slot);
    }
    board.appendChild(grid);
    board.appendChild(el("p", "hint", BOARD_GOAL + "칸을 다 채우면 엄마와 약속한 상을 받아요."));

    const pickBtn = el("button", "btn btn--ghost btn--block", "스티커 고르기 (" + state.picked.length + "종)");
    pickBtn.type = "button";
    pickBtn.addEventListener("click", openPicker);
    board.appendChild(pickBtn);
    host.appendChild(board);

    /* 설정 */
    const set = el("section", "card card--settings");
    set.appendChild(el("h2", null, "설정"));

    set.appendChild(el("p", "settings-label", "테마"));
    const themeRow = el("div", "opt-row");
    for (const t of THEMES) {
      const sw = el("span", "opt-swatches");
      for (const c of t.sw) { const i = el("i"); i.style.background = c; sw.appendChild(i); }
      themeRow.appendChild(optButton(null, t.label, state.theme === t.id, () => {
        state.theme = t.id; state.bg = t.bg; save(studentId, state); applySettings(); renderPanel();
      }, sw));
    }
    set.appendChild(themeRow);

    set.appendChild(el("p", "settings-label", "배경화면"));
    const bgRow = el("div", "opt-row");
    for (const b of BGS) {
      bgRow.appendChild(optButton(null, b.label, state.bg === b.id, () => {
        state.bg = b.id; save(studentId, state); applySettings(); renderPanel();
      }, el("span", "opt-bg opt-bg--" + b.id)));
    }
    set.appendChild(bgRow);

    set.appendChild(el("p", "settings-label", "글꼴"));
    const fontRow = el("div", "opt-row opt-row--4");
    for (const f of FONTS) {
      const sample = el("span", "opt-font", "가나다");
      sample.style.fontFamily = f.family;   // 미리보기는 그 글꼴 그대로
      fontRow.appendChild(optButton(null, f.label, state.font === f.id, () => {
        state.font = f.id; save(studentId, state); applySettings(); renderPanel();
      }, sample));
    }
    set.appendChild(fontRow);
    host.appendChild(set);
  }

  /* --- 스티커 고르기 시트 --- */
  function openPicker() {
    const sheet = el("div", "sheet");
    const inner = el("div", "sheet-inner");
    inner.appendChild(el("h2", null, "스티커 고르기"));
    inner.appendChild(el("p", "hint", "담은 스티커만 완료 도장과 스티커 판에 쓰여요."));

    for (const group of GROUPS) {
      inner.appendChild(el("h3", "sheet-group", group));
      const grid = el("div", "pick-grid");
      for (const s of STICKERS.filter((x) => x.group === group)) {
        const btn = el("button", "pick" + (state.picked.includes(s.id) ? " is-on" : ""));
        btn.type = "button";
        btn.setAttribute("aria-pressed", String(state.picked.includes(s.id)));
        btn.appendChild(createSticker(s.id, 46));
        btn.appendChild(el("span", "pick-name", s.name));
        btn.addEventListener("click", () => {
          const on = state.picked.includes(s.id);
          state.picked = on ? state.picked.filter((x) => x !== s.id) : state.picked.concat(s.id);
          if (!state.picked.length) state.picked = [s.id];   // 최소 한 종은 남긴다
          btn.classList.toggle("is-on", state.picked.includes(s.id));
          btn.setAttribute("aria-pressed", String(state.picked.includes(s.id)));
          save(studentId, state);
          renderPanel();
          if (opts.onPickedChange) opts.onPickedChange(state.picked);
        });
        grid.appendChild(btn);
      }
      inner.appendChild(grid);
    }

    const close = el("button", "btn btn--primary btn--block", "다 골랐어요");
    close.type = "button";
    close.addEventListener("click", () => sheet.remove());
    inner.appendChild(close);

    sheet.appendChild(inner);
    sheet.addEventListener("click", (e) => { if (e.target === sheet) sheet.remove(); });
    document.body.appendChild(sheet);
  }

  /* --- 완주 축하 --- */
  function celebrate(stickerId) {
    buzz([18, 60, 18]);
    const modal = el("div", "celebrate");
    const box = el("div", "celebrate-box");
    const art = el("div", "celebrate-art");
    art.appendChild(createSticker(stickerId, 104));
    box.appendChild(art);
    box.appendChild(el("h2", null, "오늘 할 일 끝!"));
    box.appendChild(el("p", null,
      getSticker(stickerId).name + " 스티커를 받았어요. " + state.streak + "일 연속 달성 중이에요."));
    const ok = el("button", "btn btn--primary btn--block", "스티커 받기");
    ok.type = "button";
    ok.addEventListener("click", () => modal.remove());
    box.appendChild(ok);

    const confetti = el("div", "confetti");
    confetti.setAttribute("aria-hidden", "true");
    for (let i = 0; i < 28; i++) {
      const bit = el("span");
      bit.style.left = (3 + (i * 3.4) % 94) + "%";
      bit.style.animationDelay = ((i % 7) * 0.17) + "s";
      bit.style.animationDuration = (1.9 + (i % 5) * 0.32) + "s";
      confetti.appendChild(bit);
    }
    modal.append(confetti, box);
    document.body.appendChild(modal);
  }

  /** 하루에 한 번, 전부 끝냈을 때만 스티커를 한 장 준다. */
  function awardOnce() {
    if (state.lastClearDate === today()) return null;
    const next = state.picked[state.board.length % state.picked.length];
    state.board = state.board.length >= BOARD_GOAL ? [next] : state.board.concat(next);
    state.streak = state.streak + 1;
    state.lastClearDate = today();
    save(studentId, state);
    renderPanel();
    return next;
  }

  renderPanel();

  return {
    state,
    /** 체크 하나가 완료로 바뀔 때: 그 자리에서 조각이 터지고 짧게 진동한다. */
    onCompleted(anchor) { buzz(15); burstAt(anchor); },
    /** renderProgress() 끝에서 호출. calcProgress()[ALL] 객체를 그대로 넘기면 된다. */
    setProgress(p) {
      const ratio = p && typeof p.비율 === "number" ? p.비율 : 0;
      renderRing(ratio);
      if (ringHost) {
        const c = ringHost.querySelector(".ring-count");
        if (c && p) c.textContent = p.완료 + "/" + p.총;
      }
      const total = p ? p.총 : 0;
      if (lastRatio !== null && ratio === 100 && lastRatio < 100 && total > 0) {
        const given = awardOnce();
        if (given) celebrate(given);
      }
      lastRatio = ratio;
    },
    /** 지금 담긴 스티커 중 index번째 (완료 도장에 쓴다) */
    stickerFor(index) { return state.picked[index % state.picked.length]; },
    openPicker,
    setTheme(id) { state.theme = id; save(studentId, state); applySettings(); renderPanel(); },
    setBg(id) { state.bg = id; save(studentId, state); applySettings(); renderPanel(); },
    setFont(id) { state.font = id; save(studentId, state); applySettings(); renderPanel(); }
  };
}
