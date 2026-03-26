# Spirit Can Editor — Project Guide

## Overview
3D 음료캔 목업 에디터. 사용자가 라벨 이미지를 업로드하면 3D 캔 위에 실시간으로 렌더링하여 시각화하고 PNG/WebM으로 내보낼 수 있다.

## Tech Stack
- **Framework**: Next.js 14 (App Router, Static Export)
- **3D**: Three.js + React Three Fiber (@react-three/fiber, @react-three/drei)
- **Styling**: Tailwind CSS
- **Desktop**: Electron (macOS, arm64/x64)
- **Deployment**: Vercel (web), GitHub Releases (desktop DMG)
- **Language**: TypeScript

## Project Structure
```
src/app/page.tsx      — 메인 앱 (3D 캔 렌더링, UI, 내보내기 등 전체 로직)
src/app/layout.tsx    — 루트 레이아웃
src/app/globals.css   — 글로벌 스타일
electron/main.ts      — Electron 메인 프로세스
electron/preload.ts   — Electron preload (IPC bridge)
public/               — 3D 모델(Soda-can.gltf), 기본 라벨 이미지
build/icon.icns       — macOS 앱 아이콘 (Spirit Chill 캔 이미지)
```

## Key Commands
```bash
npm run dev               # Next.js 개발 서버 (localhost:3000)
npm run build             # Next.js 프로덕션 빌드
npm run electron:dev      # Electron + Next.js 동시 실행 (개발)
npm run electron:build    # Electron DMG 빌드 (arm64 + x64)
npm run electron:pack     # Electron 패키징 (DMG 없이, 디렉토리만)
```

## Features (v2.0)
- 3D 캔 실시간 렌더링 (355ml / 475ml 사이즈)
- 라벨 이미지 업로드 (드래그 앤 드롭, 파일 선택, 붙여넣기)
- 스티커 레이어
- 다크/라이트 모드
- 머티리얼 프리셋 (메탈릭, 매트 등)
- PNG 내보내기 (Electron: 네이티브 저장 다이얼로그)
- WebM 회전 영상 녹화
- 배치 내보내기 (여러 이미지 한번에)
- Undo/Redo (⌘Z / ⌘⇧Z)
- JSON 프리셋 저장/불러오기
- 관성 드래그, 스프링 물리

## Deployment
- **Web**: Vercel에 자동 배포 (can-editor-original.vercel.app)
- **Desktop**: `npm run electron:build` → `release/` 폴더에 DMG 생성 → GitHub Releases에 업로드
- 웹 버전에서 Desktop App 다운로드 링크가 GitHub Releases의 latest를 가리킴

## Build Notes
- electron-builder 설정은 `package.json`의 `"build"` 필드에 있음
- 앱 아이콘: `build/icon.icns` (1024x1024 PNG → iconutil로 변환)
- 코드 서명 없음 (개인 프로젝트) — macOS에서 "확인되지 않은 개발자" 경고 발생
- DMG 파일명: `Spirit Can Editor-2.0.0-arm64.dmg` (Apple Silicon), `Spirit Can Editor-2.0.0.dmg` (Intel)

## Cautions
- `src/app/page.tsx`에 거의 모든 로직이 집중되어 있음 (1200+ lines)
- Electron 빌드 시 `ELECTRON=true` 환경변수 필요 (static export 모드 전환)
- `out/` 폴더는 빌드 산출물 (git에 포함하지 않음)
- `release/` 폴더도 git에 포함하지 않음
