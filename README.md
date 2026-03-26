# Risu Asset Extractor

Risu Asset Extractor는 RisuAI 파일을 브라우저에서 읽기 전용으로 열어 보는 도구입니다.

이 저장소의 GitHub Pages 주소를 그대로 사용하며, 서버 없이 브라우저 안에서 봇 카드, 모듈, 프리셋, 에셋을 확인하고 다운로드할 수 있습니다.

배포 주소: [https://inorinatsume.github.io/RisuAI-Asset-Extractor/](https://inorinatsume.github.io/RisuAI-Asset-Extractor/)

## 할 수 있는 일

- `.charx`, `.png`, `.jpg`, `.jpeg`, `.risum`, `.risup`, `.risupreset` 열기
- 봇, 모듈, 프리셋 데이터를 브라우저에서 읽기 전용으로 확인
- 내장된 에셋을 목록이나 갤러리 형태로 보기
- 에셋 개별 다운로드 또는 묶음 다운로드
- 이미지 EXIF, PNG 텍스트 청크, NovelAI 스텔스 메타데이터 확인

## 프로젝트 구조

```text
src/
  lib/
    components/   뷰어 UI
    core/         파싱 및 메타데이터 처리
  routes/         브라우저 진입 화면
tests/
  스모크 테스트와 파서 확인용 테스트
```

## 기술 스택

- Svelte 4
- SvelteKit 2
- TypeScript
- Vite
- JSZip
- fflate
- msgpackr

## 로컬 실행

```cmd
npm install
npm run dev
```

Vite가 보여주는 로컬 주소를 연 뒤, 지원되는 파일을 페이지에 드롭하면 됩니다.

## 빌드

```cmd
npm run build
npm run preview
```

프로덕션 빌드는 `RisuAI-Asset-Extractor` GitHub Pages 경로를 기준으로 생성됩니다.

## 주의 사항

- 업로드한 파일은 신뢰하지 않는 입력으로 취급합니다.
- 프로덕션에서는 로그를 최소화합니다.
- 추적되는 파일에는 개인 계정 정보나 불필요한 개인정보를 남기지 않습니다.

## 크레딧

- RisuAI (GPLv3)
  - [https://github.com/kwaroran/RisuAI](https://github.com/kwaroran/RisuAI)
- 챈산 자료
  - 모듈 매니저: [https://arca.live/b/characterai/155936654](https://arca.live/b/characterai/155936654)
    UI, CBS 하이라이트, 자동완성, 유효성 검증 스키마 등 참고
  - 에셋의 신: [https://arca.live/b/characterai/159771658](https://arca.live/b/characterai/159771658)
    에셋 갤러리 뷰, 메타데이터 확장 참고
  - 정리의 신
    CRUD UI 패턴 참고