// ---------------------------------------------------------------------------
// mom.js
// mom.html 전용 로직. 두 개의 탭으로 나뉜다.
//   1) 입력      — 붙여넣은 글을 항목 카드로 나눠 딸들에게 보낸다 (쓰기 전용)
//   2) 현황 보기 — 딸의 할일을 실시간으로 지켜본다 (읽기 전용)
//
// "현황 보기"는 의도적으로 읽기 전용이다. 체크/수정/삭제는 각자 딸 화면에서만
// 할 수 있게 두어, 엄마가 대신 체크해 버리는 상황을 막는다.
// ---------------------------------------------------------------------------
import { addTodo, listenTodos, CATEGORIES, STUDENT_IDS } from "./db.js";
import {
  ALL,
  CATEGORY_KEY,
  calcProgress,
  splitByCompleted,
  formatDue,
} from "./todo-logic.js";
import { INPUT_SOURCES, getSource } from "./sources/index.js";

/** 화면에 보여줄 딸 이름. db의 studentId와 짝을 이룬다. */
export const STUDENT_LABEL = {
  daughter1: "첫째",
  daughter2: "둘째",
};

// ===========================================================================
// 순수 함수
// ===========================================================================

/**
 * 카드에 적힌 받는 사람 설정을 실제 studentId 배열로 바꾼다.
 * @param {{daughter1: boolean, daughter2: boolean}} recipients
 * @returns {string[]}
 */
export function recipientIds(recipients) {
  return STUDENT_IDS.filter((id) => recipients && recipients[id]);
}

/**
 * 보내기 결과 메시지를 만든다.
 * @param {number} itemCount 보낸 항목 수
 * @param {string[]} studentIds 실제로 받은 딸들
 */
export function buildSentMessage(itemCount, studentIds) {
  const names = studentIds.map((id) => STUDENT_LABEL[id] || id).join(", ");
  return itemCount + "개 항목을 " + names + "에게 보냈습니다.";
}

// ===========================================================================
// 화면
// ===========================================================================

export function initMom() {
  const $ = (id) => document.getElementById(id);

  const els = {
    tabs: $("mom-tabs"),
    panelInput: $("panel-input"),
    panelWatch: $("panel-watch"),

    // 입력 탭
    sourcePicker: $("source-picker"),
    sourceHint: $("source-hint"),
    rawInput: $("raw-input"),
    splitBtn: $("split-btn"),
    draftList: $("draft-list"),
    draftCount: $("draft-count"),
    sendBar: $("send-bar"),
    sendBtn: $("send-btn"),
    clearBtn: $("clear-btn"),
    inputStatus: $("input-status"),

    // 현황 탭
    studentTabs: $("student-tabs"),
    watchProgressCount: $("watch-progress-count"),
    watchProgressPercent: $("watch-progress-percent"),
    watchProgressFill: $("watch-progress-fill"),
    categoryProgress: $("category-progress"),
    watchList: $("watch-list"),
    watchStatus: $("watch-status"),
  };

  const state = {
    tab: "input",
    sourceId: INPUT_SOURCES[0].id,
    drafts: [],          // 보내기 전의 항목 카드들
    nextKey: 1,
    watchStudent: STUDENT_IDS[0],
    watchTodos: [],
    unsubscribe: null,
    sending: false,
  };

  // --- 작은 도우미 ---------------------------------------------------------

  function makeEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }

  function setInputStatus(message, isError = false) {
    if (!els.inputStatus) return;
    els.inputStatus.textContent = message || "";
    els.inputStatus.dataset.error = isError ? "true" : "false";
    els.inputStatus.hidden = !message;
  }

  // --- 입력 탭 -------------------------------------------------------------

  /** 입력 방법 토글. 지금은 "직접 입력" 하나뿐이지만 목록이 늘면 그대로 늘어난다. */
  function renderSourcePicker() {
    if (!els.sourcePicker) return;
    els.sourcePicker.textContent = "";
    for (const source of INPUT_SOURCES) {
      const btn = makeEl("button", "tab tab--all", source.label);
      btn.type = "button";
      btn.dataset.sourceId = source.id;
      btn.setAttribute("aria-pressed", String(state.sourceId === source.id));
      els.sourcePicker.appendChild(btn);
    }
    if (els.sourceHint) {
      els.sourceHint.hidden = INPUT_SOURCES.length > 1;
    }
  }

  function makeDraft(title) {
    return {
      key: "d" + state.nextKey++,
      title,
      category: CATEGORIES[0], // 기본값 "숙제"
      date: "",
      // 기본값은 둘 다. 한 명만 보낼 때 한 번만 눌러 끄면 된다.
      recipients: { daughter1: true, daughter2: true },
    };
  }

  /** 붙여넣은 글을 항목 카드로 나눈다. 기존 카드는 유지하고 뒤에 덧붙인다. */
  function handleSplit() {
    const source = getSource(state.sourceId);
    const titles = source.parse(els.rawInput ? els.rawInput.value : "");

    if (titles.length === 0) {
      setInputStatus("나눌 내용이 없습니다. 할 일을 한 줄에 하나씩 적어주세요.", true);
      if (els.rawInput) els.rawInput.focus();
      return;
    }

    for (const title of titles) state.drafts.push(makeDraft(title));
    if (els.rawInput) els.rawInput.value = "";
    setInputStatus(titles.length + "개 항목으로 나눴습니다. 확인 후 보내주세요.");
    renderDrafts();
  }

  function renderRecipientToggles(draft) {
    const group = makeEl("div", "recipients");
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "받는 사람");

    for (const id of STUDENT_IDS) {
      const btn = makeEl("button", "toggle", STUDENT_LABEL[id]);
      btn.type = "button";
      btn.dataset.action = "recipient";
      btn.dataset.key = draft.key;
      btn.dataset.student = id;
      btn.setAttribute("aria-pressed", String(!!draft.recipients[id]));
      group.appendChild(btn);
    }
    return group;
  }

  function renderDraftCard(draft) {
    const card = makeEl("li", "draft-card");
    card.dataset.key = draft.key;

    const head = makeEl("div", "draft-head");
    const title = document.createElement("input");
    title.type = "text";
    title.className = "field";
    title.value = draft.title;
    title.dataset.action = "title";
    title.dataset.key = draft.key;
    title.setAttribute("aria-label", "할 일 제목");

    const remove = makeEl("button", "icon-btn", "✕");
    remove.type = "button";
    remove.dataset.action = "remove";
    remove.dataset.key = draft.key;
    remove.title = "이 항목 빼기";
    remove.setAttribute("aria-label", draft.title + " 빼기");

    head.append(title, remove);

    const chips = makeEl("div", "chip-group");
    for (const c of CATEGORIES) {
      const chip = makeEl("button", "chip chip--" + CATEGORY_KEY[c], c);
      chip.type = "button";
      chip.dataset.action = "category";
      chip.dataset.key = draft.key;
      chip.dataset.value = c;
      chip.setAttribute("aria-pressed", String(draft.category === c));
      chips.appendChild(chip);
    }

    const bottom = makeEl("div", "draft-bottom");
    const date = document.createElement("input");
    date.type = "date";
    date.className = "field";
    date.value = draft.date;
    date.dataset.action = "date";
    date.dataset.key = draft.key;
    date.setAttribute("aria-label", "마감일 (선택)");
    bottom.append(renderRecipientToggles(draft), date);

    card.append(head, chips, bottom);
    return card;
  }

  function renderDrafts() {
    if (!els.draftList) return;
    els.draftList.textContent = "";

    for (const draft of state.drafts) {
      els.draftList.appendChild(renderDraftCard(draft));
    }

    const has = state.drafts.length > 0;
    if (els.draftCount) {
      els.draftCount.textContent = has ? "보낼 항목 " + state.drafts.length + "개" : "";
      els.draftCount.hidden = !has;
    }
    if (els.sendBar) els.sendBar.hidden = !has;
    if (els.sendBtn) {
      els.sendBtn.disabled = state.sending;
      els.sendBtn.textContent = state.sending ? "보내는 중..." : "보내기";
    }
  }

  function findDraft(key) {
    return state.drafts.find((d) => d.key === key);
  }

  function onDraftEvent(event) {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const draft = findDraft(target.dataset.key);
    if (!draft) return;

    switch (target.dataset.action) {
      case "title":
        draft.title = target.value; // 다시 그리면 커서가 튀므로 값만 갱신한다
        break;
      case "date":
        draft.date = target.value;
        break;
      case "category":
        draft.category = target.dataset.value;
        renderDrafts();
        break;
      case "recipient": {
        const id = target.dataset.student;
        draft.recipients[id] = !draft.recipients[id];
        renderDrafts();
        break;
      }
      case "remove":
        state.drafts = state.drafts.filter((d) => d.key !== draft.key);
        setInputStatus("항목 하나를 뺐습니다.");
        renderDrafts();
        break;
    }
  }

  async function handleSend() {
    if (state.sending) return;

    const items = state.drafts.map((d) => ({ ...d, title: d.title.trim() }));

    if (items.some((d) => !d.title)) {
      setInputStatus("제목이 빈 항목이 있습니다. 채우거나 빼주세요.", true);
      return;
    }
    if (items.some((d) => recipientIds(d.recipients).length === 0)) {
      setInputStatus("받는 사람이 없는 항목이 있습니다. 첫째나 둘째를 선택해 주세요.", true);
      return;
    }

    state.sending = true;
    renderDrafts();
    setInputStatus("보내는 중...");

    const sentTo = new Set();
    try {
      for (const draft of items) {
        for (const studentId of recipientIds(draft.recipients)) {
          await addTodo(studentId, {
            title: draft.title,
            category: draft.category,
            date: draft.date,
            completed: false,
            addedBy: "mom",
            source: state.sourceId,
          });
          sentTo.add(studentId);
        }
      }
      const count = items.length;
      state.drafts = [];
      if (els.rawInput) els.rawInput.value = "";
      setInputStatus(
        buildSentMessage(count, STUDENT_IDS.filter((id) => sentTo.has(id)))
      );
    } catch (err) {
      console.error("[mom] 보내기 실패", err);
      setInputStatus("보내지 못했습니다. (" + (err.code || err.message) + ")", true);
    } finally {
      state.sending = false;
      renderDrafts();
    }
  }

  // --- 현황 보기 탭 (읽기 전용) --------------------------------------------

  function renderStudentTabs() {
    if (!els.studentTabs) return;
    els.studentTabs.textContent = "";
    for (const id of STUDENT_IDS) {
      const btn = makeEl("button", "tab tab--all", STUDENT_LABEL[id]);
      btn.type = "button";
      btn.dataset.student = id;
      btn.setAttribute("aria-pressed", String(state.watchStudent === id));
      els.studentTabs.appendChild(btn);
    }
  }

  function renderWatchProgress() {
    const p = calcProgress(state.watchTodos);
    const all = p[ALL];

    if (els.watchProgressCount) {
      els.watchProgressCount.textContent = all.완료 + "/" + all.총 + " 완료";
    }
    if (els.watchProgressPercent) els.watchProgressPercent.textContent = all.비율 + "%";
    if (els.watchProgressFill) {
      els.watchProgressFill.style.width = all.비율 + "%";
      const bar = els.watchProgressFill.parentElement;
      if (bar) {
        bar.setAttribute("aria-valuenow", String(all.비율));
        bar.setAttribute("aria-valuetext", all.완료 + "개 중 " + all.총 + "개 완료");
      }
    }

    if (!els.categoryProgress) return;
    els.categoryProgress.textContent = "";
    for (const c of CATEGORIES) {
      const row = makeEl("div", "cat-row");
      row.append(makeEl("span", "badge badge--" + CATEGORY_KEY[c], c));

      const track = makeEl("div", "cat-track");
      const fill = makeEl("div", "cat-fill cat-fill--" + CATEGORY_KEY[c]);
      fill.style.width = p[c].비율 + "%";
      track.appendChild(fill);

      row.append(track, makeEl("span", "cat-num", p[c].완료 + "/" + p[c].총));
      els.categoryProgress.appendChild(row);
    }
  }

  /** 읽기 전용 항목. 체크박스도 버튼도 없다 — 눌러도 아무 일이 없어야 한다. */
  function renderWatchItem(todo) {
    const li = makeEl("li", "watch-item" + (todo.completed ? " is-done" : ""));

    const mark = makeEl("span", "watch-mark");
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = todo.completed ? "✓" : "";

    const body = makeEl("div", "watch-body");
    body.appendChild(makeEl("span", "watch-title", todo.title));

    const meta = makeEl("span", "todo-meta");
    meta.appendChild(makeEl("span", "badge badge--" + CATEGORY_KEY[todo.category], todo.category));
    const due = formatDue(todo.date);
    if (due) meta.appendChild(makeEl("span", "due due--" + due.tone, due.text));
    if (todo.addedBy === "mom") meta.appendChild(makeEl("span", "from-mom", "내가 보냄"));
    if (todo.memo) meta.appendChild(makeEl("span", "memo", todo.memo));
    body.appendChild(meta);

    // 스크린리더에게도 완료 여부를 알린다
    li.setAttribute("aria-label", todo.title + (todo.completed ? ", 완료함" : ", 아직 안 함"));
    li.append(mark, body);
    return li;
  }

  function renderWatchList() {
    if (!els.watchList) return;
    els.watchList.textContent = "";

    const { active, completed } = splitByCompleted(state.watchTodos);
    if (active.length === 0 && completed.length === 0) {
      els.watchList.appendChild(makeEl("li", "empty", "아직 할 일이 없습니다."));
      return;
    }
    // 미완료 먼저, 완료는 아래
    for (const todo of [...active, ...completed]) {
      els.watchList.appendChild(renderWatchItem(todo));
    }
  }

  function renderWatch() {
    renderStudentTabs();
    renderWatchProgress();
    renderWatchList();
  }

  /** 보고 있는 딸이 바뀌면 이전 구독을 끊고 새로 건다. */
  function subscribeWatch() {
    if (state.unsubscribe) {
      state.unsubscribe();
      state.unsubscribe = null;
    }
    state.watchTodos = [];
    renderWatch();

    state.unsubscribe = listenTodos(
      state.watchStudent,
      (todos) => {
        state.watchTodos = todos;
        if (els.watchStatus) els.watchStatus.hidden = true;
        renderWatch();
      },
      (err) => {
        console.error("[mom] 현황 구독 실패", err);
        if (els.watchStatus) {
          els.watchStatus.hidden = false;
          els.watchStatus.textContent =
            "현황을 불러오지 못했습니다. (" + (err.code || err.message) + ")";
          els.watchStatus.dataset.error = "true";
        }
      }
    );
  }

  // --- 탭 전환 -------------------------------------------------------------

  function renderTabs() {
    if (els.tabs) {
      for (const btn of els.tabs.querySelectorAll("[data-tab]")) {
        btn.setAttribute("aria-selected", String(btn.dataset.tab === state.tab));
      }
    }
    if (els.panelInput) els.panelInput.hidden = state.tab !== "input";
    if (els.panelWatch) els.panelWatch.hidden = state.tab !== "watch";
  }

  function switchTab(tab) {
    if (state.tab === tab) return;
    state.tab = tab;
    renderTabs();
    // 현황 탭을 처음 열 때만 구독을 시작한다 (입력만 할 거면 읽기 요청이 없다)
    if (tab === "watch" && !state.unsubscribe) subscribeWatch();
  }

  // --- 이벤트 배선 ---------------------------------------------------------

  if (els.tabs) {
    els.tabs.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-tab]");
      if (btn) switchTab(btn.dataset.tab);
    });
  }

  if (els.sourcePicker) {
    els.sourcePicker.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-source-id]");
      if (!btn) return;
      state.sourceId = btn.dataset.sourceId;
      renderSourcePicker();
    });
  }

  if (els.splitBtn) els.splitBtn.addEventListener("click", handleSplit);
  if (els.sendBtn) els.sendBtn.addEventListener("click", handleSend);

  if (els.clearBtn) {
    els.clearBtn.addEventListener("click", () => {
      state.drafts = [];
      if (els.rawInput) els.rawInput.value = "";
      setInputStatus("모두 지웠습니다.");
      renderDrafts();
    });
  }

  if (els.draftList) {
    els.draftList.addEventListener("click", onDraftEvent);
    els.draftList.addEventListener("input", onDraftEvent);
    els.draftList.addEventListener("change", onDraftEvent);
  }

  if (els.studentTabs) {
    els.studentTabs.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-student]");
      if (!btn || btn.dataset.student === state.watchStudent) return;
      state.watchStudent = btn.dataset.student;
      subscribeWatch();
    });
  }

  // --- 시작 ---------------------------------------------------------------

  renderTabs();
  renderSourcePicker();
  renderDrafts();
  renderWatch();

  return { state, subscribeWatch, switchTab };
}
