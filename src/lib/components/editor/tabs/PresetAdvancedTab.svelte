<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import DSLEditor from '../DSLEditor.svelte';

  export let data: any;

  const dispatch = createEventDispatcher();

  // 프리셋 데이터 추출
  $: preset = data?.preset || data || {};

  // 고급 설정 필드들
  const advancedFieldDefs = [
    { key: 'forceReplaceUrl', label: 'Force Replace URL', type: 'text' },
    { key: 'forceReplaceUrl2', label: 'Force Replace URL 2', type: 'text' },
    { key: 'koboldURL', label: 'Kobold URL', type: 'text' },
    { key: 'instructChatTemplate', label: 'Instruct Chat Template', type: 'text' },
    { key: 'promptPreprocess', label: 'Prompt Preprocess', type: 'boolean' },
    { key: 'useInstructPrompt', label: 'Use Instruct Prompt', type: 'boolean' },
    { key: 'jsonSchemaEnabled', label: 'JSON Schema Enabled', type: 'boolean' },
  ];

  // 큰 텍스트 필드들
  const codeFieldDefs = [
    { key: 'jsonSchema', label: 'JSON Schema' },
    { key: 'JinjaTemplate', label: 'Jinja Template' },
    { key: 'groupTemplate', label: 'Group Template' },
    { key: 'customPromptTemplateToggle', label: 'Custom Toggles' },
    { key: 'templateDefaultVariables', label: 'Default Variables' },
  ];

  let selectedCodeField = 'jsonSchema';
  let dslEditor: DSLEditor;

  $: currentCodeValue = preset[selectedCodeField] || '';

  function handleFieldChange(key: string, value: any) {
    const newData = structuredClone(data);
    const target = newData.preset || newData;
    target[key] = value;
    dispatch('change', newData);
  }

  function handleCodeChange(event: CustomEvent<{ value: string }>) {
    handleFieldChange(selectedCodeField, event.detail.value);
  }
</script>

<div class="preset-advanced-tab">
  <!-- 상단: 기본 필드들 -->
  <section class="basic-fields">
    <h3 class="section-title">기본 설정</h3>
    <div class="fields-grid">
      {#each advancedFieldDefs as field}
        <div class="field-group">
          <div class="field-label">{field.label}</div>
          {#if field.type === 'boolean'}
            <label class="checkbox-wrapper">
              <input
                type="checkbox"
                checked={preset[field.key] ?? false}
                on:change={(e) => handleFieldChange(field.key, e.currentTarget.checked)}
              />
              <span class="checkbox-text">{preset[field.key] ? '활성화' : '비활성화'}</span>
            </label>
          {:else}
            <input
              id={"preset-advanced-" + field.key}
              type="text"
              class="field-input"
              value={preset[field.key] || ''}
              on:input={(e) => handleFieldChange(field.key, e.currentTarget.value)}
            />
          {/if}
        </div>
      {/each}
    </div>
  </section>

  <!-- 하단: 코드/템플릿 필드 -->
  <section class="code-fields">
    <div class="code-tabs">
      {#each codeFieldDefs as field}
        <button
          class="code-tab"
          class:active={selectedCodeField === field.key}
          on:click={() => selectedCodeField = field.key}
        >
          {field.label}
        </button>
      {/each}
    </div>
    <div class="code-editor-wrapper">
      <DSLEditor
        bind:this={dslEditor}
        value={currentCodeValue}
        mode="lorebook"
        placeholder="{codeFieldDefs.find(f => f.key === selectedCodeField)?.label} 내용..."
        on:change={handleCodeChange}
      />
    </div>
  </section>
</div>

<style>
  .preset-advanced-tab {
    display: flex;
    flex-direction: column;
    height: calc(100vh - 200px);
    min-height: 500px;
    background: var(--risu-theme-bgcolor, #1a1a1a);
  }

  .section-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--risu-theme-textcolor2, #aaa);
    margin: 0 0 0.75rem 0;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--risu-theme-borderc, #444);
  }

  .basic-fields {
    padding: 1rem;
    border-bottom: 1px solid var(--risu-theme-borderc, #444);
  }

  .fields-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 0.75rem;
  }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .field-label {
    font-size: 0.8rem;
    color: var(--risu-theme-textcolor2, #888);
  }

  .field-input {
    padding: 0.5rem 0.625rem;
    background: var(--risu-theme-darkbg, #252525);
    border: 1px solid var(--risu-theme-borderc, #444);
    border-radius: 4px;
    color: var(--risu-theme-textcolor, #fff);
    font-size: 0.875rem;
  }

  .field-input:focus {
    outline: none;
    border-color: var(--risu-theme-primary-600, #4682B4);
  }

  .checkbox-wrapper {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
  }

  .checkbox-wrapper input[type="checkbox"] {
    width: 1rem;
    height: 1rem;
    accent-color: var(--risu-theme-primary-600, #4682B4);
  }

  .checkbox-text {
    font-size: 0.8rem;
    color: var(--risu-theme-textcolor2, #888);
  }

  .code-fields {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .code-tabs {
    display: flex;
    gap: 0.25rem;
    padding: 0.5rem 1rem;
    background: var(--risu-theme-darkbg, #252525);
    border-bottom: 1px solid var(--risu-theme-borderc, #444);
    overflow-x: auto;
  }

  .code-tab {
    padding: 0.375rem 0.75rem;
    background: transparent;
    border: 1px solid var(--risu-theme-borderc, #444);
    border-radius: 4px;
    color: var(--risu-theme-textcolor2, #888);
    font-size: 0.75rem;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s;
  }

  .code-tab:hover {
    color: var(--risu-theme-textcolor, #fff);
  }

  .code-tab.active {
    background: var(--risu-theme-primary-600, #4682B4);
    color: white;
    border-color: var(--risu-theme-primary-600, #4682B4);
  }

  .code-editor-wrapper {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
</style>
