// ---------------------------------------------------------------------------
// todo-editor.js
// 이미 저장된 할일 하나를 고치는 인라인 폼. 딸 화면과 엄마 화면이 같은 것을 쓴다.
//
// 폼은 자기가 만든 draft 객체를 직접 갱신하고, 저장 단추를 누를 때 그 draft를
// 그대로 넘긴다. 목록이 실시간으로 다시 그려져도 같은 draft·같은 DOM을 다시 붙이면
// 입력하던 값과 커서가 살아남는다 (호출하는 쪽에서 폼 엘리먼트를 들고 있으면 된다).
//
// 세부 항목(items)까지 여기서 고칠 수 있다. 학원 숙제는 항목 한 줄이 잘못 읽히는
// 일이 많은데, 그것 때문에 숙제를 지웠다 다시 만들게 하지 않으려는 것이다.
// ---------------------------------------------------------------------------
import { CATEGORIES, SUBJECTS, MAX_ITEMS } from "./db.js";
import { CATEGORY_KEY, SUBJECT_KEY } from "./todo-logic.js";
import { createDuePicker, createUrgentToggle } from "./due-picker.js";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/** 저장된 할일 → 폼이 만지작거릴 사본 */
export function makeEditDraft(todo) {
  return {
    id: todo.id,
    title: todo.title || "",
    category: CATEGORIES.includes(todo.category) ? todo.category : CATEGORIES[0],
    subject: SUBJECTS.includes(todo.subject) ? todo.subject : "기타",
    date: typeof todo.date === "string" ? todo.date : "",
    memo: todo.memo || "",
    urgent: todo.urgent === true,
    // {text, done} 모양을 유지한다 — 체크해 둔 것이 수정하다 풀리면 안 된다
    items: (Array.isArray(todo.items) ? todo.items : []).map((it) => ({
      text: it && typeof it.text === "string" ? it.text : String(it || ""),
      done: !!(it && it.done),
    })),
  };
}

/** 선택 칩 한 줄 (카테고리 / 과목 공용) */
function chipRow(values, current, className, keyMap, onPick, label) {
  const row = el("div", className);
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", label);
  const chips = [];
  for (const value of values) {
    const chip = el("button", keyMap(value), value);
    chip.type = "button";
    chip.dataset.value = value;
    chip.setAttribute("aria-pressed", String(value === current));
    chip.addEventListener("click", (e) => {
      e.stopPropagation();
      onPick(value);
      for (const other of chips) {
        other.setAttribute("aria-pressed", String(other.dataset.value === value));
      }
    });
    chips.push(chip);
    row.appendChild(chip);
  }
  return row;
}

/**
 * 편집 폼을 만든다.
 * @param {object} draft makeEditDraft()가 만든 사본. 폼이 이 객체를 직접 고친다.
 * @param {{onSave: (draft) => void, onCancel: () => void, onDelete?: () => void,
 *          saveLabel?: string}} handlers
 * @returns {HTMLElement}
 */
export function createTodoEditor(draft, handlers) {
  const on = handlers || {};
  const form = el("div", "edit-form");

  // 제목 — 학원 알림장처럼 여러 줄이면 input이 줄바꿈을 지워버리므로 textarea로
  const multiline = draft.title.includes("\n");
  const title = document.createElement(multiline ? "textarea" : "input");
  if (multiline) title.rows = Math.min(draft.title.split("\n").length + 1, 10);
  else title.type = "text";
  title.className = "field";
  title.value = draft.title;
  title.setAttribute("aria-label", "할 일 제목");
  title.addEventListener("input", () => { draft.title = title.value; });

  form.appendChild(title);
  form.appendChild(
    chipRow(CATEGORIES, draft.category, "chip-group",
      (c) => "chip chip--" + CATEGORY_KEY[c],
      (c) => { draft.category = c; }, "종류")
  );
  form.appendChild(
    chipRow(SUBJECTS, draft.subject, "subject-row",
      (s) => "subject-chip subject--" + SUBJECT_KEY[s],
      (s) => { draft.subject = s; }, "과목")
  );

  const dueRow = el("div", "edit-due");
  dueRow.append(
    createDuePicker(draft.date, (v) => { draft.date = v; }),
    createUrgentToggle(draft.urgent, (v) => { draft.urgent = v; })
  );
  form.appendChild(dueRow);

  // 세부 항목
  const itemsBox = el("div", "edit-items");
  const list = el("ul", "edit-item-list");

  function addItemRow(item) {
    const li = el("li", "edit-item");
    const input = document.createElement("input");
    input.type = "text";
    input.className = "field";
    input.value = item.text;
    input.setAttribute("aria-label", "세부 항목");
    input.addEventListener("input", () => { item.text = input.value; });
    input.addEventListener("click", (e) => e.stopPropagation());

    const del = el("button", "icon-btn", "✕");
    del.type = "button";
    del.setAttribute("aria-label", "이 항목 빼기");
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      const at = draft.items.indexOf(item);
      if (at >= 0) draft.items.splice(at, 1);
      li.remove();
      syncItemLabel();
    });

    li.append(input, del);
    list.appendChild(li);
  }

  const itemLabel = el("p", "edit-items-label");
  function syncItemLabel() {
    itemLabel.textContent =
      draft.items.length > 0 ? "세부 항목 " + draft.items.length + "개" : "세부 항목 없음";
    addBtn.disabled = draft.items.length >= MAX_ITEMS;
  }

  const addBtn = el("button", "btn btn--ghost btn--small", "+ 항목 추가");
  addBtn.type = "button";
  addBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const item = { text: "", done: false };
    draft.items.push(item);
    addItemRow(item);
    syncItemLabel();
    const inputs = list.querySelectorAll("input");
    if (inputs.length) inputs[inputs.length - 1].focus();
  });

  draft.items.forEach(addItemRow);
  syncItemLabel();
  itemsBox.append(itemLabel, list, addBtn);
  form.appendChild(itemsBox);

  const memo = document.createElement("input");
  memo.type = "text";
  memo.className = "field";
  memo.placeholder = "메모 (선택)";
  memo.value = draft.memo;
  memo.setAttribute("aria-label", "메모");
  memo.addEventListener("input", () => { draft.memo = memo.value; });
  form.appendChild(memo);

  const actions = el("div", "edit-actions");
  const save = el("button", "btn btn--primary", on.saveLabel || "저장");
  save.type = "button";
  save.addEventListener("click", (e) => {
    e.stopPropagation();
    if (on.onSave) on.onSave(draft);
  });
  const cancel = el("button", "btn btn--ghost", "취소");
  cancel.type = "button";
  cancel.addEventListener("click", (e) => {
    e.stopPropagation();
    if (on.onCancel) on.onCancel();
  });
  actions.append(save, cancel);
  form.appendChild(actions);

  return form;
}
