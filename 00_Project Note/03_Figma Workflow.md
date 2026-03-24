# Figma ↔ Code Workflow

코드로 만든 UI를 Figma로 가져가서 디자인 수정 후 다시 코드에 반영하는 워크플로우.

---

## Concept / 개념

이 프로젝트의 UI는 `src/app/page.tsx` 한 파일에 집중되어 있음.
Three.js 캔버스(3D)와 React UI(사이드바, HUD)가 공존하기 때문에 Figma 코드 자동생성은
현실적으로 맞지 않음. 대신 아래 방향으로 나눠서 사용:

```
Code → Figma   :  html.to.design 플러그인으로 현재 UI 스냅샷 import
Figma → Code   :  Dev Mode에서 수치 확인 후 수동 반영 (or 스크린샷 공유 후 AI 반영)
```

**Figma가 담당하는 영역**
- 사이드바 레이아웃, 버튼 스타일, 색상, 타이포그래피, 간격
- HUD 배치, 컨트롤 순서

**Figma로 다루기 어려운 영역**
- Three.js 3D 캔버스 (정적 스크린샷으로만 표현됨)
- 애니메이션, 드래그 인터랙션

---

## Tools / 도구

| 방향 | 도구 | 비고 |
|------|------|------|
| Code → Figma | [html.to.design](https://www.figma.com/community/plugin/1159123024924461424/html-to-design) | 로컬 또는 배포 URL → Figma 레이어 |
| Figma → Code | Figma Dev Mode (내장) | 색상·간격·폰트 수치 복사 |
| Figma → Code (자동) | [Builder.io](https://www.figma.com/community/plugin/747985167520967365/builder-io-ai-powered-figma-to-code) | 단순 컴포넌트에 한해 React 코드 생성 |

---

## Setup / 설치

### 1. html.to.design 설치
1. Figma 상단 메뉴 → `Plugins` → `Find more plugins`
2. `html.to.design` 검색 → Install

### 2. 로컬 dev 서버 실행
```bash
npm run dev
# → http://localhost:3000 (포트 충돌 시 3001, 3002 순으로 자동 할당)
```

---

## Code → Figma / 코드를 피그마로 가져오기

```
1. npm run dev 실행
2. Figma 열기 → Plugins → html.to.design
3. URL 입력: http://localhost:3000  (또는 배포 URL: https://can-editor-original.vercel.app)
4. Width: 1440
5. Import 클릭
```

**결과물 수준**
- 색상, 폰트, 간격 → 거의 그대로 재현
- glassmorphism blur → 근사치 (Figma Layer Blur로 변환)
- Three.js 캔버스 → 정적 스크린샷으로 들어옴
- 레이어명은 자동 정리되나 이후 수동으로 네이밍 정리 권장

**팁**: 배포 URL을 쓰면 로컬 서버 불필요. 단, 최신 코드 반영 여부 확인할 것.

---

## Figma → Code / 피그마 수정사항 코드에 반영

### 방법 A — 수치 직접 확인 후 반영 (권장)

1. Figma Dev Mode 활성화 (우측 상단 `</>` 아이콘)
2. 수정한 요소 클릭 → 우측 패널에서 색상·크기·간격 확인
3. `src/app/page.tsx`에서 해당 부분 찾아 수정

```
예시:
Figma: background rgba(7,7,7,0.97)  border-radius 12px
→ page.tsx: style={{ background: "rgba(7,7,7,0.97)", borderRadius: "12px" }}
```

### 방법 B — 스크린샷 + AI 반영

1. Figma에서 수정한 화면 스크린샷
2. Claude Code에 "이 부분 이렇게 바꿔줘" + 이미지 첨부
3. 코드 자동 반영

### 방법 C — Builder.io 플러그인 (단순 컴포넌트만)

단순한 카드, 버튼 컴포넌트 → React 코드 생성 가능.
Three.js, 복잡한 상태 로직이 섞인 부분엔 생성 코드가 현재 구조와 맞지 않으므로 비권장.

---

## Recommended Workflow / 권장 흐름

```
[초기 1회]
npm run dev → html.to.design → Figma에 스냅샷 import

[이후 반복]
Figma에서 디자인 수정
    ↓
방법 A: Dev Mode에서 수치 확인 → 직접 코드 수정
방법 B: 스크린샷 첨부 → Claude Code에 수정 요청
    ↓
git push → Vercel 자동 배포
```

---

## Notes / 참고

- Figma의 변경사항이 코드에 자동 반영되지는 않음. 항상 수동 or AI 통해 반영 필요.
- UI 대규모 개편 시: `html.to.design`으로 재import해서 Figma 파일 갱신.
- 3D 캔버스 디자인 변경(배경색, 조명 등)은 Figma 대신 코드에서 직접 수정하는 것이 빠름.

---

## Links / 링크

- [html.to.design Figma plugin](https://www.figma.com/community/plugin/1159123024924461424/html-to-design)
- [Builder.io Figma plugin](https://www.figma.com/community/plugin/747985167520967365/builder-io-ai-powered-figma-to-code)
- [Figma Dev Mode 공식 문서](https://help.figma.com/hc/en-us/articles/15023124644247-Guide-to-Dev-Mode)
- [Vercel 배포 URL](https://can-editor-original.vercel.app)
