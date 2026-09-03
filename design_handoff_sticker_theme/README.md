# Handoff: 숙제앱 스티커 톤 UI + 성취 연출

## Overview

두 딸(중1·초5)이 쓰는 할 일 화면을 "아이들이 예쁘다고 느끼고, 하나 끝낼 때마다 성취감을 느끼는"
UI로 바꾸는 작업입니다. 대상 저장소는 `hjjjum/homework-app` (순수 JS + Firestore, 빌드 없음, GitHub Pages).

핵심은 네 가지입니다.

1. **체크가 곧 보상** — 완료하면 그 자리에 스티커가 도장처럼 찍히고 짧게 진동합니다.
2. **눈에 보이는 저장고** — 하루를 완주하면 스티커 판(8칸)이 한 칸 찹니다. 다 채우면 실물 보상과 연결.
3. **연속 달성** — 완주한 날마다 "n일 연속" 배지가 올라갑니다.
4. **스티커 24종 골라 담기** — 아이가 직접 고른 스티커만 쓰입니다(애착이 동기).

## About the Design Files

이 폴더의 `.dc.html` 파일은 **HTML로 만든 디자인 레퍼런스(프로토타입)** 입니다. 그대로 배포할 코드가
아니고, 의도한 모양·움직임을 보여주는 자료입니다. 실제 구현은 대상 저장소의 기존 환경
(바닐라 JS + `css/style.css` 클래스 체계 + Firestore)에 맞춰 재현하면 됩니다.

단, `code/` 안의 세 파일은 **그 저장소 환경에 맞춰 이미 작성한 실사용 코드**이므로 그대로 복사해 쓰면 됩니다.

- `code/theme-sticker.css` — 테마 전체(기존 클래스 이름을 덮어씀). `css/style.css` 다음에 로드.
- `code/stickers.js` — 스티커 24종 정의 + `createSticker(id, size, rotate)`.
- `code/rewards.js` — 진행 링·연속 달성·스티커 판·고르기 시트·축하 화면. localStorage만 사용.

붙이는 순서는 `PROMPT.md`에 그대로 있습니다(클로드 코드에 붙여넣는 용도).

## Fidelity

**High-fidelity.** 색·크기·모션 값이 모두 확정된 상태입니다. 위 세 파일을 그대로 쓰면 시안과 동일하게
나옵니다. 새로 만들 부분(엄마 화면 2단계)만 아래 스펙을 따라 구현하면 됩니다.

## Screens / Views

### 1. 아이 화면 — `daughter1.html` / `daughter2.html`

목적: 오늘 할 일을 확인하고 체크하며, 성취를 눈으로 확인.

레이아웃(위→아래), 폭은 `max-width:460px` 중앙 정렬, 좌우 여백 18px:

| 순서 | 요소 | 스펙 |
| --- | --- | --- |
| 배경 | `.bg-art` (fixed, z-index 0) | 상단 300px 하늘 그라데이션(#BFE7F6→#DCF1F8→종이색), 구름 2개, 반짝임 3개, 블롭 2개, 하단 66px 핑크 스트라이프 |
| 헤더 | `.app-header h1` | Jua 29px, 색 `--coral`, letter-spacing -.5px |
| 진행 | `.progress` 카드 | 흰 카드 radius 28, padding 20, shadow `0 6px 20px rgba(47,42,51,.1)`. 좌: 진행 링 104px(트랙 #FFE4D9, 채움 `--coral`, 두께 13, 라운드 캡, transition .55s `cubic-bezier(.3,1.5,.4,1)`), 링 안 퍼센트 Jua 26px + `n/m` 11.5px. 우: `n/m 완료` Jua 17px + 퍼센트 12.5px |
| 연속 | `.streak` | 코랄 pill, 노란 4각별 12px + "n일 연속" Jua 15px, shadow `0 4px 10px rgba(255,91,62,.3)` |
| 필터 | `.filters .tab` | pill, 2px 테두리 `--line`, 선택 시 코랄 배경/흰 글씨, min-height 44px |
| 구분선 | `.todo-list::before` | 높이 14px 핑크 체커보드(`repeating-conic-gradient` 14px 타일), 좌우 여백 밖으로 -18px |
| 목록 | `.todo` | 흰 카드, 2px `--line`, radius 22, padding 14/15, gap 10. 완료 시 배경 #FFF6F2 / 테두리 #FFD3C6 |
| 체크 | `.check` 44px | 미완료: 30px 점선 원(#E3B9C9). 완료: 34px 스티커가 `stamp .45s` 로 등장(CSS `:checked` 로 전환, JS 분기 없음) |
| 본문 | `.todo-title` 15.5px / `.todo-meta` | 완료 시 #B3A9AF + 취소선. 메타: 카테고리 배지(원/삼각/사각 도형 + 색), 마감 pill(오늘·내일·지났어요 톤), "엄마가 보냄", 세부항목 `n/m` |
| 세부항목 | `.subitems` | 좌 44px 들여쓰기, 20px 라운드 체크, 13.5px 텍스트 |
| 보상 | `#reward-panel` | 스티커 판 카드: 4열 8칸, 빈 칸 점선 #EFE7DB, 채운 칸 스티커 46px에 -9°~+9° 기울기. 아래 "스티커 고르기(n종)" 버튼 |
| 고르기 | `.sheet` | 하단 시트, 4열 그리드 24종, 담긴 것은 코랄 테두리 + ✓ 배지, 안 담긴 것도 opacity .92로 선명하게 |
| 축하 | `.celebrate` | 반투명 배경 + blur, 흰 카드 radius 34, 스티커 104px `stamp .5s`, "오늘 할 일 끝!" Jua 27px, 색종이 28개 낙하 |

테마: `body[data-theme="candy"]`(초5 기본) / `body[data-theme="calm"]`(중1 기본, 코랄→#5B8DEF 계열).
아이별 기본값은 `rewards.js`가 studentId로 정합니다.

### 2. 엄마 화면 — `mom.html` (2단계, 새로 구현)

- **현황 보기**: 딸 전환 탭 대신 두 아이 카드를 세로로 나란히. 각 카드에 진행률 바(`.kid-bar`),
  `n/m 완료`, 연속 일수, 남은 항목 3개, 마지막 체크 시각. **읽기 전용 유지.**
- **응원 한마디**: 칩을 누르면 Firestore `students/{studentId}/meta/cheer` 에 `{ text, at }` 저장.
  아이 화면이 이 문서를 구독해 헤더 아래 `.cheer` 배너로 표시(오늘 것만).
- **입력 탭**은 지금 구조(붙여넣기 → 항목 나누기 → 보내기, OCR 포함) 유지.

## Interactions & Behavior

- 체크 → `stamp` 애니메이션(.45s, `cubic-bezier(.3,1.5,.4,1)`), 진동 15ms. 다시 누르면 취소(스티커 사라짐).
- 세부 항목 전부 완료 → 상위 할 일도 완료(기존 `handleToggleItem` 로직 그대로).
- 진행률 100% 도달(0→100 전이) → 스티커 1장 지급 + 연속 +1 + 축하 화면 + 진동 `[18,60,18]`.
  **같은 날 두 번은 주지 않음**(`lastClearDate`로 하루 1회 제한). 판이 8칸을 넘으면 새 판으로 리셋.
- 스티커 고르기: 담기/빼기 즉시 반영, 최소 1종은 남김.
- `prefers-reduced-motion` 존중(모든 애니메이션 사실상 정지).
- 접근성: 터치 44px 이상, 본문 15px 이상, 체크박스는 실제 `<input type="checkbox">` 유지, 스티커는
  `role="img"` + `aria-label`.

## State Management

`rewards.js`가 localStorage 키 `hw.rewards.<studentId>` 하나만 씁니다. Firestore 스키마 변경 없음.

```json
{ "picked": ["berry","star"], "board": ["berry","star","cherry"],
  "streak": 6, "lastClearDate": "2026-09-04", "theme": "candy" }
```

- `picked` 담은 스티커 id / `board` 채워진 칸 / `streak` 연속 일수 / `lastClearDate` 마지막 완주일 / `theme` 테마
- 2단계 응원 메시지만 Firestore 문서(`students/{id}/meta/cheer`)를 새로 씁니다.

## Design Tokens

```
--paper #FFFCF5   --ink #2F2A33    --ink-soft #8C8290   --card #FFFFFF   --line #F2EBE1
--coral #FF5B3E   --pink #FF7FAE   --yellow #FFC93C     --sky #8FD9EE    --green #3FA86B   --lilac #B9A7F0
calm 테마: --coral #5B8DEF, --pink #9BB4F5, --sky #A8DCF0, --ink #29303D, --paper #FBFBF8
카테고리: 숙제 #FFEDF3/#C24C77(원) · 개인스케줄 #FFF0E6/#C25A2E(삼각) · 공부 #EAF7FC/#2E7FA0(사각)
마감: 오늘 #FFF6E2/#A87A1E · 내일 #EAF7FC/#2E7FA0 · 지남 #FDE9E6/#B4503F
radius: 카드 22 · 큰 카드 28 · pill 999 · 스티커 칸 20 · 시트 28
간격: 카드 사이 10~12, 카드 내부 padding 14~20, 좌우 여백 18
타입: 제목 Jua 400 (16/17/19/26/27/29), 본문 Gowun Dodum (11~15.5), 최소 11px(메타)·본문 15px 이상
그림자: 카드 0 6px 20px rgba(47,42,51,.1) / 축하 0 20px 50px rgba(0,0,0,.25)
모션: stamp .45s cubic-bezier(.3,1.5,.4,1) · rise .4s ease · 링 .55s · 색종이 1.9~3.2s linear infinite
```

## Assets

이미지 파일 없음 — 스티커·배경·아이콘 전부 CSS 도형(`stickers.js`의 부품 배열 + `theme-sticker.css`)입니다.
폰트만 Google Fonts(Jua, Gowun Dodum) CDN. 실제 일러스트 PNG로 바꾸려면 `createSticker()`가 만드는
`.sticker` 요소를 `<img>`로 교체하면 되고, 나머지 로직은 그대로 동작합니다.

스티커 24종: 딸기·체리·레몬·수박·사과·복숭아 / 도넛·아이스크림·컵케이크·주스·사탕·쿠키 /
튤립·데이지·네잎클로버·선인장·버섯 / 반짝별·무지개·구름·달·하트·리본·풍선.
기본 조합 — 중1 `PICK_CALM`(별·달·구름·클로버·선인장·레몬·쿠키·리본), 초5 `PICK_CUTE`(딸기·별·체리·튤립·무지개·하트·아이스크림·클로버).

## Files

- `PROMPT.md` — 클로드 코드에 그대로 붙여넣는 작업 지시(1~6단계)
- `code/theme-sticker.css` → `css/theme-sticker.css`
- `code/stickers.js` → `js/stickers.js`
- `code/rewards.js` → `js/rewards.js`
- `reference/Sticker Style Demo.dc.html` — 스티커 톤 시안 + 24종 고르기(레퍼런스)
- `reference/Homework App Redesign v2.dc.html` — 세 화면(첫째·둘째·엄마) 구조 시안(레퍼런스)

수정 대상 저장소 파일: `daughter1.html`, `daughter2.html`, `js/app.js`, `service-worker.js`
(2단계에서 `mom.html`, `js/mom.js`).
