# 클로드 코드에 붙일 프롬프트

아래 블록을 그대로 복사해서 Claude Code에 붙여넣으세요. `design_handoff_sticker_theme/` 폴더를
저장소 루트에 함께 올려두면(또는 zip을 풀어두면) 코드 3개 파일을 그대로 가져다 씁니다.

---

우리집 할 일 앱(`hjjjum/homework-app`, 순수 JS + Firestore, 빌드 없음)의 UI를 "스티커 톤"으로
바꾸고 성취 연출을 추가하려고 해. `design_handoff_sticker_theme/` 폴더에 디자인 스펙(README.md)과
바로 쓸 수 있는 코드 3개(`code/theme-sticker.css`, `code/stickers.js`, `code/rewards.js`)가 있어.
아래 순서대로 최소 변경으로 붙여줘. **기존 Firestore 스키마와 읽기 전용 원칙(엄마 화면에서는 체크 불가)은
그대로 유지**하고, 리팩터링·파일 구조 변경·라이브러리 추가는 하지 마.

## 1단계 — 파일 추가

- `design_handoff_sticker_theme/code/theme-sticker.css` → `css/theme-sticker.css`
- `design_handoff_sticker_theme/code/stickers.js` → `js/stickers.js`
- `design_handoff_sticker_theme/code/rewards.js` → `js/rewards.js`

## 2단계 — `daughter1.html`, `daughter2.html` 수정 (두 파일 동일)

1. `css/style.css` 링크 **다음 줄에** 추가:
   `<link rel="stylesheet" href="css/theme-sticker.css" />`
2. `<div class="progress">` 안, `<p class="progress-text">` **앞에** 추가:
   `<div id="progress-ring"></div>`
3. `<ul class="todo-list" id="active-list"></ul>` **다음에** 추가:
   `<section id="reward-panel" aria-label="스티커와 연속 달성"></section>`
4. `<div class="progress-track">…</div>` 블록은 지우지 말고 그대로 둘 것 (CSS가 숨기고, 접근성 값은 계속 갱신됨).

## 3단계 — `js/app.js` 수정 (5곳, 전부 몇 줄씩)

1. import 추가:
   ```js
   import { initRewards } from "./rewards.js";
   import { createSticker } from "./stickers.js";
   ```
2. `initApp()` 안에서 `const state = {…}` 선언 **다음에**:
   ```js
   const rewards = initRewards(studentId);
   ```
3. `renderProgress()` 안, `const p = calcProgress(state.todos)[ALL];` 아래 아무 곳에:
   ```js
   rewards.setProgress(p);
   ```
   (링을 그리고, 0%→100%로 바뀌는 순간 하루 한 번 스티커 지급 + 축하 화면을 띄운다)
4. `renderItem(todo)` → `renderItem(todo, index)` 로 시그니처를 바꾸고,
   체크박스를 만드는 부분에 스티커를 하나 더 넣어줘:
   ```js
   check.append(input, makeEl("span", "check-box"),
     createSticker(rewards.stickerFor(index || 0), 34));
   ```
   그리고 `renderList()`의 루프를 인덱스가 넘어가게 바꿔줘:
   ```js
   todos.forEach((todo, i) => container.appendChild(renderItem(todo, i)));
   ```
   (완료되면 CSS가 점선 동그라미를 감추고 스티커를 도장처럼 찍는다 — JS 분기 필요 없음)
5. 완료로 바뀔 때 짧은 진동:
   - `handleToggle()`에서 `updateTodo` 성공 후 `if (completed) rewards.onCompleted();`
   - `handleToggleItem()`에서 `updateTodo` 성공 후 `if (done) rewards.onCompleted();`

## 4단계 — `service-worker.js`

- 맨 위 `CACHE_VERSION`을 한 단계 올려줘.
- 프리캐시 목록에 `css/theme-sticker.css`, `js/stickers.js`, `js/rewards.js` 추가.

## 5단계 — 확인

`npx -y serve . -l 3000` 으로 띄우고 `daughter1.html`에서:
- 배경에 하늘·구름·반짝임이 보이고, 진행 링이 퍼센트대로 채워지는지
- 체크하면 스티커가 도장처럼 찍히고 짧게 진동하는지, 다시 누르면 취소되는지
- 전부 완료하면 색종이 축하 화면이 뜨고 스티커 판이 한 칸 차는지 (같은 날 두 번은 안 줌)
- "스티커 고르기"에서 24종 중 담고 빼면 도장·판에 바로 반영되는지
- `daughter1`은 차분한 톤(`body[data-theme="calm"]`), `daughter2`는 캔디 톤이 기본인지
- 오프라인에서도 열리고, 콘솔 에러가 없는지

## 6단계 (원하면 이어서) — 엄마 화면

`mom.html`의 "현황 보기"를 두 아이 한 화면으로 바꾸고, 응원 한마디 보내기를 추가해줘.
- 현황: 아이별 카드 하나에 진행률 바(`.kid-bar`), `n/m 완료`, 남은 항목 3개, 마지막 체크 시각.
  두 아이를 세로로 나란히 (지금의 딸 전환 탭은 없애도 됨). **읽기 전용 유지.**
- 응원: Firestore `students/{studentId}/meta/cheer` 문서에 `{ text, at }`를 쓰고,
  아이 화면(`app.js`)이 그 문서를 구독해서 헤더 아래에 배너로 보여줘.
  마크업은 `<div class="cheer"><span class="cheer-from">엄마</span><span class="cheer-text">…</span></div>`
  (CSS는 `theme-sticker.css`에 이미 있음). 오늘 날짜가 아닌 메시지는 숨겨줘.
- 칩 문구 예: "잘하고 있어", "저녁 전에 한 개만 더", "다 하면 같이 놀자", "오늘도 애썼어".

작업 후 바꾼 파일 목록과, 스크린샷으로 확인해야 할 항목만 짧게 알려줘.

---
