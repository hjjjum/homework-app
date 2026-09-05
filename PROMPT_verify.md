# 클로드 코드 프롬프트 — 오늘 작업 점검 & 배포

> 확인 결과 로컬 저장소에는 오늘 작업이 **이미 반영되어 있습니다**
> (`js/stickers.js`의 `CATF`, `js/rewards.js`의 `THEMES`/설정, `css/theme-sticker.css`의
> `[data-theme]`·`[data-font]`, `fonts/*.woff2`, `service-worker.js` v30).
> 화면에 안 보이는 건 **배포가 안 됐거나 예전 서비스워커 캐시가 남아 있어서**일 가능성이 큽니다.
> 아래 프롬프트가 그 진단부터 합니다.

아래 `---` 사이를 그대로 Claude Code에 붙여넣으세요.

---

우리집 할 일 앱(순수 JS + Firestore, 빌드 없음, GitHub Pages)에서 오늘 작업한 내용이
화면에 안 보인다고 해. **먼저 원인을 진단하고**, 빠진 게 있으면 채우고, 마지막에 배포까지 해줘.
리팩터링·구조 변경·라이브러리 추가는 하지 마. Firestore 스키마와 읽기 전용 원칙
(엄마 화면에서는 체크 불가)은 그대로 유지해.

## 0단계 — 진단 (여기부터)

```
git status
git log --oneline -5
```

- **커밋/푸시가 안 됐으면** 그게 원인이야. 6단계로 가서 커밋·푸시하고, 7단계 캐시 안내까지 해줘.
- 커밋이 이미 되어 있으면 1~5단계로 실제 파일 상태를 점검해줘.
- `npx -y serve . -l 3000` 으로 로컬에서 띄우고 `daughter1.html`을 열어
  **콘솔 에러**와 아래 항목을 확인해줘. 로컬에서는 잘 되는데 배포 주소에서만 안 되면
  100% 배포/캐시 문제야.

진단 팁:
- 브라우저 콘솔에서 `document.documentElement.dataset` 를 찍어봐.
  `{theme:"…", bg:"…", font:"…"}` 가 나와야 해. 비어 있으면 `initRewards()`가 실행되지 않은 것.
- `document.querySelectorAll('#reward-panel .opt').length` 가 12(테마5+배경3+글꼴4)여야 해.
- `document.fonts.check('16px YanoljaYache')` 가 true여야 야체가 로드된 것.

## 1단계 — 스티커 52종 (`js/stickers.js`)

7개 묶음, 총 52종이 있어야 해.

| 묶음 | 개수 | 스티커 |
| --- | --- | --- |
| 고양이 | 10 | 치즈태비·삼색이·턱시도·러시안블루·샴·페르시안·스코티시폴드·랙돌·벵갈·먼치킨 |
| 과일 | 7 | 딸기·체리·레몬·수박·사과·복숭아·바나나 |
| 채소·간식 | 8 | 감자·토마토·당근·옥수수·달걀후라이·브로콜리·가지·완두콩 |
| 디저트 | 8 | 도넛·아이스크림·컵케이크·주스·사탕·쿠키·마카롱·푸딩 |
| 꽃·식물 | 5 | 튤립·데이지·네잎클로버·선인장·버섯 |
| 하늘·마음 | 7 | 반짝별·무지개·구름·달·하트·리본·풍선 |
| 사물 | 7 | 연필·지우개·공책·시계·우산·머그컵·양말 |

- 고양이는 `CATF()` 한 함수로 만든다 — 동글한 귀(45° 회전한 비대칭 border-radius) + 외곽선 한 겹 +
  큰 점 눈 + 흰 반짝임 + 코 + 앞발 두 개. 수염·입은 없다(단순화한 최종안).
- 채소·간식은 `EYES()`/`BLUSH()` 헬퍼로 전부 얼굴이 있어야 한다.
- 다르면 `design_handoff_sticker_theme/code/stickers.js` 로 **전체 덮어쓰기**.

## 2단계 — 테마·배경·글꼴 (`css/theme-sticker.css`)

`<html>`의 data 속성에 CSS가 반응하는 구조여야 해.

| 속성 | 값 |
| --- | --- |
| `data-theme` | strawberry(딸기우유) / mint(민트소다) / lemon(레몬버터) / lavender(라벤더밤) / matcha(말차라떼) |
| `data-bg` | sky(하늘·구름) / grid(모눈) / dots(물방울) |
| `data-font` | round(동글 Jua) / neat(또박 고운바탕) / yache(야놀자 야체) / story(즐거운 이야기) |

- 테마마다 `--ac --ac2 --ac3 --sky --grn --soft --line2 --track --dash --sub
  --bg1 --bg2 --blob1 --blob2 --blob3 --dotA --dotB --warm --gridline --stripe` 한 벌.
- 글꼴은 `--fh`(제목) / `--fb`(본문) 두 변수로만 갈아끼운다.
- 야체·즐거운이야기는 `@font-face`로 `fonts/*.woff2`(예비 `*.ttf`)를 읽는다.
- 다르면 `design_handoff_sticker_theme/code/theme-sticker.css` 로 **전체 덮어쓰기**.

## 3단계 — 설정 UI + 보상 (`js/rewards.js`)

- `#reward-panel`에 **연속 달성 배지 → 스티커 판(8칸) → 설정 카드** 순으로 그린다.
- 설정 카드: 테마 5칩(색 스와치 3개씩) / 배경 3칩(배경 미리보기) / 글꼴 4칩("가나다"를 **각 글꼴로**).
- 칩을 누르면 `document.documentElement.dataset.theme|bg|font` 를 바꾸고 localStorage에 저장.
  테마를 고르면 그 테마의 기본 배경으로 함께 전환된다.
- localStorage 키는 `hw.rewards.<studentId>` 하나. 저장 내용:
  `{ picked, board, streak, lastClearDate, theme, bg, font }`
- 기본값 — `daughter1`(중1): 라벤더밤 + 물방울 + 또박 / `daughter2`(초5): 딸기우유 + 하늘 + 동글.
- 진행률 0→100 전이 때만 스티커 1장 + 연속 +1 + 축하 화면(색종이), **같은 날 두 번은 안 준다**.
- `burstAt(anchor)` — 체크한 자리에서 조각 11개 + 파동. `prefers-reduced-motion`이면 생략.
- 다르면 `design_handoff_sticker_theme/code/rewards.js` 로 **전체 덮어쓰기**.

## 4단계 — `js/app.js` 연결 확인

```js
import { initRewards } from "./rewards.js";
const rewards = initRewards(studentId);              // initApp() 안
rewards.setProgress(calcProgress(state.todos)[ALL]); // renderProgress() 끝
```
`onListEvent()`에서:
```js
case "toggle":
  if (trigger.checked) rewards.onCompleted(trigger);
  handleToggle(id, trigger.checked);
  break;
case "toggle-item":
  if (trigger.checked) rewards.onCompleted(trigger);
  handleToggleItem(id, Number(trigger.dataset.index), trigger.checked);
  break;
```
완료 도장은 `createSticker(rewards.stickerFor(index || 0), 34)` 를 `.check` 안에 넣고,
CSS가 `input:checked` 로 점선 동그라미↔스티커를 전환한다(JS 분기 없음).

`handleToggle()`/`handleToggleItem()` 안에 `rewards.onCompleted()` 를 인자 없이 부르는 줄이
남아 있으면 **지워줘**(중복 호출).

## 5단계 — `daughter1.html` / `daughter2.html`

- `css/style.css` 다음 줄에 `css/theme-sticker.css`
- `.progress` 안에 `<div id="progress-ring"></div>`
- 할 일 목록 다음에 `<section id="reward-panel" aria-label="스티커와 연속 달성"></section>`

## 6단계 — 서비스워커 & 배포 (가장 중요)

- `service-worker.js`의 `CACHE_VERSION`을 **한 단계 더 올려줘**(예: v30 → v31).
  버전을 올리지 않으면 예전 캐시가 계속 나와서 "아무것도 안 바뀐" 것처럼 보인다.
- 프리캐시 목록의 파일이 **실제로 다 존재하는지** 확인해줘.
  하나라도 404면 `cache.addAll()`이 실패하고 **새 서비스워커가 설치되지 않아서
  예전 화면이 계속 보인다.** (지금 목록에 `fonts/Yanolja-Yache-Regular.woff2`,
  `fonts/JeulgeounIyagi-Medium.woff2`, `js/stickers.js`, `js/rewards.js`,
  `css/theme-sticker.css`가 있는지, 파일이 실제로 있는지 둘 다 확인.)
- 커밋하고 푸시:
```
git add -A
git commit -m "스티커 52종 + 테마/배경/글꼴 설정 + 체크 효과"
git push
```

## 7단계 — 확인하고 알려줘

배포 후 1~2분 뒤 GitHub Pages 주소에서:
- 설정 카드에 테마 5 / 배경 3 / 글꼴 4가 보이고 누르면 즉시 바뀌는지
- 새로고침해도 유지되는지
- 스티커 고르기에 7묶음 52종이 다 나오는지
- 체크하면 누른 자리에서 조각이 터지고 스티커 도장이 찍히는지
- 전부 완료하면 축하 화면 + 스티커 1장

마지막에 이 두 가지를 꼭 알려줘:
1. 원인이 무엇이었는지 (미푸시 / 캐시 / 실제 코드 누락 중 어느 것)
2. 휴대폰에서는 홈 화면 아이콘을 지우고 다시 추가해야 새 화면이 보인다는 안내
   (PC 브라우저는 개발자도구 → Application → Service Workers → Unregister 후 새로고침)

---
