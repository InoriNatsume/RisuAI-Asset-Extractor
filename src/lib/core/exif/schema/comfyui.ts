/**
 * ComfyUI 메타데이터 스키마 파서
 * - 노드 기반 워크플로우 파싱
 * - 프롬프트 추출 (KSampler, CLIPTextEncode 등)
 * - 모델/체크포인트 정보 추출
 */

import type { ComfyWorkflow, ComfyNode, ComfyEdge } from '../types';

/** ComfyUI 정규화 결과 */
export interface ComfyNormalizedMeta {
  /** 긍정 프롬프트 */
  positive: string;
  /** 부정 프롬프트 */
  negative: string;
  
  /** 샘플링 스텝 */
  steps?: number;
  /** CFG 스케일 */
  cfg?: number;
  /** 샘플러 이름 */
  sampler?: string;
  /** 스케줄러 이름 */
  scheduler?: string;
  /** 시드 */
  seed?: number | string;
  /** 디노이즈 강도 */
  denoise?: number;
  
  /** 이미지 너비 */
  width?: number;
  /** 이미지 높이 */
  height?: number;
  
  /** 체크포인트/모델 이름 */
  checkpoint?: string;
  /** VAE 이름 */
  vae?: string;
  /** LoRA 목록 */
  loras: LoraInfo[];
  
  /** 워크플로우 (있는 경우) */
  workflow?: ComfyWorkflow;
  /** 프롬프트 (노드 구조) */
  prompt?: Record<string, ComfyNodeData>;
  
  /** 원본 데이터 */
  raw: unknown;
}

/** LoRA 정보 */
export interface LoraInfo {
  name: string;
  strength?: number;
  modelStrength?: number;
  clipStrength?: number;
}

/** 노드 데이터 */
export interface ComfyNodeData {
  class_type: string;
  inputs: Record<string, unknown>;
  _meta?: { title?: string };
}

/**
 * ComfyUI 프롬프트 JSON 파싱
 */
export function parseComfyPrompt(prompt: unknown): ComfyNormalizedMeta | null {
  if (!prompt || typeof prompt !== 'object') return null;
  
  const nodes = prompt as Record<string, ComfyNodeData>;
  const nodeEntries = Object.entries(nodes);
  
  if (nodeEntries.length === 0) return null;
  
  // 노드 타입별 분류
  const nodesByType = groupNodesByType(nodes);
  
  // 프롬프트 추출
  const { positive, negative } = extractPrompts(nodes, nodesByType);
  
  // 샘플러 파라미터 추출
  const samplerParams = extractSamplerParams(nodesByType);
  
  // 이미지 크기 추출
  const { width, height } = extractImageSize(nodesByType);
  
  // 모델 정보 추출
  const checkpoint = extractCheckpoint(nodesByType);
  const vae = extractVAE(nodesByType);
  const loras = extractLoras(nodesByType);
  
  return {
    positive,
    negative,
    ...samplerParams,
    width,
    height,
    checkpoint,
    vae,
    loras,
    prompt: nodes,
    raw: prompt,
  };
}

/**
 * ComfyUI 워크플로우 파싱
 */
export function parseComfyWorkflow(workflow: unknown): ComfyWorkflow | null {
  if (!workflow || typeof workflow !== 'object') return null;
  
  const obj = workflow as Record<string, unknown>;
  
  if (!Array.isArray(obj.nodes)) return null;
  
  const nodes: ComfyNode[] = (obj.nodes as unknown[]).map(n => {
    const node = n as Record<string, unknown>;
    return {
      id: node.id as number,
      type: node.type as string,
      title: node.title as string | undefined,
      inputs: node.inputs as unknown[] | undefined,
      outputs: node.outputs as unknown[] | undefined,
      properties: node.properties as Record<string, unknown> | undefined,
      widgets_values: node.widgets_values as unknown[] | undefined,
      pos: node.pos as [number, number] | undefined,
      size: node.size as [number, number] | undefined,
    };
  });
  
  const edges: ComfyEdge[] = (Array.isArray(obj.links) ? obj.links : []).map(l => {
    const link = l as unknown[];
    return {
      id: link[0] as number,
      sourceNodeId: link[1] as number,
      sourceSlot: link[2] as number,
      targetNodeId: link[3] as number,
      targetSlot: link[4] as number,
      type: link[5] as string | undefined,
    };
  });
  
  return {
    nodes,
    edges,
    version: obj.version as number | undefined,
    lastNodeId: obj.last_node_id as number | undefined,
    lastLinkId: obj.last_link_id as number | undefined,
    groups: obj.groups as unknown[] | undefined,
  };
}

// === 추출 함수들 ===

function groupNodesByType(nodes: Record<string, ComfyNodeData>): Map<string, Array<[string, ComfyNodeData]>> {
  const map = new Map<string, Array<[string, ComfyNodeData]>>();
  
  for (const [id, node] of Object.entries(nodes)) {
    const type = node.class_type || '';
    if (!map.has(type)) {
      map.set(type, []);
    }
    map.get(type)!.push([id, node]);
  }
  
  return map;
}

function extractPrompts(
  nodes: Record<string, ComfyNodeData>,
  nodesByType: Map<string, Array<[string, ComfyNodeData]>>
): { positive: string; negative: string } {
  let positive = '';
  let negative = '';
  
  // CLIPTextEncode 노드에서 직접 추출
  const clipEncoders = nodesByType.get('CLIPTextEncode') || [];
  
  for (const [id, node] of clipEncoders) {
    const text = node.inputs?.text;
    if (typeof text !== 'string') continue;
    
    // 노드 제목이나 연결 상태로 긍정/부정 구분
    const title = node._meta?.title?.toLowerCase() || '';
    if (title.includes('negative') || title.includes('neg') || title.includes('uc')) {
      if (!negative) negative = text;
    } else {
      if (!positive) positive = text;
    }
  }
  
  // KSampler 입력에서 연결 추적
  if (!positive || !negative) {
    const samplers = [
      ...(nodesByType.get('KSampler') || []),
      ...(nodesByType.get('KSamplerAdvanced') || []),
      ...(nodesByType.get('SamplerCustom') || []),
    ];
    
    for (const [id, node] of samplers) {
      const posInput = node.inputs?.positive;
      const negInput = node.inputs?.negative;
      
      // 링크 참조인 경우 (배열 형태 [node_id, slot])
      if (Array.isArray(posInput) && !positive) {
        const linkedText = resolveTextFromLink(nodes, posInput[0]);
        if (linkedText) positive = linkedText;
      }
      if (Array.isArray(negInput) && !negative) {
        const linkedText = resolveTextFromLink(nodes, negInput[0]);
        if (linkedText) negative = linkedText;
      }
    }
  }
  
  return { positive, negative };
}

function resolveTextFromLink(nodes: Record<string, ComfyNodeData>, nodeId: unknown): string | null {
  // 노드 ID로 텍스트 찾기
  for (const [id, node] of Object.entries(nodes)) {
    if (id === String(nodeId) || node.inputs?.['id'] === nodeId) {
      const text = node.inputs?.text;
      if (typeof text === 'string') return text;
    }
  }
  return null;
}

function extractSamplerParams(nodesByType: Map<string, Array<[string, ComfyNodeData]>>): Partial<ComfyNormalizedMeta> {
  const samplers = [
    ...(nodesByType.get('KSampler') || []),
    ...(nodesByType.get('KSamplerAdvanced') || []),
    ...(nodesByType.get('SamplerCustom') || []),
  ];
  
  if (samplers.length === 0) return {};
  
  const [, node] = samplers[0];
  const inputs = node.inputs || {};
  
  return {
    steps: parseNumber(inputs.steps),
    cfg: parseNumber(inputs.cfg),
    sampler: parseString(inputs.sampler_name),
    scheduler: parseString(inputs.scheduler),
    seed: parseSeed(inputs.seed) ?? parseSeed(inputs.noise_seed),
    denoise: parseNumber(inputs.denoise),
  };
}

function extractImageSize(nodesByType: Map<string, Array<[string, ComfyNodeData]>>): { width?: number; height?: number } {
  // EmptyLatentImage에서 크기 추출
  const latentNodes = nodesByType.get('EmptyLatentImage') || [];
  if (latentNodes.length > 0) {
    const inputs = latentNodes[0][1].inputs || {};
    return {
      width: parseNumber(inputs.width),
      height: parseNumber(inputs.height),
    };
  }
  
  // EmptySD3LatentImage 등 다른 노드 확인
  for (const [type, nodes] of nodesByType) {
    if (type.includes('LatentImage') || type.includes('EmptyLatent')) {
      const inputs = nodes[0][1].inputs || {};
      const w = parseNumber(inputs.width);
      const h = parseNumber(inputs.height);
      if (w && h) return { width: w, height: h };
    }
  }
  
  return {};
}

function extractCheckpoint(nodesByType: Map<string, Array<[string, ComfyNodeData]>>): string | undefined {
  const loaders = [
    ...(nodesByType.get('CheckpointLoaderSimple') || []),
    ...(nodesByType.get('CheckpointLoader') || []),
    ...(nodesByType.get('UNETLoader') || []),
  ];
  
  if (loaders.length === 0) return undefined;
  
  const inputs = loaders[0][1].inputs || {};
  return parseString(inputs.ckpt_name) || parseString(inputs.unet_name);
}

function extractVAE(nodesByType: Map<string, Array<[string, ComfyNodeData]>>): string | undefined {
  const vaeLoaders = nodesByType.get('VAELoader') || [];
  if (vaeLoaders.length === 0) return undefined;
  
  const inputs = vaeLoaders[0][1].inputs || {};
  return parseString(inputs.vae_name);
}

function extractLoras(nodesByType: Map<string, Array<[string, ComfyNodeData]>>): LoraInfo[] {
  const loras: LoraInfo[] = [];
  
  const loraLoaders = [
    ...(nodesByType.get('LoraLoader') || []),
    ...(nodesByType.get('LoRALoader') || []),
    ...(nodesByType.get('LoraLoaderModelOnly') || []),
  ];
  
  for (const [, node] of loraLoaders) {
    const inputs = node.inputs || {};
    const name = parseString(inputs.lora_name);
    if (!name) continue;
    
    loras.push({
      name,
      strength: parseNumber(inputs.strength) ?? parseNumber(inputs.strength_model),
      modelStrength: parseNumber(inputs.strength_model),
      clipStrength: parseNumber(inputs.strength_clip),
    });
  }
  
  return loras;
}

// === 유틸리티 ===

function parseString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  return undefined;
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && !isNaN(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    if (!isNaN(n)) return n;
  }
  return undefined;
}

function parseSeed(value: unknown): number | string | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    if (/^\d{15,}$/.test(value)) return value;
    const n = Number(value);
    if (!isNaN(n)) return n;
  }
  return undefined;
}
