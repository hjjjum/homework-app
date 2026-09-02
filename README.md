# 우리집 할 일

두 딸이 각자 쓰는 할일 화면과, 엄마가 숙제·일정을 보내주는 화면으로 이루어진 가족용 앱입니다.

순수 자바스크립트로 만들었습니다. npm 설치도, 빌드도 필요 없습니다. Firebase SDK만 CDN에서 불러옵니다.

## 화면 구성

| 주소 | 화면 | 누가 씁니까 |
| --- | --- | --- |
| `index.html` | 시작 화면 (세 화면으로 가는 링크) | 아무나 |
| `daughter1.html` | 첫째 할 일 | 첫째 |
| `daughter2.html` | 둘째 할 일 | 둘째 |
| `mom.html` | 엄마 화면 (입력 / 현황 보기) | 엄마 |

딸 화면에서는 할 일을 추가·수정·삭제하고 체크할 수 있습니다.
엄마 화면의 "현황 보기"는 **읽기 전용**입니다. 체크와 수정은 각자 딸의 화면에서만 됩니다.

## 휴대폰 홈 화면에 추가하기

배포된 주소에서 **자기 화면을 연 다음** 아래대로 하면 앱처럼 쓸 수 있습니다.
첫째는 `daughter1.html`, 둘째는 `daughter2.html`, 엄마는 `mom.html`을 열고 추가해야
아이콘을 눌렀을 때 자기 화면이 열립니다.

**아이폰 (사파리)**
1. 사파리로 자기 화면 주소를 엽니다. (크롬이 아니라 사파리여야 합니다)
2. 아래쪽 가운데 공유 버튼(↑)을 누릅니다.
3. 메뉴를 내려서 **홈 화면에 추가**를 누릅니다.
4. 이름을 확인하고 **추가**를 누릅니다.

**안드로이드 (크롬)**
1. 크롬으로 자기 화면 주소를 엽니다.
2. 화면 아래에 뜨는 "홈 화면에 추가" 안내를 누릅니다.
   안 뜨면 오른쪽 위 점 세 개(⋮) → **홈 화면에 추가**를 누릅니다.
3. **설치**를 누릅니다.

추가하고 나면 주소창 없이 앱처럼 열리고, 인터넷이 잠깐 끊겨도 마지막으로 본 내용이 그대로 보입니다.
끊긴 동안 체크한 내용은 인터넷이 돌아오면 자동으로 저장됩니다.

## 로컬에서 실행하기

```bash
npx -y serve . -l 3000
```

그다음 브라우저에서 http://localhost:3000 을 엽니다.

> **파일을 더블클릭해서 열면 동작하지 않습니다.** 자바스크립트 모듈이 `file://`에서 차단되기 때문에
> 반드시 위처럼 로컬 서버로 띄우거나 배포된 주소로 접속해야 합니다.

## GitHub Pages로 배포하기

정적 파일뿐이라 빌드 없이 그대로 올라갑니다.

1. GitHub에 저장소를 만들고 이 폴더를 올립니다.

   ```bash
   git init
   git add .
   git commit -m "우리집 할 일 앱"
   git branch -M main
   git remote add origin https://github.com/<계정>/<저장소>.git
   git push -u origin main
   ```

2. 저장소 **Settings → Pages**로 갑니다.
3. **Source**를 `Deploy from a branch`로 두고, 브랜치는 `main`, 폴더는 `/ (root)`를 고른 뒤 저장합니다.
4. 1~2분 뒤 `https://<계정>.github.io/<저장소>/` 에서 열립니다.

주소는 이렇게 됩니다.

```
https://<계정>.github.io/<저장소>/daughter1.html
https://<계정>.github.io/<저장소>/daughter2.html
https://<계정>.github.io/<저장소>/mom.html
```

경로를 모두 상대 경로로 썼기 때문에 저장소 이름이 무엇이든 그대로 동작합니다.

### 배포 후 반드시 해야 하는 일

Firebase 콘솔 → **Authentication → Settings → 승인된 도메인**에 `<계정>.github.io`를 추가하세요.
이걸 안 하면 익명 로그인이 막힙니다.

### 파일을 고쳐서 다시 배포할 때

`service-worker.js` 맨 위의 `CACHE_VERSION`을 올려주세요 (`"v4"` → `"v5"`).
이 값이 그대로면 휴대폰이 예전에 받아둔 파일을 계속 씁니다.

## Firebase 설정

이미 `js/firebase-config.js`에 설정값이 들어 있습니다. **다른 Firebase 프로젝트로 옮길 때만** 아래가 필요합니다.

1. [Firebase 콘솔](https://console.firebase.google.com)에서 프로젝트를 만듭니다.
2. **웹 앱**을 추가하고 `firebaseConfig` 객체를 복사해 `js/firebase-config.js`에 붙여넣습니다.
3. **Firestore Database**를 만듭니다. 위치는 서울(`asia-northeast3`)을 권합니다.
   위치는 나중에 바꿀 수 없습니다.
4. **Authentication → 로그인 방법 → 익명**을 사용 설정합니다.
5. 보안 규칙을 배포합니다.

   ```bash
   npx -y firebase-tools deploy --only firestore:rules
   ```

   CLI 로그인이 번거로우면 콘솔의 **Firestore → 규칙** 탭에 `firestore.rules` 내용을 붙여넣고
   "게시"를 눌러도 됩니다.
6. `.firebaserc`의 프로젝트 ID를 새 프로젝트 것으로 바꿉니다.

### 데이터 구조

```
students/{studentId}/todos/{todoId}
```

`studentId`는 `daughter1`, `daughter2` 두 가지입니다.

| 필드 | 설명 |
| --- | --- |
| `title` | 할 일 제목 |
| `category` | `숙제` / `개인스케줄` / `공부` |
| `completed` | 완료 여부 |
| `date` | 마감일 (선택) |
| `memo` | 메모 (선택) |
| `addedBy` | `mom` (엄마가 보냄) / `self` (본인이 추가) |
| `source` | 어떤 입력 방식으로 들어왔는지 (지금은 항상 `manual`) |
| `createdAt` | 만든 시각 |

### 보안에 대해

지금 규칙은 **로그인 없이도** 위 경로에만 읽기·쓰기를 허용합니다. 가족끼리 쓰는 앱이라 이렇게 두었지만,
주소를 아는 사람은 누구나 내용을 보고 고칠 수 있다는 뜻입니다.

더 조이려면 `firestore.rules`의 각 `allow` 앞에 `request.auth != null &&`를 붙이고 다시 배포하세요.
익명 로그인이 이미 붙어 있어서 앱 코드는 고칠 필요가 없습니다.

## 폴더 구조

```
index.html              시작 화면
daughter1.html          첫째 화면
daughter2.html          둘째 화면
mom.html                엄마 화면
service-worker.js       정적 파일 캐싱 (오프라인 대응)
manifest-*.json         홈 화면에 추가할 때 쓰는 앱 정보
firestore.rules         Firestore 보안 규칙
icons/                  앱 아이콘
css/style.css           전체 스타일
js/
  firebase-config.js    Firebase 초기화 (오프라인 지속성 포함)
  db.js                 Firestore 읽기·쓰기 함수
  todo-logic.js         진행률·정렬 등 순수 계산 함수
  app.js                딸 화면 로직
  mom.js                엄마 화면 로직
  sources/              입력 방식 (지금은 "직접 입력" 하나)
```

새로운 입력 방식을 추가하려면 `js/sources/`에 파일 하나를 만들고 `sources/index.js`에 한 줄만
등록하면 됩니다. 엄마 화면의 "입력 방법" 선택에 자동으로 나타납니다.
