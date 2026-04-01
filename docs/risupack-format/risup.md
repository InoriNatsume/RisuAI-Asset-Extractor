# 프리셋 포맷 (.risup, .risupreset)

검증 기준 RisuAI 버전: `RisuAI 2026.3.334`

## 1. 개요

| 확장자        | 외부 포장 | 내부 내용                                    |
| ------------- | --------- | -------------------------------------------- |
| `.risup`      | RPack     | Deflate + MsgPack + AES-GCM encrypted preset |
| `.risupreset` | 없음      | Deflate + MsgPack + AES-GCM encrypted preset |

최신 코드 기준 export 결과물은 `.risup`입니다. `.risupreset`은 import 호환 경로로 취급하는 편이 맞습니다.

---

## 2. 처리 체인

### 2.1 `.risup`

```text
읽기:
RPack decode
-> Deflate 해제
-> MsgPack decode
-> AES-GCM 복호화
-> MsgPack decode
-> botPreset

쓰기:
botPreset
-> MsgPack encode
-> AES-GCM 암호화
-> wrapper MsgPack encode
-> Deflate
-> RPack encode
-> .risup
```

### 2.2 `.risupreset`

```text
읽기:
Deflate 해제
-> MsgPack decode
-> AES-GCM 복호화
-> MsgPack decode
-> botPreset
```

---

## 3. 암호화

### 3.1 파라미터

| 항목     | 값                      |
| -------- | ----------------------- |
| 알고리즘 | AES-256-GCM             |
| 키       | `SHA-256("risupreset")` |
| IV       | 12바이트 zero           |

Web Crypto의 AES-GCM 결과에는 auth tag가 포함되므로, 별도 필드라기보다 암호문 결과의 일부로 취급하면 됩니다.

---

## 4. wrapper 구조

Deflate를 풀면 대략 이런 MsgPack 객체가 나옵니다.

```typescript
interface PresetEnvelope {
  presetVersion: 0 | 2;
  type: "preset";
  preset?: Uint8Array;
  pres?: Uint8Array;
}
```

- 최신 export는 `presetVersion: 2`
- import는 `preset`와 `pres` 둘 다 받아들이는 경로가 있습니다.

---

## 5. botPreset 주요 필드

```typescript
interface botPreset {
  name?: string;
  image?: string;
  apiType?: string;
  aiModel?: string;

  temperature: number;
  maxContext: number;
  maxResponse: number;
  frequencyPenalty: number;
  PresensePenalty: number;
  top_p?: number;
  top_k?: number;

  mainPrompt: string;
  jailbreak: string;
  globalNote: string;

  formatingOrder: FormatingOrderItem[];
  promptTemplate?: PromptItem[];
  customPromptTemplateToggle?: string;

  regex?: RegexScript[];
}
```

### 5.1 `PresensePenalty`

오타처럼 보이지만 실제 필드명은 `PresensePenalty`입니다.

### 5.2 promptTemplate

`promptTemplate`가 있으면 구조화된 프롬프트 조합을 쓰고, 없으면 `mainPrompt` / `jailbreak` / `globalNote` 중심의 레거시 경로를 탑니다.

---

## 6. Regex

```typescript
interface RegexScript {
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

## 7. PromptItem

```typescript
type PromptItem =
  | PromptItemPlain
  | PromptItemTyped
  | PromptItemChat
  | PromptItemAuthorNote
  | PromptItemChatML
  | PromptItemCache;
```

### 7.1 PromptItemPlain

```typescript
interface PromptItemPlain {
  type: "plain" | "jailbreak" | "cot";
  type2: "normal" | "globalNote" | "main";
  text: string;
  role: "user" | "bot" | "system";
  name?: string;
}
```

### 7.2 PromptItemTyped

```typescript
interface PromptItemTyped {
  type: "persona" | "description" | "lorebook" | "postEverything" | "memory";
  innerFormat?: string;
  name?: string;
}
```

### 7.3 PromptItemAuthorNote

```typescript
interface PromptItemAuthorNote {
  type: "authornote";
  innerFormat?: string;
  defaultText?: string;
  name?: string;
}
```

### 7.4 PromptItemChat

```typescript
interface PromptItemChat {
  type: "chat";
  rangeStart: number;
  rangeEnd: number | "end";
  chatAsOriginalOnSystem?: boolean;
  name?: string;
}
```

### 7.5 PromptItemChatML

```typescript
interface PromptItemChatML {
  type: "chatML";
  text: string;
  name?: string;
}
```

### 7.6 PromptItemCache

```typescript
interface PromptItemCache {
  type: "cache";
  name: string;
  depth: number;
  role: "user" | "assistant" | "system" | "all";
}
```

---

## 8. FormatingOrderItem

```typescript
type FormatingOrderItem =
  | "main"
  | "jailbreak"
  | "chats"
  | "lorebook"
  | "globalNote"
  | "authorNote"
  | "lastChat"
  | "description"
  | "postEverything"
  | "personaPrompt";
```

---

## 9. 주의할 점

- 최신 export 결과물 이름은 `.risup`입니다.
- `.risup`만 RPack을 한번 더 감쌉니다.
- `customPromptTemplateToggle`와 `promptTemplate`는 최신 프롬프트 조합 경로에 포함됩니다.
- `PresensePenalty` 오타를 자동 교정하면 안 됩니다.

---

## 참조

- [charx.md](charx.md)
- [risum.md](risum.md)
