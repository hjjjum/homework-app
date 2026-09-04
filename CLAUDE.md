# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

두 딸(daughter1, daughter2)이 각자 쓰는 할일 화면과, 엄마가 숙제/일정을 넣어주는 입력 화면으로 이루어진 가족용 할일 관리 앱.

**바닐라 JS 전용 — npm 의존성도, 빌드 도구도, 프레임워크도 쓰지 않는다.** Firebase SDK는 CDN에서 ES 모듈로 직접 import한다. 이 제약은 사용자가 명시한 것이므로 번들러나 프레임워크 도입을 제안하지 말 것.

## 개발 명령

```bash
npx -y serve . -l 3000        # 로컬 서버 (필수 — 아래 참고)
```

`file://`로 열면 동작하지 않는다. ES 모듈이 CORS로 차단되기 때문에 반드시 http로 서빙해야 한다.
접속: `http://localhost:3000/daughter1.html`, `daughter2.html`, `mom.html`

테스트 프레임워크·린터·빌드 스텝은 없다.

### Firestore 규칙 배포

`firestore.rules`를 고쳤으면 반드시 배포해야 실제로 적용된다. 편집만으로는 아무 효과가 없다.

```bash
npx -y firebase-tools deploy --only firestore:rules
```

firebase CLI 로그인이 인터랙티브라 에이전트가 직접 못 하는 경우, Firebase 콘솔 →
Firestore → 규칙 탭에 파일 내용을 붙여넣고 "게시"해도 동일하다.

### 데이터 확인 / 규칙 검증

브라우저 없이 Firestore REST API로 읽기·쓰기·규칙 거부를 확인할 수 있다. 규칙을 고친 뒤
의도대로 막히는지 검증할 때 유용하다 (인증 없이 apiKey만으로 호출 = 익명 미로그인 상태와 동일).

```bash
node -e 'fetch("https://firestore.googleapis.com/v1/projects/homework-assistant-fcc6c/databases/(default)/documents/students/daughter1/todos?key=<apiKey>").then(r=>r.json()).then(j=>console.log(JSON.stringify(j,null,2)))'
```

규칙에 막히면 403이 돌아온다.

## 아키텍처

의존 방향은 단방향이다:

```
daughter*.html  →  js/app.js  ┐
mom.html        →  js/mom.js  ┤→  js/db.js  →  js/firebase-config.js  →  CDN (gstatic firebasejs 12.0.0)
                              └→  js/todo-logic.js (순수 함수)
                              └→  js/sources/*.js  (입력 파싱)
```

- **js/firebase-config.js** — 앱/Firestore/Auth 인스턴스를 만들어 export하는 유일한 지점.
  Firestore는 `initializeFirestore` + `persistentLocalCache(persistentMultipleTabManager())`로
  오프라인 지속성을 켠 상태로 생성된다. `getFirestore()`를 따로 호출하면 이 설정이 무시되므로
  절대 쓰지 말고 여기서 export한 `db`를 import할 것. (구 API `enableIndexedDbPersistence()`도 쓰지 않는다.)
  익명 로그인은 붙어 있지만 실패해도 앱이 죽지 않도록 `authReady` Promise가 항상 resolve된다.
- **js/db.js** — Firestore에 접근하는 유일한 계층. HTML에서 Firestore SDK를 직접 import하지 말고
  반드시 이 모듈의 함수를 쓴다. `addTodo` / `updateTodo` / `deleteTodo` / `deleteCompletedTodos` /
  `listenTodos`(구독 해제 함수를 반환).
- **js/app.js** — daughter1/daughter2 화면의 공용 로직. 두 HTML은 `initApp(studentId)`에 넘기는
  값만 다르고 나머지는 완전히 같다. **화면별로 코드를 갈라놓지 말 것** — 분기가 필요하면 studentId를
  인자로 받는 방식으로 처리한다.
  순수 로직은 todo-logic.js와 sources/로 빠져 있다. 로직을 고칠 때는 `initApp` 안쪽이 아니라
  그 모듈들에 넣는 편이 검증하기 쉽다.
  `alert()` / `confirm()` / `prompt()`는 쓰지 않는다 — 브라우저 모달이 자동화 세션을 멈추게 하므로,
  삭제 확인은 "한 번 더 누르기", 항목 수정은 인라인 폼으로 처리한다.
- **js/todo-logic.js** — 두 화면이 함께 쓰는 순수 함수(`filterByCategory` / `splitByCompleted` /
  `calcProgress` / `formatDue`)와 `CATEGORY_KEY`. DOM·Firestore에 의존하지 않으므로 Node에서
  그대로 테스트할 수 있다. 진행률이나 정렬 규칙을 바꿀 일이 있으면 여기 한 곳만 고치면 두 화면에
  같이 반영된다. app.js가 하위 호환을 위해 이것들을 다시 export 한다.
- **js/sources/** — "할일을 어디서 얻어오는가"를 담당하는 모듈들. 각 파일은
  `{ id, label, actionLabel, hint, parse }`를 default export 하고, `sources/index.js`의
  `INPUT_SOURCES`에 등록된다. mom.html의 "입력 방법" 토글은 이 목록을 그대로 그리므로,
  입력 방식을 추가하려면 파일 하나와 index.js의 import 한 줄이면 된다.
  `parse()`는 문자열 배열을 돌려주거나, `{title, subject, items, memo}` 객체 배열을 돌려줘도 된다
  (mom.js의 `makeDraft`가 둘 다 받는다).
  - `academy-message.js` — 학원 카톡 알림장을 읽는다. 기본 입력 방식.
    머리말 → 과제 시작 표시(`△ 과제`, `#숙제범위`, `과제 안내`, `Homework`) → 번호 항목
    (`①②` `1️⃣2️⃣` `1.` `1)` `-`, 그리고 `READING`/`NOVEL` 같은 영역 헤더) → 맺음말 구조를 인식하고,
    내용 속 단어로 과목을 추측한다(`SUBJECT_KEYWORDS`). 번호 없는 줄은 앞 항목의 설명으로 붙인다.
    실제 학원 7곳 메시지로 검증했다. **새 학원 형태가 안 맞으면 START_MARKERS / ITEM_PATTERNS /
    SUBJECT_KEYWORDS 에 패턴을 추가하는 것으로 대응한다.**
  - `manual-input.js` — 줄마다 하나씩 나눈다.
  - `whole-message.js` — 줄바꿈을 살려 통째로 하나로 담는다.
- **js/ocr.js** — 캡쳐 이미지에서 글자를 읽는다(Tesseract.js, CDN에서 처음 쓸 때만 지연 로딩).
  넘기기 전에 2배 확대 + 회색조/대비를 준다. 이 전처리가 인식률과 속도를 크게 좌우하므로 빼지 말 것
  (실측: 카톡 캡쳐 18.5초 → 7.6초, 내용 정확도도 눈에 띄게 개선).
  엄마 화면과 딸 화면이 같은 모듈을 쓴다. 모델이 약 15MB라 **오프라인에서는 OCR만 동작하지 않는다.**
  표 캡쳐는 신뢰도 87~91%로 잘 읽지만, 카톡 캡쳐는 번호(①②)가 자주 깨진다 —
  카톡은 원문 복사가 되므로 그쪽을 안내하는 편이 낫다.

  **표(칸이 나뉜 숙제표)는 글자 좌표로 칸을 되살린다** (`reconstructTable`).
  그냥 읽으면 칸 경계가 사라져 여러 숙제가 한 덩어리가 되기 때문이다. 순서는:
  줄 시작 x좌표로 열 찾기 → 가로 구분선으로 행 나누기 → 첫 열(과목 이름)은
  Tesseract가 통째로 건너뛰므로 픽셀로 위치를 찾아 그 칸만 따로 읽기.
  아래 세 가지는 실제로 겪은 버그라 건드릴 때 조심할 것:
    - 날짜 열의 시작은 그 열에서 **가장 왼쪽** 글자다 (가장 오른쪽을 쓰면 날짜가 본문에 섞인다)
    - 세로 테두리선이 매 줄 어둡게 잡히므로 잉크 판정 문턱을 넉넉히 둬야 한다
    - 구역은 라벨 위치가 아니라 **가로 구분선**으로 나눠야 한다 (라벨은 칸 가운데 있다)

  표가 인식되면 글로 바꾸지 않고 **구조 그대로** 카드/할일을 만든다.
  글로 바꿨다가 다시 파싱하면 칸 경계가 또 뭉개진다.
- **js/mom.js** — 엄마 화면. 입력 탭(쓰기 전용)과 현황 보기 탭(읽기 전용) 두 개.
  **현황 탭은 의도적으로 읽기 전용이다** — 목록에 input/textarea/select를 만들지 않는다.
  세부 내용을 펼치는 버튼은 있지만 보기 상태만 바꿀 뿐 데이터는 건드리지 않는다.
  편의를 위해서라도 여기에 체크박스나 수정 칸을 추가하지 말 것
  (엄마가 딸 대신 완료 처리를 해버리게 된다).
  펼침 상태는 `state.expandedIds`에 기억해 둔다 — 실시간 갱신이 올 때마다 다시 그리기 때문에
  기억하지 않으면 보던 항목이 저절로 접힌다.
  현황 탭을 처음 열 때만 `listenTodos`를 구독하고, 보는 딸이 바뀌면 이전 구독을 끊고 새로 건다.

## ⚠️ 데이터를 지우지 말 것

`students/{studentId}/todos` 에는 **딸들이 실제로 쓰는 숙제**가 들어 있다.
사용자 확인 없이 지우지 않는다. 백업도 휴지통도 없어서 한 번 지우면 끝이다.

검증이 필요하면:
- 제목에 `[테스트]` 표식을 붙여 새로 만들고, **방금 만든 그 문서만** id로 지정해 지운다.
  컬렉션을 통째로 순회하며 지우는 코드는 쓰지 않는다.
- 되도록 쓰기 없이 확인한다 (순수 함수 테스트, 브라우저에서 파싱 결과만 보기).
- 전체 정리가 꼭 필요하면 지울 목록을 먼저 보여주고 확인을 받는다.

보안 규칙을 배포할 때도 주의한다. 콘솔 편집기가 비어 있는 상태로 "게시"하면
모든 접근이 막힌다. 게시 전에 규칙 내용이 온전한지 반드시 눈으로 확인할 것.

## 데이터 모델과 불변 조건

컬렉션 경로: `students/{studentId}/todos/{todoId}`

- `studentId`는 `"daughter1"` / `"daughter2"` 두 개뿐이다.
- `students/{studentId}` 문서 자체에는 아무것도 쓰지 않는다 (규칙에서도 `allow write: if false`).
  콘솔에서 이 문서가 기울임체로 보이는 건 정상이다.
- todo 필드: `title`(string), `category`(`"숙제"|"개인스케줄"|"공부"`), `completed`(bool),
  `date`(string, 선택), `memo`(string, 선택), `addedBy`(`"mom"|"self"`),
  `source`(string, 어떤 입력 방식으로 들어왔는지 — `"academy"|"manual"|"whole"`),
  `subject`(`"수학"|"영어"|"과학"|"국어"|"사회"|"기타"`),
  `items`(list of `{text, done}`, 최대 50개 — 학원 숙제의 세부 항목),
  `createdAt`(serverTimestamp)

**카테고리와 과목은 다른 축이다.** 카테고리는 "숙제/개인스케줄/공부"처럼 할 일의 종류이고,
과목은 "수학/영어..."다. 학원 숙제는 보통 category=숙제 + subject=수학 조합이 된다.

`items`가 있으면 진행률을 **항목 단위**로 센다(`todo-logic.js`의 `countTodo`). 학원 숙제 1건에
세부 항목이 4개면 4개로 세야 체감과 맞는다. 항목이 전부 done이면 그 숙제의 `completed`도
자동으로 true가 된다 (app.js의 `handleToggleItem`).

**필드를 추가/변경할 때는 세 곳을 함께 고쳐야 한다.** 하나라도 빠지면 쓰기가 403으로 조용히 실패한다:

1. `js/db.js`의 `normalizeTodo()` (기본값·검증)
2. `js/db.js`의 `updateTodo()` 안 `allowed` 배열 (허용 필드 화이트리스트)
3. `firestore.rules`의 `isValidTodo()` — `hasOnly([...])`가 필드 화이트리스트라 새 필드는 여기 없으면 거부된다

`listenTodos`는 `d.data({ serverTimestamps: "estimate" })`로 읽는다. 오프라인에서 방금 추가한 항목의
`createdAt`이 `null`이 되어 정렬이 깨지는 걸 막기 위한 것이므로 그냥 `d.data()`로 바꾸지 말 것.

## 색 팔레트

`css/style.css` 맨 위 `:root`에 원색 5개(`--heather` `--viridian` `--sandstone` `--candy` `--azur`)를
모아 두었고, 나머지 토큰은 여기서 파생된다. 색을 바꿀 일이 있으면 원색만 고친다.
`--cat-*`(카테고리) / `--sub-*`(과목) 토큰이 각 뱃지 색의 유일한 출처다.
## 앱 아이콘

`icons/*.png`는 손으로 그린 게 아니라 `tools/make-icons.mjs`가 만든다.

```bash
node tools/make-icons.mjs      # icons/{daughter1,daughter2,mom}-{180,192,512}.png
```

외부 라이브러리 없이 Node의 zlib만으로 PNG를 쓰고, 도형은 4배로 그린 뒤 줄여 가장자리를
부드럽게 만든다. 색은 `css/theme-sticker.css`와 같은 값을 스크립트 위 `C`에 적어 두었으므로
테마 색을 바꾸면 여기도 같이 고치고 다시 돌린다.

- 세 화면이 각자 다른 아이콘을 쓴다(첫째=별, 둘째=체리, 엄마=하트). **하나로 합치지 말 것** —
  홈 화면에 세 개가 나란히 있어서 색과 그림이 다르지 않으면 구분이 안 된다.
- 안드로이드는 아이콘 가장자리를 잘라내므로(`purpose: any maskable`), 중요한 그림은
  한가운데 원(반지름 0.4) 안에 둔다. 배경은 끝까지 채운다.
- 아이콘을 바꾸면 매니페스트 3개의 `theme_color`와 각 HTML의 `<meta name="theme-color">`도
  같은 색으로 맞춘다 (상태 표시줄과 아이콘이 이어져 보인다).

## PWA / 서비스워커

정적 파일은 `service-worker.js`가 캐싱한다. **Firestore 요청에는 절대 끼어들지 않는다** —
SDK가 IndexedDB로 자체 오프라인 처리를 하고 있어서 서비스워커가 가로채면 동기화가 깨진다.
`fetch` 핸들러의 origin 검사를 지우지 말 것.

**파일을 고쳤으면 `CACHE_VERSION`을 올려야 한다.** 안 그러면 사용자 기기가 옛 파일을 계속 쓴다.

캐시에 넣기 전 `withoutRedirect()`를 거치는 이유: 리다이렉트를 거친 응답은 화면 이동(navigate)
요청에 쓸 수 없어서, 그대로 캐시하면 오프라인에서 흰 화면이 된다. 로컬 개발 서버(`serve`)가
`/a.html` → `/a`로 보내기 때문에 실제로 겪는 문제다. 같은 이유로 `matchNavigation()`이
확장자 없는 경로도 찾아본다.

manifest는 화면마다 따로 있다(`manifest-daughter1/2`, `manifest-mom`). `start_url`과 이름이
달라야 홈 화면 아이콘이 각자 자기 화면을 열기 때문이므로 하나로 합치지 말 것.

## Firebase 프로젝트

- 프로젝트 ID: `homework-assistant-fcc6c` (`.firebaserc`에 default로 지정됨)
- Firestore 리전: `asia-northeast3` (서울) — 변경 불가
- 익명 인증 활성화됨

현재 보안 규칙은 **로그인 없이도** 위 경로에만 읽기/쓰기를 허용한다. 경로를 아는 사람은 누구나 접근
가능하다는 뜻이므로, 공개 URL에 배포하게 되면 각 `allow` 앞에 `request.auth != null &&`를 붙인다
(익명 로그인이 이미 붙어 있어 클라이언트 코드는 수정할 필요 없다).
