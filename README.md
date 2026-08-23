# GW-OTP

OTP(TOTP) 인증 코드를 관리하는 크롬 확장 프로그램.

## 기능

- **OTP 등록**: 수동 입력, otpauth:// URI 붙여넣기, QR 이미지 업로드, 화면 캡처
- **OTP 관리**: 편집, 삭제, 드래그앤드롭 순서 조정
- **태그 & 검색**: 태그 기반 그룹핑, issuer/label 검색 필터
- **보안**: 마스터 비밀번호 기반 AES-256-GCM 암호화, 세션 기반 잠금 + 수동 잠금
- **편의 기능**: 클릭 복사, 카운트다운 바, 내보내기/가져오기 (.gw-otp)
- **프라이버시**: 마우스 hover 시에만 OTP 코드 표시 (설정)
- **테마**: 라이트 / 다크 / 시스템

## 기술 스택

- React 19, TypeScript, Vite
- @crxjs/vite-plugin (Chrome Extension MV3 빌드)
- Tailwind CSS v4 + shadcn/ui
- otplib (TOTP 생성)
- jsQR (QR 디코딩)
- @dnd-kit (드래그앤드롭)
- Web Crypto API (PBKDF2 + AES-GCM)
- Vitest (단위 테스트)

## 시작하기

```bash
# 의존성 설치
pnpm install

# 개발 서버 (HMR)
pnpm dev

# 빌드
pnpm build

# 테스트
pnpm test

# 테스트 (watch 모드)
pnpm test:watch
```

## Chrome에 로드하기

1. `pnpm build` 실행
2. Chrome에서 `chrome://extensions` 이동
3. "개발자 모드" 활성화
4. "압축해제된 확장 프로그램을 로드합니다" 클릭
5. `dist` 폴더 선택

개발 중에는 `pnpm dev`를 실행하면 HMR이 적용된 확장 프로그램을 바로 테스트할 수 있습니다.

## 프로젝트 구조

```
src/
├─ background/       # Service Worker (세션 관리)
├─ core/             # 비즈니스 로직 (UI 무관, 순수 TypeScript)
│  ├─ crypto.ts      # 암호화/복호화 (PBKDF2 + AES-GCM)
│  ├─ storage.ts     # chrome.storage.sync CRUD + 청크 분할
│  ├─ otp.ts         # TOTP 생성/검증/URI 파싱
│  ├─ qr.ts          # QR 코드 디코딩
│  └─ backup.ts      # 내보내기/가져오기
├─ popup/            # React UI
│  ├─ components/    # 공유 컴포넌트
│  ├─ pages/         # 페이지 컴포넌트
│  └─ lib/           # 유틸리티
└─ types/            # 공유 타입 정의
tests/               # Vitest 단위 테스트
docs/                # 설계 문서
```

## 아키텍처

Core 레이어와 UI 레이어가 분리되어 있어, UI 프레임워크를 교체해도 비즈니스 로직을 재사용할 수 있습니다.

```
UI (popup) ──► Core ◄── Background
     │                       │
     └───── Messages ────────┘
```

## 라이선스

Private
