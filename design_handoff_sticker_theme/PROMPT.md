# 클로드 코드에 붙여넣을 프롬프트 (스티커 52종 + 테마/배경/글꼴 설정)

이 저장소에는 이미 1차 스티커 톤이 적용되어 있습니다(`css/theme-sticker.css`, `js/stickers.js`, `js/rewards.js`).
이 문서는 그 위에 **스티커 52종 · 테마 5종 · 배경 3종 · 글꼴 4종 · 체크할 때 터지는 효과**를 올리는 2차 작업입니다.

아래 `---` 사이를 그대로 Claude Code에 붙여넣으세요. 폴더가 저장소 안에 있으면
"design_handoff_sticker_theme/PROMPT.md 를 읽고 그대로 실행해줘" 한 줄로도 됩니다.

---

우리집 할 일 앱(순수 JS + Firestore, 빌드 없음)의 스티커·테마를 갱신해줘.
`design_handoff_sticker_theme/` 안에 갱신된 원본이 있어. **Firestore 스키마와 읽기 전용 원칙
(엄마 화면에서는 체크 불가)은 그대로 유지**하고, 리팩터링·구조 변경·라이브러리 추가는 하지 마.

## 1. 파일 교체 · 추가

- `design_handoff_sticker_theme/code/stickers.js` → `js/stickers.js` (**전체 덮어쓰기**)
  - 스티커 52종: 고양이 10 · 과일 7 · 채소·간식 8 · 디저트 8 · 꽃·식물 5 · 하늘·마음 7 · 사물 7
  - `createSticker(id, size, rotate)` API는 그대로. `GROUPS`가 7개로 늘었고 `PICK_CUTE`/`PICK_CALM` 기본값이 바뀜.
- `design_handoff_sticker_theme/code/theme-sticker.css` → `css/theme-sticker.css` (**전체 덮어쓰기**)
- `design_handoff_sticker_theme/code/rewards.js` → `js/rewards.js` (**전체 덮어쓰기**)
- `design_handoff_sticker_theme/fonts/*.ttf` → `fonts/` 폴더 새로 만들어 복사
  (`Yanolja-Yache-Regular.ttf`, `JeulgeounIyagi-Medium.ttf`)

## 2. 글꼴 용량 줄이기 (권장)

TTF가 1종당 수 MB라 그대로 쓰면 앱이 무거워져. woff2로 변환해서 같은 폴더에 두면
CSS가 woff2를 먼저 쓰고 TTF는 예비로만 남아(둘 다 `@font-face`에 이미 적어뒀어).

```
npx -y ttf2woff2 < fonts/Yanolja-Yache-Regular.ttf > fonts/Yanolja-Yache-Regular.woff2
npx -y ttf2woff2 < fonts/JeulgeounIyagi-Medium.ttf > fonts/JeulgeounIyagi-Medium.woff2
```

변환이 되면 TTF는 지워도 돼(그럼 `@font-face`의 TTF 줄도 같이 지워줘).
서브셋(한글 상용 2350자)까지 하면 더 줄지만, 아이가 입력한 글자가 깨질 수 있으니 하지 마.

## 3. `js/app.js` — 두 곳만

지금은 `handleToggle()` / `handleToggleItem()` 안에서 서버 응답을 기다린 뒤 `rewards.onCompleted()`를
인자 없이 부르고 있어. 그러면 조각이 터질 위치를 알 수 없고 한 박자 늦어. 이벤트 위임 지점에서
누른 엘리먼트를 그대로 넘기도록 바꿔줘.

`onListEvent()`:

```js
    switch (action) {
      case "toggle":
        if (trigger.checked) rewards.onCompleted(trigger);
        handleToggle(id, trigger.checked);
        break;
      case "toggle-item":
        if (trigger.checked) rewards.onCompleted(trigger);
        handleToggleItem(id, Number(trigger.dataset.index), trigger.checked);
        break;
```

그리고 `handleToggle()` 안의 `if (completed) rewards.onCompleted();` 와
`handleToggleItem()` 안의 `if (done) rewards.onCompleted();` 두 줄은 **삭제**해줘(중복 호출 방지).

`app.js`가 스티커 고르기 UI를 자체적으로 갖고 있으면(`STICKERS`, `GROUPS`를 직접 import해서 그리는 코드)
그 부분은 지우고 `rewards.openPicker()`를 쓰도록 바꿔줘 — 시트는 rewards.js가 그린다.

## 4. `mom.html` / `js/mom.js`

`js/mom.js`가 `createSticker(STUDENT_ICON[studentId], 30)`로 아이 아이콘을 그리고 있어.
스티커 id가 바뀌었을 수 있으니 확인해줘. 없는 id면 `getSticker`가 첫 스티커로 대체하니 깨지진 않지만,
`daughter1`은 `"moon"`, `daughter2`는 `"cheese"`로 맞춰주면 좋겠어.

## 5. `service-worker.js`

- `CACHE_VERSION`을 한 단계 올려줘.
- 프리캐시 목록에 실제로 존재하는 폰트 파일을 추가해줘
  (woff2로 변환했으면 woff2만, 아니면 ttf).

## 6. 확인

`npx -y serve . -l 3000` 으로 띄우고 `daughter1.html`, `daughter2.html`에서:

- **설정 카드**(스티커 판 아래)에 테마 5개 · 배경 3개 · 글꼴 4개가 보이고, 누르면 즉시 바뀌는지
- 테마를 고르면 배경도 그 테마의 기본 배경으로 함께 바뀌는지
- 글꼴 칩의 "가나다" 미리보기가 **각각 다른 글꼴로** 보이는지 (야체·즐거운이야기가 실제로 로드되는지)
- 새로고침해도 테마·배경·글꼴·담은 스티커가 유지되는지 (localStorage)
- `daughter1`은 라벤더밤+또박, `daughter2`는 딸기우유+동글이 기본인지
- 스티커 고르기에 **7개 묶음 52종**이 다 나오고, 담고 빼면 도장·판에 바로 반영되는지
- 체크하면 **누른 자리에서** 조각이 터지고 스티커가 도장처럼 찍히는지, 해제할 때는 안 터지는지
- 전부 완료하면 축하 화면 + 스티커 1장(같은 날 두 번은 안 줌)
- 기기 설정에서 "동작 줄이기"를 켜면 터지는 효과가 생략되는지
- 콘솔 에러 없음, 오프라인에서도 열림

## 7. 배포 후

휴대폰에서는 홈 화면 아이콘을 한 번 지우고 다시 추가하라고 알려줘 (예전 캐시가 남으면 새 화면이 안 보임).

바꾼 파일 목록과 폰트 용량(변환 전/후)만 짧게 알려줘.

---
