# 프로젝트 구조와 동작 지도

이 문서는 `Risu Asset Extractor`가 무엇을 어디서 처리하는지 한 번에 보기 위한 지도다.

## 전체 흐름

```mermaid
flowchart LR
    A["사용자 파일 선택<br/>.charx / .png / .jpg / .risum / .risup"] --> B["src/routes/+page.svelte<br/>형식 감지 + 1차 파싱 호출"]
    B --> C["src/lib/core/formats/*<br/>컨테이너 해석"]
    C --> D["+page.svelte<br/>UI용 데이터 구조로 변환"]
    D --> E["src/lib/components/editor/EditorScreen.svelte<br/>탭 구성"]
    E --> F["Info / Lorebook / Regex / Trigger / Asset / Script"]
    F --> G["다운로드 / 미리보기 / EXIF 확인 / 검색"]
```

## 파일 종류별 처리 경로

```mermaid
flowchart TD
    A["입력 파일"] --> B{"detectInputFormat"}

    B -->|charx| C["parseCharx"]
    B -->|png| D["parsePng"]
    B -->|jpeg| E["parseJpeg"]
    B -->|risum| F["parseRisum"]
    B -->|risup / risupreset| G["parsePresetAuto"]

    C --> H["transformCharxData"]
    D --> H
    E --> H
    F --> I["transformRisumData"]
    G --> J["프리셋 데이터 그대로 사용"]

    H --> K["EditorScreen"]
    I --> K
    J --> K
```

## 폴더 역할

### `src/routes`

```mermaid
flowchart TD
    A["src/routes"] --> B["+page.svelte"]
    B --> C["파일 입력"]
    B --> D["로딩 상태"]
    B --> E["파서 연결"]
```

### `src/lib/core`

```mermaid
flowchart TD
    A["src/lib/core"] --> B["formats<br/>charx, risum, risup, rpack"]
    A --> C["exif<br/>PNG 텍스트 청크, 스텔스 메타데이터"]
    A --> D["regex<br/>Regex 실행기와 디버거"]
    A --> E["trigger<br/>Trigger 실행기와 디버거"]
    A --> F["search<br/>전역 검색 인덱싱"]
    A --> G["types / validation / logger"]
```

### `src/lib/components/editor`

```mermaid
flowchart TD
    A["src/lib/components/editor"] --> B["EditorScreen.svelte<br/>탭 배치와 공통 상태"]
    A --> C["tabs/*.svelte<br/>각 데이터 영역 화면"]
```

### `tests`

```mermaid
flowchart TD
    A["tests"] --> B["파서/검색/트리거/정규식 확인"]
```

### `docs/risupack-format`

```mermaid
flowchart TD
    A["docs/risupack-format"] --> B["포맷 기준 참조본"]
```

## 화면이 데이터를 보는 방식

### 1. 봇 카드 계열

```mermaid
flowchart LR
    A["charx / png / jpeg"] --> B["card + assets + raw"]
    B --> C["transformCharxData"]
    C --> D["cardData"]
    C --> E["lorebook"]
    C --> F["regex"]
    C --> G["trigger"]
    C --> H["assets Map"]
    D --> I["EditorScreen 탭"]
    E --> I
    F --> I
    G --> I
    H --> I
```

### 2. 모듈 계열

```mermaid
flowchart LR
    A["risum"] --> B["module + assets[] + version"]
    B --> C["transformRisumData"]
    C --> D["module"]
    C --> E["assets Map"]
    D --> F["Info / Lorebook / Regex / Trigger / Script"]
    E --> G["Asset"]
```

### 3. 프리셋 계열

```mermaid
flowchart LR
    A["risup / risupreset"] --> B["preset object"]
    B --> C["EditorScreen"]
    C --> D["기본 정보"]
    C --> E["모델 파라미터"]
    C --> F["프롬프트"]
    C --> G["고급 설정"]
```

## 에셋 탭이 맡는 일

```mermaid
flowchart TD
    A["AssetTab.svelte"] --> B["목록 / 갤러리 / 상세 보기"]
    A --> C["지연 로딩 썸네일"]
    A --> D["개별 다운로드 / ZIP 다운로드"]
    A --> E["이름 정리 / 교체 / 삭제 / 중복 찾기"]
    A --> F["이미지 메타데이터 읽기"]
    F --> G["src/lib/core/exif/extract.ts"]
```

## 검색과 디버깅의 위치

```mermaid
flowchart LR
    A["EditorScreen 전역 검색"] --> B["src/lib/core/search/globalSearch.ts"]
    C["Regex 탭"] --> D["src/lib/core/regex/*"]
    E["Trigger 탭"] --> F["src/lib/core/trigger/*"]
    G["로그 스위치"] --> H["src/lib/core/logger.ts"]
```

## 이 저장소를 읽는 순서

1. `src/routes/+page.svelte`
2. `src/lib/components/editor/EditorScreen.svelte`
3. `src/lib/components/editor/tabs/AssetTab.svelte`
4. `src/lib/core/formats/charx.ts`
5. `src/lib/core/formats/risum.ts`
6. `src/lib/core/exif/extract.ts`

## 빠른 요약

```mermaid
flowchart LR
    A["입력 파일"] --> B["formats"]
    B --> C["변환"]
    C --> D["EditorScreen"]
    D --> E["탭별 뷰어"]
    E --> F["검색 / 다운로드 / 메타데이터 확인"]
```
