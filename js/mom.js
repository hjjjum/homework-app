// ---------------------------------------------------------------------------
// mom.js
// mom.html 전용 로직. 두 개의 탭으로 나뉜다.
//   1) 입력      — 붙여넣은 글을 항목 카드로 나눠 딸들에게 보낸다 (쓰기 전용)
//   2) 현황 보기 — 딸의 할일을 실시간으로 지켜본다 (읽기 전용)
//
// "현황 보기"는 의도적으로 읽기 전용이다. 체크/수정/삭제는 각자 딸 화면에서만
// 할 수 있게 두어, 엄마가 대신 체크해 버리는 상황을 막는다.
// ---------------------------------------------------------------------------
import {
  addTodo,
  updateTodo,
  listenTodos,
  setCheer,
  listenProfile,
  DEFAULT_PROFILE,
  CATEGORIES,
  STUDENT_IDS,
  SUBJECTS,
  MAX_CHEER_LENGTH,
} from "./db.js";
import {
  ALL,
  CATEGORY_KEY,
  SUBJECT_KEY,
  calcProgress,
  splitByCompleted,
  dueLabel,
  countTodo,
  sortByUrgency,
} from "./todo-logic.js";
import { createDuePicker, createUrgentToggle, urgentIcon } from "./due-picker.js";
import { createTodoEditor, makeEditDraft } from "./todo-editor.js";
import { createSticker } from "./stickers.js";
import { initAppearance } from "./appearance.js";
import { INPUT_SOURCES, getSource } from "./sources/index.js";
import { recognizeImage, imageFromPaste, parseDueDate } from "./ocr.js";

/**
 * 화면에 보여줄 딸 이름. db의 studentId와 짝을 이룬다.
 * 딸 화면에서 이름을 바꾸면(students/{id}/meta/profile) 여기 값도 따라 바뀐다 —
 * 엄마 화면과 딸 화면에 서로 다른 이름이 보이면 헷갈리기 때문이다.
 * 객체를 갈아끼우지 말고 속성만 고칠 것 (이미 import한 쪽이 같은 객체를 본다).
 */
export const STUDENT_LABEL = {
  daughter1: DEFAULT_PROFILE.daughter1.name,
  daughter2: DEFAULT_PROFILE.daughter2.name,
};

/** 이름 옆에 붙는 아이콘 (stickers.js의 id) */
export const STUDENT_ICON = {
  daughter1: DEFAULT_PROFILE.daughter1.icon,
  daughter2: DEFAULT_PROFILE.daughter2.icon,
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
    ocrBtn: $("ocr-btn"),
    ocrImage: $("ocr-image"),
    ocrStatus: $("ocr-status"),
    draftList: $("draft-list"),
    draftCount: $("draft-count"),
    sendBar: $("send-bar"),
    sendBtn: $("send-btn"),
    clearBtn: $("clear-btn"),
    inputStatus: $("input-status"),

    appearance: $("appearance"),

    // 현황 탭
    kidCards: $("kid-cards"),
    watchStatus: $("watch-status"),
  };

  const state = {
    tab: "input",
    sourceId: INPUT_SOURCES[0].id,
    drafts: [],          // 보내기 전의 항목 카드들
    nextKey: 1,
    // 아이별 현황. 두 아이를 동시에 구독한다.
    kids: Object.fromEntries(
      STUDENT_IDS.map((id) => [id, { todos: [], loaded: false, error: "", cheerNote: "", cheerEl: null }])
    ),
    unsubscribe: null,
    sending: false,
    // 현황 탭: 펼친 항목 · 전부 보기 · 고치는 중인 항목
    expandedIds: new Set(),
    showAll: Object.fromEntries(STUDENT_IDS.map((id) => [id, false])),
    editing: null,
    editDraft: null,
    editorEl: null,
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
    const current = getSource(state.sourceId);
    if (els.sourceHint) {
      els.sourceHint.textContent = current.hint || "";
      els.sourceHint.hidden = !current.hint;
    }
    if (els.splitBtn) {
      els.splitBtn.textContent = current.actionLabel || "항목 만들기";
    }
  }

  /**
   * 파서가 준 결과로 카드 하나를 만든다.
   * 입력 소스에 따라 문자열(제목만) 또는 객체({title, subject, items, memo})가 온다.
   */
  function makeDraft(parsed) {
    const data = typeof parsed === "string" ? { title: parsed } : parsed || {};
    return {
      key: "d" + state.nextKey++,
      title: data.title || "",
      category: CATEGORIES[0], // 기본값 "숙제"
      subject: SUBJECTS.includes(data.subject) ? data.subject : "기타",
      subjectConfident: data.subjectConfident !== false,
      items: Array.isArray(data.items) ? data.items.slice() : [],
      memo: data.memo || "",
      // 빈 값 = "다음 수업까지". 학원 숙제는 대부분 그래서 기본값으로 뒀다.
      date: "",
      urgent: false,
      // 기본값은 둘 다. 한 명만 보낼 때 한 번만 눌러 끄면 된다.
      recipients: { daughter1: true, daughter2: true },
    };
  }

  /** 붙여넣은 글을 항목 카드로 나눈다. 기존 카드는 유지하고 뒤에 덧붙인다. */
  function handleSplit() {
    const source = getSource(state.sourceId);
    const titles = source.parse(els.rawInput ? els.rawInput.value : "");

    if (titles.length === 0) {
      setInputStatus("보낼 내용이 비어 있습니다.", true);
      if (els.rawInput) els.rawInput.focus();
      return;
    }

    for (const parsed of titles) {
      const draft = makeDraft(parsed);
      // 학원 메시지 첫 줄이 바로 숙제라서 제목이 비는 경우가 있다
      if (!draft.title) {
        draft.title = (draft.subject !== "기타" ? draft.subject + " " : "") + "숙제";
      }
      state.drafts.push(draft);
    }
    if (els.rawInput) els.rawInput.value = "";
    setInputStatus(
      titles.length === 1
        ? "항목 1개를 담았습니다. 받는 사람을 확인하고 보내주세요."
        : titles.length + "개 항목으로 나눴습니다. 확인 후 보내주세요."
    );
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
    // 여러 줄짜리 제목을 <input>에 넣으면 브라우저가 줄바꿈을 지워버린다.
    // 그래서 줄바꿈이 있으면 textarea로 편집한다.
    const multiline = draft.title.includes("\n");
    const title = document.createElement(multiline ? "textarea" : "input");
    if (multiline) {
      title.rows = Math.min(draft.title.split("\n").length + 1, 10);
    } else {
      title.type = "text";
    }
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

    // 과목 선택 (학원 메시지에서 자동으로 골라진 값이 미리 선택돼 있다)
    const subjectRow = makeEl("div", "subject-row");
    subjectRow.setAttribute("role", "group");
    subjectRow.setAttribute("aria-label", "과목");
    for (const sub of SUBJECTS) {
      const btn = makeEl("button", "subject-chip subject--" + SUBJECT_KEY[sub], sub);
      btn.type = "button";
      btn.dataset.action = "subject";
      btn.dataset.key = draft.key;
      btn.dataset.value = sub;
      btn.setAttribute("aria-pressed", String(draft.subject === sub));
      subjectRow.appendChild(btn);
    }

    const bottom = makeEl("div", "draft-bottom");
    bottom.append(renderRecipientToggles(draft));

    // 마감일 + 급한 일. 달력을 열지 않고도 한 번에 고를 수 있게 칩을 두었다.
    const dueRow = makeEl("div", "edit-due");
    dueRow.append(
      createDuePicker(draft.date, (v) => { draft.date = v; }),
      createUrgentToggle(draft.urgent, (v) => { draft.urgent = v; })
    );

    card.append(head, chips, subjectRow, bottom, dueRow);

    // 세부 항목 — 딸 화면에서 하나씩 체크하게 될 목록. 여기서 지우거나 고칠 수 있다.
    if (draft.items.length > 0) {
      const label = makeEl("p", "draft-items-label", "세부 항목 " + draft.items.length + "개");
      const ul = makeEl("ul", "draft-items");
      draft.items.forEach((text, index) => {
        const li = makeEl("li", "draft-item");
        const input = document.createElement("input");
        input.type = "text";
        input.className = "field";
        input.value = text;
        input.dataset.action = "item-text";
        input.dataset.key = draft.key;
        input.dataset.index = String(index);
        input.setAttribute("aria-label", "세부 항목 " + (index + 1));

        const del = makeEl("button", "icon-btn", "✕");
        del.type = "button";
        del.dataset.action = "item-remove";
        del.dataset.key = draft.key;
        del.dataset.index = String(index);
        del.setAttribute("aria-label", text + " 빼기");

        li.append(input, del);
        ul.appendChild(li);
      });
      card.append(label, ul);
    }

    if (draft.memo) {
      card.appendChild(makeEl("p", "draft-memo", "참고: " + draft.memo.split("\n").join(" ")));
    }

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
      els.draftCount.textContent = has
        ? "보낼 항목 " + state.drafts.length + "개"
        : "위에 내용을 적고 \"항목 나누기\"를 누르면 보낼 항목이 여기에 나옵니다.";
    }
    // 보내기 버튼은 항상 보인다. 보낼 게 없으면 눌리지 않을 뿐이다.
    // (버튼이 통째로 사라지면 "보내기가 어디 있지?" 하고 헤매게 된다)
    if (els.sendBtn) {
      els.sendBtn.disabled = !has || state.sending;
      els.sendBtn.textContent = state.sending
        ? "보내는 중..."
        : has
        ? state.drafts.length + "개 보내기"
        : "보내기";
    }
    if (els.clearBtn) els.clearBtn.disabled = !has || state.sending;
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
      case "subject":
        draft.subject = target.dataset.value;
        draft.subjectConfident = true;
        renderDrafts();
        break;
      case "item-text":
        draft.items[Number(target.dataset.index)] = target.value;
        break;
      case "item-remove":
        draft.items.splice(Number(target.dataset.index), 1);
        renderDrafts();
        break;
      case "remove":
        state.drafts = state.drafts.filter((d) => d.key !== draft.key);
        setInputStatus("항목 하나를 뺐습니다.");
        renderDrafts();
        break;
    }
  }

  async function handleSend() {
    if (state.sending) return;

    const items = state.drafts.map((d) => ({
      ...d,
      title: d.title.trim(),
      items: d.items.map((t) => String(t).trim()).filter(Boolean),
    }));

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
            subject: draft.subject,
            items: draft.items,
            memo: draft.memo,
            date: draft.date,
            urgent: draft.urgent === true,
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

  // --- 현황 보기 탭 --------------------------------------------------------
  //
  // 두 아이를 한 화면에 세로로 나란히 놓는다. 아이별로 진행률 · 남은 항목 ·
  // 마지막으로 움직인 시각을 보여준다.
  //
  // 완료 체크는 여기서 할 수 없다 — 목록에 체크박스를 만들지 않는다.
  // (엄마가 딸 대신 완료 처리를 해버리는 걸 막기 위한 것이다)
  // 다만 이미 보낸 숙제의 내용은 여기서 고칠 수 있다. 잘못 읽힌 학원 숙제를
  // 지웠다 다시 보내게 하지 않으려는 것이고, 고치는 것은 완료 처리와 다르다.
  //
  // 항목을 누르면 세부 내용이 펼쳐진다. 펼침 상태는 state.expandedIds에 기억해 둔다 —
  // 실시간 갱신이 올 때마다 다시 그리기 때문에 기억하지 않으면 저절로 접힌다.

  /** 접혀 있을 때 보여줄 남은 항목 개수 */
  const PREVIEW_COUNT = 3;

  /** 응원 한마디 기본 문구 (직접 써서 보낼 수도 있다) */
  const CHEER_CHIPS = [
    "잘하고 있어",
    "저녁 전에 한 개만 더",
    "다 하면 같이 놀자",
    "오늘도 애썼어",
  ];

  /** "방금 전" / "10분 전" / "오후 3:20" */
  function timeAgo(date) {
    if (!(date instanceof Date) || isNaN(date)) return "";
    const min = Math.round((Date.now() - date.getTime()) / 60000);
    if (min < 1) return "방금 전";
    if (min < 60) return min + "분 전";
    if (min < 24 * 60) return Math.round(min / 60) + "시간 전";
    return date.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
  }

  /** 그 아이가 마지막으로 움직인 시각 (체크·수정 시각 중 가장 최근) */
  function lastMoved(todos) {
    let latest = null;
    for (const t of todos) {
      const at = t.updatedAt && typeof t.updatedAt.toDate === "function"
        ? t.updatedAt.toDate()
        : null;
      if (at && (!latest || at > latest)) latest = at;
    }
    return latest;
  }

  function closeWatchEditor() {
    state.editing = null;
    state.editDraft = null;
    state.editorEl = null;
  }

  /** 펼친 항목의 세부 내용 (읽기 전용 — 체크박스가 아니라 글자다) */
  function renderTodoDetail(studentId, todo) {
    const box = makeEl("div", "watch-detail");

    const meta = makeEl("div", "watch-meta");
    if (todo.subject && todo.subject !== "기타") {
      meta.appendChild(
        makeEl("span", "badge badge--subject subject--" + SUBJECT_KEY[todo.subject], todo.subject)
      );
    }
    meta.appendChild(makeEl("span", "badge badge--" + CATEGORY_KEY[todo.category], todo.category));
    const due = dueLabel(todo);
    if (due) meta.appendChild(makeEl("span", "due due--" + due.tone, due.text));
    if (todo.urgent) meta.appendChild(makeEl("span", "badge badge--urgent", "급해요"));
    box.appendChild(meta);

    const items = Array.isArray(todo.items) ? todo.items : [];
    if (items.length > 0) {
      const ul = makeEl("ul", "watch-items");
      for (const item of items) {
        const li = makeEl("li", "watch-item" + (item.done ? " is-done" : ""));
        li.append(
          makeEl("span", "watch-item-mark", item.done ? "✓" : "·"),
          makeEl("span", "watch-item-text", item.text)
        );
        ul.appendChild(li);
      }
      box.appendChild(ul);
    }
    if (todo.memo) box.appendChild(makeEl("p", "watch-memo", "참고: " + todo.memo));

    const edit = makeEl("button", "btn btn--ghost btn--small", "내용 고치기");
    edit.type = "button";
    edit.dataset.action = "watch-edit";
    edit.dataset.student = studentId;
    edit.dataset.id = todo.id;
    box.appendChild(edit);

    return box;
  }

  /** 남은 항목 한 줄. 누르면 펼쳐진다. */
  function renderWatchRow(studentId, todo) {
    const li = makeEl(
      "li",
      "watch-row" + (todo.urgent ? " is-urgent" : "") + (todo.completed ? " is-done" : "")
    );
    const open = state.expandedIds.has(todo.id);

    if (state.editing && state.editing.id === todo.id) {
      if (!state.editorEl) {
        state.editDraft = makeEditDraft(todo);
        state.editorEl = createTodoEditor(state.editDraft, {
          onSave: (draft) => saveWatchEdit(studentId, draft),
          onCancel: () => { closeWatchEditor(); renderWatch(); },
        });
      }
      li.classList.add("is-editing");
      li.appendChild(state.editorEl);
      return li;
    }

    const counts = countTodo(todo);
    const btn = makeEl("button", "watch-title");
    btn.type = "button";
    btn.dataset.action = "watch-expand";
    btn.dataset.id = todo.id;
    btn.setAttribute("aria-expanded", String(open));
    if (todo.urgent) btn.appendChild(urgentIcon());
    btn.appendChild(makeEl("span", "watch-title-text", todo.title));
    if (counts.총 > 1) {
      btn.appendChild(makeEl("span", "watch-count", counts.완료 + "/" + counts.총));
    }
    btn.appendChild(makeEl("span", "watch-caret", open ? "▾" : "▸"));

    // 고치기는 펼치지 않아도 한 번에 닿게 행에 붙여 둔다.
    // (과목·세부 항목까지 여기서 고친다)
    const edit = makeEl("button", "watch-edit-btn", "✎");
    edit.type = "button";
    edit.dataset.action = "watch-edit";
    edit.dataset.student = studentId;
    edit.dataset.id = todo.id;
    edit.title = "내용 고치기";
    edit.setAttribute("aria-label", todo.title + " 내용 고치기");

    const head = makeEl("div", "watch-head");
    head.append(btn, edit);
    li.appendChild(head);

    if (open) li.appendChild(renderTodoDetail(studentId, todo));
    return li;
  }

  /**
   * 응원 한마디 줄. 고를 수도 있고 직접 써서 보낼 수도 있다.
   * 입력칸을 그대로 다시 그리면 쓰던 글자와 커서가 날아가므로 한 번 만들어 두고 재사용한다.
   */
  function cheerBox(studentId) {
    const kid = state.kids[studentId];
    if (kid.cheerEl) return kid.cheerEl;

    const box = makeEl("div", "cheer-box");

    const chips = makeEl("div", "cheer-chips");
    for (const text of CHEER_CHIPS) {
      const chip = makeEl("button", "cheer-chip", text);
      chip.type = "button";
      chip.dataset.cheer = text;
      chip.dataset.student = studentId;
      chips.appendChild(chip);
    }

    const row = makeEl("div", "cheer-write");
    const input = document.createElement("input");
    input.type = "text";
    input.className = "field";
    input.maxLength = MAX_CHEER_LENGTH;
    input.placeholder = "직접 써서 보내기";
    input.setAttribute("aria-label", STUDENT_LABEL[studentId] + "에게 보낼 응원 한마디");

    const send = makeEl("button", "btn btn--primary btn--small", "보내기");
    send.type = "button";

    function submit() {
      const text = input.value.trim();
      if (!text) {
        input.focus();
        return;
      }
      input.value = "";
      sendCheer(studentId, text);
    }
    send.addEventListener("click", submit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submit();
      }
    });

    row.append(input, send);
    box.append(chips, row);
    kid.cheerEl = box;
    return box;
  }

  function renderKidCard(studentId) {
    const kid = state.kids[studentId];
    const todos = kid.todos;
    const all = calcProgress(todos)[ALL];

    const card = makeEl("section", "card kid");
    card.dataset.student = studentId;

    const head = makeEl("div", "kid-card");
    const icon = makeEl("span", "kid-icon");
    icon.appendChild(createSticker(STUDENT_ICON[studentId], 30));
    head.appendChild(icon);

    const text = makeEl("div", "kid-text");
    text.appendChild(makeEl("span", "kid-name", STUDENT_LABEL[studentId]));

    const moved = lastMoved(todos);
    const sub = [all.완료 + "/" + all.총 + " 완료"];
    if (moved) sub.push("마지막 체크 " + timeAgo(moved));
    text.appendChild(makeEl("span", "kid-sub", sub.join(" · ")));
    head.appendChild(text);
    card.appendChild(head);

    const bar = makeEl("div", "kid-bar");
    bar.setAttribute("role", "progressbar");
    bar.setAttribute("aria-valuemin", "0");
    bar.setAttribute("aria-valuemax", "100");
    bar.setAttribute("aria-valuenow", String(all.비율));
    bar.setAttribute("aria-label", STUDENT_LABEL[studentId] + " 진행률");
    const fill = makeEl("i");
    fill.style.width = all.비율 + "%";
    bar.appendChild(fill);
    card.appendChild(bar);

    // 남은 항목이 먼저(급한 일이 맨 위), 그 뒤에 완료한 항목.
    // 완료한 것도 목록에 둔다 — 빠지면 엄마가 그 숙제 내용을 고칠 방법이 없다.
    const split = splitByCompleted(todos);
    const active = sortByUrgency(split.active);
    const done = split.completed;
    if (kid.error) {
      card.appendChild(makeEl("p", "kid-sub", kid.error));
    } else if (!kid.loaded) {
      card.appendChild(makeEl("p", "kid-sub", "불러오는 중…"));
    } else if (active.length === 0 && done.length === 0) {
      card.appendChild(makeEl("p", "kid-sub", "아직 할 일이 없습니다."));
    } else if (active.length === 0) {
      card.appendChild(makeEl("p", "kid-sub", "남은 할 일이 없어요 🎉"));
      const ul = makeEl("ul", "watch-list");
      for (const todo of done) ul.appendChild(renderWatchRow(studentId, todo));
      card.appendChild(ul);
    } else {
      const showAll = state.showAll[studentId];
      const shown = showAll ? active.concat(done) : active.slice(0, PREVIEW_COUNT);
      const ul = makeEl("ul", "watch-list");
      for (const todo of shown) ul.appendChild(renderWatchRow(studentId, todo));
      card.appendChild(ul);

      const hidden = active.length - Math.min(active.length, PREVIEW_COUNT) + done.length;
      if (hidden > 0 || showAll) {
        const label = showAll
          ? "접기"
          : done.length > 0 && active.length <= PREVIEW_COUNT
          ? "완료한 " + done.length + "개 보기"
          : "외 " + hidden + "개 더 보기";
        const more = makeEl("button", "btn btn--ghost btn--small", label);
        more.type = "button";
        more.dataset.action = "watch-more";
        more.dataset.student = studentId;
        card.appendChild(more);
      }
    }

    card.appendChild(cheerBox(studentId));
    if (kid.cheerNote) card.appendChild(makeEl("p", "kid-sub", kid.cheerNote));

    return card;
  }

  function renderWatch() {
    if (!els.kidCards) return;
    els.kidCards.textContent = "";
    for (const id of STUDENT_IDS) els.kidCards.appendChild(renderKidCard(id));
  }

  /** 두 아이를 동시에 구독한다 (현황 탭을 처음 열 때 한 번만). */
  function subscribeWatch() {
    if (state.unsubscribe) return;

    const stops = STUDENT_IDS.map((id) =>
      listenTodos(
        id,
        (todos) => {
          state.kids[id].todos = todos;
          state.kids[id].loaded = true;
          state.kids[id].error = "";
          // 고치던 항목이 사라졌으면(딸이 지웠다면) 폼을 닫는다
          if (state.editing && state.editing.studentId === id &&
              !todos.some((t) => t.id === state.editing.id)) {
            closeWatchEditor();
          }
          renderWatch();
        },
        (err) => {
          console.error("[mom] 현황 구독 실패", id, err);
          state.kids[id].error = "현황을 불러오지 못했습니다. (" + (err.code || err.message) + ")";
          renderWatch();
        }
      )
    );

    state.unsubscribe = () => stops.forEach((stop) => stop());
    renderWatch();
  }

  /** 이미 보낸 숙제의 내용을 고친다 (완료 여부는 건드리지 않는다) */
  async function saveWatchEdit(studentId, draft) {
    const items = draft.items
      .map((it) => ({ text: String(it.text || "").trim(), done: it.done === true }))
      .filter((it) => it.text);
    if (!draft.title.trim()) {
      state.kids[studentId].cheerNote = "제목은 비울 수 없습니다.";
      renderWatch();
      return;
    }
    try {
      await updateTodo(studentId, draft.id, {
        title: draft.title.trim(),
        category: draft.category,
        subject: draft.subject,
        date: draft.date,
        memo: draft.memo.trim(),
        urgent: draft.urgent === true,
        items,
      });
      closeWatchEditor();
      state.kids[studentId].cheerNote = "고쳤습니다.";
    } catch (err) {
      console.error("[mom] 수정 실패", err);
      state.kids[studentId].cheerNote = "고치지 못했습니다. (" + (err.code || err.message) + ")";
    }
    renderWatch();
  }

  /** 응원 한마디 보내기 (할일이 아니라 meta/cheer 문서에만 쓴다) */
  async function sendCheer(studentId, text) {
    const kid = state.kids[studentId];
    kid.cheerNote = "보내는 중…";
    renderWatch();
    try {
      await setCheer(studentId, text);
      kid.cheerNote = "“" + text + "” 보냈어요";
    } catch (err) {
      console.error("[mom] 응원 보내기 실패", err);
      kid.cheerNote = "응원을 보내지 못했습니다. (" + (err.code || err.message) + ")";
    }
    renderWatch();
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

  // --- 캡쳐 이미지에서 글자 읽기 ---
  function setOcrStatus(message, isError) {
    if (!els.ocrStatus) return;
    els.ocrStatus.textContent = message || "";
    els.ocrStatus.hidden = !message;
    els.ocrStatus.dataset.error = isError ? "true" : "false";
  }

  /** 표 한 칸의 내용으로 과목을 추측한다 (학원 메시지 파서의 판단을 그대로 쓴다) */
  function detectSubjectOf(section) {
    const text = [section.name, ...section.lines].join(" ");
    const guessed = getSource("academy").parse(text);
    return guessed.length ? guessed[0].subject : "기타";
  }

  async function readImage(file) {
    if (!file) return;
    if (els.ocrBtn) els.ocrBtn.disabled = true;
    try {
      const { text, confidence, sections } = await recognizeImage(file, (step, percent) => {
        setOcrStatus(percent === null ? step + "..." : step + "... " + percent + "%");
      });
      if (!text) {
        setOcrStatus("글자를 찾지 못했습니다. 더 크게 찍은 캡쳐로 해보세요.", true);
        return;
      }

      // 칸이 나뉜 숙제표면 칸 구조를 그대로 살려 카드를 만든다.
      // (글로 바꿨다가 다시 나누면 칸 경계가 또 뭉개진다)
      if (sections && sections.length >= 2) {
        for (const section of sections) {
          const draft = makeDraft({
            title: section.name || "",
            items: section.lines,
            subject: detectSubjectOf(section),
          });
          draft.date = parseDueDate(section.date);
          if (!draft.title) {
            draft.title = (draft.subject !== "기타" ? draft.subject + " " : "") + "숙제";
          }
          state.drafts.push(draft);
        }
        setOcrStatus(
          "표에서 숙제 " + sections.length + "개를 만들었습니다 (정확도 " +
            Math.round(confidence) + "%). 내용을 확인해 주세요."
        );
        renderDrafts();
        return;
      }

      // 표가 아니면 읽은 글을 입력창에 넣고, 평소처럼 나누게 한다
      const box = els.rawInput;
      box.value = box.value.trim() ? box.value.trim() + "\n" + text : text;
      setOcrStatus(
        "읽었습니다 (정확도 " + Math.round(confidence) + "%). 틀린 글자는 고친 뒤 눌러주세요."
      );
      box.focus();
    } catch (err) {
      console.error("[mom] OCR 실패", err);
      setOcrStatus(err.message || "이미지를 읽지 못했습니다.", true);
    } finally {
      if (els.ocrBtn) els.ocrBtn.disabled = false;
    }
  }

  if (els.ocrBtn && els.ocrImage) {
    els.ocrBtn.addEventListener("click", () => els.ocrImage.click());
    els.ocrImage.addEventListener("change", () => {
      readImage(els.ocrImage.files && els.ocrImage.files[0]);
      els.ocrImage.value = ""; // 같은 파일을 다시 골라도 동작하도록
    });
  }

  // 입력창에 이미지를 바로 붙여넣어도(Ctrl+V) 읽는다
  if (els.rawInput) {
    els.rawInput.addEventListener("paste", (e) => {
      const file = imageFromPaste(e);
      if (file) {
        e.preventDefault();
        readImage(file);
      }
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

  if (els.kidCards) {
    els.kidCards.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-cheer]");
      if (chip) {
        sendCheer(chip.dataset.student, chip.dataset.cheer);
        return;
      }
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      switch (btn.dataset.action) {
        case "watch-expand": {
          const id = btn.dataset.id;
          if (state.expandedIds.has(id)) state.expandedIds.delete(id);
          else state.expandedIds.add(id);
          renderWatch();
          break;
        }
        case "watch-more":
          state.showAll[btn.dataset.student] = !state.showAll[btn.dataset.student];
          renderWatch();
          break;
        case "watch-edit":
          closeWatchEditor();
          state.editing = { studentId: btn.dataset.student, id: btn.dataset.id };
          renderWatch();
          break;
      }
    });
  }

  // --- 시작 ---------------------------------------------------------------

  // 이름·아이콘은 딸 화면에서 바꾼다. 입력 탭의 받는 사람 단추에도 쓰이므로
  // 현황 탭을 열지 않아도 구독한다.
  const stopProfiles = STUDENT_IDS.map((id) =>
    listenProfile(id, (profile) => {
      STUDENT_LABEL[id] = profile.name;
      STUDENT_ICON[id] = profile.icon;
      renderDrafts();
      renderWatch();
    })
  );

  // 테마·배경·글꼴. 딸들과 저장 키가 달라서(hw.appearance.mom) 서로 영향을 주지 않는다.
  if (els.appearance) {
    els.appearance.appendChild(initAppearance("hw.appearance.mom").card);
  }

  renderTabs();
  renderSourcePicker();
  renderDrafts();
  renderWatch();

  return {
    state,
    subscribeWatch,
    switchTab,
    unsubscribe() {
      stopProfiles.forEach((stop) => stop());
      if (state.unsubscribe) state.unsubscribe();
    },
  };
}
