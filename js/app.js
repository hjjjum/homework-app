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
  CATEGORIES,
} from "./db.js";
import {
  ALL,
  FILTERS,
  CATEGORY_KEY,
  filterByCategory,
  splitByCompleted,
  calcProgress,
  formatDue,
} from "./todo-logic.js";
import { parseManualInput } from "./sources/manual-input.js";

// 순수 로직은 todo-logic.js, 입력 파싱은 sources/ 아래로 분리되어 있다.
// 콘솔이나 다른 화면에서 쓰기 편하도록 여기서 다시 내보낸다.
export {
  ALL,
  FILTERS,
  CATEGORY_KEY,
  filterByCategory,
  splitByCompleted,
  calcProgress,
  formatDue,
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
    progressCount: $("progress-count"),
    progressPercent: $("progress-percent"),
    progressFill: $("progress-fill"),
    filters: $("filters"),
    addToggle: $("add-toggle"),
    addForm: $("add-form"),
    quickInput: $("quick-input"),
    quickCategory: $("quick-category"),
    quickDate: $("quick-date"),
    quickAddBtn: $("quick-add-btn"),
    addCancel: $("add-cancel"),
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
    completedOpen: false,
    editingId: null,    // 인라인 수정 중인 항목
    confirmingId: null, // 삭제 확인 대기 중인 항목
    confirmingAll: false,
  };

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

  function renderProgress() {
    const p = calcProgress(state.todos)[ALL];
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

  /** 수정 중인 항목 → 인라인 편집 폼 */
  function renderEditForm(todo) {
    const li = makeEl("li", "todo todo--editing");
    li.dataset.id = todo.id;

    const form = makeEl("div", "edit-form");

    const title = document.createElement("input");
    title.type = "text";
    title.className = "field";
    title.value = todo.title;
    title.dataset.field = "title";
    title.setAttribute("aria-label", "할 일 제목");

    const chips = makeEl("div", "chip-group");
    chips.dataset.field = "category";
    buildCategoryChips(chips, todo.category);

    const row = makeEl("div", "edit-row");
    const date = document.createElement("input");
    date.type = "date";
    date.className = "field";
    date.value = todo.date || "";
    date.dataset.field = "date";
    date.setAttribute("aria-label", "마감일");

    const memo = document.createElement("input");
    memo.type = "text";
    memo.className = "field";
    memo.placeholder = "메모 (선택)";
    memo.value = todo.memo || "";
    memo.dataset.field = "memo";
    memo.setAttribute("aria-label", "메모");
    row.append(date, memo);

    const actions = makeEl("div", "edit-actions");
    const save = makeEl("button", "btn btn--primary", "저장");
    save.type = "button";
    save.dataset.action = "save";
    save.dataset.id = todo.id;
    const cancel = makeEl("button", "btn btn--ghost", "취소");
    cancel.type = "button";
    cancel.dataset.action = "cancel-edit";
    actions.append(save, cancel);

    form.append(title, chips, row, actions);
    li.appendChild(form);
    return li;
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

  function renderItem(todo) {
    if (state.editingId === todo.id) return renderEditForm(todo);
    if (state.confirmingId === todo.id) return renderDeleteConfirm(todo);

    const li = makeEl("li", "todo");
    li.dataset.id = todo.id;

    // 체크박스: 보이는 크기는 24px이지만 label이 44px 터치 영역을 만든다.
    const check = makeEl("label", "check");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = todo.completed;
    input.dataset.action = "toggle";
    input.dataset.id = todo.id;
    input.setAttribute("aria-label", todo.title + " 완료");
    check.append(input, makeEl("span", "check-box"));

    // 본문 전체가 버튼 = 항목을 탭하면 수정
    const main = makeEl("button", "todo-main");
    main.type = "button";
    main.dataset.action = "edit";
    main.dataset.id = todo.id;
    main.setAttribute("aria-label", todo.title + " 수정");
    main.appendChild(makeEl("span", "todo-title", todo.title));

    const meta = makeEl("span", "todo-meta");
    meta.appendChild(
      makeEl("span", "badge badge--" + CATEGORY_KEY[todo.category], todo.category)
    );

    const due = formatDue(todo.date);
    if (due) meta.appendChild(makeEl("span", "due due--" + due.tone, due.text));
    if (todo.addedBy === "mom") meta.appendChild(makeEl("span", "from-mom", "엄마가 보냄"));
    if (todo.memo) meta.appendChild(makeEl("span", "memo", todo.memo));

    main.appendChild(meta);

    const del = makeEl("button", "icon-btn");
    del.type = "button";
    del.dataset.action = "delete";
    del.dataset.id = todo.id;
    del.setAttribute("aria-label", todo.title + " 삭제");
    del.appendChild(trashIcon());

    li.append(check, main, del);
    return li;
  }

  function renderList(container, todos, emptyText) {
    if (!container) return;
    container.textContent = "";
    if (todos.length === 0) {
      container.appendChild(makeEl("li", "empty", emptyText));
      return;
    }
    for (const todo of todos) container.appendChild(renderItem(todo));
  }

  function render() {
    const visible = filterByCategory(state.todos, state.filter);
    const { active, completed } = splitByCompleted(visible);

    renderFilters();
    renderProgress();

    const emptyText =
      state.filter === ALL ? "할 일이 없어요. 오늘은 여유롭네요." : state.filter + " 항목이 없어요.";
    renderList(els.activeList, active, emptyText);

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
    try {
      await updateTodo(studentId, id, { completed });
      setStatus(completed ? "잘했어요!" : "다시 할 일로 되돌렸어요.");
    } catch (err) {
      reportError("완료 표시", err);
    }
  }

  async function handleSave(li, id) {
    const get = (field) => li.querySelector('[data-field="' + field + '"]');
    const changes = {
      title: get("title").value.trim(),
      category: get("category").dataset.value,
      date: get("date").value,
      memo: get("memo").value.trim(),
    };
    if (!changes.title) {
      setStatus("제목은 비울 수 없어요.", true);
      return;
    }
    try {
      await updateTodo(studentId, id, changes);
      state.editingId = null;
      setStatus("수정했어요.");
      render();
    } catch (err) {
      reportError("수정", err);
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

  /** 빠른 추가: 여러 줄을 붙여넣으면 줄 수만큼 항목이 만들어진다. */
  async function handleQuickAdd() {
    const titles = parseManualInput(els.quickInput ? els.quickInput.value : "");
    if (titles.length === 0) {
      setStatus("할 일을 입력해 주세요.", true);
      if (els.quickInput) els.quickInput.focus();
      return;
    }
    const category = els.quickCategory ? els.quickCategory.dataset.value : CATEGORIES[0];
    const date = els.quickDate ? els.quickDate.value : "";

    els.quickAddBtn.disabled = true;
    els.quickAddBtn.textContent = "추가 중...";
    try {
      // 순서대로 넣어야 createdAt 순서가 입력 순서와 맞는다.
      for (const title of titles) {
        await addTodo(studentId, {
          title,
          category,
          date,
          completed: false,
          addedBy: "self",
          source: "manual",
        });
      }
      els.quickInput.value = "";
      if (els.quickDate) els.quickDate.value = "";
      state.addOpen = false;
      setStatus(titles.length + "개 추가했어요.");
      render();
    } catch (err) {
      reportError("추가", err);
    } finally {
      els.quickAddBtn.disabled = false;
      els.quickAddBtn.textContent = "추가";
    }
  }

  // --- 이벤트 배선 (목록은 위임으로 한 번만 건다) ---------------------------

  function onListEvent(event) {
    const trigger = event.target.closest("[data-action]");
    if (!trigger) return;
    const action = trigger.dataset.action;
    const id = trigger.dataset.id;
    const li = trigger.closest("li");

    switch (action) {
      case "toggle":
        handleToggle(id, trigger.checked);
        break;
      case "edit":
        state.editingId = id;
        state.confirmingId = null;
        render();
        break;
      case "cancel-edit":
        state.editingId = null;
        render();
        break;
      case "save":
        handleSave(li, id);
        break;
      case "delete":
        state.confirmingId = id;
        state.editingId = null;
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

  for (const list of [els.activeList, els.completedList]) {
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

  if (els.quickCategory) buildCategoryChips(els.quickCategory, CATEGORIES[0]);

  // --- 실시간 구독 ---------------------------------------------------------

  const unsubscribe = listenTodos(
    studentId,
    (todos) => {
      state.todos = todos;
      // 수정/삭제 확인 중이던 항목이 사라졌다면 상태를 정리한다.
      const ids = new Set(todos.map((t) => t.id));
      if (state.editingId && !ids.has(state.editingId)) state.editingId = null;
      if (state.confirmingId && !ids.has(state.confirmingId)) state.confirmingId = null;
      render();
    },
    (err) => reportError("실시간 연결", err)
  );

  render();

  return { studentId, state, render, unsubscribe };
}
