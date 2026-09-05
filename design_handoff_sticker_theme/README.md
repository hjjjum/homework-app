# Handoff: 숙제앱 스티커 52종 + 테마·배경·글꼴 설정

## Overview

두 딸(중1·초5)이 쓰는 할 일 화면. 1차로 스티커 톤(진행 링·스티커 판·축하 화면)이 이미 저장소에
적용되어 있고, 이 문서는 **2차 갱신**입니다.

1. **스티커 52종** — 고양이 10종(묘종별)·채소 8종을 포함, 전부 CSS 도형으로 그려 용량 0.
2. **설정** — 테마 5종 / 배경 3종 / 글꼴 4종을 아이가 직접 고름. 기기에 저장.
3. **체크할 때 터지는 조각** — 누른 자리에서 색종이·별이 사방으로.

붙이는 순서는 `PROMPT.md`에 있습니다(클로드 코드에 그대로 붙여넣는 용도).

## About the Design Files

`reference/Sticker Style Demo.dc.html`는 **디자인 레퍼런스(프로토타입)** 입니다. 그대로 배포할 코드가
아니고, 의도한 모양·움직임을 보여주는 자료입니다. `code/` 안의 세 파일은 대상 저장소 환경
(바닐라 JS + `css/style.css` 클래스 체계 + Firestore)에 맞춰 작성한 **실사용 코드**이므로 그대로 복사해 씁니다.

- `code/stickers.js` → `js/stickers.js` — 스티커 52종 + `createSticker()`
- `code/theme-sticker.css` → `css/theme-sticker.css` — 테마/배경/글꼴 + 전체 컴포넌트 스타일
- `code/rewards.js` → `js/rewards.js` — 진행 링·스티커 판·설정·고르기 시트·축하·터지는 조각
- `fonts/*.ttf` → `fonts/` — 야놀자 야체, 즐거운 이야기

## Fidelity

**High-fidelity.** 색·크기·모션 값이 확정 상태입니다. 세 파일을 그대로 쓰면 시안과 같게 나옵니다.

## Settings (아이가 고르는 것)

`<html>`의 data 속성으로 결정되고, CSS가 그 값에 반응합니다 — `rewards.js`가 붙입니다.

| 속성 | 값 | 내용 |
| --- | --- | --- |
| `data-theme` | strawberry / mint / lemon / lavender / matcha | 딸기우유·민트소다·레몬버터·라벤더밤·말차라떼 |
| `data-bg` | sky / grid / dots | 하늘(구름·반짝임) · 모눈(공책) · 물방울(파스텔 도트) |
| `data-font` | round / neat / yache / story | 동글(Jua) · 또박(고운바탕) · 야체 · 즐거운이야기 |

- 테마를 고르면 그 테마의 기본 배경으로 함께 전환됩니다(그 뒤 배경만 따로 바꿀 수 있음).
- 기본값 — `daughter1`(중1): 라벤더밤 + 물방울 + 또박 / `daughter2`(초5): 딸기우유 + 하늘 + 동글.
- 배경 그림은 span 열 몇 개를 항상 만들어 두고, 어떤 걸 보여줄지는 CSS(`[data-bg=...]`)가 정합니다.

## Stickers (52종, 7묶음)

| 묶음 | 스티커 |
| --- | --- |
| 고양이 (10) | 치즈태비·삼색이·턱시도·러시안블루·샴·페르시안·스코티시폴드·랙돌·벵갈·먼치킨 |
| 과일 (7) | 딸기·체리·레몬·수박·사과·복숭아·바나나 |
| 채소·간식 (8) | 감자·토마토·당근·옥수수·달걀후라이·브로콜리·가지·완두콩 |
| 디저트 (8) | 도넛·아이스크림·컵케이크·주스·사탕·쿠키·마카롱·푸딩 |
| 꽃·식물 (5) | 튤립·데이지·네잎클로버·선인장·버섯 |
| 하늘·마음 (7) | 반짝별·무지개·구름·달·하트·리본·풍선 |
| 사물 (7) | 연필·지우개·공책·시계·우산·머그컵·양말 |

- 한 스티커 = **부품 배열**. 부품은 `{l,t,w,h,bg,r,c,rot}`(전부 %)이고 `createSticker(id, px)`가 DOM으로 그립니다.
- 고양이는 `CATF()` 한 함수로 만들어집니다 — 동글한 귀(45° 회전한 비대칭 라운드) + 외곽선 한 겹 +
  큰 점 눈 + 반짝임 + 코 + 앞발 두 개. 묘종은 `fur / ear / inner / eye / nose / blush / marks / flatEars / fluff`만 다릅니다.
- 채소·간식은 `EYES()` / `BLUSH()` 헬퍼로 얼굴을 붙였습니다.
- 실제 일러스트 PNG로 바꾸려면 `createSticker()`가 만드는 `.sticker` 요소를 `<img>`로 교체하면 되고,
  나머지 로직(도장·판·축하)은 그대로 동작합니다.

## Interactions & Behavior

- 체크 → 누른 자리에서 조각 11개 + 파동(`burstAt(anchor)`), 진동 15ms, 스티커 도장(`stamp .45s`).
  다시 누르면 취소(추가 효과 없음).
- 세부 항목 전부 완료 → 상위 할 일도 완료(기존 로직 그대로).
- 진행률 0→100 전이 → 스티커 1장 + 연속 +1 + 축하 화면 + 진동 `[18,60,18]`.
  **같은 날 두 번은 주지 않음**(`lastClearDate`). 판이 8칸을 넘으면 새 판으로 리셋.
- 스티커 고르기: 담기/빼기 즉시 반영, 최소 1종 유지.
- `prefers-reduced-motion` 존중(터지는 효과 생략, 애니메이션 정지).
- 터치 44px 이상, 본문 15px 이상, 체크박스는 실제 `<input type="checkbox">` 유지,
  스티커는 `role="img"` + `aria-label`.

## State Management

`rewards.js`가 localStorage 키 `hw.rewards.<studentId>` 하나만 씁니다. Firestore 스키마 변경 없음.

```json
{ "picked": ["cheese","berry"], "board": ["cheese","star","tomato"],
  "streak": 6, "lastClearDate": "2026-09-05",
  "theme": "strawberry", "bg": "sky", "font": "round" }
```

## Design Tokens

테마마다 아래 변수 한 벌이 정의됩니다(`theme-sticker.css` 상단).

```
--ac  강조색       --ac2 보조색       --ac3 포인트(별·체커)
--sky --grn        --soft 완료 배경   --line2 완료 테두리   --track 링 트랙
--dash 미완료 점선 --sub 부제 글자색
--bg1/--bg2 하늘 그라데이션   --blob1/2/3 배경 원   --dotA/--dotB 물방울
--warm 따뜻한 띠   --gridline 모눈선   --stripe 하단 줄무늬
--fh 제목 글꼴     --fb 본문 글꼴
공통: --paper #FFFCF5 · --ink #2F2A33 · --ink-soft #8C8290 · --card #fff · --line #F2EBE1
radius 카드 22 / 큰 카드 28 / pill 999 / 스티커 칸 20 / 시트 28
모션 stamp .45s cubic-bezier(.3,1.5,.4,1) · rise .4s · 링 .55s · shoot .6s · shockwave .55s
```

## Assets

이미지 파일 없음 — 스티커·배경·아이콘 전부 CSS 도형. 폰트만 파일:
`fonts/Yanolja-Yache-Regular.ttf`, `fonts/JeulgeounIyagi-Medium.ttf` (woff2 변환 권장, `PROMPT.md` 2단계).
Jua·고운바탕·고운돋움은 Google Fonts CDN.

## Files

- `PROMPT.md` — 클로드 코드에 붙여넣는 작업 지시(1~7단계)
- `PATCH_burst.md` — 1차 적용본에 터지는 효과만 얹는 이전 패치(이 2차 작업에 포함되어 있으므로 참고용)
- `code/stickers.js`, `code/theme-sticker.css`, `code/rewards.js`
- `fonts/` — 야체, 즐거운이야기 TTF
- `reference/Sticker Style Demo.dc.html` — 시안(테마·배경·글꼴·스티커 전체 확인용)

수정 대상 저장소 파일: `js/stickers.js`, `js/rewards.js`, `css/theme-sticker.css`, `js/app.js`,
`js/mom.js`, `service-worker.js`, `fonts/`(신규).
