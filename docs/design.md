# GW-OTP Chrome Extension - 설계 문서

## 1. 프로젝트 개요

GW-OTP는 TOTP(Time-based One-Time Password) 코드를 관리하는 크롬 확장 프로그램이다. 사용자가 팝업에서 OTP를 등록, 수정, 삭제, 그룹화, 검색하고 코드를 확인할 수 있으며, 마스터 비밀번호로 데이터를 암호화하여 `chrome.storage.sync`에 저장한다.

## 2. 요구사항 요약

| # | 요구사항 | 설명 |
|---|---------|------|
| 1 | OTP 등록 | 수동 입력, QR 이미지 업로드, 화면 캡처, `otpauth://` URI 붙여넣기 |
| 2 | OTP 관리 | 항목 수정 (issuer, label, secret, tags 등), 항목 삭제 (확인 후) |
| 3 | OTP 표시 | 리스트형 + 검색/필터 + 태그 기반 그룹핑 |
| 4 | OTP 카드 | issuer와 label(id) 표시, 드래그앤드롭 순서 조정 |
| 5 | 보안 | 마스터 비밀번호 암호화, 세션 기반 잠금 + 수동 잠금 |
| 6 | 편의 기능 | 클립보드 복사, 카운트다운 표시, 내보내기/가져오기 |
| 7 | 프라이버시 | 마우스 hover 시에만 OTP 코드 표시 (설정 토글) |
| 8 | 테마 | 라이트/다크/시스템 테마 전환 지원 |
| 9 | 코드 컨벤션 | 모든 파일명 kebab-case |
| 10 | 테스트 | Vitest 사용 |

## 3. 기술 스택

| 영역 | 기술 |
|------|------|
| UI 프레임워크 | React 19, TypeScript |
| 스타일링 | Tailwind CSS |
| UI 컴포넌트 | shadcn/ui (Radix UI 기반) |
| 빌드 도구 | Vite |
| Chrome Extension 빌드 | @crxjs/vite-plugin |
| OTP 생성 | otplib |
| QR 디코딩 | jsQR |
| 드래그앤드롭 | @dnd-kit/core, @dnd-kit/sortable |
| 암호화 | Web Crypto API (AES-GCM, PBKDF2) |
| 테스트 | Vitest |
| Manifest 버전 | Chrome Extension Manifest V3 |

## 4. 아키텍처

### 4.1 레이어 분리 원칙

Core 레이어와 UI 레이어를 엄격히 격리한다. 이를 통해 UI 프레임워크를 교체하더라도 비즈니스 로직은 그대로 재사용할 수 있다.

```
┌─────────────────────────────────────────────────────────────┐
│  UI Layer (React + Tailwind + shadcn/ui)                    │
│  - 순수 표현 로직, 사용자 인터랙션 처리                        │
│  - Core에 의존하되, Core는 UI에 의존하지 않음                  │
├─────────────────────────────────────────────────────────────┤
│  Core Layer (순수 TypeScript, UI 무관)                       │
│  - crypto, storage, otp, qr, backup                         │
│  - React, DOM, Tailwind 등 UI 관련 import 금지              │
│  - 브라우저 API(chrome.*)만 의존                             │
├─────────────────────────────────────────────────────────────┤
│  Background Layer (Service Worker)                          │
│  - Core를 사용하여 세션/키 관리                               │
│  - 메시지 기반 인터페이스 제공                                │
└─────────────────────────────────────────────────────────────┘
```

**규칙:**
- `src/core/` 내 파일은 `react`, `react-dom`, CSS, Tailwind, shadcn/ui를 import하지 않는다.
- `src/core/` 는 순수 TypeScript 함수/클래스만 포함하며, 모든 외부 의존은 인자로 주입받는다 (예: `chrome.storage`는 인터페이스로 추상화 가능).
- UI 레이어(`src/popup/`)는 Core의 함수를 호출하여 데이터를 가공하고, 결과를 렌더링하는 역할만 담당한다.
- Background 레이어(`src/background/`)는 Core를 직접 사용하며, Popup과는 메시지로만 통신한다.

**의존 방향:**
```
UI (popup) ──► Core ◄── Background
     │                       │
     └───── Messages ────────┘
```

### 4.2 시스템 구조도

```
┌─────────────────────────────────────────────────────────────────┐
│                    Chrome Extension (MV3)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────────────┐     Messages      ┌──────────────┐  │
│  │     Popup (React)     │ ◄───────────────► │  Background  │  │
│  │                       │                    │  Service     │  │
│  │  ┌─────────────────┐  │  unlock/lock/     │  Worker      │  │
│  │  │  Unlock Page    │  │  getStatus        │              │  │
│  │  ├─────────────────┤  │                    │  - 세션 관리  │  │
│  │  │  Main Page      │  │                    │  - 키 보관   │  │
│  │  │  (OTP List)     │  │                    │  (메모리)    │  │
│  │  ├─────────────────┤  │                    └──────────────┘  │
│  │  │  Add OTP Page   │  │                                      │
│  │  ├─────────────────┤  │                    ┌──────────────┐  │
│  │  │  Edit OTP Page  │  │                    │   Storage    │  │
│  │  ├─────────────────┤  │                    │              │  │
│  │  │  Settings Page  │  │ ──────────────────►│  chrome.     │  │
│  │  └─────────────────┘  │   encrypt/decrypt  │  storage.    │  │
│  └───────────────────────┘                    │  sync        │  │
│                                               └──────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                     Core Modules                           │  │
│  │  crypto.ts | storage.ts | otp.ts | qr.ts | backup.ts     │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 데이터 흐름

1. **Popup 열림** → Background에 `getStatus` 메시지 → 잠금 상태 확인
2. **잠금 해제** → 비밀번호 입력 → Background에 `unlock` 메시지 → PBKDF2로 키 유도 → 메모리에 키 보관
3. **OTP 로드** → Storage에서 암호화된 데이터 읽기 → Background의 키로 복호화 → UI에 표시
4. **OTP 저장** → 데이터 암호화 → Storage에 저장
5. **잠금** → Background에 `lock` 메시지 → 메모리에서 키 제거

## 5. 디렉토리 구조

모든 파일명은 **kebab-case**를 사용한다.

```
gw-otp/
├─ docs/
│  └─ design.md
├─ public/
│  └─ icons/                    # 확장 프로그램 아이콘 (16, 48, 128px)
├─ src/
│  ├─ background/
│  │  └─ index.ts               # Service Worker 진입점
│  ├─ popup/
│  │  ├─ index.html             # Popup HTML 진입점
│  │  ├─ main.tsx               # React 마운트
│  │  ├─ app.tsx                # App 컴포넌트 (라우팅)
│  │  ├─ pages/
│  │  │  ├─ unlock-page.tsx     # 마스터 비밀번호 입력/설정
│  │  │  ├─ main-page.tsx       # OTP 리스트 (메인 화면)
│  │  │  ├─ add-otp-page.tsx    # OTP 등록 (수동/QR/URI)
│  │  │  ├─ edit-otp-page.tsx   # OTP 편집
│  │  │  └─ settings-page.tsx   # 설정 (프라이버시, 백업)
│  │  └─ components/
│  │     ├─ otp-card.tsx        # 개별 OTP 카드
│  │     ├─ otp-list.tsx        # 드래그 가능한 OTP 리스트
│  │     ├─ tag-filter.tsx      # 태그 필터 바
│  │     ├─ search-bar.tsx      # 검색 입력
│  │     └─ countdown-bar.tsx   # TOTP 카운트다운 프로그레스
│  ├─ core/
│  │  ├─ crypto.ts              # 암호화/복호화 유틸리티
│  │  ├─ storage.ts             # Storage CRUD 레이어
│  │  ├─ otp.ts                 # TOTP 생성/검증/URI 파싱
│  │  ├─ qr.ts                  # QR 코드 디코딩
│  │  └─ backup.ts              # 내보내기/가져오기
│  └─ types/
│     └─ index.ts               # 공유 타입 정의
├─ tests/
│  ├─ core/
│  │  ├─ crypto.test.ts
│  │  ├─ storage.test.ts
│  │  ├─ otp.test.ts
│  │  ├─ qr.test.ts
│  │  └─ backup.test.ts
│  └─ background/
│     └─ session.test.ts
├─ manifest.json                # Chrome Extension Manifest V3
├─ vite.config.ts
├─ vitest.config.ts
├─ tsconfig.json
└─ package.json
```

## 6. 데이터 모델

### 6.1 OTPEntry

```typescript
interface OTPEntry {
  /** 고유 식별자 (UUID v4) */
  id: string;
  /** 서비스 제공자 이름 (예: Google, GitHub) */
  issuer: string;
  /** 계정 식별자 (예: hello@gmail.com) */
  label: string;
  /** 암호화된 secret 키 (Base64 인코딩) */
  encryptedSecret: string;
  /** 할당된 태그 ID 목록 */
  tags: string[];
  /** HMAC 알고리즘 */
  algorithm: 'SHA1' | 'SHA256' | 'SHA512';
  /** OTP 자릿수 */
  digits: 6 | 8;
  /** 갱신 주기 (초) */
  period: number;
  /** 생성 일시 (ISO 8601) */
  createdAt: string;
  /** 수정 일시 (ISO 8601) */
  updatedAt: string;
}
```

### 6.2 Tag

```typescript
interface Tag {
  /** 고유 식별자 (UUID v4) */
  id: string;
  /** 태그 표시 이름 */
  name: string;
  /** 태그 색상 (hex) */
  color: string;
}
```

### 6.3 Settings

```typescript
interface Settings {
  /** hover 시에만 OTP 코드 표시 */
  hideCodesUntilHover: boolean;
  /** 테마 설정 */
  theme: 'light' | 'dark' | 'system';
  /** 마스터 비밀번호 해시 (검증용) */
  passwordHash: string;
  /** PBKDF2 salt (Base64) */
  salt: string;
}
```

### 6.4 Storage 구조

```typescript
interface StorageSchema {
  /** 설정 */
  settings: Settings;
  /** OTP 항목 목록 */
  entries: OTPEntry[];
  /** 태그 목록 */
  tags: Tag[];
  /** OTP 표시 순서 (entry ID 배열) */
  order: string[];
}
```

## 7. 컴포넌트 트리 및 페이지 구조

```
App
├─ UnlockPage              (잠금 상태일 때)
│  ├─ 비밀번호 입력 폼
│  └─ 최초 설정 폼 (비밀번호 생성 + 확인)
│
└─ (잠금 해제 후)
   ├─ MainPage             (기본 화면)
   │  ├─ Header
   │  │  ├─ 검색 바 (SearchBar)
   │  │  ├─ 잠금 버튼
   │  │  ├─ 설정 버튼
   │  │  └─ 추가 버튼
   │  ├─ TagFilter         (태그 필터 바)
   │  └─ OTPList           (드래그 가능)
   │     └─ OTPCard[]
   │        ├─ issuer 표시
   │        ├─ label/id 표시
   │        ├─ OTP 코드 (hover 마스킹 옵션)
   │        ├─ CountdownBar
   │        ├─ 드래그 핸들
   │        └─ 편집/삭제 액션 버튼
   │
   ├─ AddOTPPage           (OTP 등록)
   │  ├─ 탭: 수동 입력 | QR 업로드 | 화면 캡처 | URI 붙여넣기
   │  ├─ 입력 폼 (issuer, label, secret, algorithm, digits, period)
   │  └─ 태그 선택/생성
   │
   ├─ EditOTPPage          (OTP 편집)
   │  ├─ 기존 정보 로드된 편집 폼
   │  └─ 저장/취소 버튼
   │
   └─ SettingsPage         (설정)
      ├─ 테마: 라이트 / 다크 / 시스템 선택
      ├─ 프라이버시: hover 마스킹 토글
      ├─ 내보내기 버튼
      └─ 가져오기 버튼
```

### 페이지 네비게이션

팝업 내에서는 단순한 상태 기반 라우팅을 사용한다 (React Router 없이 상태로 관리).

```typescript
type Page = 'unlock' | 'main' | 'add' | 'edit' | 'settings';
```

## 8. Background ↔ Popup 메시지 프로토콜

`chrome.runtime.sendMessage` / `chrome.runtime.onMessage`를 사용한 메시지 기반 통신.

### 메시지 타입 정의

```typescript
/** Popup → Background 요청 */
type MessageRequest =
  | { type: 'unlock'; password: string }
  | { type: 'lock' }
  | { type: 'getStatus' }
  | { type: 'getKey' };

/** Background → Popup 응답 */
type MessageResponse =
  | { type: 'unlock'; success: boolean; error?: string }
  | { type: 'lock'; success: boolean }
  | { type: 'getStatus'; isUnlocked: boolean; isInitialized: boolean }
  | { type: 'getKey'; key: string | null };
```

### 메시지 흐름

| 메시지 | 설명 | 요청 | 응답 |
|--------|------|------|------|
| `unlock` | 마스터 비밀번호로 잠금 해제 | `{ type: 'unlock', password }` | `{ success, error? }` |
| `lock` | 수동 잠금 | `{ type: 'lock' }` | `{ success }` |
| `getStatus` | 현재 잠금 상태 확인 | `{ type: 'getStatus' }` | `{ isUnlocked, isInitialized }` |
| `getKey` | 복호화 키 요청 | `{ type: 'getKey' }` | `{ key }` |

### 상태 전이

```
[초기화 안됨] ──(최초 비밀번호 설정)──► [잠금]
[잠금] ──(unlock 성공)──► [해제]
[해제] ──(lock / SW 종료)──► [잠금]
```

## 9. 암호화 흐름

### 9.1 키 유도 (PBKDF2)

```
마스터 비밀번호 + salt
       │
       ▼
  PBKDF2-SHA256
  (iterations: 600,000)
       │
       ▼
  256-bit AES-GCM Key
```

### 9.2 암호화 (AES-GCM)

```
평문 (secret) + AES Key + random IV (12 bytes)
       │
       ▼
  AES-256-GCM Encrypt
       │
       ▼
  Base64(IV + ciphertext + authTag)
```

### 9.3 복호화

```
Base64 encoded data → IV(12) | ciphertext | authTag(16)
       │
       ▼
  AES-256-GCM Decrypt (with Key + IV)
       │
       ▼
  평문 (secret)
```

### 9.4 비밀번호 검증

최초 비밀번호 설정 시:
1. random salt 생성 (16 bytes)
2. PBKDF2로 키 유도
3. 고정 검증 문자열("gw-otp-verify")을 암호화하여 `passwordHash`로 저장
4. salt를 Settings에 저장

잠금 해제 시:
1. 입력된 비밀번호 + 저장된 salt로 키 유도
2. `passwordHash`를 복호화 시도
3. 결과가 "gw-otp-verify"이면 비밀번호 정확 → 키를 Background 메모리에 보관

## 10. Storage 분할 전략

### 제한사항

- `chrome.storage.sync`: 항목당 최대 8,192 bytes, 전체 최대 102,400 bytes
- 최대 512개 항목(key-value pairs)

### 분할 전략

데이터를 논리적 키로 분할하여 저장한다:

```
storage keys:
  "settings"    → Settings 객체
  "tags"        → Tag[] 배열
  "order"       → string[] (ID 순서 배열)
  "entries_0"   → OTPEntry[] (chunk 0, 최대 ~7KB)
  "entries_1"   → OTPEntry[] (chunk 1)
  ...
  "entries_N"   → OTPEntry[] (chunk N)
```

### 청크 분할 로직

```typescript
const CHUNK_SIZE = 7000; // bytes (8192 미만으로 여유 확보)

function splitEntries(entries: OTPEntry[]): OTPEntry[][] {
  const chunks: OTPEntry[][] = [];
  let currentChunk: OTPEntry[] = [];
  let currentSize = 0;

  for (const entry of entries) {
    const entrySize = JSON.stringify(entry).length * 2; // UTF-16 추정
    if (currentSize + entrySize > CHUNK_SIZE && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentSize = 0;
    }
    currentChunk.push(entry);
    currentSize += entrySize;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}
```

### 용량 추정

- 평균 OTPEntry 크기: ~300 bytes (암호화된 secret 포함)
- 청크당 약 23개 항목
- 최대 약 300+ OTP 항목 저장 가능 (충분)

## 11. 보안 모델

### 11.1 세션 생명주기

| 상태 | 조건 | 키 위치 |
|------|------|---------|
| 초기화 안됨 | 최초 실행, 비밀번호 미설정 | 없음 |
| 잠금 | 비밀번호 설정됨, 미인증 | 없음 |
| 해제 | 비밀번호 검증 완료 | Background SW 메모리 |

### 11.2 자동 잠금

- **Service Worker 종료**: Chrome이 idle Service Worker를 종료하면 메모리의 키가 자동 소멸 → 잠금 상태
- **브라우저 종료**: 동일하게 키 소멸

### 11.3 수동 잠금

- 팝업 헤더의 잠금 버튼 클릭 → `lock` 메시지 → Background에서 키 제거
- 즉시 Unlock 화면으로 전환

### 11.4 보안 고려사항

- Secret은 **항상 암호화된 상태**로 storage에 저장
- 복호화 키는 **메모리에만** 존재 (디스크에 저장하지 않음)
- PBKDF2 iterations 600,000회로 brute-force 방어
- 각 암호화 시 새로운 random IV 사용 (동일 평문이라도 다른 암호문)
- `authTag`로 무결성 검증 (변조 탐지)

## 12. OTP 카드 UI 명세

### 카드 레이아웃

```
┌─────────────────────────────────────────────────┐
│ ⠿  │  Google                        ✏️  🗑️  │
│    │  hello@gmail.com                         │
│    │                                          │
│    │  1 2 3  4 5 6        (또는 ••••••)       │
│    │  ████████████░░░░░  15s                  │
└─────────────────────────────────────────────────┘
  │       │         │              │
  │       │         │              └─ 카운트다운 바 + 남은 초
  │       │         └─ OTP 코드 (클릭 시 복사)
  │       └─ issuer + label
  └─ 드래그 핸들
```

### 인터랙션

| 액션 | 동작 |
|------|------|
| OTP 코드 클릭 | 클립보드 복사 + 토스트 "복사됨" |
| 드래그 핸들 잡고 드래그 | 순서 변경 |
| 편집 아이콘 (✏️) 클릭 | EditOTPPage로 이동 |
| 삭제 아이콘 (🗑️) 클릭 | 확인 다이얼로그 → 삭제 |
| 마우스 hover (프라이버시 ON) | `••••••` → 실제 코드 표시 |

### OTP 코드 갱신

- 매 초마다 남은 시간 계산: `period - (currentTime % period)`
- 남은 시간이 0이 되면 새 코드 생성
- CountdownBar는 `(remainingSeconds / period) * 100`%로 너비 표시

## 13. 테마 시스템

### 테마 옵션

| 옵션 | 동작 |
|------|------|
| `light` | 항상 라이트 모드 |
| `dark` | 항상 다크 모드 |
| `system` | OS 설정에 따라 자동 전환 (`prefers-color-scheme`) |

### 구현 방식

Tailwind CSS의 `darkMode: 'class'` 전략을 사용한다.

```typescript
// src/popup/hooks/use-theme.ts
type Theme = 'light' | 'dark' | 'system';

function useTheme() {
  // 1. Settings에서 저장된 테마 로드
  // 2. 'system'이면 matchMedia('(prefers-color-scheme: dark)') 감지
  // 3. <html> 요소에 'dark' class 추가/제거
}
```

### CSS 변수 (shadcn/ui 기반)

shadcn/ui는 CSS 변수 기반 테마를 사용한다. `globals.css`에 라이트/다크 변수를 정의:

```css
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --primary: 222.2 47.4% 11.2%;
  --primary-foreground: 210 40% 98%;
  /* ... */
}

.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  --primary: 210 40% 98%;
  --primary-foreground: 222.2 47.4% 11.2%;
  /* ... */
}
```

### Settings 페이지 UI

라디오 버튼 또는 세그먼트 컨트롤로 3가지 옵션 선택:
- ☀️ 라이트
- 🌙 다크
- 💻 시스템

선택 즉시 적용 + `chrome.storage.sync`에 저장.

## 14. QR 인식 흐름

### 13.1 이미지 업로드

```
사용자가 파일 선택 (input[type=file])
       │
       ▼
  FileReader → DataURL
       │
       ▼
  Image → Canvas (drawImage)
       │
       ▼
  canvas.getImageData()
       │
       ▼
  jsQR(imageData.data, width, height)
       │
       ▼
  QR 데이터 (otpauth:// URI)
       │
       ▼
  parseOTPAuthURI() → OTPEntry 필드 채우기
```

### 13.2 화면 캡처

```
사용자가 "화면 캡처" 버튼 클릭
       │
       ▼
  chrome.tabs.captureVisibleTab() → DataURL
       │
       ▼
  Image → Canvas → getImageData()
       │
       ▼
  jsQR() → QR 데이터 탐색
       │
       ├─ QR 발견 → URI 파싱 → 등록 폼에 채우기
       └─ QR 미발견 → 에러 메시지 "QR 코드를 찾을 수 없습니다"
```

### 필요 권한

- `activeTab`: 현재 탭 캡처를 위해 필요
- 사용자가 팝업에서 버튼을 클릭하는 시점에만 권한 활성화

## 15. 내보내기/가져오기 포맷

### 파일 확장자

`.gw-otp`

### 파일 구조

```typescript
interface BackupFile {
  /** 파일 포맷 버전 */
  version: 1;
  /** 생성 일시 (ISO 8601) */
  exportedAt: string;
  /** PBKDF2 salt (Base64, 백업 전용) */
  salt: string;
  /** 암호화된 데이터 (Base64) */
  encryptedData: string;
}
```

### 내보내기 흐름

```
1. 사용자에게 내보내기 비밀번호 입력 받기 (현재 마스터 비밀번호 또는 별도)
2. 모든 OTP entries의 secret을 복호화
3. 평문 상태의 전체 데이터를 JSON 직렬화
   { entries: OTPEntry[], tags: Tag[], order: string[] }
4. 내보내기 비밀번호로 새 salt 생성 + PBKDF2 키 유도
5. AES-GCM으로 암호화
6. BackupFile 구조로 JSON 생성
7. Blob → URL.createObjectURL → 다운로드
```

### 가져오기 흐름

```
1. 파일 업로드 (input[type=file], accept=".gw-otp")
2. JSON 파싱 → version 확인
3. 내보내기 시 사용한 비밀번호 입력 받기
4. salt + 비밀번호로 키 유도
5. encryptedData 복호화
6. 복호화된 entries/tags/order를 현재 storage에 병합
   - 동일 ID가 있으면 사용자에게 덮어쓰기 확인
   - 새 항목은 추가
7. 현재 마스터 비밀번호로 재암호화하여 저장
```

## 16. 테스트 전략

### 테스트 프레임워크

- **Vitest**: 단위 테스트 및 통합 테스트
- **환경**: `jsdom` (DOM API 필요 시)
- **Web Crypto**: Node.js `crypto` 모듈로 polyfill

### 테스트 범위

| 모듈 | 테스트 파일 | 주요 테스트 케이스 |
|------|------------|-------------------|
| crypto | `tests/core/crypto.test.ts` | encrypt/decrypt 왕복, 잘못된 비밀번호 실패, salt 고유성 |
| storage | `tests/core/storage.test.ts` | CRUD 동작, 순서 관리, 청크 분할, 삭제 정합성 |
| otp | `tests/core/otp.test.ts` | TOTP 생성 검증, URI 파싱, 남은 시간 계산 |
| qr | `tests/core/qr.test.ts` | QR 이미지 데이터 디코딩 |
| backup | `tests/core/backup.test.ts` | 내보내기→가져오기 왕복, 버전 검증 |
| session | `tests/background/session.test.ts` | 잠금/해제 상태 전환, 키 보관/삭제 |

### Mock 전략

- `chrome.storage.sync`: in-memory 객체로 mock
- `chrome.runtime.sendMessage`: 직접 핸들러 호출로 mock
- `chrome.tabs.captureVisibleTab`: mock DataURL 반환

### 실행

```bash
# 전체 테스트
pnpm test

# 특정 파일
pnpm test tests/core/crypto.test.ts

# watch 모드 (개발 중)
pnpm test --watch
```

## 17. Manifest 설정

```json
{
  "manifest_version": 3,
  "name": "GW-OTP",
  "version": "1.0.0",
  "description": "OTP 인증 코드 관리 크롬 확장 프로그램",
  "permissions": [
    "storage",
    "activeTab",
    "clipboardWrite"
  ],
  "action": {
    "default_popup": "src/popup/index.html",
    "default_icon": {
      "16": "public/icons/icon-16.png",
      "48": "public/icons/icon-48.png",
      "128": "public/icons/icon-128.png"
    }
  },
  "background": {
    "service_worker": "src/background/index.ts",
    "type": "module"
  },
  "icons": {
    "16": "public/icons/icon-16.png",
    "48": "public/icons/icon-48.png",
    "128": "public/icons/icon-128.png"
  }
}
```

## 18. 구현 순서

1. 프로젝트 구조 전환 (Vite + @crxjs/vite-plugin + Vitest)
2. 암호화 모듈 (`crypto.ts`)
3. Storage 레이어 (`storage.ts` + `types/index.ts`)
4. OTP 생성 모듈 (`otp.ts`)
5. Background Service Worker (세션 관리)
6. Unlock Page UI
7. OTP 리스트 UI (Main Page + OTP Card)
8. OTP 편집 & 삭제
9. OTP 카드 순서 조정 (드래그앤드롭)
10. 태그 그룹핑 & 검색/필터
11. OTP 등록 — 수동 입력 & URI
12. OTP 등록 — QR 이미지 업로드
13. OTP 등록 — 화면 캡처
14. 프라이버시 옵션 (hover 마스킹)
15. 수동 잠금 기능
16. 내보내기/가져오기
17. 최종 통합 및 폴리싱
