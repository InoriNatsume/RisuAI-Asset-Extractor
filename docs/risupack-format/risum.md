# 모듈 포맷 (.risum)

검증 기준 RisuAI 버전: `RisuAI 2026.3.334`

## 1. 개요

`.risum`은 로어북, regex, trigger, 에셋을 한 파일에 묶는 RisuAI 모듈 포맷입니다.

---

## 2. 바이너리 구조

```text
byte 0      : 0x6F
byte 1      : 0x00
byte 2..5   : main block length (uint32 LE)
byte 6..    : main block (RPack)

반복:
  marker    : 0x01
  length    : uint32 LE
  payload   : asset block (RPack)

종료:
  0x00
```

### 2.1 의미

- `0x6F 0x00`은 현재 코드에서 쓰는 매직/버전입니다.
- 메인 블록은 RPack으로 감싼 JSON입니다.
- 에셋은 `0x01 + 길이 + RPack payload` 반복으로 이어집니다.
- 마지막 `0x00`이 EOF입니다.

---

## 3. 메인 블록

```typescript
interface RisumMainBlock {
  type: "risuModule";
  module: RisuModule;
}
```

`type`은 항상 `"risuModule"`이어야 합니다.

---

## 4. RisuModule

```typescript
interface RisuModule {
  name: string;
  description: string;
  id: string;
  lorebook?: LoreBookEntry[];
  regex?: CustomScript[];
  trigger?: TriggerScript[];
  cjs?: string;
  assets?: [name: string, path: string, ext: string][];
  namespace?: string;
  lowLevelAccess?: boolean;
  hideIcon?: boolean;
  backgroundEmbedding?: string;
  customModuleToggle?: string;
  mcp?: {
    url: string;
  };
}
```

`assets`의 두 번째 값은 export 시 빈 문자열로 저장될 수 있고, 실제 바이너리 매핑은 배열 순서로 이뤄집니다.

---

## 5. 로어북

```typescript
interface LoreBookEntry {
  key: string;
  secondkey: string;
  selective: boolean;
  comment: string;
  content: string;
  insertorder: number;
  mode: "normal" | "constant" | "folder" | "multiple" | "child";
  alwaysActive: boolean;
  extentions?: {
    risu_case_sensitive?: boolean;
    [key: string]: unknown;
  };
  activationPercent?: number;
  loreCache?: {
    key: string;
    data: string[];
  };
  useRegex?: boolean;
  bookVersion?: number;
  id?: string;
  folder?: string;
}
```

폴더 엔트리의 `key`와, 그 폴더에 속한 일반 엔트리의 `folder`는 카드 포맷과 동일하게 `\uf000folder:<id>` 형식을 씁니다.

즉 폴더 소속 판정은 일반적으로 다음 비교로 이해하면 됩니다.

```text
entry.folder === folderEntry.key
```

---

## 6. Regex

```typescript
interface CustomScript {
  comment: string;
  type:
    | "editinput"
    | "editoutput"
    | "editprocess"
    | "editdisplay"
    | "edittrans";
  in: string;
  out: string;
  flag?: string;
  ableFlag?: boolean;
}
```

---

## 7. Trigger

```typescript
interface TriggerScript {
  comment: string;
  type: "start" | "manual" | "output" | "input" | "display" | "request";
  conditions: TriggerCondition[];
  effect: TriggerEffect[];
  lowLevelAccess?: boolean;
}
```

`conditions`와 `effect`는 union이 크고 자주 확장되므로, `.risum`은 trigger를 구조적으로 해석하기보다 RisuAI의 `triggerscript[]`를 그대로 보존하는 컨테이너로 보는 편이 안전합니다.

---

## 8. 에셋 매핑

에셋은 `module.assets`와 바이너리 블록이 순서대로 대응합니다.

```typescript
[
  ["background", "", "png"], // asset block #0
  ["bgm", "", "mp3"] // asset block #1
];
```

즉 이름으로 블록을 찾는 형식이 아니라 배열 순서가 중요합니다.

---

## 9. 주의할 점

- 헤더는 `0x6F 0x00` 고정으로 보는 편이 맞습니다.
- 메인 블록과 자산 블록 모두 RPack을 거칩니다.
- 로어북은 정규화된 별도 공개 스키마라기보다, 최신 `RisuAI`의 `loreBook[]`를 거의 그대로 담는 쪽에 가깝습니다.
- trigger 구조는 문서보다 실제 코드가 더 큽니다. 세부 union을 고정 명세처럼 박아두면 금방 어긋납니다.

---

## 참조

- [charx.md](charx.md)
- [risup.md](risup.md)
