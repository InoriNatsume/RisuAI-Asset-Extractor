<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { ComfyNormalizedMeta, ComfyNodeData } from '$lib/core/exif/schema/comfyui';
  
  export let data: ComfyNormalizedMeta;
  export let show = false;
  
  const dispatch = createEventDispatcher();
  
  // 상태
  let currentFilter = 'all';
  let searchQuery = '';
  let idSearch = '';
  let selectedNodeId: string | null = null;
  let selectedTypeFilter: string | null = null;
  
  // 카테고리 키워드 패턴 (더 유연한 매칭)
  const CATEGORY_PATTERNS = {
    model: {
      typePatterns: [
        /checkpoint/i, /loader/i, /lora/i, /unet/i, /vae.*load/i, 
        /efficient.*loader/i, /model.*merge/i, /ckpt/i
      ],
      inputPatterns: [/ckpt_name/i, /model_name/i, /lora_name/i, /vae_name/i],
      valuePatterns: [/\.safetensors/i, /\.ckpt/i, /\.pt\b/i, /\.pth/i, /\.gguf/i]
    },
    sampler: {
      typePatterns: [/ksampler/i, /sampler/i, /facedetailer/i, /scheduler/i],
      inputPatterns: [/sampler_name/i, /scheduler/i, /steps/i, /cfg/i, /denoise/i],
      valuePatterns: []
    },
    prompt: {
      typePatterns: [
        /cliptextencode/i, /text.*prompt/i, /conditioning/i, /string/i,
        /primitive/i, /text.*box/i, /prompt/i
      ],
      inputPatterns: [/text/i, /positive/i, /negative/i, /prompt/i],
      valuePatterns: []
    },
    image: {
      typePatterns: [/loadimage/i, /saveimage/i, /previewimage/i, /image.*scale/i, /upscale/i],
      inputPatterns: [/image/i, /pixels/i],
      valuePatterns: []
    },
    latent: {
      typePatterns: [/emptylatent/i, /latent/i, /vae.*decode/i, /vae.*encode/i],
      inputPatterns: [/latent/i, /samples/i],
      valuePatterns: []
    },
    controlnet: {
      typePatterns: [/controlnet/i, /ipadapter/i, /instant.*id/i],
      inputPatterns: [/control_net/i],
      valuePatterns: []
    },
  };
  
  function getNodeCategory(classType: string, inputs?: Record<string, unknown>): string {
    const inputsStr = inputs ? JSON.stringify(inputs).toLowerCase() : '';
    const inputKeys = inputs ? Object.keys(inputs) : [];
    
    for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
      // class_type 패턴 매칭
      if (patterns.typePatterns.some(p => p.test(classType))) {
        return category;
      }
      
      // input 키 패턴 매칭
      if (patterns.inputPatterns.some(p => inputKeys.some(k => p.test(k)))) {
        return category;
      }
      
      // input 값 패턴 매칭 (모델 파일 등)
      if (patterns.valuePatterns.some(p => p.test(inputsStr))) {
        return category;
      }
    }
    
    return 'other';
  }
  
  function getCategoryColor(cat: string): string {
    const colors: Record<string, string> = {
      model: '#f0a',
      sampler: '#0af',
      prompt: '#fa0',
      latent: '#0fa',
      image: '#af0',
      controlnet: '#a0f',
      other: '#888',
    };
    return colors[cat] || colors.other;
  }
  
  // 노드 목록
  $: nodes = data?.prompt ? Object.entries(data.prompt).map(([id, node]) => ({
    id,
    classType: node.class_type,
    title: node._meta?.title,
    inputs: node.inputs,
    category: getNodeCategory(node.class_type, node.inputs),
    preview: getNodePreview(node.class_type, node.inputs),
  })) : [];
  
  // 노드 미리보기 (주요 값 추출)
  function getNodePreview(classType: string, inputs?: Record<string, unknown>): string {
    if (!inputs) return '';
    
    // 모델 파일명
    const modelKeys = ['ckpt_name', 'model_name', 'lora_name', 'vae_name', 'unet_name'];
    for (const key of modelKeys) {
      if (typeof inputs[key] === 'string') {
        const val = inputs[key] as string;
        // 파일명만 추출
        return val.split(/[\/\\]/).pop() || val;
      }
    }
    
    // 샘플러 정보
    if (inputs.sampler_name || inputs.scheduler) {
      const parts = [];
      if (inputs.sampler_name) parts.push(inputs.sampler_name);
      if (inputs.scheduler) parts.push(inputs.scheduler);
      if (inputs.steps) parts.push(`${inputs.steps}steps`);
      return parts.join(' / ');
    }
    
    // 프롬프트 텍스트
    if (typeof inputs.text === 'string') {
      const text = inputs.text as string;
      return text.length > 50 ? text.slice(0, 50) + '...' : text;
    }
    
    // 이미지 크기
    if (inputs.width && inputs.height) {
      return `${inputs.width}×${inputs.height}`;
    }
    
    return '';
  }
  
  // 타입별 그룹
  $: typeGroups = nodes.reduce((acc, node) => {
    const type = node.classType;
    if (!acc[type]) acc[type] = [];
    acc[type].push(node);
    return acc;
  }, {} as Record<string, typeof nodes>);
  
  // 필터링된 노드
  $: filteredNodes = (() => {
    let result = nodes;
    
    // 카테고리 필터
    if (currentFilter !== 'all' && currentFilter !== 'type') {
      result = result.filter(n => n.category === currentFilter);
    }
    
    // 타입 필터
    if (selectedTypeFilter) {
      result = result.filter(n => n.classType === selectedTypeFilter);
    }
    
    // 검색 필터
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(n => 
        n.classType.toLowerCase().includes(q) ||
        n.title?.toLowerCase().includes(q) ||
        JSON.stringify(n.inputs).toLowerCase().includes(q)
      );
    }
    
    // ID 검색
    if (idSearch) {
      result = result.filter(n => n.id.includes(idSearch));
    }
    
    return result;
  })();
  
  // 선택된 노드
  $: selectedNode = selectedNodeId && data?.prompt 
    ? { id: selectedNodeId, ...data.prompt[selectedNodeId] }
    : null;
  
  function close() {
    dispatch('close');
  }
  
  function selectNode(id: string) {
    selectedNodeId = id;
  }
  
  function formatValue(val: unknown): string {
    if (val === null || val === undefined) return '-';
    if (typeof val === 'string') return val;
    if (typeof val === 'number') return String(val);
    if (typeof val === 'boolean') return val ? 'true' : 'false';
    if (Array.isArray(val)) {
      // 노드 참조 [nodeId, slotIndex]
      if (val.length === 2 && typeof val[0] === 'string') {
        return `→ #${val[0]}`;
      }
      return JSON.stringify(val);
    }
    return JSON.stringify(val, null, 2);
  }
  
  function isNodeRef(val: unknown): val is [string, number] {
    return Array.isArray(val) && val.length === 2 && typeof val[0] === 'string';
  }
  
  function jumpToNode(nodeId: string) {
    selectedNodeId = nodeId;
  }
</script>

<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<!-- svelte-ignore a11y-click-events-have-key-events -->
{#if show}
  <div 
    class="modal-overlay" 
    on:click={close} 
    on:keydown={(e) => e.key === 'Escape' && close()} 
    role="dialog" 
    aria-modal="true"
    tabindex="-1"
  >
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="modal-content" on:click|stopPropagation>
      <div class="modal-header">
        <h2>🔧 ComfyUI 워크플로우 뷰어</h2>
        <button class="close-btn" on:click={close}>✕</button>
      </div>
      
      <div class="modal-body">
        <!-- 왼쪽: 노드 목록 -->
        <div class="node-panel">
          <div class="panel-header">
            <div class="meta-info">
              {nodes.length} Nodes
            </div>
            
            <!-- 필터 버튼 -->
            <div class="filter-buttons">
              <button 
                class:active={currentFilter === 'all'} 
                on:click={() => { currentFilter = 'all'; selectedTypeFilter = null; }}
              >All</button>
              <button 
                class:active={currentFilter === 'type'} 
                on:click={() => { currentFilter = 'type'; selectedTypeFilter = null; }}
              >Type</button>
              <button 
                class:active={currentFilter === 'model'} 
                on:click={() => currentFilter = 'model'}
              >Model</button>
              <button 
                class:active={currentFilter === 'sampler'} 
                on:click={() => currentFilter = 'sampler'}
              >Sampler</button>
              <button 
                class:active={currentFilter === 'prompt'} 
                on:click={() => currentFilter = 'prompt'}
              >Prompt</button>
              <button 
                class:active={currentFilter === 'image'} 
                on:click={() => currentFilter = 'image'}
              >Image</button>
            </div>
            
            <!-- 검색 -->
            <div class="search-row">
              <input 
                type="text" 
                placeholder="Search nodes..." 
                bind:value={searchQuery}
              />
              <input 
                type="text" 
                placeholder="ID" 
                bind:value={idSearch}
                class="id-search"
              />
            </div>
          </div>
          
          <div class="node-list">
            {#if currentFilter === 'type' && !selectedTypeFilter}
              <!-- 타입 그룹 목록 -->
              {#each Object.entries(typeGroups).sort((a, b) => b[1].length - a[1].length) as [typeName, typeNodes]}
                {#if !searchQuery || typeName.toLowerCase().includes(searchQuery.toLowerCase())}
                  <button 
                    class="type-group-item"
                    on:click={() => selectedTypeFilter = typeName}
                  >
                    <span class="type-name">{typeName}</span>
                    <span class="type-count">{typeNodes.length}</span>
                  </button>
                {/if}
              {/each}
            {:else}
              <!-- 노드 목록 -->
              {#if selectedTypeFilter}
                <button class="back-btn" on:click={() => selectedTypeFilter = null}>
                  ← Back ({selectedTypeFilter})
                </button>
              {/if}
              
              {#each filteredNodes as node}
                <button 
                  class="node-item"
                  class:selected={selectedNodeId === node.id}
                  style="--cat-color: {getCategoryColor(node.category)}"
                  on:click={() => selectNode(node.id)}
                >
                  <div class="node-head">
                    <span class="node-type">{node.classType}</span>
                    <span class="node-id">#{node.id}</span>
                  </div>
                  {#if node.title}
                    <div class="node-title">{node.title}</div>
                  {/if}
                  {#if node.preview}
                    <div class="node-preview">{node.preview}</div>
                  {/if}
                </button>
              {:else}
                <div class="empty-msg">결과 없음</div>
              {/each}
            {/if}
          </div>
        </div>
        
        <!-- 오른쪽: 노드 상세 -->
        <div class="detail-panel">
          {#if selectedNode}
            <div class="detail-card">
              <h3 class="detail-title">{selectedNode.class_type}</h3>
              <div class="detail-subtitle">
                ID: {selectedNode.id}
                {#if selectedNode._meta?.title}
                  • {selectedNode._meta.title}
                {/if}
              </div>
              
              <h4>입력값 (Inputs)</h4>
              <div class="inputs-list">
                {#each Object.entries(selectedNode.inputs || {}) as [key, val]}
                  <div class="input-row">
                    <span class="input-label">{key}</span>
                    {#if isNodeRef(val)}
                      <button class="node-ref" on:click={() => jumpToNode(val[0])}>
                        → #{val[0]} (slot {val[1]})
                      </button>
                    {:else}
                      <span class="input-value">{formatValue(val)}</span>
                    {/if}
                  </div>
                {:else}
                  <div class="empty-msg">입력값 없음</div>
                {/each}
              </div>
              
              <!-- Raw JSON -->
              <details class="raw-json">
                <summary>Raw JSON</summary>
                <pre>{JSON.stringify(selectedNode, null, 2)}</pre>
              </details>
            </div>
          {:else}
            <div class="empty-detail">
              <p>👈 왼쪽에서 노드를 선택하세요</p>
            </div>
          {/if}
        </div>
      </div>
      
      <!-- 하단: 요약 정보 -->
      <div class="modal-footer">
        <div class="summary">
          {#if data.checkpoint}
            <span class="summary-item">📦 {data.checkpoint}</span>
          {/if}
          {#if data.sampler}
            <span class="summary-item">🎲 {data.sampler}</span>
          {/if}
          {#if data.steps}
            <span class="summary-item">Steps: {data.steps}</span>
          {/if}
          {#if data.cfg}
            <span class="summary-item">CFG: {data.cfg}</span>
          {/if}
          {#if data.seed}
            <span class="summary-item">Seed: {data.seed}</span>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.85);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 2000;
  }
  
  .modal-content {
    width: 95vw;
    height: 90vh;
    max-width: 1400px;
    background: var(--bg-secondary, #16213e);
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  
  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--border-color, #333);
    background: var(--bg-primary, #1a1a2e);
  }
  
  .modal-header h2 {
    margin: 0;
    font-size: 1.25rem;
    color: var(--text-primary, #fff);
  }
  
  .close-btn {
    background: none;
    border: none;
    color: var(--text-secondary, #aaa);
    font-size: 1.5rem;
    cursor: pointer;
    padding: 0.25rem 0.5rem;
  }
  
  .close-btn:hover {
    color: var(--text-primary, #fff);
  }
  
  .modal-body {
    flex: 1;
    display: flex;
    overflow: hidden;
  }
  
  /* 왼쪽 패널 */
  .node-panel {
    width: 400px;
    border-right: 1px solid var(--border-color, #333);
    display: flex;
    flex-direction: column;
    background: var(--bg-primary, #1a1a2e);
  }
  
  .panel-header {
    padding: 0.75rem;
    border-bottom: 1px solid var(--border-color, #333);
  }
  
  .meta-info {
    font-size: 0.875rem;
    color: var(--text-secondary, #aaa);
    margin-bottom: 0.5rem;
  }
  
  .filter-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-bottom: 0.5rem;
  }
  
  .filter-buttons button {
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    border: 1px solid var(--border-color, #444);
    background: var(--bg-secondary, #16213e);
    color: var(--text-secondary, #aaa);
    border-radius: 4px;
    cursor: pointer;
  }
  
  .filter-buttons button.active {
    background: var(--accent-color, #4a9eff);
    color: white;
    border-color: var(--accent-color, #4a9eff);
  }
  
  .search-row {
    display: flex;
    gap: 0.5rem;
  }
  
  .search-row input {
    flex: 1;
    padding: 0.5rem;
    border: 1px solid var(--border-color, #444);
    background: var(--bg-secondary, #16213e);
    color: var(--text-primary, #fff);
    border-radius: 4px;
    font-size: 0.875rem;
  }
  
  .search-row .id-search {
    width: 60px;
    flex: none;
  }
  
  .node-list {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
  }
  
  .type-group-item {
    display: flex;
    justify-content: space-between;
    padding: 0.75rem;
    margin-bottom: 0.25rem;
    background: var(--bg-secondary, #16213e);
    border: 1px solid var(--border-color, #333);
    border-radius: 6px;
    cursor: pointer;
    width: 100%;
    text-align: left;
    color: var(--text-primary, #fff);
  }
  
  .type-group-item:hover {
    border-color: var(--accent-color, #4a9eff);
  }
  
  .type-name {
    color: #0af;
    font-weight: bold;
  }
  
  .type-count {
    color: var(--text-secondary, #888);
    font-size: 0.75rem;
  }
  
  .back-btn {
    display: block;
    width: 100%;
    padding: 0.5rem;
    margin-bottom: 0.5rem;
    background: var(--bg-secondary, #16213e);
    border: 1px solid var(--border-color, #333);
    border-radius: 4px;
    color: var(--text-secondary, #aaa);
    cursor: pointer;
    text-align: left;
  }
  
  .node-item {
    display: block;
    width: 100%;
    padding: 0.5rem 0.75rem;
    margin-bottom: 0.25rem;
    background: var(--bg-secondary, #16213e);
    border: 1px solid var(--border-color, #333);
    border-left: 3px solid var(--cat-color, #888);
    border-radius: 4px;
    cursor: pointer;
    text-align: left;
    color: var(--text-primary, #fff);
  }
  
  .node-item:hover {
    border-color: var(--accent-color, #4a9eff);
  }
  
  .node-item.selected {
    background: var(--accent-color, #4a9eff);
    border-color: var(--accent-color, #4a9eff);
  }
  
  .node-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .node-type {
    font-weight: bold;
    font-size: 0.875rem;
    color: inherit;
  }
  
  .node-id {
    font-size: 0.75rem;
    color: var(--text-secondary, #888);
  }
  
  .node-title {
    font-size: 0.75rem;
    color: var(--text-secondary, #aaa);
    margin-top: 0.25rem;
  }
  
  .node-preview {
    font-size: 0.7rem;
    color: var(--cat-color, #0af);
    margin-top: 0.25rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    opacity: 0.9;
  }
  
  /* 오른쪽 패널 */
  .detail-panel {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
  }
  
  .empty-detail, .empty-msg {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
    color: var(--text-secondary, #888);
    font-style: italic;
  }
  
  .detail-card {
    background: var(--bg-primary, #1a1a2e);
    border-radius: 8px;
    padding: 1.5rem;
  }
  
  .detail-title {
    margin: 0 0 0.25rem;
    font-size: 1.25rem;
    color: #0af;
  }
  
  .detail-subtitle {
    font-size: 0.875rem;
    color: var(--text-secondary, #888);
    margin-bottom: 1.5rem;
  }
  
  .detail-card h4 {
    margin: 1rem 0 0.5rem;
    font-size: 0.875rem;
    color: var(--text-secondary, #aaa);
    text-transform: uppercase;
  }
  
  .inputs-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  
  .input-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 0.5rem;
    background: var(--bg-secondary, #16213e);
    border-radius: 4px;
  }
  
  .input-label {
    font-weight: bold;
    color: #fa0;
    min-width: 100px;
  }
  
  .input-value {
    flex: 1;
    text-align: right;
    word-break: break-all;
    color: var(--text-primary, #fff);
  }
  
  .node-ref {
    background: var(--accent-color, #4a9eff);
    color: white;
    border: none;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.75rem;
  }
  
  .node-ref:hover {
    background: #3a8eef;
  }
  
  .raw-json {
    margin-top: 1.5rem;
  }
  
  .raw-json summary {
    cursor: pointer;
    color: var(--text-secondary, #888);
    font-size: 0.875rem;
  }
  
  .raw-json pre {
    margin-top: 0.5rem;
    padding: 1rem;
    background: var(--bg-secondary, #16213e);
    border-radius: 4px;
    font-size: 0.75rem;
    overflow-x: auto;
    max-height: 300px;
    overflow-y: auto;
  }
  
  /* 하단 */
  .modal-footer {
    padding: 0.75rem 1.5rem;
    border-top: 1px solid var(--border-color, #333);
    background: var(--bg-primary, #1a1a2e);
  }
  
  .summary {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
  }
  
  .summary-item {
    font-size: 0.875rem;
    color: var(--text-secondary, #aaa);
  }
</style>
