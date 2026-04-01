# 파싱 함정 및 해결책

검증 기준 RisuAI 버전: `RisuAI 2026.3.334`

포맷 자체를 구현할 때 계속 부딪히는 함정만 모았습니다.

## 1. 봇 카드 PNG와 AI 이미지 PNG는 다르다

봇 카드 PNG는 캐릭터 카드를 담는 컨테이너이고, AI 이미지 PNG는 생성 메타데이터를 담는 이미지입니다.

| 구분      | 봇 카드 PNG                          | AI 이미지 PNG                                 |
| --------- | ------------------------------------ | --------------------------------------------- |
| 핵심 청크 | `chara`, `ccv3`, `chara-ext-asset_*` | `parameters`, `Comment`, `prompt`, `workflow` |
| 목적      | 캐릭터 카드 import/export            | 이미지 메타 확인                              |

둘을 같은 파서로 처리하면 안 됩니다.

---

## 2. PNG는 `ccv3`가 우선이다

같은 PNG 안에 `chara`와 `ccv3`가 같이 들어있을 수 있습니다.

- `ccv3`가 있으면 `ccv3`
- 없으면 `chara`

순서로 보는 편이 안전합니다.

---

## 3. PNG V2와 V3는 에셋 위치가 다르다

| 카드 버전 | 에셋 메타데이터 위치                                                   |
| --------- | ---------------------------------------------------------------------- |
| V3        | `card.data.assets[]`                                                   |
| V2        | `card.data.extensions.risuai.emotions[]`, `additionalAssets[]`, `vits` |

V3만 처리하면 PNG 카드의 에셋이 대량 누락될 수 있습니다.

---

## 4. PNG `tEXt` 청크는 Latin1 바이트 위에 Base64를 얹는다

실제 카드 JSON은 보통 다음 순서로 저장됩니다.

```text
UTF-8 JSON -> Base64 문자열 -> Latin1 바이트로 PNG tEXt 청크 저장
```

읽을 때도 역순으로 풀어야 한글이 깨지지 않습니다.

```text
Latin1 bytes -> Base64 string -> UTF-8 JSON
```

---

## 5. `asset.ext`는 그대로 믿지 않는 편이 낫다

특히 V3의 `x-risu-asset`은 `ext`가 실제 확장자가 아니라 이름처럼 저장되는 경우가 있습니다.

```json
{
  "type": "x-risu-asset",
  "name": "fertilization_success",
  "ext": "fertilization_success"
}
```

`ext`가 이상하면 magic bytes로 실제 포맷을 다시 추정하는 편이 안전합니다.

---

## 6. `x_meta/`는 에셋 폴더가 아니다

`.charx` ZIP 안의 `x_meta/`는 PNG 자산 메타를 보존하는 내부 폴더입니다.

```text
character.charx
├── card.json
├── assets/...
└── x_meta/...
```

에셋 목록을 만들 때 `x_meta/`를 일반 자산으로 취급하면 안 됩니다.

---

## 7. 폴더 엔트리 key와 자식 엔트리 folder는 같은 값을 쓴다

폴더 엔트리의 `key`는 다음 형태로 만들어집니다.

```text
\uf000folder:<folder-id>
```

폴더 안에 들어가는 일반 엔트리의 `folder`도 같은 값을 씁니다.

```text
entry.folder === folderEntry.key
```

즉 다음처럼 이해하면 됩니다.

- 폴더 엔트리 자체 식별: `key`의 `\uf000folder:` 접두사 확인
- 일반 엔트리의 상위 폴더 참조: `folder`에 같은 `\uf000folder:<id>` 값 저장

---

## 8. 에셋 타입은 역할이지 미디어 포맷이 아니다

예를 들어:

- `icon`
- `emotion`
- `x-risu-asset`

이 값들은 용도 구분입니다. 이미지/오디오/비디오 여부는 `ext`나 실제 파일 시그니처를 보고 판단하는 편이 맞습니다.

---

## 9. 에셋 URI는 여러 종류가 있다

최신 코드에서 직접 확인되는 주요 형태는 다음입니다.

| 형식                   | 의미             |
| ---------------------- | ---------------- |
| `ccdefault:`           | 기본 아이콘      |
| `embeded://assets/...` | ZIP 내부 파일    |
| `__asset:N`            | PNG 청크 인덱스  |
| `data:...;base64,...`  | JSON 내장 데이터 |

URI 하나만 가정하고 구현하면 포맷별 에셋 누락이 생기기 쉽습니다.

---

## 10. 최신 `.charx`와 `.jpg`는 `module.risum`도 같이 봐야 한다

최신 export 경로에서는 lorebook, regex, trigger가 카드 JSON 밖의 `module.risum`으로 분리되어 함께 나옵니다.

즉 `card.json`만 읽고 끝내면 동작이 빠진 카드가 됩니다.

---

## 11. 프리셋의 `PresensePenalty`는 오타가 맞지만 실제 필드명이다

```typescript
const penalty = preset.PresensePenalty;
```

자동 교정해서 `PresencePenalty`로 바꾸면 안 됩니다.

---

## 12. `.risup`만 outer RPack이 있다

- `.risup`는 `RPack -> Deflate -> MsgPack -> AES-GCM`
- `.risupreset`은 `Deflate -> MsgPack -> AES-GCM`

두 확장자를 같은 외부 래퍼로 처리하면 import가 틀어집니다.
