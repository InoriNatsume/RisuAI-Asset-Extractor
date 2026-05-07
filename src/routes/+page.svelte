<script lang="ts">
  import { detectInputFormat, parseCharx, parseRisum, parsePresetAuto, parsePng, parseJpeg } from '$lib/core';
  import { debugLog, debugWarn, logger } from '$lib/core/logger';
  import EditorScreen from '$lib/components/editor/EditorScreen.svelte';

  const repositoryUrl = 'https://github.com/InoriNatsume/RisuAI-Asset-Extractor';
  const MAX_INPUT_FILE_BYTES = 512 * 1024 * 1024;

  let fileData: any = null;
  let fileName = '';
  let fileType: 'charx' | 'risum' | 'risup' | 'png' | 'jpeg' | '' = '';
  let originalFileBytes: Uint8Array | null = null;
  let error = '';
  let isDragging = false;
  let loading = false;
  let loadingProgress = 0;  // 로딩 진행률 (0-100)
  let loadingMessage = '';  // 로딩 상태 메시지
  
  // 뷰 모드: 'drop' = 드롭존, 'json' = JSON 뷰어, 'edit' = 편집기
  let viewMode: 'drop' | 'json' | 'edit' = 'drop';
  let fileInputEl: HTMLInputElement | null = null;

  function revokeAssetBlobUrls(source: any): void {
    if (!source?.assets || !(source.assets instanceof Map)) {
      return;
    }

    for (const asset of source.assets.values()) {
      if (asset?.dataUrl && typeof asset.dataUrl === 'string' && asset.dataUrl.startsWith('blob:')) {
        URL.revokeObjectURL(asset.dataUrl);
      }
    }
  }

  /**
   * charx 파싱 결과를 UI용 데이터로 변환
   * ZIP 엔트리 중심 처리 (RisuPack 방식)
   */
  function transformCharxData(result: any): any {
    const { card, assets, raw } = result;
    const cardData = card.data;
    const risuext = cardData?.extensions?.risuai;

    // module.risum 파싱
    let moduleData: any = null;
    const moduleRisumData = assets.get('module.risum') || raw?.['module.risum'];
    if (moduleRisumData) {
      try {
        const parsedModule = parseRisum(moduleRisumData);
        moduleData = parsedModule.module;
      } catch (e) {
        debugWarn('[charx] module.risum 파싱 실패:', e);
      }
    }
    
    // 로어북 변환
    const lorebook: any[] = [];
    const charbook = cardData.character_book;
    if (charbook?.entries) {
      const entries = Array.isArray(charbook.entries) ? charbook.entries : Object.values(charbook.entries);
      for (const book of entries) {
        const isFolder = book.mode === 'folder';
        let entryId = book.id;
        if (isFolder) {
          // 방법 1: 이미 id가 있으면 그것 사용
          // 방법 2: keys에서 \uf000folder:UUID 추출
          if (!entryId && book.keys && book.keys.length > 0) {
            const folderKeyMatch = book.keys[0]?.match?.(/\uf000folder:(.+)/);
            if (folderKeyMatch) {
              entryId = folderKeyMatch[1];
            }
          }
          // 방법 3: name 기반 fallback
          if (!entryId) {
            entryId = `folder-${book.name || book.comment || Math.random().toString(36).slice(2)}`;
          }
        }
        
        lorebook.push({
          id: entryId,
          key: book.keys?.join(', ') ?? '',
          secondkey: book.secondary_keys?.join(', ') ?? '',
          insertorder: book.insertion_order ?? 0,
          comment: book.name ?? book.comment ?? '',
          content: book.content ?? '',
          mode: book.mode || 'normal',
          folder: book.folder,
          alwaysActive: book.constant ?? false,
          selective: book.selective ?? false,
          useRegex: book.use_regex ?? false,
          activationPercent: book.extensions?.risu_activationPercent ?? 100
        });
      }
    }

    // Regex
    let regex = moduleData?.regex ?? [];
    if (!regex || regex.length === 0) regex = risuext?.customScripts ?? [];
    if (!regex || regex.length === 0) regex = cardData?.customscript ?? [];
    if (!regex || regex.length === 0) regex = risuext?.customscripts ?? [];

    // Trigger
    let trigger = moduleData?.trigger ?? [];
    if (!trigger || trigger.length === 0) trigger = risuext?.triggerscript ?? [];
    if (!trigger || trigger.length === 0) trigger = cardData?.triggerscript ?? [];
    
    // ── 에셋: ZIP 엔트리 중심 처리 (RisuPack 방식) ──
    const displayMap = buildAssetDisplayMap(cardData, risuext);
    const assetMap = buildAssetMapFromZipEntries(assets, displayMap);

    debugLog('[charx] assetMap size:', assetMap.size);

    return {
      card,
      cardData,
      lorebook,
      regex,
      trigger,
      assets: assetMap,
      _moduleData: moduleData,
      _raw: raw,
      type: 'charx'
    };
  }

  /**
   * card.json 메타에서 ZIP경로 → 표시정보 맵 생성 (이름표 역할만).
   */
  function buildAssetDisplayMap(
    cardData: any,
    risuext: any
  ): Map<string, { name: string; declaredExt?: string; type?: string }> {
    const result = new Map<string, { name: string; declaredExt?: string; type?: string }>();

    function resolveZipPaths(uri: string): string[] {
      if (!uri || uri.startsWith('ccdefault:') || uri.startsWith('data:') || uri.startsWith('__asset:')) return [];
      if (uri.startsWith('embeded://')) {
        return uniquePaths([normalizeAssetPath(uri.replace('embeded://', ''))]);
      }
      if (uri.startsWith('~risuasset:')) {
        const key = uri.replace('~risuasset:', '');
        if (key.includes('/')) {
          const np = normalizeAssetPath(key);
          return uniquePaths([np, np.replace(/^assets\//, '')]);
        }
        const [hash, ext] = key.split(':');
        if (!hash) return [];
        const nExt = ext ? ext.replace(/^\./, '').toLowerCase() : '';
        return uniquePaths([normalizeAssetPath(hash), hash, ...(nExt ? [normalizeAssetPath(`${hash}.${nExt}`), `${hash}.${nExt}`] : [])].filter(Boolean));
      }
      const fileName = uri.split('/').pop() || uri;
      return uniquePaths([normalizeAssetPath(uri), normalizeAssetPath(fileName)]);
    }

    function normalizeAssetPath(p: string): string {
      const n = p.replace(/\\/g, '/').replace(/^\/+/, '');
      return n.startsWith('assets/') ? n : `assets/${n}`;
    }

    function uniquePaths(paths: string[]): string[] {
      return [...new Set(paths.map(p => p.replace(/\\/g, '/')))];
    }

    const cardAssets = Array.isArray(cardData?.assets) ? cardData.assets : [];
    for (const asset of cardAssets) {
      if (!asset || typeof asset !== 'object') continue;
      for (const resolved of resolveZipPaths(asset.uri || '')) {
        if (!result.has(resolved)) {
          result.set(resolved, {
            name: asset.name || resolved.split('/').pop() || 'asset',
            declaredExt: asset.ext || undefined,
            type: asset.type || undefined
          });
        }
      }
    }

    const additionalAssets = Array.isArray(risuext?.additionalAssets) ? risuext.additionalAssets : [];
    for (const item of additionalAssets) {
      if (!Array.isArray(item) || item.length < 2) continue;
      for (const resolved of resolveZipPaths(item[1] || '')) {
        if (!result.has(resolved)) {
          result.set(resolved, { name: item[0] || resolved.split('/').pop() || 'asset', declaredExt: item[2] || undefined, type: 'image' });
        }
      }
    }

    const emotions = Array.isArray(risuext?.emotions) ? risuext.emotions : [];
    for (const item of emotions) {
      if (!Array.isArray(item) || item.length < 2) continue;
      for (const resolved of resolveZipPaths(item[1] || '')) {
        if (!result.has(resolved)) {
          result.set(resolved, { name: item[0] || resolved.split('/').pop() || 'emotion', declaredExt: 'png', type: 'emotion' });
        }
      }
    }

    return result;
  }

  const KNOWN_MEDIA_EXTS = new Set([
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp',
    'mp3', 'wav', 'ogg', 'm4a', 'mp4', 'webm', 'mov',
    'ttf', 'otf', 'woff', 'woff2', 'css', 'json'
  ]);

  function splitNameAndExt(fileName: string): { name: string; ext: string } {
    const dotIndex = fileName.lastIndexOf('.');
    if (dotIndex <= 0) return { name: fileName, ext: '' };
    const ext = fileName.slice(dotIndex + 1).toLowerCase();
    if (KNOWN_MEDIA_EXTS.has(ext)) return { name: fileName.slice(0, dotIndex), ext };
    return { name: fileName, ext: '' };
  }

  /**
   * ZIP 엔트리를 순회하여 에셋 맵 구성. 이름 충돌 시 _1, _2 자동 추가.
   */
  function buildAssetMapFromZipEntries(
    zipAssets: Map<string, Uint8Array>,
    displayMap: Map<string, { name: string; declaredExt?: string; type?: string }>
  ): Map<string, { id: string; name: string; ext: string; type: string; data: Uint8Array; dataUrl: string; size: number }> {
    const assetMap = new Map<string, { id: string; name: string; ext: string; type: string; data: Uint8Array; dataUrl: string; size: number }>();
    const usedNames = new Map<string, number>();
    const LAZY_THRESHOLD = 200;
    const AUTO_PREVIEW_BYTE_LIMIT = 16 * 1024 * 1024;

    let assetEntryCount = 0;
    for (const path of zipAssets.keys()) {
      if (path.startsWith('assets/')) assetEntryCount++;
    }
    const useLazyLoading = assetEntryCount > LAZY_THRESHOLD;

    for (const [zipPath, data] of zipAssets) {
      if (zipPath === 'card.json' || zipPath === 'module.risum') continue;
      if (zipPath.startsWith('x_meta/') || zipPath.startsWith('x_meta\\')) continue;
      if (!zipPath.startsWith('assets/')) continue;

      const display = displayMap.get(zipPath);
      const rawFileName = zipPath.split('/').pop() || zipPath;
      const { name: baseName, ext: fileExt } = splitNameAndExt(display?.name || rawFileName);

      const detectedExt = detectImageFormat(data);
      const ext = detectedExt || fileExt || display?.declaredExt || '';

      const nameKey = baseName.toLowerCase();
      const count = usedNames.get(nameKey) ?? 0;
      usedNames.set(nameKey, count + 1);
      const displayName = count === 0 ? baseName : `${baseName}_${count}`;

      const type = display?.type ? normalizeAssetType(display.type, ext) : getAssetType(ext);

      assetMap.set(zipPath, {
        id: zipPath,
        name: displayName,
        ext,
        type,
        data,
        dataUrl: useLazyLoading || data.length > AUTO_PREVIEW_BYTE_LIMIT ? '' : createDataUrl(data, ext),
        size: data.length
      });
    }

    return assetMap;
  }

  function normalizeAssetType(rawType: string, ext: string): string {
    const t = rawType.toLowerCase();
    if (['icon', 'emotion', 'background', 'portrait', 'x-risu-asset', 'additional', 'user_icon'].includes(t)) return getAssetType(ext) || 'image';
    if (t === 'audio') return 'audio';
    if (t === 'video') return 'video';
    return getAssetType(ext);
  }

  function getAssetType(ext: string): string {
    const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp'];
    const audioExts = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'];
    const videoExts = ['mp4', 'webm', 'mov', 'avi'];
    if (imageExts.includes(ext)) return 'image';
    if (audioExts.includes(ext)) return 'audio';
    if (videoExts.includes(ext)) return 'video';
    return 'other';
  }

  function detectImageFormat(data: Uint8Array): string | null {
    if (!data || data.length < 12) return null;
    
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E && data[3] === 0x47) return 'png';
    
    // JPEG: FF D8 FF
    if (data[0] === 0xFF && data[1] === 0xD8 && data[2] === 0xFF) return 'jpeg';
    
    // GIF: 47 49 46 38 (GIF8)
    if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x38) return 'gif';
    
    // WebP: RIFF....WEBP (52 49 46 46 ... 57 45 42 50)
    if (data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46 &&
        data.length > 11 && data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50) return 'webp';
    
    // AVIF/HEIC: ....ftyp (offset 4-7 = 66 74 79 70)
    if (data.length > 12 && data[4] === 0x66 && data[5] === 0x74 && data[6] === 0x79 && data[7] === 0x70) {
      const brand = String.fromCharCode(data[8], data[9], data[10], data[11]);
      if (brand === 'avif' || brand === 'avis' || brand === 'mif1' || brand === 'heic') return 'avif';
    }
    
    // BMP: 42 4D
    if (data[0] === 0x42 && data[1] === 0x4D) return 'bmp';
    
    return null;
  }
  
  /**
   * AssetGod 방식: Blob URL 생성 (base64보다 훨씬 효율적)
   * magic bytes 우선, 확장자 폴백으로 MIME 타입 결정
   */
  function createDataUrl(data: Uint8Array, ext: string): string {
    if (!data || data.length === 0) return '';
    
    // SSR 환경 체크 - 브라우저에서만 Blob URL 생성 가능
    if (typeof window === 'undefined' || typeof Blob === 'undefined') {
      debugLog('[createDataUrl] SSR 환경 - 스킵');
      return '';
    }
    
    // 1. magic bytes로 이미지 포맷 감지 시도
    const detectedFormat = detectImageFormat(data);
    
    // 2. MIME 타입 결정 (감지된 포맷 우선, 확장자 폴백)
    let mimeType: string;
    
    if (detectedFormat) {
      const formatMimeMap: Record<string, string> = {
        'png': 'image/png',
        'jpeg': 'image/jpeg',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'avif': 'image/avif',
        'bmp': 'image/bmp'
      };
      mimeType = formatMimeMap[detectedFormat] || 'image/png';
    } else {
      // 확장자 기반 폴백
      const mimeTypes: Record<string, string> = {
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'avif': 'image/avif',
        'bmp': 'image/bmp',
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'ogg': 'audio/ogg',
        'mp4': 'video/mp4',
        'webm': 'video/webm',
        'json': 'application/json',
        'css': 'text/css',
        'ttf': 'font/ttf',
        'otf': 'font/otf',
        'woff': 'font/woff',
        'woff2': 'font/woff2'
      };
      mimeType = mimeTypes[ext] || 'application/octet-stream';
    }
    
    // 3. Blob URL 생성 (AssetGod 방식 - base64보다 효율적)
    try {
      // AssetGod과 동일하게 직접 Uint8Array 전달
      const blob = new Blob([toArrayBuffer(data)], { type: mimeType });
      const url = URL.createObjectURL(blob);
      debugLog('[createDataUrl] 생성됨:', { ext, mimeType, detectedFormat, dataLen: data.length, urlStart: url.slice(0, 50) });
      return url;
    } catch (e) {
      console.error('Failed to create blob URL:', e);
      return '';
    }
  }

  function toArrayBuffer(data: Uint8Array): ArrayBuffer {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  }

  /**
   * risum 파싱 결과를 UI용 데이터로 변환
   */
  function transformRisumData(result: any): any {
    const { module, assets, version } = result;
    
    // 에셋 배열을 Map으로 변환 (module.assets와 매핑)
    const assetMap = new Map<string, { name: string; ext: string; data: Uint8Array }>();
    
    if (module.assets && assets) {
      for (let i = 0; i < module.assets.length && i < assets.length; i++) {
        const [name, , ext] = module.assets[i];
        const id = `${name}.${ext}`;
        assetMap.set(id, {
          name,
          ext,
          data: assets[i]
        });
      }
    }
    
    return {
      // 모듈 데이터
      module,
      // UI용 에셋 맵
      assets: assetMap,
      // 원본 에셋 배열 (export용)
      _rawAssets: assets,
      // 버전
      version,
      // 타입 표시
      type: 'risum'
    };
  }

  async function handleFile(file: File) {
    revokeAssetBlobUrls(fileData);
    loading = true;
    loadingProgress = 0;
    loadingMessage = '파일 읽는 중...';
    error = '';
    fileData = null;
    fileName = file.name;
    fileType = '';

    try {
      if (file.size > MAX_INPUT_FILE_BYTES) {
        throw new Error(`파일이 너무 큽니다. ${Math.round(MAX_INPUT_FILE_BYTES / (1024 * 1024))}MB 이하 파일만 열 수 있습니다.`);
      }

      loadingProgress = 10;
      loadingMessage = '파일 버퍼 생성 중...';
      
      const buffer = await file.arrayBuffer();
      const data = new Uint8Array(buffer);
      originalFileBytes = data;
      const detected = detectInputFormat(data, file.name);
      fileType = detected.displayType;

      logger.info('file', `Loading file: ${file.name} (${detected.kind})`);
      
      loadingProgress = 30;
      loadingMessage = '파일 파싱 중...';

      switch (detected.kind) {
        case 'charx':
          // charx도 변환 필요
          loadingMessage = 'CharX 파싱 중...';
          const charxResult = await parseCharx(data);
          loadingProgress = 60;
          loadingMessage = '에셋 변환 중...';
          // 비동기로 변환하여 UI 블로킹 방지
          await new Promise(r => setTimeout(r, 0));
          fileData = transformCharxData(charxResult);
          break;
        case 'png':
          // PNG 카드 파싱
          loadingMessage = 'PNG 파싱 중...';
          const pngResult = await parsePng(data);
          loadingProgress = 60;
          loadingMessage = '에셋 변환 중...';
          await new Promise(r => setTimeout(r, 0));
          fileData = transformCharxData(pngResult);
          break;
        case 'jpeg':
          // JPEG 카드 (CharX-JPEG) 파싱
          loadingMessage = 'JPEG 파싱 중...';
          const jpegResult = await parseJpeg(data);
          loadingProgress = 60;
          loadingMessage = '에셋 변환 중...';
          await new Promise(r => setTimeout(r, 0));
          fileData = transformCharxData(jpegResult);
          break;
        case 'risum':
          // risum은 변환 필요
          loadingMessage = 'Risum 파싱 중...';
          const risumResult = parseRisum(data);
          loadingProgress = 60;
          loadingMessage = '데이터 변환 중...';
          await new Promise(r => setTimeout(r, 0));
          fileData = transformRisumData(risumResult);
          break;
        case 'risup':
        case 'risupreset':
          loadingMessage = 'Risup 파싱 중...';
          fileData = await parsePresetAuto(data, file.name);
          break;
        default:
          error = `Unsupported file type: ${detected.kind}`;
          logger.error('file', error);
      }
      
      loadingProgress = 90;
      loadingMessage = '완료 중...';

      if (fileData) {
        logger.info('file', `Successfully parsed ${fileType} file`);
        loadingProgress = 100;
        viewMode = 'edit'; // 파싱 후 자동으로 편집 모드로 전환
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unknown error';
      logger.error('file', `Parse error: ${error}`);
    } finally {
      loading = false;
      loadingProgress = 0;
      loadingMessage = '';
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
    const file = e.dataTransfer?.files[0];
    if (file) handleFile(file);
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    isDragging = true;
  }

  function handleDragLeave() {
    isDragging = false;
  }

  function handleFileInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) handleFile(file);
  }

  function handleDropzoneKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInputEl?.click();
    }
  }

  function formatJson(data: any): string {
    // Map과 Uint8Array를 처리하는 replacer
    const replacer = (key: string, value: any) => {
      if (value instanceof Map) {
        const obj: Record<string, string> = {};
        for (const [k, v] of value) {
          if (v instanceof Uint8Array) {
            obj[k] = `[Uint8Array: ${v.length} bytes]`;
          } else {
            obj[k] = v;
          }
        }
        return obj;
      }
      if (value instanceof Uint8Array) {
        return `[Uint8Array: ${value.length} bytes]`;
      }
      // 긴 문자열 자르기
      if (typeof value === 'string' && value.length > 500) {
        return value.slice(0, 500) + '... [truncated]';
      }
      return value;
    };
    
    try {
      return JSON.stringify(data, replacer, 2);
    } catch (e) {
      return `[Error formatting: ${e}]`;
    }
  }

  function renderValue(value: any, depth = 0): string {
    if (value === null) return '<span class="null">null</span>';
    if (value === undefined) return '<span class="undefined">undefined</span>';
    
    const type = typeof value;
    
    if (type === 'string') {
      if (value.length > 100) {
        return `<span class="string">"${escapeHtml(value.slice(0, 100))}..."</span>`;
      }
      return `<span class="string">"${escapeHtml(value)}"</span>`;
    }
    if (type === 'number') return `<span class="number">${value}</span>`;
    if (type === 'boolean') return `<span class="boolean">${value}</span>`;
    
    if (value instanceof Uint8Array) {
      return `<span class="binary">Uint8Array(${value.length} bytes)</span>`;
    }
    
    return escapeHtml(String(value));
  }

  function escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function handleClose() {
    revokeAssetBlobUrls(fileData);
    fileData = null;
    fileName = '';
    fileType = '';
    originalFileBytes = null;
    error = '';
    viewMode = 'drop';
  }

  async function handleDownload(_event: CustomEvent<any>) {
    if (!originalFileBytes || !fileType) return;

    try {
      const blob = new Blob([toArrayBuffer(originalFileBytes)], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      
      logger.info('file', `Downloaded original file: ${fileName}`);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Download failed';
      logger.error('file', `Download error: ${error}`);
    }
  }
</script>

<svelte:head>
  <title>Risu Asset Extractor</title>
</svelte:head>

<!-- 편집기 모드 -->
{#if viewMode === 'edit' && fileData && fileType}
  <EditorScreen
    data={fileData}
    fileType={fileType === 'jpeg' || fileType === 'png' ? 'charx' : fileType}
    {fileName}
    on:close={handleClose}
    on:download={handleDownload}
  />
{:else}
  <!-- 드롭존 모드 -->
  <main>
  <header>
    <a
      class="repo-link"
      href={repositoryUrl}
      target="_blank"
      rel="noreferrer"
      aria-label="Open the GitHub repository"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.85 10.9.57.1.78-.25.78-.56 0-.28-.01-1.19-.02-2.16-3.19.69-3.86-1.35-3.86-1.35-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.24 3.34.95.1-.74.4-1.24.73-1.53-2.55-.29-5.23-1.27-5.23-5.68 0-1.26.45-2.29 1.18-3.09-.12-.29-.51-1.47.11-3.06 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.62 1.59.23 2.77.11 3.06.74.8 1.18 1.83 1.18 3.09 0 4.42-2.69 5.38-5.25 5.66.41.35.78 1.04.78 2.11 0 1.52-.01 2.75-.01 3.13 0 .31.21.67.79.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
      </svg>
      <span>GitHub</span>
    </a>
    <h1>Risu Asset Extractor</h1>
    <p class="subtitle">Read-only viewer for RisuAI cards, modules, presets, and assets</p>
  </header>

  <section 
    class="dropzone"
    class:dragging={isDragging}
    class:has-file={fileData !== null}
    on:drop={handleDrop}
    on:dragover={handleDragOver}
    on:dragleave={handleDragLeave}
    on:keydown={handleDropzoneKeydown}
    role="button"
    tabindex="0"
  >
    {#if loading}
      <div class="loading">
        <div class="spinner"></div>
        <p>{loadingMessage || 'Loading...'}</p>
        {#if loadingProgress > 0}
          <div class="progress-bar">
            <div class="progress-fill" style="width: {loadingProgress}%"></div>
          </div>
          <p class="progress-text">{loadingProgress}%</p>
        {/if}
      </div>
    {:else if !fileData}
      <div class="dropzone-content">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <p>Drop a file here or click to select</p>
        <p class="supported">.charx, .png, .jpg, .risum, .risup</p>
        <input 
          bind:this={fileInputEl}
          type="file" 
          accept=".charx,.png,.jpg,.jpeg,.risum,.risup,.risupreset" 
          on:change={handleFileInput}
        />
      </div>
    {:else}
      <div class="file-info">
        <span class="file-name">{fileName}</span>
        <span class="file-type">{fileType}</span>
      </div>
    {/if}
  </section>

  {#if error}
    <div class="error-panel">
      <h3>Error</h3>
      <pre>{error}</pre>
    </div>
  {/if}
</main>
{/if}

<style>
  main {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
  }

  header {
    position: relative;
    text-align: center;
    margin-bottom: 2rem;
  }

  .repo-link {
    position: absolute;
    top: 0;
    right: 0;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.55rem 0.85rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    color: var(--text-secondary);
    text-decoration: none;
    background: var(--surface);
    transition: border-color 0.2s ease, color 0.2s ease, transform 0.2s ease;
  }

  .repo-link:hover {
    border-color: var(--accent);
    color: var(--text-primary);
    transform: translateY(-1px);
  }

  .repo-link svg {
    width: 1rem;
    height: 1rem;
    fill: currentColor;
    flex: 0 0 auto;
  }

  .repo-link span {
    font-size: 0.875rem;
    font-weight: 600;
  }

  h1 {
    font-size: 2.5rem;
    margin: 0;
    background: linear-gradient(135deg, var(--accent), var(--accent-hover));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .subtitle {
    color: var(--text-muted);
    margin-top: 0.5rem;
  }

  .dropzone {
    border: 2px dashed var(--border);
    border-radius: 12px;
    padding: 3rem;
    text-align: center;
    transition: all 0.2s ease;
    cursor: pointer;
    position: relative;
    background: var(--surface);
  }

  .dropzone:hover,
  .dropzone.dragging {
    border-color: var(--accent);
    background: rgba(99, 102, 241, 0.05);
  }

  .dropzone.has-file {
    border-style: solid;
    cursor: default;
  }

  .dropzone-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  .dropzone-content svg {
    color: var(--text-muted);
    opacity: 0.5;
  }

  .dropzone-content p {
    margin: 0;
    color: var(--text-secondary);
  }

  .supported {
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  .dropzone input[type="file"] {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }

  .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  .progress-bar {
    width: 200px;
    height: 8px;
    background: var(--bg-tertiary, #333);
    border-radius: 4px;
    overflow: hidden;
    margin-top: 0.5rem;
  }
  
  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--accent, #4a9eff), #00c853);
    border-radius: 4px;
    transition: width 0.3s ease;
  }
  
  .progress-text {
    font-size: 0.875rem;
    color: var(--text-secondary, #888);
    margin-top: 0.25rem;
  }

  .file-info {
    display: flex;
    align-items: center;
    gap: 1rem;
    justify-content: center;
  }

  .file-name {
    font-weight: 600;
    color: var(--text-primary);
  }

  .file-type {
    background: var(--accent);
    color: white;
    padding: 0.25rem 0.75rem;
    border-radius: 999px;
    font-size: 0.75rem;
    text-transform: uppercase;
  }

  .error-panel {
    margin-top: 1rem;
    padding: 1rem;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 8px;
  }

  .error-panel h3 {
    margin: 0 0 0.5rem;
    color: #ef4444;
    font-size: 1rem;
  }

  .error-panel pre {
    margin: 0;
    color: #fca5a5;
    font-size: 0.875rem;
    white-space: pre-wrap;
  }

  @media (max-width: 640px) {
    header {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.75rem;
    }

    .repo-link {
      position: static;
      order: -1;
    }
  }

</style>
