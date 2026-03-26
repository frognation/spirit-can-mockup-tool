# Revising Notes

## 2026-03-26

- [x] Electron 창 드래그 이동 — 타이틀바 영역(`-webkit-app-region: drag`) 추가, 사이드바는 `no-drag` 처리
- [x] 라벨 Unload / Show Label 토글 — 빈 캔(라벨 없음) 상태 전환 기능
- [x] 이미지 Unload Image 버튼 — 이미지 제거 + 라벨 숨김 동시 처리
- [x] Hydration 에러 수정 — `isElectron`을 `useEffect` 마운트 후 `useState`로 관리하여 SSR/CSR 불일치 해소
- [x] UI Design Base 추가 — `ui-design-base/` 폴더에 순수 HTML/CSS/JS UI 뼈대 생성 (다른 프로젝트 디자인 참조용, 3D·Electron·녹화 등 무거운 기능 제외)
  - `index.html` — 사이드바 + 하단 HUD 전체 레이아웃
  - `style.css` — CSS 변수 기반 다크/라이트 테마 시스템
  - `script.js` — 아코디언 토글, 테마 전환, 인터랙티브 UI 데모

## 2026-03-24 (문서 정리 — Figma 워크플로우)

- [x] `03_Figma Workflow.md` 작성 — 코드↔Figma 양방향 워크플로우 정리
  - html.to.design (Code → Figma 스냅샷 import)
  - Dev Mode / 스크린샷 기반 (Figma → Code 수동 반영)
  - 공식 Figma MCP / Framelink MCP / claude-talk-to-figma-mcp 비교
  - 권장 조합 및 설치 방법 (한·영 병기, 유용한 링크 포함)

## 2026-03-24 (Electron 데스크탑 앱 기반 구축)

- [x] Electron 뼈대 추가 — `electron/main.ts`, `electron/preload.ts`, `electron/tsconfig.json`
- [x] `electron-builder.yml` — macOS `.dmg` 패키징 (arm64 + x64), App Store 전환 주석 포함
- [x] `next.config.mjs` — `ELECTRON=true` env로 static export 모드 분기 (`assetPrefix: "./"`)
- [x] `package.json` — `electron:dev` / `electron:build` / `electron:pack` 스크립트 추가
- [x] Electron IPC 핸들러 — `save-png` (네이티브 Save 다이얼로그 + Finder 오픈), `open-image`, `open-images-batch`, `save-pngs-batch` (배치 처리), `get-history` / `set-history` (영속 히스토리)
- [x] `preload.ts` contextBridge — `window.electronAPI` 타입세이프 브릿지
- [x] `page.tsx` — Electron API 연동: PNG 저장 네이티브 다이얼로그, 이미지/스티커 열기 네이티브 다이얼로그, 앱 재시작 후에도 최근 이미지/스티커 유지 (electron `userData`에 JSON 저장)
- [x] `.gitignore` — `electron-dist/`, `dist-electron/` 추가

## 2026-03-24

- [x] 이미지/스티커 회전 슬라이더 추가
- [x] 이미지/스티커 색상 반전(Invert Colors) 토글 버튼
- [x] 이미지/스티커 배경 제거(Remove Background) 버튼 — 코너 플러드필 방식
- [x] 스티커 최근 기록 (최대 6개 썸네일, ⌘V 붙여넣기도 기록에 추가)
- [x] 슬라이더 값 클릭 시 직접 숫자 입력 가능
- [x] 드래그 관성(Inertia) — 릴리즈 후 자연스러운 감속 스핀
- [x] LEVEL 토글 (바텀 HUD) — 세로 기울임 후 자동 수평 복귀 (~1초), 켜고 끄기 가능
- [x] 드래그 최대 속도 제한 (수평 1.8 rad/s, 수직 1.2 rad/s)
- [x] 라이트 고정 — 카메라 아닌 캔 자체를 드래그로 회전 (조명 시점 유지)
- [x] 반응형 레이아웃 수정 — 우측 사이드바 절대위치 고정으로 항상 표시
- [x] PNG 내보내기 1920×1920 정사각형, 줌 독립적 (canonical 카메라 기준)
- [x] Controls 섹션에 Reset View 버튼 추가
- [x] 섹션 헤더 chevron 크기 확대
- [x] 라벨 UV 림/바닥 번짐 수정 — per-frame 갱신 클리핑 플레인 (캔 기울여도 마스킹 없음)
- [x] localStorage 자동저장 제거 — 새로고침 시 항상 디폴트로 복귀
- [x] Undo / Redo — ⌘Z / ⌘⇧Z 단축키 + 바텀 HUD ↺↻ 버튼, 400ms 디바운스 히스토리 (최대 50단계), 슬라이더 드래그 중 단계 누적 없음

## 2026-03-23

- [x] 스티커 레이어 추가 — 라벨 위에 별도 PNG 오버레이, 투명배경 지원, 위치/스케일/그림자/Roughness/Metalness 조절
- [x] 바텀 HUD — 캔버스 하단 중앙 플로팅 컨트롤바 (Play/Pause, 속도, 리셋, PNG, 360° 비디오)
- [x] PNG 내보내기 개선 — 실제 사용자 시점 그대로 캡처, 자동 크롭 + 패딩, 1200px 출력
- [x] 360° 비디오 취소 버튼 추가
- [x] 이미지 스케일/포지션/배경색 조절 (useFitTexture 훅)
- [x] ⌘V 스티커 붙여넣기 — Image / Sticker 섹션 클릭 시 붙여넣기 대상 전환
- [x] 다크/라이트 모드 토글 (좌하단 아이콘 버튼)

## 2026-03-20

- [x] 전체 UI 리디자인 — 다크모드, 글래스모피즘, 모노스페이스, 우측 사이드바
- [x] 타이틀 변경: Spirit Can Editor 2.0
- [x] 패널 순서 재정렬 (Can → Image → Material → Lighting → Controls), 모두 기본 열림
- [x] Material 프리셋 추가 (Matte / Satin / Glossy / Chrome / Custom)
- [x] Lighting UI 간소화 (Bar/Studio 토글, Advanced 접기)
- [x] 자동 회전 기본값 ON
- [x] 드래그앤드롭 — 사이드바 + 3D 캔버스 위 직접 드롭
- [x] 붙여넣기(Ctrl+V / Cmd+V) 이미지 업로드
- [x] 최근 이미지 기록 (최대 6개 썸네일, 클릭 재적용)
- [x] 360° 비디오 — 녹화 전 캔 정면 복귀, 취소 버튼 추가
- [x] Image 탭에 선택 캔 사이즈별 최적 이미지 사이즈 표시
- [x] Vercel 배포 (https://can-editor-original.vercel.app)

## 2026-01-10

- [x] Publish this project to GitHub (push latest)
- [x] Configure GitHub Pages to redirect to Vercel deployment (https://can-editor-original.vercel.app/)
- [ ] Add this project to frognation.github.io list with a Live link pointing to Vercel
- [x] Update docs/README with publishing instructions
