// ---------------------------------------------------------------------------
// app.js
// daughter1.html / daughter2.html 공용 로직 + 화면 렌더링.
// 두 화면은 initApp()에 넘기는 studentId만 다르고 나머지는 전부 동일하다.
// ---------------------------------------------------------------------------
import {
  addTodo,
  updateTodo,
  deleteTodo,
  deleteCompletedTodos,
  listenTodos,
  listenCheer,
  listenProfile,
  setProfile,
  MAX_NAME_LENGTH,
  CATEGORIES,
  SUBJECTS,
} from "./db.js";
import {
  ALL,
  FILTERS,
  CATEGORY_KEY,
  SUBJECT_KEY,
  filterByCategory,
  splitByCompleted,
  calcProgress,
  formatDue,
  countTodo,
  allItemsDone,
  sameDay,
  dueLabel,
  sortByUrgency,
  selectToday,
  shiftDate,
} from "./todo-logic.js";
import { createDuePicker, createUrgentToggle, urgentIcon } from "./due-picker.js";
import { createTodoEditor, makeEditDraft } from "./todo-editor.js";
import { parseManualInput } from "./sources/manual-input.js";
import { INPUT_SOURCES, getSource } from "./sources/index.js";
import { recognizeImage, imageFromPaste, parseDueDate } from "./ocr.js";
import { initRewards } from "./rewards.js";
import { createSticker, STICKERS, GROUPS } from "./stickers.js";

// 순수 로직은 todo-logic.js, 입력 파싱은 sources/ 아래로 분리되어 있다.
// 콘솔이나 다른 화면에서 쓰기 편하도록 여기서 다시 내보낸다.
export {
  ALL,
  FILTERS,
  CATEGORY_KEY,
  SUBJECT_KEY,
  filterByCategory,
  splitByCompleted,
  calcProgress,
  formatDue,
  countTodo,
  allItemsDone,
} from "./todo-logic.js";
export { parseManualInput } from "./sources/manual-input.js";

// ===========================================================================
// 화면
// ===========================================================================

/**
 * 한 학생 화면을 초기화한다.
 * @param {"daughter1"|"daughter2"} studentId
 * @returns {object} 콘솔에서 만져볼 수 있는 핸들 (구독 해제 함수 포함)
 */
export function initApp(studentId) {
  const $ = (id) => document.getElementById(id);

  const els = {
    appTitle: $("app-title"),
    progressCount: $("progress-count"),
    progressPercent: $("progress-percent"),
    progressFill: $("progress-fill"),
    filters: $("filters"),
    addToggle: $("add-toggle"),
    addForm: $("add-form"),
    quickSource: $("quick-source"),
    quickSourceHint: $("quick-source-hint"),
    quickInput: $("quick-input"),
    quickOcrBtn: $("quick-ocr-btn"),
    quickImage: $("quick-image"),
    quickOcrStatus: $("quick-ocr-status"),
    quickCategory: $("quick-category"),
    quickDate: $("quick-date"),
    quickAddBtn: $("quick-add-btn"),
    addCancel: $("add-cancel"),
    progressAll: $("progress-all"),
    todaySection: $("today-section"),
    todayList: $("today-list"),
    todayCount: $("today-count"),
    restTitle: $("rest-title"),
    activeList: $("active-list"),
    completedList: $("completed-list"),
    toggleCompletedBtn: $("toggle-completed"),
    deleteCompletedBtn: $("delete-completed-btn"),
    completedSection: $("completed-section"),
    status: $("status"),
  };

  const state = {
    todos: [],          // listenTodos가 넘겨준 원본 (최신순)
    filter: ALL,
    addOpen: false,
    sourceId: INPUT_SOURCES[0].id,
    completedOpen: false,
    editingId: null,    // 인라인 수정 중인 항목
    editDraft: null,    // 수정 중인 값 사본 (실시간 갱신에도 살아남는다)
    editorEl: null,     // 만들어 둔 폼 DOM. 다시 그릴 때 그대로 재사용한다
    quickDate: "",      // 빠른 추가의 마감일 ("" = 다음 수업까지)
    quickUrgent: false, // 빠른 추가의 급한 일 표시
    profile: null,      // { name, icon } — 화면 제목에 쓴다
    confirmingId: null, // 삭제 확인 대기 중인 항목
    confirmingAll: false,
  };

  // 성취 연출(진행 링·스티커 판·축하). Firestore는 건드리지 않고 이 기기에만 저장한다.
  const rewards = initRewards(studentId);

  // --- 작은 도우미 ---------------------------------------------------------

  function setStatus(message, isError = false) {
    if (!els.status) return;
    els.status.textContent = message || "";
    els.status.dataset.error = isError ? "true" : "false";
    els.status.hidden = !message;
  }

  function reportError(where, err) {
    console.error("[app:" + studentId + "] " + where, err);
    setStatus(where + "에 실패했어요. (" + (err.code || err.message) + ")", true);
  }

  function makeEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }

  /** 휴지통 아이콘. 아이콘 라이브러리를 쓸 수 없는 환경이라 인라인 SVG 하나만 둔다. */
  function trashIcon() {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", "M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6");
    svg.appendChild(path);
    return svg;
  }

  /**
   * 카테고리 선택 칩 묶음을 만든다. 선택값은 container.dataset.value에 들어간다.
   * (추가 폼과 수정 폼이 같은 것을 쓴다)
   */
  function buildCategoryChips(container, selected) {
    container.textContent = "";
    container.dataset.value = selected;
    container.setAttribute("role", "group");

    for (const c of CATEGORIES) {
      const chip = makeEl("button", "chip chip--" + CATEGORY_KEY[c], c);
      chip.type = "button";
      chip.dataset.value = c;
      chip.setAttribute("aria-pressed", String(c === selected));
      chip.addEventListener("click", () => {
        container.dataset.value = c;
        for (const other of container.children) {
          other.setAttribute("aria-pressed", String(other.dataset.value === c));
        }
      });
      container.appendChild(chip);
    }
  }

  // --- 렌더링 --------------------------------------------------------------

  function renderFilters() {
    if (!els.filters) return;
    els.filters.textContent = "";
    for (const name of FILTERS) {
      const key = CATEGORY_KEY[name] || "all";
      const tab = makeEl("button", "tab tab--" + key, name);
      tab.type = "button";
      tab.dataset.filter = name;
      tab.setAttribute("aria-pressed", String(state.filter === name));
      els.filters.appendChild(tab);
    }
  }

  /**
   * 진행률은 **오늘 몫**을 분모로 삼는다. 숙제는 계속 쌓이기 때문에 전체를 분모로 두면
   * 100%가 영영 오지 않고, 그러면 스티커도 영영 안 나온다. 전체 상황은 옆에 작게만 둔다.
   */
  function renderProgress() {
    const p = calcProgress(selectToday(state.todos))[ALL];
    const whole = calcProgress(state.todos)[ALL];
    rewards.setProgress(p);
    if (els.progressAll) {
      els.progressAll.textContent = whole.총 > 0 ? "전체 " + whole.완료 + "/" + whole.총 : "";
    }
    if (els.progressCount) els.progressCount.textContent = p.완료 + "/" + p.총 + " 완료";
    if (els.progressPercent) els.progressPercent.textContent = p.비율 + "%";
    if (els.progressFill) {
      els.progressFill.style.width = p.비율 + "%";
      const bar = els.progressFill.parentElement;
      if (bar) {
        bar.setAttribute("aria-valuenow", String(p.비율));
        bar.setAttribute("aria-valuetext", p.완료 + "개 중 " + p.총 + "개 완료, " + p.비율 + "퍼센트");
      }
    }
  }

  /**
   * 수정 중인 항목 → 인라인 편집 폼.
   * 폼 DOM을 한 번만 만들어 두고 재사용한다 — 실시간 갱신으로 목록을 다시 그릴 때
   * 폼을 새로 만들면 입력하던 글자와 커서가 날아간다.
   */
  function renderEditForm(todo) {
    const li = makeEl("li", "todo todo--editing");
    li.dataset.id = todo.id;

    if (!state.editorEl) {
      state.editDraft = makeEditDraft(todo);
      state.editorEl = createTodoEditor(state.editDraft, {
        onSave: (draft) => handleSave(draft),
        onCancel: () => {
          closeEditor();
          render();
        },
      });
    }
    li.appendChild(state.editorEl);
    return li;
  }

  function closeEditor() {
    state.editingId = null;
    state.editDraft = null;
    state.editorEl = null;
  }

  /** 삭제 확인 대기 중인 항목 */
  function renderDeleteConfirm(todo) {
    const li = makeEl("li", "todo todo--confirming");
    li.dataset.id = todo.id;
    li.append(makeEl("span", "confirm-text", "'" + todo.title + "' 지울까요?"));

    const actions = makeEl("div", "confirm-actions");
    const yes = makeEl("button", "btn btn--danger", "지우기");
    yes.type = "button";
    yes.dataset.action = "delete-confirm";
    yes.dataset.id = todo.id;
    const no = makeEl("button", "btn btn--ghost", "취소");
    no.type = "button";
    no.dataset.action = "cancel-delete";
    actions.append(yes, no);

    li.appendChild(actions);
    return li;
  }

  function renderItem(todo, index, options) {
    if (state.editingId === todo.id) return renderEditForm(todo);
    if (state.confirmingId === todo.id) return renderDeleteConfirm(todo);

    const li = makeEl("li", "todo" + (todo.urgent ? " todo--urgent" : ""));
    li.dataset.id = todo.id;

    // 체크박스: 보이는 크기는 24px이지만 label이 44px 터치 영역을 만든다.
    const check = makeEl("label", "check");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = todo.completed;
    input.dataset.action = "toggle";
    input.dataset.id = todo.id;
    input.setAttribute("aria-label", todo.title + " 완료");
    // 완료되면 CSS가 점선 동그라미를 감추고 이 스티커를 도장처럼 찍는다
    check.append(
      input,
      makeEl("span", "check-box"),
      createSticker(rewards.stickerFor(index || 0), 34)
    );

    // 본문 전체가 버튼 = 항목을 탭하면 수정
    const main = makeEl("button", "todo-main");
    main.type = "button";
    main.dataset.action = "edit";
    main.dataset.id = todo.id;
    main.setAttribute("aria-label", todo.title + " 수정");
    main.appendChild(makeEl("span", "todo-title", todo.title));

    const meta = makeEl("span", "todo-meta");
    // 과목이 있으면 과목을 먼저 보여준다 (수학/영어/과학...)
    if (todo.subject && todo.subject !== "기타") {
      meta.appendChild(
        makeEl("span", "badge badge--subject subject--" + SUBJECT_KEY[todo.subject], todo.subject)
      );
    }
    meta.appendChild(
      makeEl("span", "badge badge--" + CATEGORY_KEY[todo.category], todo.category)
    );

    // 마감일. 숙제는 날짜를 안 정해도 "다음 수업까지"가 기본으로 붙는다.
    const due = dueLabel(todo);
    if (due) meta.appendChild(makeEl("span", "due due--" + due.tone, due.text));
    if (todo.addedBy === "mom") meta.appendChild(makeEl("span", "from-mom", "엄마가 보냄"));

    const counts = countTodo(todo);
    if (Array.isArray(todo.items) && todo.items.length > 0) {
      meta.appendChild(
        makeEl("span", "item-count", counts.완료 + "/" + counts.총)
      );
    }
    if (todo.memo) meta.appendChild(makeEl("span", "memo", todo.memo));

    main.appendChild(meta);

    // 급한 일 표시 단추 — 목록에서 바로 켜고 끈다
    const urgent = makeEl("button", "urgent-btn urgent-btn--inline");
    urgent.type = "button";
    urgent.dataset.action = "urgent";
    urgent.dataset.id = todo.id;
    urgent.dataset.on = todo.urgent ? "true" : "false";
    urgent.setAttribute("aria-pressed", String(todo.urgent === true));
    urgent.setAttribute("aria-label", todo.title + " 급한 일로 표시");
    urgent.title = "급한 일로 표시";
    urgent.appendChild(urgentIcon());

    const del = makeEl("button", "icon-btn");
    del.type = "button";
    del.dataset.action = "delete";
    del.dataset.id = todo.id;
    del.setAttribute("aria-label", todo.title + " 삭제");
    del.appendChild(trashIcon());

    // 한 줄짜리 요약 부분
    const row = makeEl("div", "todo-row");
    row.append(check, main);
    // 오늘 몫에만 "내일로". 이게 없으면 못 끝낸 것이 매일 지난 마감으로 쌓여서
    // 오늘 몫이 다시 끝없이 불어난다.
    if (options && options.canPush) {
      const push = makeEl("button", "push-btn", "내일로");
      push.type = "button";
      push.dataset.action = "push";
      push.dataset.id = todo.id;
      push.setAttribute("aria-label", todo.title + " 내일로 미루기");
      row.appendChild(push);
    }
    row.append(urgent, del);
    li.appendChild(row);

    // 세부 항목이 있으면 하나씩 체크할 수 있게 아래에 펼쳐준다
    const subItems = Array.isArray(todo.items) ? todo.items : [];
    if (subItems.length > 0) {
      li.classList.add("todo--has-items");
      const ul = makeEl("ul", "subitems");
      subItems.forEach((item, index) => {
        const sub = makeEl("li", "subitem" + (item.done ? " is-done" : ""));

        const label = makeEl("label", "check check--sub");
        const box = document.createElement("input");
        box.type = "checkbox";
        box.checked = item.done === true;
        box.dataset.action = "toggle-item";
        box.dataset.id = todo.id;
        box.dataset.index = String(index);
        box.setAttribute("aria-label", item.text);
        label.append(box, makeEl("span", "check-box"));

        // 글자를 누르면 수정 폼이 열린다. 체크는 왼쪽 동그라미로만 한다 —
        // 글자를 누르려다 실수로 완료 처리되는 일이 없도록 나눠 두었다.
        const text = makeEl("button", "subitem-text", item.text);
        text.type = "button";
        text.dataset.action = "edit";
        text.dataset.id = todo.id;
        text.setAttribute("aria-label", item.text + " 고치기");
        sub.append(label, text);
        ul.appendChild(sub);
      });
      li.appendChild(ul);
    }

    return li;
  }

  function renderList(container, todos, emptyText, options) {
    if (!container) return;
    container.textContent = "";
    if (todos.length === 0) {
      container.appendChild(makeEl("li", "empty", emptyText));
      return;
    }
    todos.forEach((todo, i) => container.appendChild(renderItem(todo, i, options)));
  }

  function render() {
    const visible = filterByCategory(state.todos, state.filter);
    const split = splitByCompleted(visible);
    // 급한 일이 맨 위로 (같은 급 안에서는 원래 순서 그대로)
    const active = sortByUrgency(split.active);
    const completed = split.completed;

    renderFilters();
    renderProgress();

    // 오늘 몫과 나머지로 나눈다. 오늘 몫만 진행 링과 스티커의 분모가 된다.
    const todayIds = new Set(selectToday(state.todos).map((t) => t.id));
    const todayActive = active.filter((t) => todayIds.has(t.id));
    const restActive = active.filter((t) => !todayIds.has(t.id));

    renderList(
      els.todayList,
      todayActive,
      "오늘 할 일이 아직 없어요. 아래에서 하고 싶은 걸 골라 마감일을 [오늘]로 옮겨 보세요.",
      { canPush: true }
    );
    if (els.todayCount) {
      const done = calcProgress(selectToday(state.todos))[ALL];
      els.todayCount.textContent = done.총 > 0 ? done.완료 + " / " + done.총 : "";
    }

    const emptyText =
      state.filter === ALL ? "할 일이 없어요. 오늘은 여유롭네요." : state.filter + " 항목이 없어요.";
    renderList(els.activeList, restActive, emptyText);
    if (els.restTitle) els.restTitle.hidden = restActive.length === 0;

    if (els.addToggle) {
      els.addToggle.textContent = state.addOpen ? "닫기" : "+ 할일 추가";
      els.addToggle.setAttribute("aria-expanded", String(state.addOpen));
    }
    if (els.addForm) els.addForm.hidden = !state.addOpen;

    if (els.completedSection) els.completedSection.hidden = completed.length === 0;
    if (els.toggleCompletedBtn) {
      els.toggleCompletedBtn.textContent = "완료한 일 " + completed.length + "개";
      els.toggleCompletedBtn.setAttribute("aria-expanded", String(state.completedOpen));
    }
    if (els.completedList) {
      els.completedList.hidden = !state.completedOpen;
      if (state.completedOpen) renderList(els.completedList, completed, "");
    }
    if (els.deleteCompletedBtn) {
      els.deleteCompletedBtn.hidden = !state.completedOpen;
      els.deleteCompletedBtn.textContent = state.confirmingAll
        ? completed.length + "개를 정말 지울까요? 한 번 더 누르기"
        : "완료 항목 모두 지우기";
      els.deleteCompletedBtn.classList.toggle("is-confirming", state.confirmingAll);
    }
  }

  // --- 동작 ---------------------------------------------------------------

  async function handleToggle(id, completed) {
    const todo = state.todos.find((t) => t.id === id);
    const changes = { completed };
    // 세부 항목이 있는 숙제는 위쪽 체크박스로 한꺼번에 처리한다
    if (todo && Array.isArray(todo.items) && todo.items.length > 0) {
      changes.items = todo.items.map((it) => ({ ...it, done: completed }));
    }
    try {
      await updateTodo(studentId, id, changes);
      setStatus(completed ? "잘했어요!" : "다시 할 일로 되돌렸어요.");
    } catch (err) {
      reportError("완료 표시", err);
    }
  }

  /** 숙제 안의 세부 항목 하나를 체크/해제한다. */
  async function handleToggleItem(id, index, done) {
    const todo = state.todos.find((t) => t.id === id);
    if (!todo || !Array.isArray(todo.items)) return;

    const items = todo.items.map((it, i) => (i === index ? { ...it, done } : it));
    // 세부 항목이 전부 끝나면 숙제 자체도 완료로, 하나라도 남으면 다시 미완료로.
    const completed = items.every((it) => it.done);
    try {
      await updateTodo(studentId, id, { items, completed });
      setStatus(completed ? "숙제 하나를 다 끝냈어요!" : "");
    } catch (err) {
      reportError("항목 체크", err);
    }
  }

  /** 오늘 못 하는 것을 내일로 미룬다. 급한 일 표시는 함께 내린다 — 안 내리면 내일도 오늘 몫이다. */
  async function handlePush(id) {
    const todo = state.todos.find((t) => t.id === id);
    if (!todo) return;
    try {
      await updateTodo(studentId, id, { date: shiftDate(1), urgent: false });
      setStatus("내일로 미뤘어요.");
    } catch (err) {
      reportError("내일로 미루기", err);
    }
  }

  async function handleSave(draft) {
    const items = draft.items
      .map((it) => ({ text: String(it.text || "").trim(), done: it.done === true }))
      .filter((it) => it.text);
    const changes = {
      title: draft.title.trim(),
      category: draft.category,
      subject: draft.subject,
      date: draft.date,
      memo: draft.memo.trim(),
      urgent: draft.urgent === true,
      items,
    };
    if (!changes.title) {
      setStatus("제목은 비울 수 없어요.", true);
      return;
    }
    // 세부 항목을 다 지웠는데 완료로 남아 있으면 이상하므로 함께 맞춰준다
    if (items.length > 0) changes.completed = items.every((it) => it.done);

    try {
      await updateTodo(studentId, draft.id, changes);
      closeEditor();
      setStatus("수정했어요.");
      render();
    } catch (err) {
      reportError("수정", err);
    }
  }

  /** 목록에서 바로 급한 일 표시를 켜고 끈다 */
  async function handleUrgent(id, next) {
    try {
      await updateTodo(studentId, id, { urgent: next });
      setStatus(next ? "급한 일로 표시했어요." : "급한 일 표시를 풀었어요.");
    } catch (err) {
      reportError("급한 일 표시", err);
    }
  }

  async function handleDelete(id) {
    try {
      await deleteTodo(studentId, id);
      state.confirmingId = null;
      setStatus("지웠어요.");
    } catch (err) {
      reportError("삭제", err);
    }
  }

  async function handleDeleteCompleted() {
    // 되돌릴 수 없으니 한 번 더 누르게 한다. (confirm() 창은 쓰지 않는다)
    if (!state.confirmingAll) {
      state.confirmingAll = true;
      render();
      return;
    }
    state.confirmingAll = false;
    try {
      const count = await deleteCompletedTodos(studentId);
      setStatus("완료한 일 " + count + "개를 지웠어요.");
    } catch (err) {
      reportError("완료 항목 삭제", err);
    }
    render();
  }

  /**
   * 입력 방법 버튼. 엄마 화면과 같은 js/sources/ 목록을 그대로 쓴다.
   * 학원에서 온 카톡을 아이가 직접 붙여넣어도 과목과 세부 항목이 나뉜다.
   */
  function renderSourcePicker() {
    if (!els.quickSource) return;
    els.quickSource.textContent = "";
    for (const source of INPUT_SOURCES) {
      const btn = makeEl("button", "tab tab--all", source.label);
      btn.type = "button";
      btn.dataset.sourceId = source.id;
      btn.setAttribute("aria-pressed", String(state.sourceId === source.id));
      els.quickSource.appendChild(btn);
    }
    const current = getSource(state.sourceId);
    if (els.quickSourceHint) {
      els.quickSourceHint.textContent = current.hint || "";
      els.quickSourceHint.hidden = !current.hint;
    }
  }

  /** 빠른 추가: 고른 입력 방법으로 나눠서 한꺼번에 넣는다. */
  async function handleQuickAdd() {
    const source = getSource(state.sourceId);
    const parsedList = source.parse(els.quickInput ? els.quickInput.value : "");
    if (parsedList.length === 0) {
      setStatus("할 일을 입력해 주세요.", true);
      if (els.quickInput) els.quickInput.focus();
      return;
    }
    const category = els.quickCategory ? els.quickCategory.dataset.value : CATEGORIES[0];
    const date = state.quickDate;

    els.quickAddBtn.disabled = true;
    els.quickAddBtn.textContent = "추가 중...";
    try {
      // 순서대로 넣어야 createdAt 순서가 입력 순서와 맞는다.
      for (const parsed of parsedList) {
        const data = typeof parsed === "string" ? { title: parsed } : parsed || {};
        const subject = SUBJECTS.includes(data.subject) ? data.subject : "기타";
        let title = data.title || "";
        if (!title) title = (subject !== "기타" ? subject + " " : "") + "숙제";

        await addTodo(studentId, {
          title,
          category,
          subject,
          items: Array.isArray(data.items) ? data.items : [],
          memo: data.memo || "",
          date,
          urgent: state.quickUrgent,
          completed: false,
          addedBy: "self",
          source: state.sourceId,
        });
      }
      els.quickInput.value = "";
      resetQuickDue();
      setOcrStatus("");
      state.addOpen = false;
      setStatus(parsedList.length + "개 추가했어요.");
      render();
    } catch (err) {
      reportError("추가", err);
    } finally {
      els.quickAddBtn.disabled = false;
      els.quickAddBtn.textContent = "추가";
    }
  }

  // --- 캡쳐 이미지에서 글자 읽기 -------------------------------------------

  function setOcrStatus(message, isError) {
    if (!els.quickOcrStatus) return;
    els.quickOcrStatus.textContent = message || "";
    els.quickOcrStatus.hidden = !message;
    els.quickOcrStatus.dataset.error = isError ? "true" : "false";
  }

  async function readImage(file) {
    if (!file) return;
    if (els.quickOcrBtn) els.quickOcrBtn.disabled = true;
    try {
      const { text, confidence, sections } = await recognizeImage(file, (step, percent) => {
        setOcrStatus(percent === null ? step + "..." : step + "... " + percent + "%");
      });
      if (!text) {
        setOcrStatus("글자를 찾지 못했어요. 더 크게 찍은 캡쳐로 해보세요.", true);
        return;
      }

      // 칸이 나뉜 숙제표면 칸 구조를 그대로 살려 바로 할 일로 만든다
      if (sections && sections.length >= 2) {
        setOcrStatus("표에서 숙제 " + sections.length + "개를 넣는 중...");
        const category = els.quickCategory ? els.quickCategory.dataset.value : CATEGORIES[0];
        for (const section of sections) {
          const guessed = getSource("academy").parse(
            [section.name, ...section.lines].join(" ")
          );
          const subject = guessed.length ? guessed[0].subject : "기타";
          await addTodo(studentId, {
            title: section.name || (subject !== "기타" ? subject + " 숙제" : "숙제"),
            category,
            subject,
            items: section.lines,
            // 표에 날짜가 적혀 있으면 그 날짜가 마감일이 된다 (없으면 다음 수업까지)
            date: parseDueDate(section.date) || state.quickDate,
            urgent: state.quickUrgent,
            completed: false,
            addedBy: "self",
            source: "academy",
          });
        }
        setOcrStatus(
          "표에서 숙제 " + sections.length + "개를 넣었어요 (정확도 " +
            Math.round(confidence) + "%). 틀린 건 눌러서 고쳐주세요."
        );
        state.addOpen = false;
        render();
        return;
      }

      const box = els.quickInput;
      box.value = box.value.trim() ? box.value.trim() + "\n" + text : text;
      setOcrStatus("읽었어요 (정확도 " + Math.round(confidence) + "%). 틀린 글자는 고쳐주세요.");
      box.focus();
    } catch (err) {
      console.error("[app:" + studentId + "] OCR 실패", err);
      setOcrStatus(err.message || "이미지를 읽지 못했어요.", true);
    } finally {
      if (els.quickOcrBtn) els.quickOcrBtn.disabled = false;
    }
  }

  // --- 이벤트 배선 (목록은 위임으로 한 번만 건다) ---------------------------

  function onListEvent(event) {
    const trigger = event.target.closest("[data-action]");
    if (!trigger) return;
    const action = trigger.dataset.action;
    const id = trigger.dataset.id;

    switch (action) {
      case "toggle":
        // 저장을 기다리지 않고 누른 자리에서 바로 터뜨린다 (기다리면 한 박자 늦다)
        if (trigger.checked) rewards.onCompleted(trigger);
        handleToggle(id, trigger.checked);
        break;
      case "toggle-item":
        if (trigger.checked) rewards.onCompleted(trigger);
        handleToggleItem(id, Number(trigger.dataset.index), trigger.checked);
        break;
      case "edit":
        closeEditor();
        state.editingId = id;
        state.confirmingId = null;
        render();
        break;
      case "push":
        handlePush(id);
        break;
      case "urgent":
        handleUrgent(id, trigger.dataset.on !== "true");
        break;
      case "delete":
        state.confirmingId = id;
        closeEditor();
        render();
        break;
      case "cancel-delete":
        state.confirmingId = null;
        render();
        break;
      case "delete-confirm":
        handleDelete(id);
        break;
    }
  }

  for (const list of [els.todayList, els.activeList, els.completedList]) {
    if (!list) continue;
    list.addEventListener("click", onListEvent);
    list.addEventListener("change", onListEvent); // 체크박스
  }

  if (els.filters) {
    els.filters.addEventListener("click", (e) => {
      const tab = e.target.closest("[data-filter]");
      if (!tab) return;
      state.filter = tab.dataset.filter;
      render();
    });
  }

  if (els.addToggle) {
    els.addToggle.addEventListener("click", () => {
      state.addOpen = !state.addOpen;
      render();
      if (state.addOpen && els.quickInput) els.quickInput.focus();
    });
  }

  if (els.addCancel) {
    els.addCancel.addEventListener("click", () => {
      state.addOpen = false;
      render();
    });
  }

  if (els.toggleCompletedBtn) {
    els.toggleCompletedBtn.addEventListener("click", () => {
      state.completedOpen = !state.completedOpen;
      state.confirmingAll = false;
      render();
    });
  }

  if (els.deleteCompletedBtn) {
    els.deleteCompletedBtn.addEventListener("click", handleDeleteCompleted);
  }

  if (els.quickAddBtn) {
    els.quickAddBtn.addEventListener("click", handleQuickAdd);
  }

  if (els.quickSource) {
    els.quickSource.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-source-id]");
      if (!btn) return;
      state.sourceId = btn.dataset.sourceId;
      renderSourcePicker();
    });
  }

  if (els.quickOcrBtn && els.quickImage) {
    els.quickOcrBtn.addEventListener("click", () => els.quickImage.click());
    els.quickImage.addEventListener("change", () => {
      readImage(els.quickImage.files && els.quickImage.files[0]);
      els.quickImage.value = ""; // 같은 파일을 다시 골라도 동작하도록
    });
  }

  if (els.quickInput) {
    els.quickInput.addEventListener("paste", (e) => {
      const file = imageFromPaste(e);
      if (file) {
        e.preventDefault();
        readImage(file);
      }
    });
  }

  /**
   * 빠른 추가 폼의 마감일 줄. 기본은 "다음 수업까지"(빈 값)라서, 학원 숙제를
   * 넣을 때는 날짜를 아예 건드리지 않아도 된다.
   */
  function renderQuickDue() {
    if (!els.quickDate) return;
    els.quickDate.textContent = "";
    els.quickDate.className = "edit-due";
    els.quickDate.append(
      createDuePicker(state.quickDate, (v) => { state.quickDate = v; }),
      createUrgentToggle(state.quickUrgent, (v) => { state.quickUrgent = v; })
    );
  }

  function resetQuickDue() {
    state.quickDate = "";
    state.quickUrgent = false;
    renderQuickDue();
  }

  if (els.quickCategory) buildCategoryChips(els.quickCategory, CATEGORIES[0]);
  renderQuickDue();
  renderSourcePicker();

  // --- 화면 제목 (이름 + 아이콘) -------------------------------------------
  //
  // 이름과 아이콘은 students/{studentId}/meta/profile 에 있다. 기기마다 다르면
  // 헷갈리므로 이 기기에만 저장하지 않는다. 엄마 화면도 같은 값을 읽어 쓴다.

  function renderTitle() {
    if (!els.appTitle || !state.profile) return;
    const { name, icon } = state.profile;
    const text = name + " 할 일";

    els.appTitle.textContent = "";
    const btn = makeEl("button", "title-btn");
    btn.type = "button";
    btn.setAttribute("aria-label", text + " — 이름과 아이콘 바꾸기");
    const iconBox = makeEl("span", "title-icon");
    iconBox.appendChild(createSticker(icon, 34));
    btn.append(iconBox, makeEl("span", "title-text", text), makeEl("span", "title-edit", "✎"));
    btn.addEventListener("click", openTitleSheet);
    els.appTitle.appendChild(btn);

    // 브라우저 탭과 홈 화면에서 고른 이름이 보이도록
    document.title = text;
  }

  /** 이름 고치기 + 아이콘 고르기 */
  function openTitleSheet() {
    const picked = { name: state.profile.name, icon: state.profile.icon };

    const sheet = makeEl("div", "sheet");
    const inner = makeEl("div", "sheet-inner");
    inner.appendChild(makeEl("h2", null, "이름과 아이콘"));

    const preview = makeEl("p", "title-preview");
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "field";
    nameInput.maxLength = MAX_NAME_LENGTH;
    nameInput.value = picked.name;
    nameInput.setAttribute("aria-label", "이름");

    function syncPreview() {
      preview.textContent = (picked.name.trim() || "…") + " 할 일";
    }
    nameInput.addEventListener("input", () => {
      picked.name = nameInput.value;
      syncPreview();
    });
    syncPreview();
    inner.append(nameInput, preview);

    // 아이콘은 스티커 판과 같은 그림을 쓴다 (앱 전체가 같은 그림체로 보이게)
    const buttons = [];
    for (const group of GROUPS) {
      inner.appendChild(makeEl("h3", "sheet-group", group));
      const grid = makeEl("div", "pick-grid");
      for (const sticker of STICKERS.filter((x) => x.group === group)) {
        const btn = makeEl("button", "pick" + (picked.icon === sticker.id ? " is-on" : ""));
        btn.type = "button";
        btn.dataset.icon = sticker.id;
        btn.setAttribute("aria-pressed", String(picked.icon === sticker.id));
        btn.appendChild(createSticker(sticker.id, 46));
        btn.appendChild(makeEl("span", "pick-name", sticker.name));
        btn.addEventListener("click", () => {
          picked.icon = sticker.id;
          for (const other of buttons) {
            const on = other.dataset.icon === picked.icon;
            other.classList.toggle("is-on", on);
            other.setAttribute("aria-pressed", String(on));
          }
        });
        buttons.push(btn);
        grid.appendChild(btn);
      }
      inner.appendChild(grid);
    }

    const save = makeEl("button", "btn btn--primary btn--block", "저장");
    save.type = "button";
    save.addEventListener("click", async () => {
      if (!picked.name.trim()) {
        nameInput.focus();
        return;
      }
      save.disabled = true;
      save.textContent = "저장 중...";
      try {
        await setProfile(studentId, picked);
        sheet.remove();
        setStatus("이름을 바꿨어요.");
      } catch (err) {
        save.disabled = false;
        save.textContent = "저장";
        reportError("이름 바꾸기", err);
      }
    });
    inner.appendChild(save);

    const close = makeEl("button", "btn btn--ghost btn--block", "취소");
    close.type = "button";
    close.addEventListener("click", () => sheet.remove());
    inner.appendChild(close);

    sheet.appendChild(inner);
    sheet.addEventListener("click", (e) => { if (e.target === sheet) sheet.remove(); });
    document.body.appendChild(sheet);
    nameInput.focus();
  }

  const unsubscribeProfile = listenProfile(studentId, (profile) => {
    state.profile = profile;
    renderTitle();
  });

  // --- 실시간 구독 ---------------------------------------------------------

  // 엄마가 보낸 응원 한마디. 오늘 것만 헤더 아래에 띄운다.
  // (어제 메시지가 계속 붙어 있으면 금세 배경처럼 무시하게 된다)
  function renderCheer(cheer) {
    const header = document.querySelector(".app-header");
    if (!header) return;
    const old = document.querySelector(".cheer");

    const isToday =
      cheer && cheer.at instanceof Date && sameDay(cheer.at, new Date());
    if (!cheer || !cheer.text || !isToday) {
      if (old) old.remove();
      return;
    }

    const box = old || makeEl("div", "cheer");
    box.textContent = "";
    box.append(makeEl("span", "cheer-from", "엄마"), makeEl("span", "cheer-text", cheer.text));
    if (!old) header.insertAdjacentElement("afterend", box);
  }

  const unsubscribeCheer = listenCheer(
    studentId,
    renderCheer,
    (err) => console.warn("[app] 응원 구독 실패:", err.code || err.message)
  );

  const unsubscribe = listenTodos(
    studentId,
    (todos) => {
      state.todos = todos;
      // 수정/삭제 확인 중이던 항목이 사라졌다면 상태를 정리한다.
      const ids = new Set(todos.map((t) => t.id));
      if (state.editingId && !ids.has(state.editingId)) closeEditor();
      if (state.confirmingId && !ids.has(state.confirmingId)) state.confirmingId = null;
      render();
    },
    (err) => reportError("실시간 연결", err)
  );

  render();

  return {
    studentId,
    state,
    render,
    unsubscribe() {
      unsubscribe();
      unsubscribeCheer();
      unsubscribeProfile();
    },
  };
}
