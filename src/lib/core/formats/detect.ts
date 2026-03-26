import { detectBotContainer } from './charx';
import { isRisumFile } from './risum';
import { isRisupFile, isRisupresetFile } from './risup';

export type DetectedInputKind =
  | 'charx'
  | 'jpeg'
  | 'png'
  | 'risum'
  | 'risup'
  | 'risupreset';

export type DetectedHandlerKind = 'bot' | 'module' | 'preset';

export interface DetectedInputFormat {
  kind: DetectedInputKind;
  handler: DetectedHandlerKind;
  displayType: 'charx' | 'jpeg' | 'png' | 'risum' | 'risup';
}

export function detectInputFormat(
  data: Uint8Array,
  fileName = ''
): DetectedInputFormat {
  if (isRisumFile(data)) {
    return {
      kind: 'risum',
      handler: 'module',
      displayType: 'risum'
    };
  }

  try {
    const container = detectBotContainer(data);
    if (container.kind === 'png-chunks') {
      return {
        kind: 'png',
        handler: 'bot',
        displayType: 'png'
      };
    }

    if (container.kind === 'jpeg-zip') {
      return {
        kind: 'jpeg',
        handler: 'bot',
        displayType: 'jpeg'
      };
    }

    return {
      kind: 'charx',
      handler: 'bot',
      displayType: 'charx'
    };
  } catch {
    // no-op: not a bot container
  }

  if (isRisupFile(data)) {
    return {
      kind: 'risup',
      handler: 'preset',
      displayType: 'risup'
    };
  }

  if (isRisupresetFile(data)) {
    return {
      kind: 'risupreset',
      handler: 'preset',
      displayType: 'risup'
    };
  }

  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith('.risup')) {
    return {
      kind: 'risup',
      handler: 'preset',
      displayType: 'risup'
    };
  }

  if (lowerName.endsWith('.risupreset')) {
    return {
      kind: 'risupreset',
      handler: 'preset',
      displayType: 'risup'
    };
  }

  throw new Error('지원하지 않는 파일 형식입니다. 확장자가 아니라 실제 포맷 시그니처를 확인해주세요.');
}
