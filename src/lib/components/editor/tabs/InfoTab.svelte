<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { debugLog } from '$lib/core/logger';

  export let data: any;
  export let fileType: 'charx' | 'risum' | 'risup';

  const dispatch = createEventDispatcher();

  // 현재 확장된 섹션
  let expandedSections: Record<string, boolean> = {
    basic: true,
    params: true,
    prompts: true,
    promptTemplate: true,
    formatingOrder: false,
    regex: false,
    advanced: false
  };

  // 파일 타입에 따른 필드 추출
  $: fields = getFields(data, fileType);
  $: arrayFields = getArrayFields(data, fileType);

  function toggleSection(section: string) {
    expandedSections[section] = !expandedSections[section];
  }

  function getFields(data: any, type: string) {
    if (!data) return [];

    switch (type) {
      case 'charx':
        return getCharxFields(data);
      case 'risum':
        return getRisumFields(data);
      case 'risup':
        return getRisupFields(data);
      default:
        return [];
    }
  }

  function getArrayFields(data: any, type: string): Record<string, any[]> {
    if (!data || type !== 'risup') return {};
    const preset = data.preset || data;
    return {
      promptTemplate: preset.promptTemplate || [],
      formatingOrder: preset.formatingOrder || [],
      regex: preset.regex || [],
      bias: preset.bias || []
    };
  }

  function getCharxFields(data: any) {
    // transformCharxData에서 반환된 구조:
    // { card, cardData, lorebook, regex, trigger, assets, type }
    // card = 전체 카드 { spec, spec_version, data }
    // cardData = card.data (실제 캐릭터 데이터)
    const cardData = data.cardData || data.card?.data || data.data || data;
    
    // RisuAI 확장 필드
    const risuExt = cardData?.extensions?.risuai || {};
    
    debugLog('[InfoTab] charx 필드 로드:', {
      name: cardData?.name,
      descLen: cardData?.description?.length,
      firstMesLen: cardData?.first_mes?.length,
      creatorNotes: cardData?.creator_notes?.length,
      risuExtKeys: Object.keys(risuExt)
    });
    
    return [
      // 기본 필드
      { key: 'name', label: '이름', type: 'text', value: cardData?.name || '', section: 'basic' },
      { key: 'description', label: '설명', type: 'textarea', value: cardData?.description || '', section: 'basic' },
      { key: 'personality', label: '성격', type: 'textarea', value: cardData?.personality || '', section: 'basic' },
      { key: 'scenario', label: '시나리오', type: 'textarea', value: cardData?.scenario || '', section: 'basic' },
      { key: 'first_mes', label: '첫 메시지', type: 'textarea', value: cardData?.first_mes || '', section: 'basic' },
      { key: 'mes_example', label: '대화 예시', type: 'textarea', value: cardData?.mes_example || '', section: 'basic' },
      { key: 'creator_notes', label: '작가의 노트', type: 'textarea', value: cardData?.creator_notes || '', section: 'basic' },
      { key: 'system_prompt', label: '시스템 프롬프트', type: 'textarea', value: cardData?.system_prompt || '', section: 'basic' },
      { key: 'post_history_instructions', label: '대화 후 지시', type: 'textarea', value: cardData?.post_history_instructions || '', section: 'basic' },
      
      // RisuAI 확장 필드 (스키마: RisuaiExtensionsV3Schema)
      { key: 'additionalText', label: '추가 디스크립션', type: 'textarea', value: risuExt.additionalText || '', section: 'basic', path: 'extensions.risuai.additionalText' },
      { key: 'defaultVariables', label: '기본 변수', type: 'textarea', value: risuExt.defaultVariables || '', section: 'basic', path: 'extensions.risuai.defaultVariables' },
      { key: 'license', label: '라이선스', type: 'text', value: risuExt.license || '', section: 'advanced', path: 'extensions.risuai.license' },
      
      // 옵션
      { key: 'lowLevelAccess', label: '저수준 접근', type: 'checkbox', value: risuExt.lowLevelAccess || false, section: 'advanced', path: 'extensions.risuai.lowLevelAccess' },
      { key: 'largePortrait', label: '대형 초상화', type: 'checkbox', value: risuExt.largePortrait || false, section: 'advanced', path: 'extensions.risuai.largePortrait' },
      { key: 'lorePlus', label: '로어 플러스', type: 'checkbox', value: risuExt.lorePlus || false, section: 'advanced', path: 'extensions.risuai.lorePlus' },
      { key: 'inlayViewScreen', label: '인레이 뷰 스크린', type: 'checkbox', value: risuExt.inlayViewScreen || false, section: 'advanced', path: 'extensions.risuai.inlayViewScreen' },
      { key: 'utilityBot', label: '유틸리티 봇', type: 'checkbox', value: risuExt.utilityBot || false, section: 'advanced', path: 'extensions.risuai.utilityBot' },
      
      // 백그라운드 임베딩 (RisuAI)
      { key: 'backgroundHTML', label: '백그라운드 임베딩', type: 'textarea', value: risuExt.backgroundHTML || '', section: 'advanced', path: 'extensions.risuai.backgroundHTML' },
    ];
  }

  function getRisumFields(data: any) {
    const module = data.module || data;
    const lorebookCount = module.lorebook?.length || 0;
    const regexCount = module.regex?.length || 0;
    const triggerCount = module.trigger?.length || 0;
    const assetCount = module.assets?.length || 0;
    
    return [
      { key: 'name', label: '모듈 이름', type: 'text', value: module.name || '', section: 'basic' },
      { key: 'description', label: '설명', type: 'textarea', value: module.description || '', section: 'basic' },
      { key: 'id', label: 'ID', type: 'text', value: module.id || '', section: 'basic', readonly: true },
      { key: 'namespace', label: '네임스페이스', type: 'text', value: module.namespace || '', section: 'basic' },
      
      // 컨텐츠 요약
      { key: '_lorebook_count', label: '로어북 항목', type: 'info', value: `${lorebookCount}개`, section: 'basic' },
      { key: '_regex_count', label: 'Regex 스크립트', type: 'info', value: `${regexCount}개`, section: 'basic' },
      { key: '_trigger_count', label: 'Trigger 스크립트', type: 'info', value: `${triggerCount}개`, section: 'basic' },
      { key: '_asset_count', label: '에셋', type: 'info', value: `${assetCount}개`, section: 'basic' },
      
      // 우선순위
      { key: 'lorpiority', label: '로어북 우선순위', type: 'number', value: module.lorpiority || 0, section: 'params' },
      { key: 'lpiority', label: 'L 우선순위', type: 'number', value: module.lpiority || 0, section: 'params' },
      
      // 스크립트
      { key: 'cbs', label: 'CBS 스크립트', type: 'code', value: module.cbs || '', section: 'advanced' },
      { key: 'cjs', label: 'CJS 스크립트', type: 'code', value: module.cjs || '', section: 'advanced' },
      
      // 옵션
      { key: 'lowLevelAccess', label: '저수준 접근', type: 'checkbox', value: module.lowLevelAccess || false, section: 'advanced' },
      { key: 'hideIcon', label: '아이콘 숨김', type: 'checkbox', value: module.hideIcon || false, section: 'advanced' },
      { key: 'backgroundEmbedding', label: '배경 임베딩', type: 'textarea', value: module.backgroundEmbedding || '', section: 'advanced' },
    ];
  }

  function getRisupFields(data: any) {
    const preset = data.preset || data;
    return [
      // 기본 정보 섹션
      { key: 'name', label: '프리셋 이름', type: 'text', value: preset.name || '', section: 'basic' },
      { key: 'aiModel', label: 'AI 모델', type: 'text', value: preset.aiModel || '', section: 'basic' },
      { key: 'subModel', label: '보조 모델', type: 'text', value: preset.subModel || '', section: 'basic' },
      { key: 'apiType', label: 'API 타입', type: 'text', value: preset.apiType || '', section: 'basic' },
      
      // 모델 파라미터 섹션
      { key: 'temperature', label: 'Temperature', type: 'number', value: preset.temperature ?? 80, section: 'params' },
      { key: 'top_p', label: 'Top P', type: 'number', value: preset.top_p ?? 1, section: 'params' },
      { key: 'top_k', label: 'Top K', type: 'number', value: preset.top_k ?? 0, section: 'params' },
      { key: 'frequencyPenalty', label: 'Frequency Penalty', type: 'number', value: preset.frequencyPenalty ?? 0, section: 'params' },
      { key: 'PresensePenalty', label: 'Presence Penalty', type: 'number', value: preset.PresensePenalty ?? 0, section: 'params' },
      { key: 'repetition_penalty', label: 'Repetition Penalty', type: 'number', value: preset.repetition_penalty ?? 1, section: 'params' },
      { key: 'min_p', label: 'Min P', type: 'number', value: preset.min_p ?? 0, section: 'params' },
      { key: 'top_a', label: 'Top A', type: 'number', value: preset.top_a ?? 0, section: 'params' },
      { key: 'maxContext', label: 'Max Context', type: 'number', value: preset.maxContext ?? 4096, section: 'params' },
      { key: 'maxResponse', label: 'Max Response', type: 'number', value: preset.maxResponse ?? 500, section: 'params' },
      
      // 프롬프트 섹션
      { key: 'mainPrompt', label: '메인 프롬프트', type: 'textarea', value: preset.mainPrompt || '', section: 'prompts' },
      { key: 'jailbreak', label: 'Jailbreak', type: 'textarea', value: preset.jailbreak || '', section: 'prompts' },
      { key: 'globalNote', label: 'Global Note', type: 'textarea', value: preset.globalNote || '', section: 'prompts' },
      { key: 'autoSuggestPrompt', label: 'Auto Suggest Prompt', type: 'textarea', value: preset.autoSuggestPrompt || '', section: 'prompts' },
      
      // 고급 설정 섹션
      { key: 'forceReplaceUrl', label: 'Force Replace URL', type: 'text', value: preset.forceReplaceUrl || '', section: 'advanced' },
      { key: 'forceReplaceUrl2', label: 'Force Replace URL 2', type: 'text', value: preset.forceReplaceUrl2 || '', section: 'advanced' },
      { key: 'koboldURL', label: 'Kobold URL', type: 'text', value: preset.koboldURL || '', section: 'advanced' },
      { key: 'promptPreprocess', label: 'Prompt Preprocess', type: 'boolean', value: preset.promptPreprocess ?? false, section: 'advanced' },
      { key: 'useInstructPrompt', label: 'Use Instruct Prompt', type: 'boolean', value: preset.useInstructPrompt ?? false, section: 'advanced' },
      { key: 'jsonSchemaEnabled', label: 'JSON Schema Enabled', type: 'boolean', value: preset.jsonSchemaEnabled ?? false, section: 'advanced' },
      { key: 'jsonSchema', label: 'JSON Schema', type: 'code', value: preset.jsonSchema || '', section: 'advanced' },
      { key: 'instructChatTemplate', label: 'Instruct Chat Template', type: 'text', value: preset.instructChatTemplate || '', section: 'advanced' },
      { key: 'JinjaTemplate', label: 'Jinja Template', type: 'textarea', value: preset.JinjaTemplate || '', section: 'advanced' },
      { key: 'groupTemplate', label: 'Group Template', type: 'textarea', value: preset.groupTemplate || '', section: 'advanced' },
      { key: 'customPromptTemplateToggle', label: 'Custom Toggles', type: 'textarea', value: preset.customPromptTemplateToggle || '', section: 'advanced' },
      { key: 'templateDefaultVariables', label: 'Default Variables', type: 'textarea', value: preset.templateDefaultVariables || '', section: 'advanced' },
    ];
  }

  // 섹션별 필드 그룹화
  $: fieldsBySection = fields.reduce((acc: Record<string, any[]>, field: any) => {
    const section = field.section || 'basic';
    if (!acc[section]) acc[section] = [];
    acc[section].push(field);
    return acc;
  }, {});

  // PromptItem 타입에 따른 표시 이름
  function getPromptTypeName(item: any): string {
    if (!item) return 'Unknown';
    
    const type = item.type;
    const type2 = item.type2;
    
    if (type === 'plain' || type === 'jailbreak' || type === 'cot') {
      if (type2 === 'main') return 'Ψ: 메인 프롬프트';
      if (type2 === 'globalNote') return 'Ψ: 글로벌 노트';
      if (type === 'jailbreak') return 'Ψ: Jailbreak';
      if (type === 'cot') return 'Ψ: Chain of Thought';
      return `Ψ: ${item.name || type}`;
    }
    if (type === 'persona') return 'Ψ: 페르소나';
    if (type === 'description') return 'Ψ: 캐릭터 설명';
    if (type === 'lorebook') return 'Ψ: 로어북';
    if (type === 'postEverything') return 'Ψ: Post Everything';
    if (type === 'authornote') return 'Ψ: Author\'s Note';
    if (type === 'chat') return 'Ψ: 채팅 기록';
    if (type === 'memory') return 'Ψ: 메모리';
    if (type === 'cache') return `Ψ: 캐시 포인트 (${item.name || ''})`;
    if (type === 'chatML') return 'ChatML';
    
    return item.name || type || 'Unknown';
  }

  // PromptItem의 역할 표시
  function getPromptRole(item: any): string {
    if (!item.role) return '';
    const roles: Record<string, string> = {
      user: '사용자',
      bot: '어시스턴트',
      system: '시스템',
      assistant: '어시스턴트'
    };
    return roles[item.role] || item.role;
  }

  function handleFieldChange(key: string, value: any) {
    const newData = structuredClone(data);
    
    if (fileType === 'charx') {
      const card = newData.card || newData;
      const cardData = card.data || card;
      cardData[key] = value;
    } else if (fileType === 'risum') {
      const module = newData.module || newData;
      module[key] = value;
    } else if (fileType === 'risup') {
      const preset = newData.preset || newData;
      preset[key] = value;
    }

    dispatch('change', newData);
  }

  // 프롬프트 템플릿 아이템 삭제
  function deletePromptItem(index: number) {
    const newData = structuredClone(data);
    const preset = newData.preset || newData;
    if (preset.promptTemplate && Array.isArray(preset.promptTemplate)) {
      preset.promptTemplate.splice(index, 1);
      dispatch('change', newData);
    }
  }

  // 프롬프트 템플릿 아이템 이동
  function movePromptItem(index: number, direction: 'up' | 'down') {
    const newData = structuredClone(data);
    const preset = newData.preset || newData;
    if (!preset.promptTemplate || !Array.isArray(preset.promptTemplate)) return;
    
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= preset.promptTemplate.length) return;
    
    const [item] = preset.promptTemplate.splice(index, 1);
    preset.promptTemplate.splice(newIndex, 0, item);
    dispatch('change', newData);
  }

  // 선택된 프롬프트 아이템
  let selectedPromptIndex: number | null = null;

  const sectionLabels: Record<string, string> = {
    basic: '📋 기본 정보',
    params: '⚙️ 모델 파라미터',
    prompts: '📝 프롬프트',
    promptTemplate: '🎭 프롬프트 템플릿',
    formatingOrder: '📊 포맷팅 순서',
    regex: '🔧 정규식 스크립트',
    advanced: '🔐 고급 설정'
  };
</script>

<div class="info-tab">
  <!-- 섹션별 필드 -->
  {#each Object.entries(fieldsBySection) as [section, sectionFields]}
    <div class="section">
      <button class="section-header" on:click={() => toggleSection(section)}>
        <span class="section-title">{sectionLabels[section] || section}</span>
        <span class="section-toggle">{expandedSections[section] ? '▼' : '▶'}</span>
      </button>
      
      {#if expandedSections[section]}
        <div class="section-content">
          <div class="fields-grid">
            {#each sectionFields as field}
              <div class="field" class:full-width={field.type === 'textarea' || field.type === 'code'}>
                <label for={field.key}>{field.label}</label>
                
                {#if field.type === 'info'}
                  <span class="info-value">{field.value}</span>
                {:else if field.type === 'text'}
                  <input
                    type="text"
                    id={field.key}
                    value={field.value}
                    readonly={field.readonly}
                    class:readonly={field.readonly}
                    on:input={(e) => !field.readonly && handleFieldChange(field.key, e.currentTarget.value)}
                  />
                {:else if field.type === 'number'}
                  <input
                    type="number"
                    id={field.key}
                    value={field.value}
                    step="0.01"
                    on:input={(e) => handleFieldChange(field.key, parseFloat(e.currentTarget.value) || 0)}
                  />
                {:else if field.type === 'textarea'}
                  <textarea
                    id={field.key}
                    value={field.value}
                    rows="4"
                    on:input={(e) => handleFieldChange(field.key, e.currentTarget.value)}
                  ></textarea>
                {:else if field.type === 'code'}
                  <textarea
                    id={field.key}
                    value={field.value}
                    rows="8"
                    class="code-editor"
                    on:input={(e) => handleFieldChange(field.key, e.currentTarget.value)}
                  ></textarea>
                {:else if field.type === 'boolean' || field.type === 'checkbox'}
                  <label class="checkbox-label">
                    <input
                      type="checkbox"
                      id={field.key}
                      checked={field.value}
                      on:change={(e) => handleFieldChange(field.key, e.currentTarget.checked)}
                    />
                    <span>{field.value ? '활성화' : '비활성화'}</span>
                  </label>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/each}

  <!-- 프롬프트 템플릿 섹션 (risup만) -->
  {#if fileType === 'risup' && arrayFields.promptTemplate?.length > 0}
    <div class="section">
      <button class="section-header" on:click={() => toggleSection('promptTemplate')}>
        <span class="section-title">{sectionLabels.promptTemplate} ({arrayFields.promptTemplate.length}개)</span>
        <span class="section-toggle">{expandedSections.promptTemplate ? '▼' : '▶'}</span>
      </button>
      
      {#if expandedSections.promptTemplate}
        <div class="section-content">
          <div class="prompt-template-list">
            {#each arrayFields.promptTemplate as item, index}
              <div 
                class="prompt-item" 
                class:selected={selectedPromptIndex === index}
                on:click={() => selectedPromptIndex = selectedPromptIndex === index ? null : index}
                on:keypress={(e) => e.key === 'Enter' && (selectedPromptIndex = selectedPromptIndex === index ? null : index)}
                role="button"
                tabindex="0"
              >
                <div class="prompt-item-main">
                  <span class="prompt-name">{getPromptTypeName(item)}</span>
                  {#if getPromptRole(item)}
                    <span class="prompt-role">[{getPromptRole(item)}]</span>
                  {/if}
                </div>
                <div class="prompt-actions">
                  <button 
                    class="action-btn" 
                    title="위로 이동"
                    disabled={index === 0}
                    on:click|stopPropagation={() => movePromptItem(index, 'up')}
                  >↑</button>
                  <button 
                    class="action-btn" 
                    title="아래로 이동"
                    disabled={index === arrayFields.promptTemplate.length - 1}
                    on:click|stopPropagation={() => movePromptItem(index, 'down')}
                  >↓</button>
                  <button 
                    class="action-btn delete" 
                    title="삭제"
                    on:click|stopPropagation={() => deletePromptItem(index)}
                  >×</button>
                </div>
              </div>
              
              <!-- 선택된 아이템 상세 정보 -->
              {#if selectedPromptIndex === index}
                <div class="prompt-detail">
                  <div class="detail-row">
                    <span class="detail-label">Type:</span>
                    <span class="detail-value">{item.type}</span>
                  </div>
                  {#if item.type2}
                    <div class="detail-row">
                      <span class="detail-label">Type2:</span>
                      <span class="detail-value">{item.type2}</span>
                    </div>
                  {/if}
                  {#if item.role}
                    <div class="detail-row">
                      <span class="detail-label">Role:</span>
                      <span class="detail-value">{item.role}</span>
                    </div>
                  {/if}
                  {#if item.name}
                    <div class="detail-row">
                      <span class="detail-label">Name:</span>
                      <span class="detail-value">{item.name}</span>
                    </div>
                  {/if}
                  {#if item.text}
                    <div class="detail-row full">
                      <span class="detail-label">Text:</span>
                      <pre class="detail-text">{item.text}</pre>
                    </div>
                  {/if}
                  {#if item.innerFormat}
                    <div class="detail-row full">
                      <span class="detail-label">Inner Format:</span>
                      <pre class="detail-text">{item.innerFormat}</pre>
                    </div>
                  {/if}
                  {#if item.type === 'chat'}
                    <div class="detail-row">
                      <span class="detail-label">Range:</span>
                      <span class="detail-value">{item.rangeStart} ~ {item.rangeEnd}</span>
                    </div>
                  {/if}
                  {#if item.type === 'cache'}
                    <div class="detail-row">
                      <span class="detail-label">Depth:</span>
                      <span class="detail-value">{item.depth}</span>
                    </div>
                  {/if}
                </div>
              {/if}
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- 포맷팅 순서 섹션 (risup만) -->
  {#if fileType === 'risup' && arrayFields.formatingOrder?.length > 0}
    <div class="section">
      <button class="section-header" on:click={() => toggleSection('formatingOrder')}>
        <span class="section-title">{sectionLabels.formatingOrder} ({arrayFields.formatingOrder.length}개)</span>
        <span class="section-toggle">{expandedSections.formatingOrder ? '▼' : '▶'}</span>
      </button>
      
      {#if expandedSections.formatingOrder}
        <div class="section-content">
          <div class="order-list">
            {#each arrayFields.formatingOrder as item, index}
              <div class="order-item">
                <span class="order-index">{index + 1}</span>
                <span class="order-name">{item}</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- 정규식 스크립트 섹션 (risup만) -->
  {#if fileType === 'risup' && arrayFields.regex?.length > 0}
    <div class="section">
      <button class="section-header" on:click={() => toggleSection('regex')}>
        <span class="section-title">{sectionLabels.regex} ({arrayFields.regex.length}개)</span>
        <span class="section-toggle">{expandedSections.regex ? '▼' : '▶'}</span>
      </button>
      
      {#if expandedSections.regex}
        <div class="section-content">
          <div class="regex-list">
            {#each arrayFields.regex as item, index}
              <div class="regex-item">
                <div class="regex-header">
                  <span class="regex-name">{item.comment || `Regex ${index + 1}`}</span>
                  <span class="regex-type">{item.type}</span>
                </div>
                <div class="regex-pattern">
                  <code>/{item.in}/{item.flag || 'g'}</code>
                </div>
                <div class="regex-replacement">
                  → <code>{item.out}</code>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .info-tab {
    max-width: 900px;
    margin: 0 auto;
    padding: 1rem;
  }

  /* 섹션 스타일 */
  .section {
    margin-bottom: 1rem;
    border: 1px solid var(--border-color, #333);
    border-radius: 8px;
    overflow: hidden;
    background: var(--bg-secondary, #1a1a1a);
  }

  .section-header {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    background: var(--bg-tertiary, #222);
    border: none;
    color: var(--text-primary, #eee);
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 600;
    transition: background 0.2s;
  }

  .section-header:hover {
    background: var(--bg-hover, #2a2a2a);
  }

  .section-toggle {
    font-size: 0.75rem;
    color: var(--text-secondary, #888);
  }

  .section-content {
    padding: 1rem;
    border-top: 1px solid var(--border-color, #333);
  }

  .fields-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .field.full-width {
    grid-column: 1 / -1;
  }

  label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-secondary, #aaa);
  }

  input, textarea {
    padding: 0.75rem;
    border: 1px solid var(--border-color, #333);
    border-radius: 4px;
    background: var(--bg-tertiary, #222);
    color: var(--text-primary, #eee);
    font-size: 0.875rem;
  }

  input:focus, textarea:focus {
    outline: none;
    border-color: var(--primary-light, #4d8bf5);
  }

  input[type="number"] {
    max-width: 150px;
  }

  textarea {
    resize: vertical;
    min-height: 100px;
    font-family: inherit;
  }

  .code-editor {
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    min-height: 200px;
    tab-size: 2;
  }

  .info-value {
    display: inline-block;
    padding: 0.5rem;
    background: var(--bg-tertiary, #222);
    border-radius: 4px;
    color: var(--primary-light, #4d8bf5);
    font-weight: 500;
  }

  input.readonly {
    background: var(--bg-tertiary, #222);
    color: var(--text-secondary, #aaa);
    cursor: not-allowed;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    font-size: 0.875rem;
  }

  .checkbox-label input[type="checkbox"] {
    width: 18px;
    height: 18px;
    cursor: pointer;
  }

  /* 프롬프트 템플릿 리스트 */
  .prompt-template-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .prompt-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    background: var(--bg-tertiary, #2a2a2a);
    border: 1px solid var(--border-color, #333);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .prompt-item:hover {
    background: var(--bg-hover, #333);
    border-color: var(--primary-light, #4d8bf5);
  }

  .prompt-item.selected {
    background: var(--primary-dark, #1e3a5f);
    border-color: var(--primary-light, #4d8bf5);
  }

  .prompt-item-main {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .prompt-name {
    font-weight: 500;
    color: var(--text-primary, #eee);
  }

  .prompt-role {
    font-size: 0.75rem;
    color: var(--text-secondary, #888);
    padding: 0.125rem 0.5rem;
    background: var(--bg-secondary, #1a1a1a);
    border-radius: 4px;
  }

  .prompt-actions {
    display: flex;
    gap: 0.25rem;
  }

  .action-btn {
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid var(--border-color, #444);
    border-radius: 4px;
    background: var(--bg-secondary, #1a1a1a);
    color: var(--text-secondary, #888);
    cursor: pointer;
    font-size: 0.875rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .action-btn:hover:not(:disabled) {
    background: var(--bg-hover, #333);
    color: var(--text-primary, #eee);
    border-color: var(--primary-light, #4d8bf5);
  }

  .action-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .action-btn.delete:hover:not(:disabled) {
    background: #dc3545;
    border-color: #dc3545;
    color: white;
  }

  /* 프롬프트 상세 정보 */
  .prompt-detail {
    margin-left: 1rem;
    padding: 1rem;
    background: var(--bg-secondary, #1a1a1a);
    border: 1px solid var(--border-color, #333);
    border-top: none;
    border-radius: 0 0 6px 6px;
    margin-bottom: 0.5rem;
  }

  .detail-row {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
    align-items: flex-start;
  }

  .detail-row.full {
    flex-direction: column;
  }

  .detail-label {
    font-weight: 600;
    color: var(--text-secondary, #888);
    min-width: 80px;
    font-size: 0.8rem;
  }

  .detail-value {
    color: var(--text-primary, #eee);
    font-size: 0.875rem;
  }

  .detail-text {
    width: 100%;
    margin: 0.25rem 0 0 0;
    padding: 0.75rem;
    background: var(--bg-tertiary, #222);
    border-radius: 4px;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 0.8rem;
    color: var(--text-primary, #eee);
    white-space: pre-wrap;
    word-break: break-all;
    max-height: 200px;
    overflow-y: auto;
  }

  /* 포맷팅 순서 리스트 */
  .order-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .order-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: var(--bg-tertiary, #2a2a2a);
    border: 1px solid var(--border-color, #333);
    border-radius: 6px;
  }

  .order-index {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--primary-dark, #1e3a5f);
    color: var(--primary-light, #4d8bf5);
    border-radius: 50%;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .order-name {
    font-size: 0.875rem;
    color: var(--text-primary, #eee);
  }

  /* 정규식 리스트 */
  .regex-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .regex-item {
    padding: 0.75rem 1rem;
    background: var(--bg-tertiary, #2a2a2a);
    border: 1px solid var(--border-color, #333);
    border-radius: 6px;
  }

  .regex-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .regex-name {
    font-weight: 500;
    color: var(--text-primary, #eee);
  }

  .regex-type {
    font-size: 0.75rem;
    padding: 0.125rem 0.5rem;
    background: var(--primary-dark, #1e3a5f);
    color: var(--primary-light, #4d8bf5);
    border-radius: 4px;
  }

  .regex-pattern, .regex-replacement {
    font-size: 0.8rem;
    margin-bottom: 0.25rem;
  }

  .regex-pattern code, .regex-replacement code {
    padding: 0.25rem 0.5rem;
    background: var(--bg-secondary, #1a1a1a);
    border-radius: 4px;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    color: #e9a66c;
  }

  .regex-replacement {
    color: var(--text-secondary, #888);
  }

  .regex-replacement code {
    color: #6ce9a6;
  }

  /* 반응형 */
  @media (max-width: 768px) {
    .fields-grid {
      grid-template-columns: 1fr;
    }

    input[type="number"] {
      max-width: 100%;
    }
  }
</style>
