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
};

export type ShowGuideRequest = {
  type: 'show-guide';
  selector?: string;
  guideText?: string;
  searchFrames?: boolean;
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
