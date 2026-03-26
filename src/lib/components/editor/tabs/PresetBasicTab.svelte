<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import DSLEditor from '../DSLEditor.svelte';

  export let data: any;

  const dispatch = createEventDispatcher();

  // 프리셋 데이터 추출
  $: preset = data?.preset || data || {};

  // 기본 정보 필드들
  $: basicFields = [
    { key: 'name', label: '프리셋 이름', value: preset.name || '' },
    { key: 'aiModel', label: 'AI 모델', value: preset.aiModel || '' },
    { key: 'subModel', label: '보조 모델', value: preset.subModel || '' },
    { key: 'apiType', label: 'API 타입', value: preset.apiType || '' },
  ];

  function handleFieldChange(key: string, value: any) {
    const newData = structuredClone(data);
    const target = newData.preset || newData;
    target[key] = value;
    dispatch('change', newData);
  }
</script>

<div class="preset-basic-tab">
  <div class="form-grid">
    {#each basicFields as field}
      <div class="form-group">
        <label class="form-label" for={"preset-basic-" + field.key}>{field.label}</label>
        <input
          id={"preset-basic-" + field.key}
          type="text"
          class="form-input"
          value={field.value}
          on:input={(e) => handleFieldChange(field.key, e.currentTarget.value)}
        />
      </div>
    {/each}
  </div>
</div>

<style>
  .preset-basic-tab {
    padding: 1rem;
    height: 100%;
    overflow-y: auto;
    background: var(--risu-theme-bgcolor, #1a1a1a);
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1rem;
    max-width: 1200px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .form-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--risu-theme-textcolor2, #aaa);
  }

  .form-input {
    padding: 0.625rem 0.75rem;
    background: var(--risu-theme-darkbg, #252525);
    border: 1px solid var(--risu-theme-borderc, #444);
    border-radius: 6px;
    color: var(--risu-theme-textcolor, #fff);
    font-size: 0.875rem;
    transition: border-color 0.15s;
  }

  .form-input:focus {
    outline: none;
    border-color: var(--risu-theme-primary-600, #4682B4);
  }
</style>
