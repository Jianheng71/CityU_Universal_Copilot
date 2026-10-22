export type GuideCode =
  | 'ok'
  | 'no-selector'
  | 'invalid-selector'
  | 'element-not-found'
  | 'element-not-visible'
  | 'no-tab'
  | 'content-script-unavailable'
  | 'frame-scan-failed'
  | 'no-ack'
  | 'highlight-failed';

export type GuideResponse = {
  ok: boolean;
  code?: GuideCode;
  reason?: string;
  selector?: string;
  frameId?: number;
  visible?: boolean;
  phase?: 'showing' | 'finished';
};

export type GuideNotice = 'highlighted' | 'waiting' | 'finished' | 'no-tab' | 'failed';

export function interpretGuideResult(response: GuideResponse): GuideNotice {
  if (response.phase === 'finished') {
    return 'finished';
  }
  if (response.ok) {
    return 'highlighted';
  }
  if (response.code === 'element-not-found' || response.code === 'element-not-visible') {
    return 'waiting';
  }
  if (response.code === 'no-tab') {
    return 'no-tab';
  }
  return 'failed';
}

export type GuideStepMessage = {
  stepId?: number;
  targetSelector?: string;
  guideText?: string;
};

export type StartGuideRequest = {
  type: 'start-guide';
  workflowKey?: string;
  steps?: GuideStepMessage[];
  tabId?: number;
};

export type ShowGuideRequest = {
  type: 'show-guide';
  selector?: string;
  guideText?: string;
  searchFrames?: boolean;
  guideToken?: string;
};

export type ClearGuideRequest = {
  type: 'clear-guide';
  tabId?: number;
};

export type RouteToAimsRequest = {
  type: 'route-to-aims';
  selector?: string;
  guideText?: string;
  tabId?: number;
};

export function clipSelector(selector: string): string {
  const compact = selector.replace(/\s+/g, ' ').trim();
  return compact.length > 180 ? `${compact.slice(0, 177)}...` : compact;
}
