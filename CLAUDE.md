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

테스트 프레임워크·린터·빌드 스텝은 없다. 순수 함수 회귀 테스트는 Node로 바로 돌린다:

```bash
node tools/test-ocr-table.mjs  # 숙제표 캡쳐 해석 (js/ocr-table.js)
node tools/test-academy.mjs    # 학원 메시지 영역 나누기 + 보기 순서 (sources/academy-message.js, todo-logic.js)
```

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
- **js/photo.js** — 캡쳐 원본 사진. `compressPhoto`(문서 한 개에 들어갈 JPEG로 줄이기)와
  `createPhotoBlock`("원본 사진 펼치기" 단추 + 사진, 딸 화면·엄마 현황 공용). 펼칠 때만 읽고
  페이지가 기억하며, 사진을 누르면 두 배로 커져 옆으로 밀어 본다(표 글씨가 작아서).
- **js/stickers.js** — 손으로 좌표를 적어 만든 스티커 56종(8묶음)(CSS 도형, 이미지 파일 없음).
  스티커 판·완료 도장·화면 제목 아이콘이 모두 이 목록을 쓴다.
- **js/due-picker.js** — 마감일 칩 한 줄(`createDuePicker`)과 급한 일 토글(`createUrgentToggle`).
  엄마 화면·딸 화면·편집 폼이 모두 이것을 쓴다.
- **js/todo-editor.js** — 이미 저장된 할일 하나를 고치는 인라인 폼(`createTodoEditor`)과
  세부 항목 줄 편집기(`createItemsEditor` — 엄마 화면의 보낼 카드도 같은 것을 쓴다).
  줄마다 `＋`(아래에 줄 추가)·`✕`(줄 빼기)가 있고, Enter는 커서 자리에서 줄을 **둘로 나눈다**
  (OCR이 숙제 두 개를 한 줄로 붙여 읽었을 때 쓴다). 빈 줄에서 Backspace는 그 줄을 뺀다.
  `onDelete`를 넘기면 "지우기"(한 번 더 누르기) 단추가 생긴다. 폼 DOM을 만들어 두고 **재사용**해야 한다 —
  실시간 갱신마다 새로 만들면 입력하던 글자와 커서가 날아간다
  (app.js의 `state.editorEl`, mom.js의 `state.editorEl`이 그 역할).
- **js/todo-logic.js** — 두 화면이 함께 쓰는 순수 함수(`filterByCategory` / `splitByCompleted` /
  `calcProgress` / `formatDue` / `arrangeTodos`)와 `CATEGORY_KEY`.
  **보기 순서**는 `SORT_MODES`(급한 순 / 과목별) 하나로 두 화면이 같이 움직인다.
  급한 순 = 급한 일 → 마감 이른 것 → 날짜 없는 것("다음 수업까지"). 과목별은 과목마다 묶어
  머리글을 달아 돌려준다. 고른 값은 기기에 남는다(`hw.sort.<화면>`). DOM·Firestore에 의존하지 않으므로 Node에서
  그대로 테스트할 수 있다. 진행률이나 정렬 규칙을 바꿀 일이 있으면 여기 한 곳만 고치면 두 화면에
  같이 반영된다. app.js가 하위 호환을 위해 이것들을 다시 export 한다.
- **js/sources/** — "할일을 어디서 얻어오는가"를 담당하는 모듈들. 각 파일은
  `{ id, label, actionLabel, hint, parse }`를 default export 하고, `sources/index.js`의
  `INPUT_SOURCES`에 등록된다. mom.html의 "입력 방법" 토글은 이 목록을 그대로 그리므로,
  입력 방식을 추가하려면 파일 하나와 index.js의 import 한 줄이면 된다.
  `parse()`는 문자열 배열을 돌려주거나, `{title, subject, items, memo}` 객체 배열을 돌려줘도 된다
  (mom.js의 `makeDraft`가 둘 다 받는다).
  - `academy-message.js` — 학원 카톡 알림장을 읽는다. 기본 입력 방식.
    **둘째(채이) 영어학원 숙제표의 영역 6개**(Reading / Novel / IB / 단어 / Grammar / Listening)는
    `KNOWN_SECTIONS`에 이름이 박혀 있고, `canonicalSection()`이 OCR 오타까지 맞춘다
    ("18"→IB, "GRAMMER"→Grammar, "단어 (Vocabulary)"→단어). 글 안에 이 영역이 **둘 이상** 보이면
    `splitKnownSections()`가 영역마다 숙제 하나로 나눈다 — 사진으로 찍은 표처럼 칸 격자가 안 잡혀
    글로만 읽힌 경우에도 6개로 나뉘게 하려는 것이다. 영역 안에서는 `[교재명]`과 `※ * •` 안내를
    참고로 빼고, "(제출 9/15)"는 마감일이 된다.
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

  **표(칸이 나뉜 숙제표)는 픽셀로 칸 격자를 찾아 칸마다 따로 읽는다** (`readTable`).
  통째로 읽으면 칸 경계가 사라져 여러 숙제가 한 덩어리가 되고, 예전의 "글자 좌표로 열 짐작"
  방식은 가운데 정렬된 표·수업이 가로로 놓인 표에서 칸이 뒤섞였다. 순서는:
  `detectGrid`(가로·세로 선 → 칸) → 칸마다 `stretchContrast` + 글자 높이 맞춤 후 인식 →
  줄마다 `lineIsColored` → `interpretTable`(순수 함수). 표가 아니면(격자 없음) 통째로 읽는다.
  칸 격자와 해석은 **js/ocr-table.js**에 있고 DOM·Tesseract 없이 Node에서 테스트된다:
  `node tools/test-ocr-table.mjs` (실제 숙제표 3종의 칸별 OCR 결과를 옮겨 적은 회귀 테스트).

  실제로 받는 표는 두 모양이다. **새 학원 표가 안 맞으면 그 표를 테스트에 추가하고 ocr-table.js를 고친다.**
    - 가로형(둘째 학원): `영역 | [교재] 번호 항목 + 색글씨 안내 | 제출 날짜`, 한 행 = 숙제 하나
    - 세로형(첫째 학원 정규/내신): 맨 왼쪽 열이 `구분/진도/과제`. **"과제" 행만** 숙제이고
      열 머리글이 제목("1교시", "암기테스트", "김은지 선생님 수업"). 과제 칸이 빈 열(2교시)은 빠진다.
  칸 안의 줄 역할(`parseCell`): `[ ]`로 싼 줄 = 교재명(참고로 감), `** ※ •`로 시작 = 참고,
  **검은 글씨가 있는 칸의 색글씨 = 참고**(학원이 안내문을 분홍·갈색으로 적는다. 단 칸 전체가
  색글씨면 그게 숙제 — 빨간 "문장듣기시험"). 번호 목록에서 번호 없는 줄은 앞 줄이 칸 끝까지 찼거나
  `(`·소문자로 시작하거나 앞 줄이 `, +`로 끝날 때만 이어 붙인다(아니면 참고). 번호가 아예 없으면(IB)
  앞 줄이 칸 끝까지 찼을 때만 이어 붙인다.
  제출일 칸이 가려져 못 읽으면(카톡 버튼) 표에서 가장 많이 나온 날짜로 채우고 `dateGuessed`로
  표시한다 — 엄마 화면 상태줄이 그걸 알려준다.

  아래는 실제로 겪은 문제라 건드릴 때 조심할 것:
    - 세로선은 **표 전체 높이를 가로질러야** 열 경계다. 머리글 칸 안의 칸막이("1교시 | 박은아R")까지
      열로 잡으면 머리글이 쪼개진다. 칸 안에 남은 칸막이는 `eraseRules`가 지운다.
    - 캡쳐 가장자리의 검은 띠도 경계로 써야 한다 (표 아래 테두리가 띠에 붙어 있으면 따로 안 잡힌다).
      다만 이미지의 30%를 넘게 덮는 어두운 면은 배경(카톡 대화방)이라 버린다.
    - 글자가 하나도 없는 행·열은 버린다 (왼쪽 테두리 바깥 틈이 "첫 열"로 잡힌 적 있다).
    - 대비는 **칸마다** 준다. 연분홍 안내문(밝기 200)은 밝기만 보면 흰 바탕에 묻혀 통째로 안 읽혀서,
      바탕보다 어두운 색글씨는 진하게 칠한다. 색글씨 판정은 채도가 아니라 "바탕색 명암선에서
      벗어난 정도"로 한다 — 노란 칸의 검은 글씨는 가장자리가 누렇게 섞여 채도로는 색글씨로 잡힌다.
    - 칸마다 글자 줄 높이를 50px로 맞춘다(`TARGET_LINE_HEIGHT`, 40·50·60 비교해서 정함).
      짧은 날짜("9/17")는 여러 줄 모드에서 자주 놓쳐서, 못 읽은 날짜 칸만 한 줄·숫자 전용으로 다시 읽는다.

  표가 인식되면 글로 바꾸지 않고 **구조 그대로** 카드/할일을 만든다.
  글로 바꿨다가 다시 파싱하면 칸 경계가 또 뭉개진다.
- **js/mom.js** — 엄마 화면. 입력 탭과 현황 보기 탭 두 개. 현황 탭은 두 아이를 한 화면에
  세로로 놓는다.
  **현황 탭에는 체크박스를 만들지 않는다** — 엄마가 딸 대신 완료 처리를 해버리기 때문이다.
  완료 여부만 못 건드릴 뿐, 이미 보낸 숙제의 **내용은 고칠 수 있고 지울 수도 있다**
  (잘못 보낸 숙제를 아이에게 부탁하지 않고 바로 치우기 위한 것. 지우기는 되돌릴 수 없으므로
  "한 번 더 누르기"로 확인받는다 — `confirm()` 창은 쓰지 않는다)
  (잘못 읽힌 학원 숙제 때문에 지웠다 다시 보내게 하지 않으려는 것. `saveWatchEdit`이
  completed를 patch에 넣지 않는 것이 핵심이다).
  항목을 누르면 세부 내용이 펼쳐지고, 행 오른쪽 ✎로 바로 고친다.
  **완료한 항목도 목록에 넣는다** — 빼면 엄마가 그 숙제 내용을 고칠 방법이 없어진다
  ("더 보기"를 누르면 나온다).
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
- `students/{studentId}/meta/` 에는 할일이 아닌 두 가지가 있다:
`cheer`(엄마의 응원 한마디, 오늘 하루만 뜬다)와 `profile`(`{name, icon}` — 화면 제목과
엄마 현황의 카드 이름). **이름은 기기가 아니라 Firestore에 둔다** — 딸 화면과 엄마 화면에
서로 다른 이름이 보이면 헷갈리기 때문이다. 기본값은 db.js의 `DEFAULT_PROFILE`
(첫째=채원이/달, 둘째=채이/치즈태비)이고, 딸 화면 제목을 눌러 바꾼다.
`icon`은 stickers.js의 id라서, 스티커가 늘어도 규칙을 다시 배포할 필요가 없다.

- `students/{studentId}/images/{imageId}` — 캡쳐로 숙제를 만들 때 남기는 **원본 사진**
(`{data: "data:image/jpeg;base64,…", createdAt}`). Storage는 요금제를 올려야 해서 Firestore
문서에 넣는다. 문서 한도(1MB)에 들도록 `js/photo.js`의 `compressPhoto`가 긴 변 1800px·JPEG로
줄인다(실측: 586KB 캡쳐 → 229KB, 75ms). **할일 목록 구독에는 끼지 않는다** — 화면에서
"원본 사진 펼치기"를 누를 때만 한 번 읽고 그 페이지가 기억한다. 한 캡쳐에서 숙제 여러 개가
나오므로 여러 할일이 같은 사진을 가리키고, 할일을 지울 때 그 사진을 쓰는 할일이 하나도
안 남으면 사진도 지운다(db.js의 `releaseImage`). 사진 저장이 막히거나 실패해도
**숙제는 사진 없이 저장된다** — 규칙을 배포하기 전에도 보내기가 막히지 않게 하려는 것이다.

`students/{studentId}` 문서 자체에는 아무것도 쓰지 않는다 (규칙에서도 `allow write: if false`).
  콘솔에서 이 문서가 기울임체로 보이는 건 정상이다.
- todo 필드: `title`(string), `category`(`"숙제"|"개인스케줄"|"공부"`), `completed`(bool),
  `date`(string, 선택), `memo`(string, 선택), `addedBy`(`"mom"|"self"`),
  `source`(string, 어떤 입력 방식으로 들어왔는지 — `"academy"|"manual"|"whole"`),
  `subject`(`"수학"|"영어"|"과학"|"국어"|"사회"|"기타"`),
  `items`(list of `{text, done}`, 최대 50개 — 학원 숙제의 세부 항목),
  `urgent`(bool — 급한 일. 목록에서 맨 위로 올라간다),
  `imageId`(string, 선택 — 캡쳐로 만든 숙제의 원본 사진. 사진이 없으면 **필드 자체를 넣지 않는다**),
  `createdAt` / `updatedAt`(serverTimestamp)

**`date`가 비어 있는 것은 "정하지 않음"이 아니라 "다음 수업까지"라는 뜻이다.** 학원 숙제는
대부분 그래서 기본값으로 뒀다. 화면에 붙일 문구는 `todo-logic.js`의 `dueLabel()`이 정한다
(숙제만 "다음 수업까지"가 붙고, 개인스케줄·공부는 날짜가 없으면 뱃지도 없다).
날짜를 고르는 UI는 칩(다음 수업까지/오늘/내일/모레) + 달력이고, 표 캡쳐에 날짜가 적혀 있으면
`parseDueDate()`가 읽어 미리 채운다.

**카테고리와 과목은 다른 축이다.** 카테고리는 "숙제/개인스케줄/공부"처럼 할 일의 종류이고,
과목은 "수학/영어..."다. 학원 숙제는 보통 category=숙제 + subject=수학 조합이 된다.

`items`가 있으면 진행률을 **항목 단위**로 센다(`todo-logic.js`의 `countTodo`). 학원 숙제 1건에
세부 항목이 4개면 4개로 세야 체감과 맞는다. 항목이 전부 done이면 그 숙제의 `completed`도
자동으로 true가 된다 (app.js의 `handleToggleItem`).

**필드를 추가/변경할 때는 세 곳을 함께 고쳐야 한다.** 하나라도 빠지면 쓰기가 403으로 조용히 실패한다:

1. `js/db.js`의 `normalizeTodo()` (기본값·검증)
2. `js/db.js`의 `updateTodo()` 안 `allowed` 배열 (허용 필드 화이트리스트)
3. `firestore.rules`의 `isValidTodo()` — `hasOnly([...])`가 필드 화이트리스트라 새 필드는 여기 없으면 거부된다

(만든 뒤에 고칠 일이 없는 필드는 2번에 넣지 않는다. `imageId`가 그렇다 — 원본 사진은
숙제를 만들 때 한 번 붙고, 고치기로는 바뀌지 않는다.)

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

## 카톡 등에서 "공유"로 받기 (엄마 화면)

`manifest-mom.json`의 `share_target` 덕분에 안드로이드에서 카톡 공유 목록에 "엄마 화면"이 뜬다.
공유는 **POST**로 들어오는데 정적 호스팅은 POST를 받을 수 없어서, `service-worker.js`가 가로채
formData를 풀어 `homework-share` 캐시에 넣고 303으로 화면을 연다. mom.js의 `consumeShared()`가
그걸 꺼내 글이면 입력칸에, 사진이면 곧장 `readImage()`로 넘기고 보관함을 비운다.

- **주소의 `?share=ready` 표시에 기대지 않는다** — 서버에 따라 리다이렉트에서 물음표 뒤가 떨어진다
  (로컬 `serve`가 그렇다). 보관함에 든 게 있으면 처리하고 비우므로 한 번만 처리된다.
- 공유받기는 **크롬으로 설치한 PWA에서만** 된다. 딸들이 쓰는 apk(TWA)는 그 안에 인텐트가 박혀 있어
  apk를 다시 만들어야 한다. 엄마 화면은 "홈 화면에 추가"로 설치되어 있어야 목록에 뜬다.
- POST 처리는 서비스워커 `fetch` 핸들러에서 **`request.method !== "GET"` 조기 반환보다 먼저** 와야 한다.

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
