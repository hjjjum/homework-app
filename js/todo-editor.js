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
 * 세부 항목 줄 편집기. items 배열({text, done})을 **제자리에서** 고친다.
 * 엄마 화면의 보낼 카드와 저장된 할일 편집 폼이 같은 것을 쓴다.
 *   - 줄마다 [＋] 바로 아래에 새 줄, [✕] 그 줄 빼기
 *   - Enter: 커서 자리에서 줄을 둘로 나눈다 (OCR이 두 숙제를 한 줄로 붙여 읽었을 때)
 *   - 빈 줄에서 Backspace: 그 줄을 빼고 윗줄로 간다
 *   - 맨 아래 [+ 줄 추가]
 * 줄을 넣고 뺄 때 목록 전체를 다시 그리므로, 커서는 새로 그린 뒤 원하는 줄로 옮긴다.
 * @param {Array<{text: string, done: boolean}>} items
 * @param {{label?: string}} [options]
 * @returns {HTMLElement}
 */
export function createItemsEditor(items, options) {
  const opts = options || {};
  const box = el("div", "edit-items");
  const label = el("p", "edit-items-label");
  const list = el("ul", "edit-item-list");
  const addBtn = el("button", "btn btn--ghost btn--small", "+ 줄 추가");
  addBtn.type = "button";

  /** 줄을 at 자리에 넣고 그 줄에 커서를 둔다 */
  function insertAt(at, text, caret) {
    if (items.length >= MAX_ITEMS) return;
    items.splice(at, 0, { text: text || "", done: false });
    draw(at, caret || 0);
  }

  function removeAt(at, focusAt) {
    items.splice(at, 1);
    draw(focusAt, "end");
  }

  function draw(focusIndex, caret) {
    list.textContent = "";
    items.forEach((item, index) => {
      const li = el("li", "edit-item");
      const input = document.createElement("input");
      input.type = "text";
      input.className = "field";
      input.value = item.text;
      input.setAttribute("aria-label", "세부 항목 " + (index + 1));
      input.addEventListener("input", () => { item.text = input.value; });
      input.addEventListener("click", (e) => e.stopPropagation());
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.isComposing) {
          e.preventDefault();
          const at = input.selectionStart ?? input.value.length;
          const rest = input.value.slice(at).trim();
          item.text = input.value.slice(0, at).trim();
          insertAt(index + 1, rest, 0);
        } else if (e.key === "Backspace" && input.value === "" && items.length > 0) {
          e.preventDefault();
          removeAt(index, Math.max(0, index - 1));
        }
      });

      const plus = el("button", "icon-btn icon-btn--small", "＋");
      plus.type = "button";
      plus.title = "아래에 줄 추가";
      plus.setAttribute("aria-label", (index + 1) + "번 아래에 줄 추가");
      plus.addEventListener("click", (e) => {
        e.stopPropagation();
        insertAt(index + 1, "", 0);
      });

      const del = el("button", "icon-btn icon-btn--small", "✕");
      del.type = "button";
      del.title = "이 줄 빼기";
      del.setAttribute("aria-label", (index + 1) + "번 줄 빼기");
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        removeAt(index, Math.min(index, items.length - 2));
      });

      li.append(input, plus, del);
      list.appendChild(li);
    });

    label.textContent =
      items.length > 0
        ? (opts.label || "세부 항목") + " " + items.length + "개"
        : (opts.label || "세부 항목") + " 없음";
    addBtn.disabled = items.length >= MAX_ITEMS;

    if (focusIndex != null && focusIndex >= 0) {
      const input = list.querySelectorAll("input")[focusIndex];
      if (input) {
        input.focus();
        const pos = caret === "end" ? input.value.length : caret || 0;
        input.setSelectionRange(pos, pos);
      }
    }
  }

  addBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    insertAt(items.length, "", 0);
  });

  draw(null);
  box.append(label, list, addBtn);
  return box;
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
  form.appendChild(createItemsEditor(draft.items));

  // 표 캡쳐에서 온 참고는 여러 줄(교재명 + 안내)이다. <input>에 넣으면 줄바꿈이
  // 지워진 채로 저장되므로, 여러 줄이면 textarea로 고친다.
  const memoMultiline = draft.memo.includes("\n");
  const memo = document.createElement(memoMultiline ? "textarea" : "input");
  if (memoMultiline) memo.rows = Math.min(draft.memo.split("\n").length + 1, 6);
  else memo.type = "text";
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

  // 지우기 — 되돌릴 수 없으니 한 번 더 누르게 한다 (confirm() 창은 쓰지 않는다)
  if (on.onDelete) {
    const del = el("button", "btn btn--ghost btn--danger-text", "지우기");
    del.type = "button";
    let armed = false;
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!armed) {
        armed = true;
        del.textContent = "정말 지울까요? 한 번 더 누르기";
        del.classList.add("is-confirming");
        return;
      }
      on.onDelete();
    });
    actions.appendChild(del);
  }
  form.appendChild(actions);

  return form;
}
