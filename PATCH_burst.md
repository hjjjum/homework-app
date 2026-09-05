# 추가 패치 — 체크할 때마다 터지는 효과

스티커 톤은 이미 적용됐습니다. 이 문서는 **"체크할 때 누른 자리에서 조각이 터지는 효과"만** 붙입니다.
아래 `---` 사이를 그대로 Claude Code에 붙여넣으세요.

---

우리집 할 일 앱에 "체크할 때마다 누른 자리에서 조각이 터지는 효과"를 추가해줘. 세 곳만 고치면 돼.
`design_handoff_sticker_theme/code/` 폴더에 갱신된 원본이 있으니 그걸 기준으로 해줘.

## 1. `js/rewards.js`

`design_handoff_sticker_theme/code/rewards.js` 로 **파일 전체를 덮어써줘.**
(기존 파일과의 차이는 `burstAt(anchor)` export 추가 + `onCompleted(anchor)` 가 인자를 받아 그 자리에서 터뜨리는 것뿐이야.
localStorage 키·스티커 판·축하 화면 로직은 동일하니 지금 저장된 아이들 스티커·연속 일수는 그대로 유지돼.)

핵심만 보면 이렇게 동작해:
- 누른 요소의 `getBoundingClientRect()` 중심에 `position:fixed` 컨테이너를 하나 붙이고,
  파동(`.burst-wave`) 1개 + 조각(`.burst-bit`) 11개를 11방향으로 뿌린 뒤 0.8초 후 DOM에서 제거.
- `prefers-reduced-motion: reduce` 면 아무것도 만들지 않고 바로 반환.

## 2. `css/theme-sticker.css`

`design_handoff_sticker_theme/code/theme-sticker.css` 로 **파일 전체를 덮어써줘.**
(차이는 `.burst / .burst-wave / .burst-arm / .burst-bit` 규칙과 `@keyframes shoot`, `@keyframes shockwave` 추가뿐이야.)

## 3. `js/app.js` — `onListEvent()` 두 줄만

지금은 `handleToggle()` / `handleToggleItem()` 안에서 서버 응답을 기다린 뒤 `rewards.onCompleted()` 를
인자 없이 부르고 있어. 그러면 터지는 위치를 알 수 없고, 체감상 한 박자 늦어. 이벤트 위임 지점에서
누른 엘리먼트를 그대로 넘기도록 바꿔줘.

`onListEvent()` 를 이렇게:

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
`handleToggleItem()` 안의 `if (done) rewards.onCompleted();` 두 줄은 **삭제해줘** (중복 호출 방지).

## 4. `service-worker.js`

`CACHE_VERSION` 을 한 단계 올려줘. (파일 목록은 그대로 — 새 파일은 없어.)

## 5. 확인

`npx -y serve . -l 3000` 으로 띄우고 `daughter1.html` 에서:
- 할 일을 체크하면 **누른 동그라미 자리에서** 코랄 파동이 퍼지고 색종이·별 조각이 사방으로 튀는지
- 세부 항목(작은 사각 체크)을 눌러도 그 자리에서 터지는지
- **체크를 해제할 때는 안 터지는지**
- 스크롤을 내린 상태에서 눌러도 위치가 정확한지 (`position: fixed` + `getBoundingClientRect` 라 맞아야 함)
- 전부 완료하면 기존 축하 화면(색종이 + 스티커 지급)이 그대로 뜨는지
- 기기 설정에서 "동작 줄이기"를 켜면 터지는 효과가 생략되는지
- 콘솔 에러가 없는지

바꾼 파일 목록만 짧게 알려줘.

---
