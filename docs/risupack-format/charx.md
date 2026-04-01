# 캐릭터 카드 포맷 (.charx, .png, .jpg)

검증 기준 RisuAI 버전: `RisuAI 2026.3.334`

## 1. 지원 컨테이너

| 확장자          | 실제 구조                 | 에셋 포함 |
| --------------- | ------------------------- | :-------: |
| `.charx`        | ZIP 아카이브              |    ✅     |
| `.jpg`, `.jpeg` | JPEG 뒤에 ZIP payload     |    ✅     |
| `.png`          | PNG `tEXt` 청크 기반 카드 |    ✅     |

---

## 2. `.charx` / `.jpg` 구조

### 2.1 ZIP 내부 구성

최신 RisuAI 코드 기준으로 실제로 확인되는 항목은 다음입니다.

```text
character.charx (ZIP)
├── card.json
├── module.risum
├── assets/
│   └── ...
└── x_meta/
    └── *.json             # PNG 메타 보존용, 선택
```

- `card.json`은 CCv3 카드 JSON입니다.
- 최신 `charx` / `charx-jpeg` export 경로는 `module.risum`을 항상 씁니다.
- `module.risum`에는 lorebook, regex, trigger가 들어갑니다.
- `assets/`는 `embeded://...` URI가 가리키는 실제 파일입니다.
- `x_meta/`는 ZIP 안 PNG 자산의 원본 텍스트 메타를 보존할 때 사용됩니다.

### 2.2 `.jpg` / `.jpeg`

`charx-jpeg`는 일반 JPEG 뒤에 ZIP payload를 붙인 형식입니다.

```text
┌─────────────────────────────┐
│ JPEG 데이터                 │
├─────────────────────────────┤
│ ZIP 데이터                  │
│   ├── card.json             │
│   ├── module.risum          │
│   ├── assets/...            │
│   └── x_meta/...            │
└─────────────────────────────┘
```

ZIP 시작점은 `PK\x03\x04` 시그니처로 찾습니다.

---

## 3. `card.json` 구조

```typescript
interface CharXCardJson {
  spec: "chara_card_v3";
  spec_version: "3.0";
  data: CCv3Data;
}

interface CCv3Data {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;

  character_book?: CharacterBook;
  assets?: CCv3Asset[];
  extensions?: {
    risuai?: RisuAIExtension;
    depth_prompt?: { depth: number; prompt: string };
    [key: string]: unknown;
  };

  creator_notes?: string;
  system_prompt?: string;
  post_history_instructions?: string;
  alternate_greetings?: string[];
  tags?: string[];
  creator?: string;
  character_version?: string;
  group_only_greetings?: string[];
  nickname?: string;
  source?: unknown[];
  creation_date?: number;
  modification_date?: number;
}
```

### 3.1 로어북 위치

- 로어북은 `data.character_book`에 직렬화됩니다.
- 카드 내부 `extensions.risuai`에 `globalLore`가 직접 저장되는 구조는 최신 코드 기준이 아닙니다.

### 3.2 `module.risum` 분리

최신 `.charx`와 `.jpg/.jpeg` export에서는 다음 데이터가 `module.risum`으로 분리됩니다.

- `globalLore`
- `customScripts`
- `triggerscript`

즉 카드 JSON만 보고 전체 기능이 끝난다고 가정하면 안 됩니다.

---

## 4. 에셋

### 4.1 CCv3Asset

```typescript
interface CCv3Asset {
  type: string;
  uri: string;
  name: string;
  ext: string;
}
```

### 4.2 실제로 확인되는 URI 형식

| 형식                   | 의미                     |
| ---------------------- | ------------------------ |
| `ccdefault:`           | 기본 아이콘              |
| `embeded://assets/...` | ZIP 내부 파일            |
| `__asset:N`            | PNG 청크 인덱스 참조     |
| `data:...;base64,...`  | JSON 내 직접 내장 데이터 |

### 4.3 에셋 타입

| type           | 의미                  |
| -------------- | --------------------- |
| `icon`         | 프로필 아이콘         |
| `emotion`      | 감정 이미지           |
| `background`   | 배경 이미지           |
| `audio`        | 오디오                |
| `video`        | 비디오                |
| `portrait`     | VN 초상화             |
| `additional`   | 일반 추가 에셋        |
| `other`        | 기타                  |
| `x-risu-asset` | RisuAI 내부 에셋 타입 |

`type`은 미디어 포맷이 아니라 역할이므로, 이미지/오디오/비디오는 `ext`나 실제 바이트 시그니처로 다시 판별하는 편이 안전합니다.

### 4.4 `asset.ext` 주의

V3 카드에서는 `x-risu-asset`의 `ext`가 실제 확장자가 아니라 이름처럼 들어가는 경우가 있습니다.

```json
{
  "type": "x-risu-asset",
  "name": "fertilization_success",
  "uri": "__asset:2",
  "ext": "fertilization_success"
}
```

이 경우 `ext`를 그대로 신뢰하기보다 magic bytes로 실제 포맷을 추정하는 편이 안전합니다.

---

## 5. `extensions.risuai`

최신 코드에서 카드 import/export 경로로 직접 확인되는 필드는 다음 범위입니다.

```typescript
interface RisuAIExtension {
  bias?: [string, number][];
  viewScreen?: "emotion" | "none" | "imggen";
  utilityBot?: boolean;
  customScripts?: CustomScript[];
  triggerscript?: TriggerScript[];
  sdData?: [string, string][];
  backgroundHTML?: string;
  license?: string;
  private?: boolean;
  additionalText?: string;
  virtualscript?: string;
  largePortrait?: boolean;
  lorePlus?: boolean;
  inlayViewScreen?: boolean;
  lowLevelAccess?: boolean;
  defaultVariables?: string;
  prebuiltAssetCommand?: boolean;
  prebuiltAssetExclude?: string[];
  prebuiltAssetStyle?: string;
  newGenData?: {
    prompt: string;
    negative: string;
    instructions: string;
    emotionInstructions: string;
  };
  vits?: Record<string, string>;
}
```

주의할 점:

- 필드명은 `customscript`가 아니라 `customScripts`입니다.
- 최신 V3 카드의 에셋 본문은 `extensions.risuai`가 아니라 `data.assets[]`에 들어갑니다.
- `emotions`, `additionalAssets`, `vits`는 V2/레거시 PNG 계열 설명으로는 유효하지만, 최신 V3 에셋 위치 설명으로 쓰면 맞지 않습니다.
- 최신 exporter는 `vits`를 빈 객체로만 남기고, 실제 V3 에셋은 `data.assets[]`로 씁니다.
- `private`는 importer가 읽는 필드지만, 최신 exporter가 항상 쓰는 필드라고 보긴 어렵습니다.
- `modules`는 최신 카드 확장 필드 설명으로는 맞지 않습니다.

---

## 6. `character_book`

```typescript
interface CharacterBook {
  entries: LoreBookEntry[];
  scan_depth?: number;
  token_budget?: number;
  recursive_scanning?: boolean;
  extensions?: {
    risu_fullWordMatching?: boolean;
    [key: string]: unknown;
  };
}

interface LoreBookEntry {
  keys: string[];
  secondary_keys?: string[];
  selective?: boolean;
  content: string;
  insertion_order: number;
  comment?: string;
  name?: string;
  id?: string;
  mode?: "normal" | "constant" | "folder" | "multiple" | "child";
  folder?: string;
}
```

### 6.1 폴더 ID 형식

폴더 엔트리의 `key`와, 그 폴더에 속한 일반 엔트리의 `folder`는 같은 형식을 씁니다.

```text
\uf000folder:<folder-id>
```

즉 폴더 소속 판정은 일반적으로 다음 비교로 이해하면 됩니다.

```text
entry.folder === folderEntry.key
```

---

## 7. PNG 카드

### 7.1 사용 청크

| 키                   | 의미                     |
| -------------------- | ------------------------ |
| `chara`              | V2/구형 카드 JSON Base64 |
| `ccv3`               | V3 카드 JSON Base64      |
| `chara-ext-asset_:N` | 에셋 Base64              |

실제 import 코드는 `chara-ext-asset_:`와 `chara-ext-asset_` 두 형태를 모두 읽습니다.

### 7.2 `ccv3` 우선

PNG 안에 `chara`와 `ccv3`가 같이 들어있을 수 있으며, 이 경우 `ccv3`가 우선됩니다.

### 7.3 V2/V3 에셋 위치 차이

| 카드 버전 | 메타데이터 위치                                                        |
| --------- | ---------------------------------------------------------------------- |
| V3        | `card.data.assets[]`                                                   |
| V2        | `card.data.extensions.risuai.emotions[]`, `additionalAssets[]`, `vits` |

### 7.4 인코딩

PNG `tEXt` 청크는 Latin1 바이트로 저장되지만, 내용은 보통 `Base64(JSON UTF-8)`입니다.

즉 디코드 순서는 다음처럼 잡는 편이 안전합니다.

```text
Latin1 bytes -> Base64 string -> UTF-8 JSON
```

---

## 8. 주의할 점

- 카드 파싱과 AI 이미지 EXIF 추출은 별개 문제입니다.
- 최신 `.charx` / `.jpg` export 결과물은 `module.risum`도 함께 봐야 합니다.
- PNG 카드는 `ccv3` 우선, `chara` fallback 구조를 가정하는 편이 안전합니다.
- `x_meta/`는 에셋 폴더가 아니라 PNG 메타 보존용 내부 폴더입니다.

---

## 참조

- [gotchas.md](gotchas.md)
- [risum.md](risum.md)
- [CCv3 Spec](https://github.com/kwaroran/character-card-spec-v3)
