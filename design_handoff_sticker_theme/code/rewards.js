/* ---------------------------------------------------------------------------
 * rewards.js — 성취 연출 담당 (진행 링 · 연속 달성 · 스티커 판 · 축하 화면)
 * Firestore를 건드리지 않는다. 보상 상태는 그 아이의 기기 localStorage에만 둔다.
 *
 * app.js에서 이렇게 쓴다:
 *   import { initRewards } from "./rewards.js";
 *   const rewards = initRewards(studentId);          // initApp() 안, render() 전에
 *   rewards.setProgress(calcProgress(state.todos)[ALL]);   // renderProgress() 끝에
 *   rewards.onCompleted();                           // 체크가 완료로 바뀔 때
 * --------------------------------------------------------------------------- */

import { STICKERS, GROUPS, PICK_CUTE, PICK_CALM, createSticker, getSticker } from "./stickers.js";

const BOARD_GOAL = 8;         // 스티커 판 칸 수
const KEY = (id) => "hw.rewards." + id;
const today = () => new Date().toISOString().slice(0, 10);

function load(studentId) {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY(studentId))) || {}; } catch (e) { saved = {}; }
  return {
    picked: Array.isArray(saved.picked) && saved.picked.length ? saved.picked
      : (studentId === "daughter1" ? PICK_CALM.slice() : PICK_CUTE.slice()),
    board: Array.isArray(saved.board) ? saved.board : [],   // 채워진 스티커 id 목록
    streak: Number(saved.streak) || 0,
    lastClearDate: saved.lastClearDate || null,
    theme: saved.theme || (studentId === "daughter1" ? "calm" : "candy")
  };
}

function save(studentId, s) {
  try {
    localStorage.setItem(KEY(studentId), JSON.stringify({
      picked: s.picked, board: s.board, streak: s.streak,
      lastClearDate: s.lastClearDate, theme: s.theme
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

export function initRewards(studentId, options) {
  const opts = options || {};
  const state = load(studentId);
  const host = document.querySelector(opts.panelSelector || "#reward-panel");
  const ringHost = document.querySelector(opts.ringSelector || "#progress-ring");
  let lastRatio = null;

  document.body.dataset.theme = state.theme;

  // --- 배경 그림 -----------------------------------------------------------
  if (!document.querySelector(".bg-art")) {
    const art = el("div", "bg-art");
    art.setAttribute("aria-hidden", "true");
    art.innerHTML =
      '<span class="bg-sky"></span>' +
      '<span class="bg-cloud bg-cloud--1"></span>' +
      '<span class="bg-cloud bg-cloud--2"></span>' +
      '<span class="bg-twinkle bg-twinkle--1"></span>' +
      '<span class="bg-twinkle bg-twinkle--2"></span>' +
      '<span class="bg-twinkle bg-twinkle--3"></span>' +
      '<span class="bg-blob bg-blob--1"></span>' +
      '<span class="bg-blob bg-blob--2"></span>' +
      '<span class="bg-stripe"></span>';
    document.body.prepend(art);
  }

  // --- 진행 링 -------------------------------------------------------------
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

  // --- 스티커 판 · 연속 달성 · 고르기 ---------------------------------------
  function renderPanel() {
    if (!host) return;
    host.textContent = "";
    host.className = "reward-panel";

    const streakRow = el("div", "streak");
    streakRow.append(el("span", "streak-star"), el("b", null, state.streak + "일 연속"));
    host.appendChild(streakRow);

    const card = el("section", "card card--board");
    const head = el("div", "board-head");
    head.append(el("h2", null, "스티커 판"), el("span", "board-count", state.board.length + " / " + BOARD_GOAL));
    card.appendChild(head);

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
    card.appendChild(grid);
    card.appendChild(el("p", "hint", BOARD_GOAL + "칸을 다 채우면 엄마와 약속한 상을 받아요."));

    const pickBtn = el("button", "btn btn--ghost btn--block", "스티커 고르기 (" + state.picked.length + "종)");
    pickBtn.type = "button";
    pickBtn.addEventListener("click", openPicker);
    card.appendChild(pickBtn);

    host.appendChild(card);
  }

  // --- 스티커 고르기 시트 ---------------------------------------------------
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

  // --- 완주 축하 ----------------------------------------------------------
  function celebrate(stickerId) {
    buzz([18, 60, 18]);
    const modal = el("div", "celebrate");
    const box = el("div", "celebrate-box");
    const art = el("div", "celebrate-art");
    art.appendChild(createSticker(stickerId, 104));
    box.appendChild(art);
    box.appendChild(el("h2", null, "오늘 할 일 끝!"));
    box.appendChild(el("p", null, getSticker(stickerId).name + " 스티커를 받았어요. " + state.streak + "일 연속 달성 중이에요."));
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
    /** 체크 하나가 완료로 바뀔 때 (짧은 진동) */
    onCompleted() { buzz(15); },
    /** renderProgress() 끝에서 호출. calcProgress()[ALL] 객체를 그대로 넘기면 된다. */
    setProgress(p) {
      const ratio = p && typeof p.비율 === "number" ? p.비율 : 0;
      renderRing(ratio);
      if (ringHost) {
        const c = ringHost.querySelector(".ring-count");
        if (c) c.textContent = p.완료 + "/" + p.총;
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
    setTheme(name) { state.theme = name; document.body.dataset.theme = name; save(studentId, state); }
  };
}
