<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { extractImageMetadata, parsePngTextChunks } from '$lib/core/exif';
  import type { ExtractedMetadata, NAINormalizedMeta } from '$lib/core/exif/types';
  import type { ComfyNormalizedMeta } from '$lib/core/exif/schema/comfyui';
  import ComfyViewerModal from './ComfyViewerModal.svelte';

  export let data: any;

  const dispatch = createEventDispatcher();

  // ===== 가상 스크롤링 / 지연 로딩 설정 =====
  const ITEMS_PER_PAGE = 100;  // 한 번에 표시할 최대 아이템 수
  const LAZY_LOAD_THRESHOLD = 200;  // 스크롤 여유 (px)
  const LAZY_LOADING_ASSET_THRESHOLD = 200;  // 이 개수 이상이면 지연 로딩 사용
  const AUTO_PREVIEW_BYTE_LIMIT = 16 * 1024 * 1024;  // 16MB 이상은 자동 미리보기 비활성화
  
  let currentPage = 0;
  let galleryContainer: HTMLDivElement;
  let isLoadingMore = false;
  
  // 표시할 아이템 수 (가상 스크롤링)
  $: visibleCount = Math.min((currentPage + 1) * ITEMS_PER_PAGE, filteredAssetList.length);
  $: visibleAssets = filteredAssetList.slice(0, visibleCount);
  $: hasMoreItems = visibleCount < filteredAssetList.length;
  
  // 썸네일 로드 상태 (지연 로딩)
  let loadedThumbnails: Set<string> = new Set();
  let thumbnailObserver: IntersectionObserver | null = null;
  
  // 에셋 dataUrl 캐시 (지연 생성용)
  let dataUrlCache: Map<string, string> = new Map();
  
  onMount(() => {
    // Intersection Observer for lazy loading thumbnails
    thumbnailObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const id = (entry.target as HTMLElement).dataset.assetId;
          if (id && !loadedThumbnails.has(id)) {
            loadedThumbnails.add(id);
            loadedThumbnails = loadedThumbnails;  // trigger reactivity
          }
        }
      });
    }, { rootMargin: '100px' });
  });
  
  onDestroy(() => {
    thumbnailObserver?.disconnect();
  });
  
  /**
   * Svelte action: 썸네일 요소가 화면에 보일 때 로드 트리거
   */
  function observeThumbnail(node: HTMLElement, asset: AssetEntry) {
    // 이미 dataUrl이 있거나 로드됐으면 관찰 안함
    if (asset.dataUrl && asset.dataUrl.length > 0) return;
    if (loadedThumbnails.has(asset.id)) return;
    
    if (!thumbnailObserver) {
      // Observer가 없으면 즉시 로드
      loadedThumbnails.add(asset.id);
      loadedThumbnails = loadedThumbnails;
      return;
    }
    
    thumbnailObserver.observe(node);
    
    // 요소가 이미 뷰포트에 있는지 즉시 체크
    requestAnimationFrame(() => {
      const rect = node.getBoundingClientRect();
      const inViewport = rect.top < window.innerHeight + 100 && rect.bottom > -100;
      if (inViewport && !loadedThumbnails.has(asset.id)) {
        loadedThumbnails.add(asset.id);
        loadedThumbnails = loadedThumbnails;
      }
    });
    
    return {
      destroy() {
        thumbnailObserver?.unobserve(node);
      }
    };
  }
  
  // 스크롤 이벤트 핸들러 - 더 많은 아이템 로드
  function handleScroll(e: Event) {
    if (isLoadingMore || !hasMoreItems) return;
    
    const container = e.target as HTMLElement;
    const scrollBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    
    if (scrollBottom < LAZY_LOAD_THRESHOLD) {
      loadMoreItems();
    }
  }
  
  function loadMoreItems() {
    if (isLoadingMore || !hasMoreItems) return;
    isLoadingMore = true;
    
    // 다음 페이지 로드 (약간의 딜레이로 UI 블로킹 방지)
    requestAnimationFrame(() => {
      currentPage++;
      isLoadingMore = false;
    });
  }
  
  // 검색/필터 변경 시 페이지 리셋
  function resetPagination() {
    currentPage = 0;
    loadedThumbnails.clear();
    loadedThumbnails = loadedThumbnails;
  }
  
  /**
   * 지연 로딩: 에셋의 dataUrl을 on-demand로 생성/반환
   * 캐시를 사용하여 중복 생성 방지
   */
  function getAssetDataUrl(asset: AssetEntry): string {
    // 이미 dataUrl이 있으면 반환
    if (asset.dataUrl && asset.dataUrl.length > 0) {
      return asset.dataUrl;
    }
    
    // 캐시 확인
    if (dataUrlCache.has(asset.id)) {
      return dataUrlCache.get(asset.id)!;
    }
    
    // 데이터가 없으면 빈 문자열
    if (!asset.data) {
      console.warn('[getAssetDataUrl] No data for:', asset.id);
      return '';
    }

    if ((asset.size || 0) > AUTO_PREVIEW_BYTE_LIMIT) {
      console.log('[getAssetDataUrl] Skip preview for large asset:', asset.id, asset.size);
      return '';
    }
    
    console.log('[getAssetDataUrl] Generating for:', asset.id, 'dataType:', asset.data?.constructor?.name);
    
    // 데이터에서 dataUrl 생성
    try {
      let dataUrl = '';
      
      if (asset.data instanceof Uint8Array) {
        dataUrl = createDataUrlFromBytes(asset.data, asset.ext);
      } else if (ArrayBuffer.isView(asset.data)) {
        const bytes = new Uint8Array((asset.data as any).buffer);
        dataUrl = createDataUrlFromBytes(bytes, asset.ext);
      } else if (typeof asset.data === 'string') {
        dataUrl = `data:${getMimeType(asset.ext)};base64,${asset.data}`;
      } else if (Array.isArray(asset.data)) {
        const bytes = new Uint8Array(asset.data as unknown as number[]);
        dataUrl = createDataUrlFromBytes(bytes, asset.ext);
      }
      
      console.log('[getAssetDataUrl] Generated:', asset.id, 'urlLen:', dataUrl.length);
      
      // 캐시에 저장
      if (dataUrl) {
        dataUrlCache.set(asset.id, dataUrl);
      }
      
      return dataUrl;
    } catch (e) {
      console.error('[AssetTab] getAssetDataUrl error:', e);
      return '';
    }
  }
  
  /**
   * 썸네일이 화면에 보일 때 dataUrl 로드 요청
   */
  function requestThumbnailLoad(asset: AssetEntry) {
    if (!loadedThumbnails.has(asset.id)) {
      loadedThumbnails.add(asset.id);
      loadedThumbnails = loadedThumbnails; // trigger reactivity
    }
  }

  // Asset 데이터 추출
  $: assetList = getAssetList(data);
  
  // 선택된 항목
  let selectedId = '';
  
  // 뷰 모드: gallery | list | detail
  let viewMode: 'gallery' | 'list' | 'detail' = 'gallery';
  let previousMode: 'gallery' | 'list' = 'gallery';
  
  // EXIF 데이터
  let exifData: ExtractedMetadata | null = null;
  let exifLoading = false;
  let exifError = '';
  
  // 도구 모달 상태
  let showSearchModal = false;
  let searchQuery = '';
  let searchMode: 'name' | 'nai' | 'comfy' = 'name';
  
  // EXIF 캐시 (검색용)
  let exifCache: Map<string, ExtractedMetadata | null> = new Map();
  
  // 검증 결과
  let validationResults: { id: string; name: string; status: 'ok' | 'warn' | 'error'; message: string }[] = [];
  let showValidationModal = false;
  
  // 중복 검사 결과
  let duplicates: Map<string, string[]> = new Map();
  let showDuplicateModal = false;
  
  // ComfyUI 뷰어 모달
  let showComfyViewer = false;
  
  // 파일 input 참조
  let fileInput: HTMLInputElement;
  
  // EXIF 정규화 데이터 추출 헬퍼
  $: naiData = exifData?.modelKind === 'nai' && exifData.normalized && 'charPrompts' in exifData.normalized 
    ? exifData.normalized as NAINormalizedMeta 
    : null;
  $: comfyData = exifData?.modelKind === 'comfy' && exifData.normalized && 'prompt' in exifData.normalized 
    ? exifData.normalized as ComfyNormalizedMeta 
    : null;
  
  // ComfyUI raw 데이터 (normalized 없어도 pngText에서 추출)
  $: comfyRawData = (() => {
    if (comfyData) return comfyData;
    if (exifData?.modelKind === 'comfy' && exifData.pngText) {
      // pngText에서 prompt/workflow 추출
      const promptStr = exifData.pngText['prompt']?.[0];
      const workflowStr = exifData.pngText['workflow']?.[0];
      try {
        const prompt = promptStr ? JSON.parse(promptStr) : null;
        const workflow = workflowStr ? JSON.parse(workflowStr) : null;
        if (prompt || workflow) {
          return {
            positive: '',
            negative: '',
            loras: [],
            prompt: prompt || {},
            workflow,
            raw: { prompt, workflow }
          } as ComfyNormalizedMeta;
        }
      } catch { /* ignore */ }
    }
    return null;
  })();

  interface AssetEntry {
    id: string;
    name: string;
    ext: string;
    type: string;
    data?: string | Uint8Array;
    dataUrl?: string;  // 미리보기용
    size?: number;
  }

  function getAssetList(data: any): AssetEntry[] {
    if (!data) return [];
    
    console.log('[AssetTab] getAssetList called, data.assets:', data.assets);
    console.log('[AssetTab] data.assets instanceof Map:', data.assets instanceof Map);
    
    // risum/charx 모듈 에셋 (새 구조: Map<string, {name, ext, data: Uint8Array, dataUrl?}>)
    if (data.assets && data.assets instanceof Map) {
      const entries = [...data.assets.entries()] as [string, any][];
      const assetCount = entries.length;
      const useLazyLoading = assetCount > LAZY_LOADING_ASSET_THRESHOLD;
      
      console.log('[AssetTab] Map entries count:', assetCount, 'useLazyLoading:', useLazyLoading);
      
      // 첫 번째 에셋 구조 확인
      if (entries.length > 0) {
        const [firstId, firstAsset] = entries[0];
        console.log('[AssetTab] First asset:', {
          id: firstId,
          name: firstAsset.name,
          ext: firstAsset.ext,
          type: firstAsset.type,
          hasData: !!firstAsset.data,
          dataType: firstAsset.data?.constructor?.name,
          dataLength: firstAsset.data?.length,
          isUint8Array: firstAsset.data instanceof Uint8Array,
          isArrayLike: ArrayBuffer.isView(firstAsset.data),
          hasDataUrl: !!firstAsset.dataUrl,
          dataUrlLen: firstAsset.dataUrl?.length,
          dataUrlStart: firstAsset.dataUrl?.slice(0, 50)
        });
      }
      
      const result = entries.map(([id, asset]) => {
        const ext = asset.ext || getExtension(id);
        // 확장자 기반으로 타입 결정 (x-risu-asset 같은 원본 타입 무시)
        const type = getAssetType(ext);
        
        // 실제 파일 포맷 감지 (메타데이터와 다를 수 있음)
        let displayExt = ext;
        if (asset.data) {
          const bytes = asset.data instanceof Uint8Array ? asset.data : 
                        (ArrayBuffer.isView(asset.data) ? new Uint8Array(asset.data.buffer) :
                        (typeof asset.data.length === 'number' ? new Uint8Array(asset.data) : null));
          if (bytes) {
            const detectedFormat = detectImageFormat(bytes);
            if (detectedFormat && detectedFormat !== ext) {
              console.log('[AssetTab] 확장자 불일치 감지 (early):', { 메타: ext, 실제: detectedFormat, id });
              displayExt = detectedFormat;
            }
          }
        }
        
        // 이미 dataUrl이 있으면 사용 (charx 변환에서 미리 계산됨)
        if (asset.dataUrl && asset.dataUrl.length > 0) {
          return {
            id,
            name: asset.name || id,
            ext: displayExt,  // 실제 감지된 확장자 사용
            type,
            data: asset.data,
            dataUrl: asset.dataUrl,
            size: asset.size || (asset.data?.length || 0)
          };
        }
        
        // 대용량 에셋일 때는 dataUrl 생성 건너뛰기 (지연 로딩)
        if (useLazyLoading) {
          const size = asset.data?.length || 0;
          return {
            id,
            name: asset.name || id,
            ext: displayExt,  // 실제 감지된 확장자 사용
            type,
            data: asset.data,
            dataUrl: '', // 나중에 on-demand로 생성
            size
          };
        }
        
        // Uint8Array 또는 ArrayBuffer 체크 (instanceof 대신 duck typing)
        const isArrayLike = asset.data && (
          asset.data instanceof Uint8Array ||
          ArrayBuffer.isView(asset.data) ||
          (typeof asset.data.length === 'number' && typeof asset.data[0] === 'number')
        );
        
        // Uint8Array를 base64로 변환 (magic bytes 감지 사용)
        let dataUrl = '';
        let size = 0;
        
        if (isArrayLike) {
          // 배열 형태를 Uint8Array로 변환
          const bytes = asset.data instanceof Uint8Array ? asset.data : new Uint8Array(asset.data);
          size = bytes.length;
          
          // 실제 파일 포맷 감지 (메타데이터와 다를 수 있음) - 이미 위에서 처리됨
          const detectedFormat = detectImageFormat(bytes);
          if (detectedFormat && detectedFormat !== displayExt) {
            console.log('[AssetTab] 확장자 불일치 감지 (late):', { 메타: ext, 실제: detectedFormat, id });
            displayExt = detectedFormat;
          }
          
          try {
            // AssetGod 방식: magic bytes 우선 감지
            dataUrl = size > AUTO_PREVIEW_BYTE_LIMIT ? '' : createDataUrlFromBytes(bytes, ext);
            console.log('[AssetTab] Blob URL 생성:', { id, ext: displayExt, size, urlLen: dataUrl.length });
          } catch (e) {
            console.error('Asset conversion error:', e);
          }
        } else if (typeof asset.data === 'string') {
          // 이미 base64 문자열
          size = Math.ceil(asset.data.length * 0.75);
          dataUrl = `data:${getMimeType(ext)};base64,${asset.data}`;
        }
        
        return {
          id,
          name: asset.name || id,
          ext: displayExt,  // 실제 감지된 확장자 사용
          type,
          data: asset.data,
          dataUrl,
          size
        };
      });
      
      // 디버그: 첫 3개 에셋 상태 확인
      if (result.length > 0) {
        console.log('[AssetTab] First 3 assets:', result.slice(0, 3).map(a => ({
          id: a.id,
          name: a.name,
          ext: a.ext,
          type: a.type,
          hasData: !!a.data,
          dataUrlLen: a.dataUrl?.length || 0,
          dataUrlStart: a.dataUrl?.slice(0, 50)
        })));
      }
      
      return result;
    }
    
    // 모듈 데이터가 module 필드 안에 있는 경우
    if (data.module?.assets && Array.isArray(data.module.assets)) {
      // module.assets = [[name, path, ext], ...]
      // 실제 데이터는 _rawAssets 또는 assets에 있음
      const rawAssets = data._rawAssets || [];
      
      return data.module.assets.map(([name, , ext]: [string, string, string], i: number) => {
        const id = `${name}.${ext}`;
        const assetData = rawAssets[i];
        let dataUrl = '';
        let size = 0;
        
        if (assetData instanceof Uint8Array) {
          size = assetData.length;
          try {
            // AssetGod 방식: magic bytes 우선 감지
            dataUrl = size > AUTO_PREVIEW_BYTE_LIMIT ? '' : createDataUrlFromBytes(assetData, ext);
          } catch (e) {
            console.error('Asset conversion error:', e);
          }
        }
        
        return {
          id,
          name,
          ext,
          type: getAssetType(ext),
          data: assetData,
          dataUrl,
          size
        };
      });
    }
    
    // Character assets
    if (data.additionalAssets) {
      return data.additionalAssets.map((asset: any) => {
        const ext = getExtension(asset[1] || '');
        const dataUrl = asset[2] ? `data:${getMimeType(ext)};base64,${asset[2]}` : '';
        return {
          id: asset[0] || crypto.randomUUID(),
          name: asset[1] || asset[0],
          ext,
          type: 'image',
          data: asset[2],
          dataUrl,
          size: asset[2] ? Math.ceil(asset[2].length * 0.75) : 0,
        };
      });
    }
    
    return [];
  }
  
  /**
   * AssetGod 방식: magic bytes로 이미지 포맷 감지
   */
  function detectImageFormat(data: Uint8Array): string | null {
    if (!data || data.length < 12) return null;
    
    // PNG: 89 50 4E 47
    if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E && data[3] === 0x47) return 'png';
    
    // JPEG: FF D8 FF
    if (data[0] === 0xFF && data[1] === 0xD8 && data[2] === 0xFF) return 'jpeg';
    
    // GIF: 47 49 46 38
    if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x38) return 'gif';
    
    // WebP: RIFF....WEBP
    if (data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46 &&
        data.length > 11 && data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50) return 'webp';
    
    // AVIF/HEIC: ....ftyp
    if (data.length > 12 && data[4] === 0x66 && data[5] === 0x74 && data[6] === 0x79 && data[7] === 0x70) {
      const brand = String.fromCharCode(data[8], data[9], data[10], data[11]);
      if (brand === 'avif' || brand === 'avis' || brand === 'mif1' || brand === 'heic') return 'avif';
    }
    
    return null;
  }
  
  /**
   * AssetGod 방식: Blob URL 생성 (base64보다 훨씬 효율적)
   */
  function createDataUrlFromBytes(data: Uint8Array, ext: string): string {
    if (!data || data.length === 0) return '';
    
    // 1. magic bytes로 이미지 포맷 감지
    const detectedFormat = detectImageFormat(data);
    
    // 2. MIME 타입 결정
    let mimeType: string;
    if (detectedFormat) {
      const formatMimeMap: Record<string, string> = {
        'png': 'image/png',
        'jpeg': 'image/jpeg',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'avif': 'image/avif'
      };
      mimeType = formatMimeMap[detectedFormat] || 'image/png';
    } else {
      mimeType = getMimeType(ext);
    }
    
    // 3. Blob URL 생성
    try {
      const blob = new Blob([toArrayBuffer(data)], { type: mimeType });
      return URL.createObjectURL(blob);
    } catch (e) {
      console.error('Failed to create blob URL:', e);
      return '';
    }
  }

  function toArrayBuffer(data: Uint8Array): ArrayBuffer {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  }

  function getExtension(name: string): string {
    const match = name.match(/\.([^.]+)$/);
    return match ? match[1].toLowerCase() : '';
  }

  function getAssetType(ext: string): string {
    const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif'];
    const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'm4a'];
    const videoExts = ['mp4', 'webm', 'mkv'];
    
    if (imageExts.includes(ext)) return 'image';
    if (audioExts.includes(ext)) return 'audio';
    if (videoExts.includes(ext)) return 'video';
    return 'other';
  }

  function getMimeType(ext: string): string {
    const mimeMap: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      avif: 'image/avif',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      ogg: 'audio/ogg',
      mp4: 'video/mp4',
      webm: 'video/webm',
    };
    return mimeMap[ext] || 'application/octet-stream';
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function selectAsset(id: string) {
    selectedId = id;
  }
  
  /** 상세 뷰로 전환 (개별 이미지 탭) */
  async function openDetailView(id: string) {
    console.log('[AssetTab] openDetailView 호출:', id);
    previousMode = viewMode === 'detail' ? previousMode : viewMode;
    selectedId = id;
    viewMode = 'detail';
    
    // EXIF 로드 - 이미지 타입이거나 x-risu-asset인 경우 모두 시도
    const asset = assetList.find(a => a.id === id);
    console.log('[AssetTab] 에셋 찾음:', asset ? { id: asset.id, type: asset.type, hasData: !!asset.data } : 'null');
    
    // 이미지 관련 타입 확인 (image, x-risu-asset 등)
    const isImageLike = asset && asset.data && (
      asset.type === 'image' ||
      asset.type === 'x-risu-asset' ||
      ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'].includes(asset.ext?.toLowerCase() || '')
    );
    
    if (isImageLike) {
      await loadExifData(asset);
    } else {
      console.log('[AssetTab] EXIF 로드 건너뜀 - 이미지가 아님');
      exifData = null;
    }
  }
  
  /** 목록/갤러리로 돌아가기 */
  function closeDetailView() {
    viewMode = previousMode;
    exifData = null;
    exifError = '';
  }
  
  /** EXIF 데이터 로드 */
  async function loadExifData(asset: AssetEntry) {
    console.log('[AssetTab] loadExifData 호출:', {
      id: asset.id,
      name: asset.name,
      ext: asset.ext,
      hasData: !!asset.data,
      dataType: asset.data?.constructor?.name,
      dataLength: asset.data instanceof Uint8Array ? asset.data.length : (typeof asset.data === 'string' ? asset.data.length : 0)
    });
    
    exifLoading = true;
    exifError = '';
    exifData = null;
    
    try {
      let buffer: ArrayBuffer;
      
      if (asset.data instanceof Uint8Array) {
        // ArrayBuffer를 명시적으로 복사
        buffer = toArrayBuffer(asset.data);
        console.log('[AssetTab] Uint8Array -> ArrayBuffer:', buffer.byteLength, 'bytes');
      } else if (typeof asset.data === 'string') {
        // base64 -> ArrayBuffer
        const binary = atob(asset.data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        buffer = toArrayBuffer(bytes);
        console.log('[AssetTab] base64 -> ArrayBuffer:', buffer.byteLength, 'bytes');
      } else {
        throw new Error('Unknown data format');
      }
      
      console.log('[AssetTab] extractImageMetadata 호출 시작');
      exifData = await extractImageMetadata(buffer);
      console.log('[AssetTab] extractImageMetadata 결과:', exifData);
    } catch (e) {
      console.error('EXIF extraction error:', e);
      exifError = e instanceof Error ? e.message : 'EXIF 추출 실패';
    } finally {
      exifLoading = false;
    }
  }
  
  // === 도구 함수들 ===
  
  /** 검증: 에셋 무결성 검사 */
  function runValidation() {
    validationResults = [];
    
    for (const asset of assetList) {
      let status: 'ok' | 'warn' | 'error' = 'ok';
      let message = '정상';
      
      // 1. 데이터 존재 확인
      if (!asset.data || (typeof asset.data !== 'string' && !(asset.data instanceof Uint8Array))) {
        status = 'error';
        message = '데이터 없음';
      }
      // 2. 크기 확인
      else if ((asset.size || 0) === 0) {
        status = 'error';
        message = '빈 파일';
      }
      // 3. 이미지 포맷 검증
      else if (asset.type === 'image') {
        const bytes = asset.data instanceof Uint8Array 
          ? asset.data 
          : new Uint8Array([...atob(asset.data)].map(c => c.charCodeAt(0)));
        const detected = detectImageFormat(bytes);
        if (!detected) {
          status = 'warn';
          message = '알 수 없는 이미지 포맷';
        } else if (detected !== asset.ext && !(detected === 'jpeg' && asset.ext === 'jpg')) {
          status = 'warn';
          message = `확장자 불일치: .${asset.ext} → ${detected}`;
        }
      }
      // 4. 확장자 없음
      else if (!asset.ext) {
        status = 'warn';
        message = '확장자 없음';
      }
      
      validationResults.push({
        id: asset.id,
        name: asset.name,
        status,
        message
      });
    }
    
    showValidationModal = true;
  }
  
  /** 확장자 제거: 파일명/ID에서 중복 확장자 정리 */
  function removeExtensions() {
    const newData = structuredClone(data);
    let modified = false;
    let changes: string[] = [];
    
    // 중복 확장자 패턴
    const extPattern = /\.(png|jpg|jpeg|gif|webp|avif|mp3|wav|ogg|mp4|webm|json|txt)(\.(png|jpg|jpeg|gif|webp|avif|mp3|wav|ogg|mp4|webm|json|txt))+$/i;
    
    if (newData.assets && newData.assets instanceof Map) {
      const entriesToProcess = Array.from(newData.assets.entries()) as [string, any][];
      
      for (const [oldId, asset] of entriesToProcess) {
        let nameChanged = false;
        let idChanged = false;
        
        // 1. name에서 중복 확장자 제거
        const oldName = asset.name;
        const newName = oldName.replace(extPattern, (match: string) => {
          const parts = match.split('.');
          return '.' + parts[parts.length - 1];
        });
        
        if (newName !== oldName) {
          asset.name = newName;
          nameChanged = true;
        }
        
        // 2. ID에서 중복 확장자 제거
        const newId = oldId.replace(extPattern, (match: string) => {
          const parts = match.split('.');
          return '.' + parts[parts.length - 1];
        });
        
        if (newId !== oldId) {
          // ID가 변경되면 Map에서 교체
          newData.assets.delete(oldId);
          newData.assets.set(newId, asset);
          idChanged = true;
        }
        
        if (nameChanged || idChanged) {
          const changeDesc = idChanged 
            ? `${oldId} → ${newId}` 
            : `${oldName} → ${newName}`;
          changes.push(changeDesc);
          modified = true;
        }
      }
    }
    
    if (modified) {
      dispatch('change', newData);
      alert(`확장자 정리 완료:\n${changes.slice(0, 10).join('\n')}${changes.length > 10 ? `\n... 외 ${changes.length - 10}개` : ''}`);
    } else {
      alert('정리할 확장자가 없습니다');
    }
  }
  
  /** 중복 정리: 동일 해시 에셋 찾기 */
  async function findDuplicates() {
    duplicates = new Map();
    const hashMap = new Map<string, string[]>();
    
    for (const asset of assetList) {
      if (!asset.data) continue;
      
      // 간단한 해시: 크기 + 첫/끝 바이트
      const bytes = asset.data instanceof Uint8Array 
        ? asset.data 
        : new Uint8Array([...atob(asset.data)].map(c => c.charCodeAt(0)));
      
      const hash = `${bytes.length}-${bytes[0]}-${bytes[bytes.length - 1]}-${bytes[Math.floor(bytes.length / 2)]}`;
      
      if (!hashMap.has(hash)) {
        hashMap.set(hash, []);
      }
      hashMap.get(hash)!.push(asset.id);
    }
    
    // 중복만 필터
    for (const [hash, ids] of hashMap) {
      if (ids.length > 1) {
        duplicates.set(hash, ids);
      }
    }
    
    showDuplicateModal = true;
  }
  
  /** 중복 삭제 (첫 번째만 유지) */
  function removeDuplicate(hash: string) {
    const ids = duplicates.get(hash);
    if (!ids || ids.length < 2) return;
    
    // 첫 번째 제외하고 삭제
    for (let i = 1; i < ids.length; i++) {
      deleteAssetSilent(ids[i]);
    }
    
    duplicates.delete(hash);
    duplicates = duplicates;
  }
  
  function deleteAssetSilent(id: string) {
    const newData = structuredClone(data);

    if (newData.assets && newData.assets instanceof Map) {
      newData.assets.delete(id);
    } else if (newData.additionalAssets) {
      newData.additionalAssets = newData.additionalAssets.filter(
        (asset: any) => asset[0] !== id
      );
    }

    dispatch('change', newData);
  }
  
  /** EXIF 캐시에서 가져오거나 로드 */
  async function getExifFromCache(asset: AssetEntry): Promise<ExtractedMetadata | null> {
    if (exifCache.has(asset.id)) {
      return exifCache.get(asset.id) || null;
    }
    
    try {
      let buffer: ArrayBuffer;
      if (asset.data instanceof Uint8Array) {
        buffer = toArrayBuffer(asset.data);
      } else if (typeof asset.data === 'string') {
        const binary = atob(asset.data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        buffer = toArrayBuffer(bytes);
      } else {
        return null;
      }
      
      const metadata = await extractImageMetadata(buffer);
      exifCache.set(asset.id, metadata);
      return metadata;
    } catch {
      exifCache.set(asset.id, null);
      return null;
    }
  }
  
  /** 태그 정규화 (ExifBased_namer 방식) */
  function normalizeTag(tag: string): string {
    return tag.trim().toLowerCase().replace(/\s+/g, ' ');
  }
  
  /** 검색어가 태그에 매칭되는지 확인 */
  function matchTags(searchTerms: string[], tags: string[]): boolean {
    const normalizedTags = tags.map(normalizeTag);
    return searchTerms.every(term => {
      const normalizedTerm = normalizeTag(term);
      return normalizedTags.some(tag => tag.includes(normalizedTerm));
    });
  }
  
  /** NAI EXIF에서 태그 검색 */
  function searchInNaiMeta(meta: NAINormalizedMeta, searchTerms: string[]): boolean {
    const allTags: string[] = [];
    
    // positive/negative 프롬프트에서 태그 추출
    if (meta.positive) {
      allTags.push(...meta.positive.split(',').map(t => t.trim()).filter(Boolean));
    }
    if (meta.negative) {
      allTags.push(...meta.negative.split(',').map(t => t.trim()).filter(Boolean));
    }
    
    // 캐릭터 프롬프트
    if (meta.charPrompts) {
      for (const char of meta.charPrompts) {
        if (char.caption) {
          allTags.push(...char.caption.split(',').map(t => t.trim()).filter(Boolean));
        }
      }
    }
    
    // 모델명도 검색 대상
    if (meta.model) allTags.push(meta.model);
    if (meta.sampler) allTags.push(meta.sampler);
    
    return matchTags(searchTerms, allTags);
  }
  
  /** ComfyUI EXIF에서 검색 (워크플로우 뷰어 검색과 동일) */
  function searchInComfyMeta(meta: ComfyNormalizedMeta, searchTerms: string[]): boolean {
    const allContent: string[] = [];
    
    // 프롬프트
    if (meta.positive) allContent.push(meta.positive);
    if (meta.negative) allContent.push(meta.negative);
    
    // 모델 정보
    if (meta.checkpoint) allContent.push(meta.checkpoint);
    if (meta.vae) allContent.push(meta.vae);
    if (meta.sampler) allContent.push(meta.sampler);
    if (meta.loras) {
      for (const lora of meta.loras) {
        allContent.push(lora.name);
      }
    }
    
    // 노드에서 검색
    if (meta.prompt) {
      for (const [nodeId, node] of Object.entries(meta.prompt)) {
        allContent.push(node.class_type);
        if (node._meta?.title) allContent.push(node._meta.title);
        if (node.inputs) {
          for (const [key, value] of Object.entries(node.inputs)) {
            if (typeof value === 'string') allContent.push(value);
          }
        }
      }
    }
    
    const combined = allContent.join(' ').toLowerCase();
    return searchTerms.every(term => combined.includes(normalizeTag(term)));
  }
  
  /** 검색 필터링 (EXIF 검색 포함) */
  let filteredAssetList: AssetEntry[] = [];
  let isSearching = false;
  
  // 초기 로드 시 filteredAssetList 설정
  $: if (assetList.length > 0 && filteredAssetList.length === 0 && !searchQuery) {
    filteredAssetList = assetList;
    console.log('[AssetTab] Initial filteredAssetList set:', filteredAssetList.length);
  }
  
  async function updateFilteredList() {
    // 페이지네이션 리셋
    resetPagination();
    
    if (!searchQuery.trim()) {
      filteredAssetList = assetList;
      return;
    }
    
    const query = searchQuery.toLowerCase();
    const searchTerms = query.split(/[,&+]/).map(t => t.trim()).filter(Boolean);
    
    if (searchMode === 'name') {
      // 이름 검색
      filteredAssetList = assetList.filter(a => 
        a.name.toLowerCase().includes(query) || a.id.toLowerCase().includes(query)
      );
    } else {
      // EXIF 검색
      isSearching = true;
      const results: AssetEntry[] = [];
      
      for (const asset of assetList) {
        // 이미지만 검색
        if (!['png', 'jpg', 'jpeg', 'webp', 'avif'].includes(asset.ext)) continue;
        
        const meta = await getExifFromCache(asset);
        if (!meta) continue;
        
        if (searchMode === 'nai' && meta.modelKind === 'nai' && meta.normalized) {
          if (searchInNaiMeta(meta.normalized as NAINormalizedMeta, searchTerms)) {
            results.push(asset);
          }
        } else if (searchMode === 'comfy' && meta.modelKind === 'comfy') {
          // ComfyUI는 normalized 없어도 pngText에서 검색
          const comfyMeta = meta.normalized as ComfyNormalizedMeta | null;
          if (comfyMeta && searchInComfyMeta(comfyMeta, searchTerms)) {
            results.push(asset);
          } else if (meta.pngText) {
            // pngText에서 직접 검색
            const promptStr = meta.pngText['prompt']?.[0] || '';
            const workflowStr = meta.pngText['workflow']?.[0] || '';
            const combined = (promptStr + ' ' + workflowStr).toLowerCase();
            if (searchTerms.every(term => combined.includes(normalizeTag(term)))) {
              results.push(asset);
            }
          }
        }
      }
      
      filteredAssetList = results;
      isSearching = false;
    }
  }
  
  // 검색어/모드 변경 시 필터링
  $: if (searchQuery !== undefined && searchMode !== undefined) {
    updateFilteredList();
  }
  
  // assetList 변경 시 필터링 업데이트
  $: if (assetList) {
    exifCache.clear(); // 캐시 초기화
    updateFilteredList();
  }

  function openFileDialog() {
    fileInput?.click();
  }

  async function handleFileUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files?.length) return;

    for (const file of files) {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1] || '';
        addAsset(file.name, base64);
      };
      reader.readAsDataURL(file);
    }

    input.value = '';
  }

  function addAsset(name: string, base64Data: string) {
    const newData = structuredClone(data);
    const id = crypto.randomUUID();
    const ext = getExtension(name);
    
    // 중복 이름 검사 및 고유 이름 생성
    const uniqueName = generateUniqueName(name);

    if (newData.assets && newData.assets instanceof Map) {
      newData.assets.set(id, { name: uniqueName, ext, data: base64Data });
    } else if (newData.additionalAssets) {
      newData.additionalAssets.push([id, uniqueName, base64Data]);
    } else {
      // 새로 생성
      newData.additionalAssets = [[id, uniqueName, base64Data]];
    }

    dispatch('change', newData);
    selectedId = id;
  }

  function deleteAsset(id: string) {
    if (!confirm('이 에셋을 삭제하시겠습니까?')) return;

    const newData = structuredClone(data);

    if (newData.assets && newData.assets instanceof Map) {
      newData.assets.delete(id);
    } else if (newData.additionalAssets) {
      newData.additionalAssets = newData.additionalAssets.filter(
        (asset: any) => asset[0] !== id
      );
    }

    dispatch('change', newData);
    if (selectedId === id) selectedId = '';
  }

  function downloadAsset(asset: AssetEntry) {
    try {
      const link = document.createElement('a');
      const filename = asset.name.includes('.') ? asset.name : `${asset.name}.${asset.ext}`;
      
      // 1순위: dataUrl이 이미 있으면 사용
      if (asset.dataUrl && asset.dataUrl.length > 0) {
        // Blob URL인 경우 fetch로 변환
        if (asset.dataUrl.startsWith('blob:')) {
          fetch(asset.dataUrl)
            .then(res => res.blob())
            .then(blob => {
              const newUrl = URL.createObjectURL(blob);
              link.href = newUrl;
              link.download = filename;
              link.click();
              setTimeout(() => URL.revokeObjectURL(newUrl), 1000);
            })
            .catch(e => {
              console.error('[AssetTab] Download error:', e);
              alert('다운로드 실패: ' + e.message);
            });
          return;
        }
        // data URL인 경우 바로 사용
        link.href = asset.dataUrl;
        link.download = filename;
        link.click();
        return;
      }
      
      // 2순위: 바이트 데이터 사용
      if (!asset.data) {
        console.error('[AssetTab] No data available for download');
        alert('다운로드 실패: 데이터가 없습니다');
        return;
      }
      
      // Uint8Array 또는 TypedArray 처리
      const isTypedArray = asset.data instanceof Uint8Array || ArrayBuffer.isView(asset.data);
      const isArrayLike = !isTypedArray && 
        typeof asset.data !== 'string' &&
        typeof (asset.data as ArrayLike<number>).length === 'number';
      
      if (isTypedArray) {
        const blob = new Blob([new Uint8Array(asset.data as Uint8Array)], { type: getMimeType(asset.ext) });
        link.href = URL.createObjectURL(blob);
      } else if (isArrayLike) {
        const bytes = new Uint8Array(asset.data as ArrayLike<number>);
        const blob = new Blob([bytes], { type: getMimeType(asset.ext) });
        link.href = URL.createObjectURL(blob);
      } else if (typeof asset.data === 'string') {
        link.href = `data:${getMimeType(asset.ext)};base64,${asset.data}`;
      } else {
        console.error('[AssetTab] Unknown data type for download:', typeof asset.data);
        alert('다운로드 실패: 알 수 없는 데이터 형식');
        return;
      }
      
      link.download = filename;
      link.click();
      
      // Blob URL 정리
      if (link.href.startsWith('blob:')) {
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      }
    } catch (e) {
      console.error('[AssetTab] Download error:', e);
      alert('다운로드 실패: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  // 복수 에셋 선택 상태
  let selectedAssetIds: Set<string> = new Set();
  let isMultiSelectMode = false;

  function toggleMultiSelect() {
    isMultiSelectMode = !isMultiSelectMode;
    if (!isMultiSelectMode) {
      selectedAssetIds.clear();
      selectedAssetIds = selectedAssetIds;
    }
  }

  function toggleAssetSelection(id: string) {
    if (selectedAssetIds.has(id)) {
      selectedAssetIds.delete(id);
    } else {
      selectedAssetIds.add(id);
    }
    selectedAssetIds = selectedAssetIds;
  }

  function selectAllAssets() {
    filteredAssetList.forEach(a => selectedAssetIds.add(a.id));
    selectedAssetIds = selectedAssetIds;
  }

  function deselectAllAssets() {
    selectedAssetIds.clear();
    selectedAssetIds = selectedAssetIds;
  }

  // 다중 에셋 ZIP 다운로드
  async function downloadSelectedAssets() {
    if (selectedAssetIds.size === 0) {
      alert('선택된 에셋이 없습니다.');
      return;
    }
    const assets = assetList.filter(a => selectedAssetIds.has(a.id));
    await downloadAssetsAsZip(assets, 'selected_assets.zip');
  }

  async function downloadAllAssets() {
    if (assetList.length === 0) {
      alert('다운로드할 에셋이 없습니다.');
      return;
    }
    await downloadAssetsAsZip(assetList, 'all_assets.zip');
  }

  // 간단한 ZIP 생성 유틸리티 (라이브러리 없이)
  function createZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
    const localHeaders: Uint8Array[] = [];
    const centralHeaders: Uint8Array[] = [];
    let offset = 0;

    for (const file of files) {
      const nameBytes = new TextEncoder().encode(file.name);
      const crc = crc32(file.data);
      
      // Local file header
      const localHeader = new Uint8Array(30 + nameBytes.length);
      const localView = new DataView(localHeader.buffer);
      localView.setUint32(0, 0x04034b50, true); // signature
      localView.setUint16(4, 20, true); // version needed
      localView.setUint16(6, 0, true); // flags
      localView.setUint16(8, 0, true); // compression (store)
      localView.setUint16(10, 0, true); // mod time
      localView.setUint16(12, 0, true); // mod date
      localView.setUint32(14, crc, true); // crc32
      localView.setUint32(18, file.data.length, true); // compressed size
      localView.setUint32(22, file.data.length, true); // uncompressed size
      localView.setUint16(26, nameBytes.length, true); // filename length
      localView.setUint16(28, 0, true); // extra field length
      localHeader.set(nameBytes, 30);
      
      localHeaders.push(localHeader);
      localHeaders.push(file.data);
      
      // Central directory header
      const centralHeader = new Uint8Array(46 + nameBytes.length);
      const centralView = new DataView(centralHeader.buffer);
      centralView.setUint32(0, 0x02014b50, true); // signature
      centralView.setUint16(4, 20, true); // version made by
      centralView.setUint16(6, 20, true); // version needed
      centralView.setUint16(8, 0, true); // flags
      centralView.setUint16(10, 0, true); // compression
      centralView.setUint16(12, 0, true); // mod time
      centralView.setUint16(14, 0, true); // mod date
      centralView.setUint32(16, crc, true); // crc32
      centralView.setUint32(20, file.data.length, true); // compressed size
      centralView.setUint32(24, file.data.length, true); // uncompressed size
      centralView.setUint16(28, nameBytes.length, true); // filename length
      centralView.setUint16(30, 0, true); // extra field length
      centralView.setUint16(32, 0, true); // comment length
      centralView.setUint16(34, 0, true); // disk number
      centralView.setUint16(36, 0, true); // internal attrs
      centralView.setUint32(38, 0, true); // external attrs
      centralView.setUint32(42, offset, true); // local header offset
      centralHeader.set(nameBytes, 46);
      
      centralHeaders.push(centralHeader);
      offset += localHeader.length + file.data.length;
    }
    
    const centralDirOffset = offset;
    let centralDirSize = 0;
    for (const h of centralHeaders) centralDirSize += h.length;
    
    // End of central directory
    const endRecord = new Uint8Array(22);
    const endView = new DataView(endRecord.buffer);
    endView.setUint32(0, 0x06054b50, true); // signature
    endView.setUint16(4, 0, true); // disk number
    endView.setUint16(6, 0, true); // central dir disk
    endView.setUint16(8, files.length, true); // entries on disk
    endView.setUint16(10, files.length, true); // total entries
    endView.setUint32(12, centralDirSize, true); // central dir size
    endView.setUint32(16, centralDirOffset, true); // central dir offset
    endView.setUint16(20, 0, true); // comment length
    
    // Combine all parts
    const totalSize = offset + centralDirSize + 22;
    const result = new Uint8Array(totalSize);
    let pos = 0;
    for (const part of localHeaders) { result.set(part, pos); pos += part.length; }
    for (const part of centralHeaders) { result.set(part, pos); pos += part.length; }
    result.set(endRecord, pos);
    
    return result;
  }

  // CRC32 계산
  function crc32(data: Uint8Array): number {
    let crc = 0xFFFFFFFF;
    const table = getCrc32Table();
    for (let i = 0; i < data.length; i++) {
      crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xFF];
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  let crc32Table: Uint32Array | null = null;
  function getCrc32Table(): Uint32Array {
    if (crc32Table) return crc32Table;
    crc32Table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      crc32Table[i] = c >>> 0;
    }
    return crc32Table;
  }

  async function downloadAssetsAsZip(assets: AssetEntry[], zipName: string) {
    try {
      const confirmed = confirm(`${assets.length}개의 에셋을 ZIP으로 압축하여 다운로드합니다. 계속하시겠습니까?`);
      if (!confirmed) return;
      
      // 파일 데이터 수집
      const files: { name: string; data: Uint8Array }[] = [];
      
      for (const asset of assets) {
        const filename = asset.name.includes('.') ? asset.name : `${asset.name}.${asset.ext}`;
        let data: Uint8Array | null = null;
        
        // dataUrl에서 데이터 추출
        if (asset.dataUrl && asset.dataUrl.length > 0) {
          if (asset.dataUrl.startsWith('blob:')) {
            try {
              const res = await fetch(asset.dataUrl);
              const blob = await res.blob();
              data = new Uint8Array(await blob.arrayBuffer());
            } catch { continue; }
          } else if (asset.dataUrl.startsWith('data:')) {
            const base64 = asset.dataUrl.split(',')[1];
            if (base64) {
              const binary = atob(base64);
              data = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) data[i] = binary.charCodeAt(i);
            }
          }
        }
        
        // asset.data에서 데이터 추출
        if (!data && asset.data) {
          if (asset.data instanceof Uint8Array) {
            data = asset.data;
          } else if (ArrayBuffer.isView(asset.data)) {
            data = new Uint8Array(asset.data.buffer, asset.data.byteOffset, asset.data.byteLength);
          } else if (typeof asset.data === 'string') {
            const binary = atob(asset.data);
            data = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) data[i] = binary.charCodeAt(i);
          } else if (typeof (asset.data as ArrayLike<number>).length === 'number') {
            data = new Uint8Array(asset.data as ArrayLike<number>);
          }
        }
        
        if (data) {
          files.push({ name: filename, data });
        }
      }
      
      if (files.length === 0) {
        alert('다운로드할 수 있는 에셋이 없습니다.');
        return;
      }
      
      // ZIP 생성 및 다운로드
      const zipData = createZip(files);
      const blob = new Blob([zipData.buffer as ArrayBuffer], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = zipName;
      link.click();
      
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      alert(`${files.length}개의 에셋을 ZIP으로 다운로드 완료!`);
    } catch (e) {
      console.error('[AssetTab] ZIP download error:', e);
      alert('ZIP 다운로드 실패: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  function downloadAssetPromise(asset: AssetEntry): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const link = document.createElement('a');
        const filename = asset.name.includes('.') ? asset.name : `${asset.name}.${asset.ext}`;
        
        if (asset.dataUrl && asset.dataUrl.length > 0) {
          if (asset.dataUrl.startsWith('blob:')) {
            fetch(asset.dataUrl)
              .then(res => res.blob())
              .then(blob => {
                const newUrl = URL.createObjectURL(blob);
                link.href = newUrl;
                link.download = filename;
                link.click();
                setTimeout(() => { URL.revokeObjectURL(newUrl); resolve(); }, 100);
              })
              .catch(reject);
            return;
          }
          link.href = asset.dataUrl;
          link.download = filename;
          link.click();
          resolve();
          return;
        }
        
        if (!asset.data) {
          reject(new Error('No data available'));
          return;
        }
        
        const isTypedArray = asset.data instanceof Uint8Array || ArrayBuffer.isView(asset.data);
        const isArrayLike = !isTypedArray && 
          typeof asset.data !== 'string' &&
          typeof (asset.data as ArrayLike<number>).length === 'number';
        
        if (isTypedArray) {
          const blob = new Blob([new Uint8Array(asset.data as Uint8Array)], { type: getMimeType(asset.ext) });
          link.href = URL.createObjectURL(blob);
        } else if (isArrayLike) {
          const bytes = new Uint8Array(asset.data as ArrayLike<number>);
          const blob = new Blob([bytes], { type: getMimeType(asset.ext) });
          link.href = URL.createObjectURL(blob);
        } else if (typeof asset.data === 'string') {
          link.href = `data:${getMimeType(asset.ext)};base64,${asset.data}`;
        } else {
          reject(new Error('Unknown data type'));
          return;
        }
        
        link.download = filename;
        link.click();
        if (link.href.startsWith('blob:')) {
          setTimeout(() => { URL.revokeObjectURL(link.href); resolve(); }, 100);
        } else {
          resolve();
        }
      } catch (e) {
        reject(e);
      }
    });
  }

  // 이름 중복 검사
  function isNameDuplicate(name: string, excludeId?: string): boolean {
    return assetList.some(a => a.id !== excludeId && a.name.toLowerCase() === name.toLowerCase());
  }

  // 고유한 이름 생성 (중복 시 자동 번호 추가)
  function generateUniqueName(baseName: string, excludeId?: string): string {
    let name = baseName;
    let counter = 1;
    
    // 확장자 분리
    const lastDot = baseName.lastIndexOf('.');
    const nameWithoutExt = lastDot > 0 ? baseName.substring(0, lastDot) : baseName;
    const ext = lastDot > 0 ? baseName.substring(lastDot) : '';
    
    while (isNameDuplicate(name, excludeId)) {
      name = `${nameWithoutExt}_${counter}${ext}`;
      counter++;
    }
    return name;
  }

  // 에셋 이름 변경
  async function renameAsset(assetId: string) {
    const asset = assetList.find(a => a.id === assetId);
    if (!asset) return;
    
    const newName = prompt('새 이름을 입력하세요:', asset.name);
    if (!newName || newName === asset.name) return;
    
    // 중복 검사
    if (isNameDuplicate(newName, assetId)) {
      const useUnique = confirm(`'${newName}' 이름이 이미 존재합니다.\n자동으로 고유한 이름을 생성할까요?`);
      if (useUnique) {
        const uniqueName = generateUniqueName(newName, assetId);
        applyRename(assetId, uniqueName);
      }
      return;
    }
    
    applyRename(assetId, newName);
  }

  function applyRename(assetId: string, newName: string) {
    if (!data.assets || !(data.assets instanceof Map)) return;
    
    const assetData = data.assets.get(assetId);
    if (!assetData) return;
    
    // 확장자 추출
    const lastDot = newName.lastIndexOf('.');
    const ext = lastDot > 0 ? newName.substring(lastDot + 1).toLowerCase() : assetData.ext;
    const cleanName = lastDot > 0 ? newName.substring(0, lastDot) : newName;
    
    // 이름과 확장자 업데이트
    assetData.name = cleanName.includes('.') ? cleanName : `${cleanName}.${ext}`;
    assetData.ext = ext;
    data.assets.set(assetId, assetData);
    
    // 변경 알림 (자동저장)
    dispatch('change', data);
    
    // 뷰 갱신
    assetList = getAssetList(data);
    updateFilteredList();
  }

  // 에셋 교체 (새 파일로 기존 에셋 교체)
  let replaceFileInput: HTMLInputElement;
  let replaceTargetId: string = '';

  function startReplaceAsset(assetId: string) {
    replaceTargetId = assetId;
    replaceFileInput?.click();
  }

  async function handleReplaceFile(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0 || !replaceTargetId) return;
    
    const file = input.files[0];
    if (!data.assets || !(data.assets instanceof Map)) return;
    
    const assetData = data.assets.get(replaceTargetId);
    if (!assetData) return;
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      // 확장자 추출
      const fileName = file.name;
      const lastDot = fileName.lastIndexOf('.');
      const ext = lastDot > 0 ? fileName.substring(lastDot + 1).toLowerCase() : assetData.ext;
      
      // 데이터 업데이트 (이름은 유지, 데이터만 교체)
      assetData.data = uint8Array;
      assetData.ext = ext;
      assetData.size = uint8Array.length;
      
      // dataUrl 재생성
      const mime = getMimeType(ext);
      const blob = new Blob([uint8Array], { type: mime });
      assetData.dataUrl = URL.createObjectURL(blob);
      
      data.assets.set(replaceTargetId, assetData);
      
      // EXIF 캐시 무효화
      exifCache.delete(replaceTargetId);
      
      // 변경 알림 (자동저장)
      dispatch('change', data);
      
      // 뷰 갱신
      assetList = getAssetList(data);
      updateFilteredList();
      
      // 상세뷰에서 교체한 경우 EXIF 재로드
      if (selectedId === replaceTargetId) {
        const asset = assetList.find(a => a.id === replaceTargetId);
        if (asset) {
          loadExifData(asset);
        }
      }
      
      alert('에셋이 교체되었습니다.');
    } catch (e) {
      console.error('[AssetTab] Replace error:', e);
      alert('에셋 교체 실패: ' + (e instanceof Error ? e.message : String(e)));
    }
    
    // 입력 초기화
    input.value = '';
    replaceTargetId = '';
  }

  $: selectedAsset = assetList.find((a) => a.id === selectedId);
  
  // 선택된 에셋의 dataUrl을 on-demand로 준비
  $: selectedAssetUrl = selectedAsset ? getAssetDataUrl(selectedAsset) : '';
</script>

<div class="asset-tab">
  <!-- 상단 툴바 -->
  <div class="toolbar">
    <div class="toolbar-left">
      {#if viewMode === 'detail'}
        <button class="view-btn back-btn" on:click={closeDetailView}>
          ← 돌아가기
        </button>
      {:else}
        <button
          class="view-btn"
          class:active={viewMode === 'gallery'}
          on:click={() => (viewMode = 'gallery')}
        >🖼️ 갤러리</button>
        <button
          class="view-btn"
          class:active={viewMode === 'list'}
          on:click={() => (viewMode = 'list')}
        >📋 목록</button>
      {/if}
    </div>
    
    <div class="toolbar-center">
      <!-- 도구 버튼들 -->
      <button class="tool-btn" on:click={runValidation} title="에셋 무결성 검사">
        ✅ 검증
      </button>
      <button class="tool-btn" on:click={removeExtensions} title="중복 확장자 정리">
        📝 확장자정리
      </button>
      <button class="tool-btn" on:click={findDuplicates} title="중복 에셋 찾기">
        🔍 중복정리
      </button>
      
      <!-- 다운로드 버튼들 -->
      <div class="download-group">
        <button 
          class="tool-btn" 
          class:active={isMultiSelectMode}
          on:click={toggleMultiSelect} 
          title={isMultiSelectMode ? '선택 모드 종료' : '복수 선택 모드'}
        >
          {isMultiSelectMode ? '✓ 선택중' : '☑️ 복수선택'}
        </button>
        {#if isMultiSelectMode}
          <button class="tool-btn" on:click={selectAllAssets} title="전체 선택">전체</button>
          <button class="tool-btn" on:click={deselectAllAssets} title="선택 해제">해제</button>
          <button 
            class="tool-btn download" 
            on:click={downloadSelectedAssets} 
            title="선택 에셋 다운로드"
            disabled={selectedAssetIds.size === 0}
          >
            ⬇️ {selectedAssetIds.size}개
          </button>
        {:else}
          <button class="tool-btn" on:click={downloadAllAssets} title="전체 에셋 다운로드">
            📦 전체 다운
          </button>
        {/if}
      </div>
      
      <div class="search-container">
        <select class="search-mode" bind:value={searchMode} title="검색 모드">
          <option value="name">📁 이름</option>
          <option value="nai">🎨 NAI</option>
          <option value="comfy">🔧 ComfyUI</option>
        </select>
        <div class="search-box">
          <input 
            type="text" 
            placeholder={searchMode === 'name' ? '🔎 검색...' : searchMode === 'nai' ? '🔎 태그 검색 (쉼표로 AND)...' : '🔎 워크플로우 검색...'}
            bind:value={searchQuery}
          />
          {#if isSearching}
            <span class="search-loading">⏳</span>
          {:else if searchQuery}
            <button class="search-clear" on:click={() => searchQuery = ''}>×</button>
          {/if}
        </div>
      </div>
    </div>
    
    <div class="toolbar-right">
      <button class="btn-add" on:click={openFileDialog}>+ 에셋 추가</button>
      <input
        bind:this={fileInput}
        type="file"
        accept="image/*,audio/*,video/*"
        multiple
        hidden
        on:change={handleFileUpload}
      />
      <!-- 에셋 교체용 숨김 인풋 -->
      <input
        bind:this={replaceFileInput}
        type="file"
        accept="image/*,audio/*,video/*"
        hidden
        on:change={handleReplaceFile}
      />
    </div>
  </div>

  <div class="content-area">
    <!-- 상세 뷰 (개별 이미지 탭) -->
    {#if viewMode === 'detail' && selectedAsset}
      <div class="detail-view">
        <div class="detail-image">
          {#if ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp'].includes(selectedAsset.ext) && selectedAssetUrl}
            <img src={selectedAssetUrl} alt={selectedAsset.name} />
          {:else if selectedAsset.type === 'audio' && selectedAssetUrl}
            <audio controls src={selectedAssetUrl}><track kind="captions" /></audio>
          {:else if selectedAsset.type === 'video' && selectedAssetUrl}
            <!-- svelte-ignore a11y-media-has-caption -->
            <video controls src={selectedAssetUrl}></video>
          {:else}
            <div class="no-preview">미리보기 불가</div>
          {/if}
        </div>
        
        <div class="detail-info">
          <div class="detail-header">
            <h3>{selectedAsset.name}</h3>
            <div class="detail-actions">
              <button on:click={() => downloadAsset(selectedAsset)} title="다운로드">⬇️</button>
              <button on:click={() => renameAsset(selectedAsset.id)} title="이름변경">✏️</button>
              <button on:click={() => startReplaceAsset(selectedAsset.id)} title="교체">🔄</button>
              <button on:click={() => { deleteAsset(selectedAsset.id); closeDetailView(); }} title="삭제">🗑️</button>
            </div>
          </div>
          
          <div class="detail-meta">
            <p><strong>ID:</strong> {selectedAsset.id}</p>
            <p><strong>크기:</strong> {formatSize(selectedAsset.size || 0)}</p>
            <p><strong>확장자:</strong> .{selectedAsset.ext}</p>
            <p><strong>타입:</strong> {selectedAsset.type}</p>
          </div>
          
          <!-- EXIF 뷰어 -->
          <div class="exif-section">
            <h4>📷 이미지 메타데이터</h4>
            {#if exifLoading}
              <div class="exif-loading">로딩 중...</div>
            {:else if exifError}
              <div class="exif-error">{exifError}</div>
            {:else if exifData}
              <div class="exif-content">
                <div class="exif-badge model-{exifData.modelKind}">
                  {exifData.modelKind.toUpperCase()}
                </div>
                <p class="exif-reason">{exifData.modelReason}</p>
                
                {#if exifData.normalized}
                  <div class="exif-normalized">
                    {#if naiData}
                      <div class="exif-field">
                        <span class="exif-label">프롬프트:</span>
                        <pre>{naiData.positive || '(없음)'}</pre>
                      </div>
                      <div class="exif-field">
                        <span class="exif-label">네거티브:</span>
                        <pre>{naiData.negative || '(없음)'}</pre>
                      </div>
                      {#if naiData.charPrompts?.length > 0}
                        <div class="exif-field">
                          <span class="exif-label">캐릭터 프롬프트:</span>
                          {#each naiData.charPrompts as char}
                            <div class="char-prompt">
                              <strong>{char.name}</strong>: {char.caption}
                            </div>
                          {/each}
                        </div>
                      {/if}
                      <div class="exif-params">
                        {#if naiData.steps}<span>Steps: {naiData.steps}</span>{/if}
                        {#if naiData.scale}<span>CFG: {naiData.scale}</span>{/if}
                        {#if naiData.sampler}<span>Sampler: {naiData.sampler}</span>{/if}
                        {#if naiData.seed}<span>Seed: {naiData.seed}</span>{/if}
                        {#if naiData.width && naiData.height}<span>Size: {naiData.width}×{naiData.height}</span>{/if}
                      </div>
                    {:else if comfyRawData}
                      <!-- ComfyUI: 모델 정보만 표시 (프롬프트/네거티브는 워크플로우 뷰어에서 확인) -->
                      {#if comfyRawData.checkpoint || comfyRawData.vae || comfyRawData.loras?.length}
                        <div class="exif-field comfy-models">
                          <span class="exif-label">📦 모델:</span>
                          <div class="model-list">
                            {#if comfyRawData.checkpoint}
                              <div class="model-item checkpoint">
                                <span class="model-type">Checkpoint:</span>
                                <span class="model-name">{comfyRawData.checkpoint}</span>
                              </div>
                            {/if}
                            {#if comfyRawData.vae}
                              <div class="model-item vae">
                                <span class="model-type">VAE:</span>
                                <span class="model-name">{comfyRawData.vae}</span>
                              </div>
                            {/if}
                            {#if comfyRawData.loras?.length > 0}
                              {#each comfyRawData.loras as lora}
                                <div class="model-item lora">
                                  <span class="model-type">LoRA:</span>
                                  <span class="model-name">{lora.name}</span>
                                  {#if lora.strength !== undefined}
                                    <span class="model-strength">({lora.strength})</span>
                                  {/if}
                                </div>
                              {/each}
                            {/if}
                          </div>
                        </div>
                      {/if}
                      
                      <!-- 주요 파라미터만 간단히 표시 -->
                      <div class="exif-params">
                        {#if comfyRawData.steps}<span>Steps: {comfyRawData.steps}</span>{/if}
                        {#if comfyRawData.cfg}<span>CFG: {comfyRawData.cfg}</span>{/if}
                        {#if comfyRawData.sampler}<span>Sampler: {comfyRawData.sampler}</span>{/if}
                        {#if comfyRawData.scheduler}<span>Scheduler: {comfyRawData.scheduler}</span>{/if}
                        {#if comfyRawData.seed}<span>Seed: {comfyRawData.seed}</span>{/if}
                        {#if comfyRawData.width && comfyRawData.height}<span>Size: {comfyRawData.width}×{comfyRawData.height}</span>{/if}
                      </div>
                      
                      <!-- 워크플로우 뷰어와 노드 미리보기 -->
                      {#if comfyRawData.prompt && Object.keys(comfyRawData.prompt).length > 0}
                        <button class="open-comfy-viewer" on:click={() => showComfyViewer = true}>
                          🔧 워크플로우 뷰어 열기 ({Object.keys(comfyRawData.prompt).length} nodes)
                        </button>
                        
                        <details class="comfy-nodes">
                          <summary>노드 미리보기</summary>
                          <div class="node-list">
                            {#each Object.entries(comfyRawData.prompt).slice(0, 10) as [nodeId, nodeData]}
                              <div class="node-item">
                                <span class="node-id">#{nodeId}</span>
                                <span class="node-type">{nodeData.class_type}</span>
                                {#if nodeData._meta?.title}
                                  <span class="node-title">({nodeData._meta.title})</span>
                                {/if}
                              </div>
                            {/each}
                            {#if Object.keys(comfyRawData.prompt).length > 10}
                              <div class="node-item more">... 외 {Object.keys(comfyRawData.prompt).length - 10}개</div>
                            {/if}
                          </div>
                        </details>
                      {/if}
                    {/if}
                  </div>
                {/if}
                
                <!-- PNG 텍스트 청크 -->
                {#if Object.keys(exifData.pngText).length > 0}
                  <details class="exif-raw">
                    <summary>PNG 텍스트 청크 ({Object.keys(exifData.pngText).length})</summary>
                    <div class="raw-content">
                      {#each Object.entries(exifData.pngText) as [key, values]}
                        <div class="raw-item">
                          <strong>{key}:</strong>
                          {#each values as val}
                            <pre>{val.slice(0, 500)}{val.length > 500 ? '...' : ''}</pre>
                          {/each}
                        </div>
                      {/each}
                    </div>
                  </details>
                {/if}
              </div>
            {:else}
              <div class="exif-empty">메타데이터 없음</div>
            {/if}
          </div>
        </div>
      </div>
    
    <!-- 갤러리 뷰 (가상 스크롤링 적용) -->
    {:else if viewMode === 'gallery'}
      <div class="gallery-view" bind:this={galleryContainer} on:scroll={handleScroll}>
        {#each visibleAssets as asset, idx (asset.id)}
          {@const isInInitialView = idx < ITEMS_PER_PAGE}
          {@const shouldLoadThumb = isInInitialView || loadedThumbnails.has(asset.id) || (asset.dataUrl && asset.dataUrl.length > 0)}
          {@const thumbUrl = shouldLoadThumb ? getAssetDataUrl(asset) : ''}
          <button
            class="gallery-item"
            class:selected={selectedId === asset.id}
            class:multi-selected={selectedAssetIds.has(asset.id)}
            data-asset-id={asset.id}
            use:observeThumbnail={asset}
            on:click={(e) => {
              if (isMultiSelectMode) {
                e.stopPropagation();
                toggleAssetSelection(asset.id);
              } else {
                selectAsset(asset.id);
              }
            }}
            on:dblclick={() => !isMultiSelectMode && openDetailView(asset.id)}
          >
            {#if isMultiSelectMode}
              <div class="multi-checkbox" class:checked={selectedAssetIds.has(asset.id)}>
                {selectedAssetIds.has(asset.id) ? '✓' : ''}
              </div>
            {/if}
            <div class="gallery-thumb">
              {#if ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp'].includes(asset.ext) && thumbUrl}
                <img
                  src={thumbUrl}
                  alt={asset.name}
                  loading="lazy"
                  decoding="async"
                  on:error={(e) => { 
                    const target = e.currentTarget; 
                    if (target instanceof HTMLElement) target.style.display = 'none'; 
                  }}
                />
              {:else if ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp'].includes(asset.ext) && !shouldLoadThumb}
                <!-- 썸네일 로딩 대기 placeholder -->
                <div class="thumb-placeholder">
                  <span>🖼️</span>
                </div>
              {:else if asset.type === 'audio'}
                <span class="type-icon">🎵</span>
              {:else if asset.type === 'video'}
                <span class="type-icon">🎬</span>
              {:else}
                <span class="type-icon">📄</span>
              {/if}
            </div>
            <span class="gallery-name">{asset.name}</span>
          </button>
        {/each}
        
        {#if hasMoreItems}
          <div class="load-more-indicator">
            {#if isLoadingMore}
              <span>로딩 중...</span>
            {:else}
              <button class="btn-load-more" on:click={loadMoreItems}>
                더 보기 ({visibleCount}/{filteredAssetList.length})
              </button>
            {/if}
          </div>
        {/if}
        
        {#if filteredAssetList.length === 0}
          <div class="empty-gallery">
            {#if searchQuery}
              <p>검색 결과 없음: "{searchQuery}"</p>
            {:else}
              <p>에셋이 없습니다</p>
              <button class="btn-add" on:click={openFileDialog}>+ 에셋 추가</button>
            {/if}
          </div>
        {/if}
      </div>
    {:else}
      <!-- 목록 뷰 -->
      <table class="list-view">
        <thead>
          <tr>
            {#if isMultiSelectMode}
              <th class="checkbox-header">☑</th>
            {/if}
            <th>이름</th>
            <th>타입</th>
            <th>크기</th>
            <th>작업</th>
          </tr>
        </thead>
        <tbody>
          {#each visibleAssets as asset (asset.id)}
            <tr
              class:selected={selectedId === asset.id}
              class:multi-selected={selectedAssetIds.has(asset.id)}
              on:click={(e) => {
                if (isMultiSelectMode) {
                  toggleAssetSelection(asset.id);
                } else {
                  selectAsset(asset.id);
                }
              }}
              on:dblclick={() => !isMultiSelectMode && openDetailView(asset.id)}
            >
              {#if isMultiSelectMode}
                <td class="checkbox-cell">
                  <div class="multi-checkbox" class:checked={selectedAssetIds.has(asset.id)}>
                    {selectedAssetIds.has(asset.id) ? '✓' : ''}
                  </div>
                </td>
              {/if}
              <td class="name-cell">
                <span class="type-badge">{asset.type}</span>
                {asset.name}
              </td>
              <td>.{asset.ext}</td>
              <td>{formatSize(asset.size || 0)}</td>
              <td class="action-cell">
                <button on:click|stopPropagation={() => openDetailView(asset.id)} title="상세 보기">🔍</button>
                <button on:click|stopPropagation={() => downloadAsset(asset)}>⬇️</button>
                <button on:click|stopPropagation={() => renameAsset(asset.id)} title="이름변경">✏️</button>
                <button on:click|stopPropagation={() => startReplaceAsset(asset.id)} title="교체">🔄</button>
                <button on:click|stopPropagation={() => deleteAsset(asset.id)}>🗑️</button>
              </td>
            </tr>
          {/each}
          {#if hasMoreItems}
            <tr class="load-more-row">
              <td colspan="5">
                <button class="btn-load-more" on:click={loadMoreItems}>
                  더 보기 ({visibleCount}/{filteredAssetList.length})
                </button>
              </td>
            </tr>
          {/if}
        </tbody>
      </table>
      
      {#if filteredAssetList.length === 0}
        <div class="empty-list">
          {#if searchQuery}
            검색 결과 없음: "{searchQuery}"
          {:else}
            에셋이 없습니다
          {/if}
        </div>
      {/if}
    {/if}
  </div>

  <!-- 미리보기 패널 (갤러리/목록 모드에서만) -->
  {#if selectedAsset && viewMode !== 'detail'}
    <div class="preview-panel">
      <div class="preview-header">
        <h3>{selectedAsset.name}</h3>
        <div class="preview-actions">
          <button on:click={() => openDetailView(selectedAsset.id)}>🔍 상세</button>
          <button on:click={() => downloadAsset(selectedAsset)}>⬇️ 다운로드</button>
          <button on:click={() => deleteAsset(selectedAsset.id)}>🗑️ 삭제</button>
          <button class="btn-close" on:click={() => selectedId = ''} title="선택 해제">✕ 닫기</button>
        </div>
      </div>
      
      <div class="preview-content">
        {#if ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp'].includes(selectedAsset.ext) && selectedAssetUrl}
          <img
            src={selectedAssetUrl}
            alt={selectedAsset.name}
            on:error={() => console.log('[AssetTab] 상세 이미지 로드 실패:', selectedAsset.id)}
          />
        {:else if selectedAsset.type === 'audio' && selectedAssetUrl}
          <audio controls src={selectedAssetUrl}>
            <track kind="captions" />
          </audio>
        {:else if selectedAsset.type === 'video' && selectedAssetUrl}
          <!-- svelte-ignore a11y-media-has-caption -->
          <video controls src={selectedAssetUrl}></video>
        {:else}
          <div class="no-preview">미리보기 불가</div>
        {/if}
      </div>
      
      <div class="preview-info">
        <p><strong>ID:</strong> {selectedAsset.id}</p>
        <p><strong>크기:</strong> {formatSize(selectedAsset.size || 0)}</p>
        <p><strong>확장자:</strong> .{selectedAsset.ext}</p>
      </div>
    </div>
  {/if}
</div>

<!-- 검증 결과 모달 -->
{#if showValidationModal}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="modal-overlay" on:click={() => showValidationModal = false}>
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div class="modal" on:click|stopPropagation>
      <div class="modal-header">
        <h3>✅ 에셋 검증 결과</h3>
        <button class="modal-close" on:click={() => showValidationModal = false}>×</button>
      </div>
      <div class="modal-body">
        <div class="validation-summary">
          <span class="v-ok">✓ 정상: {validationResults.filter(r => r.status === 'ok').length}</span>
          <span class="v-warn">⚠ 경고: {validationResults.filter(r => r.status === 'warn').length}</span>
          <span class="v-error">✕ 오류: {validationResults.filter(r => r.status === 'error').length}</span>
        </div>
        <table class="validation-table">
          <thead>
            <tr>
              <th>상태</th>
              <th>이름</th>
              <th>메시지</th>
            </tr>
          </thead>
          <tbody>
            {#each validationResults as result}
              <tr class="v-row-{result.status}">
                <td class="v-status">
                  {#if result.status === 'ok'}✓{:else if result.status === 'warn'}⚠{:else}✕{/if}
                </td>
                <td>{result.name}</td>
                <td>{result.message}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </div>
{/if}

<!-- 중복 정리 모달 -->
{#if showDuplicateModal}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="modal-overlay" on:click={() => showDuplicateModal = false}>
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div class="modal" on:click|stopPropagation>
      <div class="modal-header">
        <h3>🔍 중복 에셋</h3>
        <button class="modal-close" on:click={() => showDuplicateModal = false}>×</button>
      </div>
      <div class="modal-body">
        {#if duplicates.size === 0}
          <p class="no-duplicates">중복 에셋이 없습니다 🎉</p>
        {:else}
          <p class="dup-info">동일한 데이터를 가진 에셋 그룹입니다. 첫 번째를 제외하고 삭제할 수 있습니다.</p>
          {#each [...duplicates] as [hash, ids]}
            <div class="dup-group">
              <div class="dup-header">
                <span>그룹 ({ids.length}개)</span>
                <button class="btn-remove-dup" on:click={() => removeDuplicate(hash)}>
                  중복 삭제 (첫 번째 유지)
                </button>
              </div>
              <ul class="dup-list">
                {#each ids as id, i}
                  {@const asset = assetList.find(a => a.id === id)}
                  <li class:keep={i === 0}>
                    {#if i === 0}🔒{:else}🗑️{/if}
                    {asset?.name || id}
                    ({formatSize(asset?.size || 0)})
                  </li>
                {/each}
              </ul>
            </div>
          {/each}
        {/if}
      </div>
    </div>
  </div>
{/if}

<!-- ComfyUI 워크플로우 뷰어 모달 -->
{#if comfyRawData}
  <ComfyViewerModal 
    data={comfyRawData} 
    show={showComfyViewer} 
    on:close={() => showComfyViewer = false}
  />
{/if}

<style>
  .asset-tab {
    display: flex;
    flex-direction: column;
    height: calc(100vh - 200px);
    min-height: 400px;
    gap: 1rem;
  }

  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    background: var(--bg-secondary, #16213e);
    border-radius: 8px;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .toolbar-left,
  .toolbar-right,
  .toolbar-center {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  
  .toolbar-center {
    flex: 1;
    justify-content: center;
  }

  .view-btn {
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border-color, #333);
    border-radius: 4px;
    background: transparent;
    color: var(--text-primary, #eee);
    cursor: pointer;
  }

  .view-btn.active {
    background: var(--primary, #0f3460);
    border-color: var(--primary, #0f3460);
  }
  
  .back-btn {
    background: var(--bg-tertiary, #222);
  }
  
  .tool-btn {
    padding: 0.375rem 0.75rem;
    border: 1px solid var(--border-color, #333);
    border-radius: 4px;
    background: transparent;
    color: var(--text-secondary, #aaa);
    cursor: pointer;
    font-size: 0.75rem;
  }
  
  .tool-btn:hover {
    background: var(--bg-tertiary, #222);
    color: var(--text-primary, #eee);
  }
  
  .tool-btn.active {
    background: #4caf50;
    border-color: #4caf50;
    color: #fff;
  }
  
  .tool-btn.download {
    background: #2196f3;
    border-color: #2196f3;
    color: #fff;
  }
  
  .tool-btn.download:disabled {
    background: var(--bg-tertiary, #333);
    border-color: var(--border-color, #555);
    color: var(--text-secondary, #888);
    cursor: not-allowed;
  }
  
  .download-group {
    display: flex;
    gap: 4px;
    align-items: center;
    padding-left: 8px;
    border-left: 1px solid var(--border-color, #333);
  }
  
  .search-container {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  
  .search-mode {
    padding: 0.375rem 0.5rem;
    border: 1px solid var(--border-color, #333);
    border-radius: 4px;
    background: var(--bg-tertiary, #222);
    color: var(--text-primary, #eee);
    font-size: 0.75rem;
    cursor: pointer;
  }
  
  .search-mode:hover {
    background: var(--bg-secondary, #333);
  }
  
  .search-box {
    position: relative;
    display: flex;
    align-items: center;
  }
  
  .search-box input {
    padding: 0.375rem 1.5rem 0.375rem 0.5rem;
    border: 1px solid var(--border-color, #333);
    border-radius: 4px;
    background: var(--bg-tertiary, #222);
    color: var(--text-primary, #eee);
    width: 180px;
    font-size: 0.75rem;
  }
  
  .search-clear, .search-loading {
    position: absolute;
    right: 4px;
    background: none;
    border: none;
    color: var(--text-secondary, #aaa);
    cursor: pointer;
    padding: 0 4px;
  }
  
  .search-loading {
    cursor: default;
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .btn-add {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 4px;
    background: var(--primary, #0f3460);
    color: white;
    cursor: pointer;
  }

  .content-area {
    flex: 1;
    overflow-y: auto;
    background: var(--bg-secondary, #16213e);
    border-radius: 8px;
    padding: 1rem;
  }

  /* 갤러리 뷰 */
  .gallery-view {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 1rem;
  }

  .gallery-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.75rem;
    border: 2px solid transparent;
    border-radius: 8px;
    background: var(--bg-tertiary, #222);
    cursor: pointer;
    transition: all 0.15s;
  }

  .gallery-item:hover {
    border-color: var(--border-color, #555);
  }

  .gallery-item.selected {
    border-color: var(--primary, #0f3460);
    background: var(--bg-primary, #1a1a2e);
  }

  .gallery-item.multi-selected {
    border-color: #4caf50;
    background: rgba(76, 175, 80, 0.2);
  }

  .multi-checkbox {
    position: absolute;
    top: 4px;
    left: 4px;
    width: 20px;
    height: 20px;
    border: 2px solid var(--border-color, #555);
    border-radius: 4px;
    background: var(--bg-card, #16213e);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    color: #fff;
    z-index: 1;
  }

  .multi-checkbox.checked {
    background: #4caf50;
    border-color: #4caf50;
  }

  .gallery-item {
    position: relative;
  }

  .gallery-thumb {
    width: 80px;
    height: 80px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border-radius: 4px;
    background: #111;
  }

  .gallery-thumb img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }

  .type-icon {
    font-size: 2rem;
  }

  .gallery-name {
    margin-top: 0.5rem;
    font-size: 0.75rem;
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: center;
  }

  .empty-gallery {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 3rem;
    color: var(--text-secondary, #aaa);
  }

  /* 더 보기 버튼 */
  .load-more-indicator {
    grid-column: 1 / -1;
    display: flex;
    justify-content: center;
    padding: 1rem;
  }

  .btn-load-more {
    padding: 0.5rem 1.5rem;
    border: 1px solid var(--primary, #0f3460);
    border-radius: 4px;
    background: transparent;
    color: var(--primary, #4a9eff);
    cursor: pointer;
    font-size: 0.875rem;
    transition: all 0.2s;
  }

  .btn-load-more:hover {
    background: var(--primary, #0f3460);
    color: #fff;
  }

  .load-more-row td {
    text-align: center;
    padding: 1rem;
  }
  
  /* 썸네일 지연 로딩 placeholder */
  .thumb-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    animation: placeholderPulse 1.5s ease-in-out infinite;
  }
  
  .thumb-placeholder span {
    font-size: 1.5rem;
    opacity: 0.5;
  }
  
  @keyframes placeholderPulse {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 0.3; }
  }

  /* 목록 뷰 */
  .list-view {
    width: 100%;
    border-collapse: collapse;
  }

  .list-view th,
  .list-view td {
    padding: 0.75rem;
    text-align: left;
    border-bottom: 1px solid var(--border-color, #333);
  }

  .list-view th {
    font-weight: 600;
    color: var(--text-secondary, #aaa);
    font-size: 0.75rem;
    text-transform: uppercase;
  }

  .list-view tr:hover {
    background: var(--bg-tertiary, #222);
  }

  .list-view tr.selected {
    background: var(--primary, #0f3460);
  }

  .list-view tr.multi-selected {
    background: rgba(76, 175, 80, 0.2);
  }

  .checkbox-cell, .checkbox-header {
    width: 40px;
    text-align: center;
  }

  .checkbox-cell .multi-checkbox {
    position: static;
    display: inline-flex;
    margin: 0 auto;
  }

  .name-cell {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .type-badge {
    padding: 0.125rem 0.5rem;
    border-radius: 4px;
    background: var(--bg-tertiary, #333);
    font-size: 0.75rem;
    text-transform: uppercase;
  }

  .action-cell button {
    padding: 0.25rem 0.5rem;
    border: none;
    background: transparent;
    cursor: pointer;
  }

  .empty-list {
    padding: 3rem;
    text-align: center;
    color: var(--text-secondary, #aaa);
  }

  /* 미리보기 패널 */
  .preview-panel {
    background: var(--bg-secondary, #16213e);
    border-radius: 8px;
    overflow: hidden;
  }

  .preview-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border-color, #333);
  }

  .preview-header h3 {
    margin: 0;
    font-size: 0.875rem;
  }

  .preview-actions {
    display: flex;
    gap: 0.5rem;
  }

  .preview-actions button {
    padding: 0.375rem 0.75rem;
    border: 1px solid var(--border-color, #333);
    border-radius: 4px;
    background: transparent;
    color: var(--text-primary, #eee);
    cursor: pointer;
    font-size: 0.75rem;
  }
  
  .preview-actions button:hover {
    background: var(--bg-tertiary, #222);
  }
  
  .preview-actions .btn-close {
    background: var(--error, #dc3545);
    border-color: var(--error, #dc3545);
    color: white;
  }
  
  .preview-actions .btn-close:hover {
    background: #c82333;
  }

  .preview-content {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 1rem;
    min-height: 150px;
    background: #111;
  }

  .preview-content img {
    max-width: 100%;
    max-height: 300px;
    object-fit: contain;
  }

  .preview-content audio,
  .preview-content video {
    max-width: 100%;
  }

  .no-preview {
    color: var(--text-secondary, #aaa);
  }

  .preview-info {
    padding: 0.75rem 1rem;
    font-size: 0.75rem;
    color: var(--text-secondary, #aaa);
  }

  .preview-info p {
    margin: 0.25rem 0;
  }
  
  /* 상세 뷰 스타일 */
  .detail-view {
    display: grid;
    grid-template-columns: 1fr 350px;
    gap: 1rem;
    height: 100%;
  }
  
  .detail-image {
    display: flex;
    justify-content: center;
    align-items: center;
    background: #111;
    border-radius: 8px;
    overflow: hidden;
  }
  
  .detail-image img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
  
  .detail-info {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    overflow-y: auto;
  }
  
  .detail-header {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .detail-header h3 {
    margin: 0;
    word-break: break-all;
  }
  
  .detail-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  
  .detail-actions button {
    padding: 0.375rem 0.75rem;
    border: 1px solid var(--border-color, #333);
    border-radius: 4px;
    background: transparent;
    color: var(--text-primary, #eee);
    cursor: pointer;
    font-size: 0.75rem;
  }
  
  .detail-meta {
    padding: 0.75rem;
    background: var(--bg-tertiary, #222);
    border-radius: 4px;
    font-size: 0.75rem;
  }
  
  .detail-meta p {
    margin: 0.25rem 0;
  }
  
  /* EXIF 섹션 */
  .exif-section {
    flex: 1;
    overflow-y: auto;
    padding: 0.75rem;
    background: var(--bg-tertiary, #222);
    border-radius: 4px;
  }
  
  .exif-section h4 {
    margin: 0 0 0.75rem;
    font-size: 0.875rem;
  }
  
  .exif-loading,
  .exif-error,
  .exif-empty {
    color: var(--text-secondary, #aaa);
    font-size: 0.75rem;
    padding: 1rem;
    text-align: center;
  }
  
  .exif-error {
    color: #f44336;
  }
  
  .exif-badge {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.625rem;
    font-weight: bold;
    text-transform: uppercase;
    margin-bottom: 0.5rem;
  }
  
  .exif-badge.model-nai {
    background: #7c4dff;
    color: white;
  }
  
  .exif-badge.model-comfy {
    background: #ff9800;
    color: black;
  }
  
  .exif-badge.model-a1111 {
    background: #4caf50;
    color: white;
  }
  
  .exif-badge.model-unknown {
    background: #666;
    color: white;
  }
  
  .exif-reason {
    font-size: 0.625rem;
    color: var(--text-secondary, #aaa);
    margin: 0 0 0.75rem;
  }
  
  .exif-field {
    margin-bottom: 0.75rem;
  }
  
  .exif-field .exif-label {
    display: block;
    font-size: 0.625rem;
    color: var(--text-secondary, #aaa);
    margin-bottom: 0.25rem;
  }
  
  .exif-field pre {
    margin: 0;
    padding: 0.5rem;
    background: var(--bg-primary, #1a1a2e);
    border-radius: 4px;
    font-size: 0.75rem;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 150px;
    overflow-y: auto;
  }
  
  .char-prompt {
    padding: 0.5rem;
    background: var(--bg-primary, #1a1a2e);
    border-radius: 4px;
    margin-bottom: 0.25rem;
    font-size: 0.75rem;
  }
  
  .exif-params {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  
  .exif-params span {
    padding: 0.25rem 0.5rem;
    background: var(--bg-primary, #1a1a2e);
    border-radius: 4px;
    font-size: 0.625rem;
  }
  
  .exif-raw {
    margin-top: 1rem;
  }
  
  .exif-raw summary {
    cursor: pointer;
    font-size: 0.75rem;
    color: var(--text-secondary, #aaa);
  }
  
  .raw-content {
    margin-top: 0.5rem;
    max-height: 200px;
    overflow-y: auto;
  }
  
  .raw-item {
    margin-bottom: 0.5rem;
    font-size: 0.625rem;
  }
  
  .raw-item pre {
    margin: 0.25rem 0 0;
    padding: 0.25rem;
    background: var(--bg-primary, #1a1a2e);
    border-radius: 2px;
    white-space: pre-wrap;
    word-break: break-all;
  }
  
  /* ComfyUI 모델 정보 스타일 */
  .comfy-models .model-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-top: 0.25rem;
  }
  
  .model-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0.5rem;
    background: var(--bg-primary, #1a1a2e);
    border-radius: 4px;
    font-size: 0.75rem;
  }
  
  .model-item.checkpoint .model-type { color: #f0a; }
  .model-item.vae .model-type { color: #0af; }
  .model-item.lora .model-type { color: #fa0; }
  
  .model-type {
    font-weight: bold;
    min-width: 80px;
  }
  
  .model-name {
    color: var(--text-primary, #fff);
    word-break: break-all;
  }
  
  .model-strength {
    color: var(--text-secondary, #888);
    font-size: 0.625rem;
  }
  
  /* ComfyUI 노드 목록 */
  .comfy-nodes {
    margin-top: 1rem;
  }
  
  .comfy-nodes summary {
    cursor: pointer;
    font-size: 0.75rem;
    color: var(--text-secondary, #aaa);
  }
  
  .open-comfy-viewer {
    display: block;
    width: 100%;
    padding: 0.75rem 1rem;
    margin: 0.5rem 0;
    background: linear-gradient(135deg, #4a9eff 0%, #7c3aed 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 0.875rem;
    font-weight: bold;
    cursor: pointer;
    transition: transform 0.1s, box-shadow 0.1s;
  }
  
  .open-comfy-viewer:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(74, 158, 255, 0.4);
  }
  
  .node-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-top: 0.5rem;
    max-height: 200px;
    overflow-y: auto;
  }
  
  .node-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0.5rem;
    background: var(--bg-primary, #1a1a2e);
    border-radius: 4px;
    font-size: 0.625rem;
  }
  
  .node-item.more {
    color: var(--text-secondary, #888);
    font-style: italic;
  }
  
  .node-id {
    color: var(--text-secondary, #888);
    font-family: monospace;
    min-width: 30px;
  }
  
  .node-type {
    color: #0af;
    font-weight: bold;
  }
  
  .node-title {
    color: var(--text-secondary, #888);
    font-style: italic;
  }
  
  /* 모달 스타일 */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }
  
  .modal {
    background: var(--bg-secondary, #16213e);
    border-radius: 8px;
    width: 90%;
    max-width: 600px;
    max-height: 80vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  
  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    border-bottom: 1px solid var(--border-color, #333);
  }
  
  .modal-header h3 {
    margin: 0;
  }
  
  .modal-close {
    background: none;
    border: none;
    color: var(--text-secondary, #aaa);
    font-size: 1.5rem;
    cursor: pointer;
    line-height: 1;
  }
  
  .modal-body {
    padding: 1rem;
    overflow-y: auto;
    flex: 1;
  }
  
  /* 검증 결과 */
  .validation-summary {
    display: flex;
    gap: 1rem;
    margin-bottom: 1rem;
    font-size: 0.875rem;
  }
  
  .v-ok { color: #4caf50; }
  .v-warn { color: #ff9800; }
  .v-error { color: #f44336; }
  
  .validation-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.75rem;
  }
  
  .validation-table th,
  .validation-table td {
    padding: 0.5rem;
    text-align: left;
    border-bottom: 1px solid var(--border-color, #333);
  }
  
  .v-row-ok .v-status { color: #4caf50; }
  .v-row-warn .v-status { color: #ff9800; }
  .v-row-error .v-status { color: #f44336; }
  
  /* 중복 정리 */
  .no-duplicates {
    text-align: center;
    color: var(--text-secondary, #aaa);
    padding: 2rem;
  }
  
  .dup-info {
    font-size: 0.75rem;
    color: var(--text-secondary, #aaa);
    margin-bottom: 1rem;
  }
  
  .dup-group {
    background: var(--bg-tertiary, #222);
    border-radius: 4px;
    margin-bottom: 1rem;
    overflow: hidden;
  }
  
  .dup-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    border-bottom: 1px solid var(--border-color, #333);
  }
  
  .btn-remove-dup {
    padding: 0.25rem 0.5rem;
    border: 1px solid #f44336;
    border-radius: 4px;
    background: transparent;
    color: #f44336;
    cursor: pointer;
    font-size: 0.625rem;
  }
  
  .dup-list {
    list-style: none;
    margin: 0;
    padding: 0.5rem;
  }
  
  .dup-list li {
    padding: 0.375rem 0.5rem;
    font-size: 0.75rem;
  }
  
  .dup-list li.keep {
    color: #4caf50;
  }
</style>
