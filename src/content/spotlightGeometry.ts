export const SPOTLIGHT_PAD = 8;
export const SPOTLIGHT_RADIUS = 12;
export const TOOLTIP_GAP = 16;
export const TOOLTIP_MARGIN = 12;
export const TOOLTIP_MAX_WIDTH = 260;

export type Box = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type Viewport = {
  width: number;
  height: number;
};

export function isMeasurableBox(box: Box): boolean {
  return box.width > 0 && box.height > 0 && Number.isFinite(box.left) && Number.isFinite(box.top);
}

export function holeBox(target: Box, pad = SPOTLIGHT_PAD): Box {
  return {
    left: target.left - pad,
    top: target.top - pad,
    width: Math.max(0, target.width + pad * 2),
    height: Math.max(0, target.height + pad * 2)
  };
}

export function clampTooltip(
  anchor: Box,
  viewport: Viewport,
  tip: { width: number; height: number },
  gap = TOOLTIP_GAP,
  margin = TOOLTIP_MARGIN
): { left: number; top: number } {
  let left = anchor.left + anchor.width + gap;
  let top = Math.max(margin, anchor.top);

  if (left + tip.width > viewport.width - margin) {
    const leftSide = anchor.left - gap - tip.width;
    if (leftSide >= margin) {
      left = leftSide;
    } else {
      const maxLeft = Math.max(margin, viewport.width - tip.width - margin);
      left = Math.min(Math.max(margin, anchor.left), maxLeft);
      top = anchor.top + anchor.height + gap;
    }
  }

  if (top + tip.height > viewport.height - margin) {
    const above = anchor.top - gap - tip.height;
    top = above >= margin ? above : Math.max(margin, viewport.height - tip.height - margin);
  }

  const maxLeft = Math.max(margin, viewport.width - tip.width - margin);
  const maxTop = Math.max(margin, viewport.height - tip.height - margin);
  left = Math.min(Math.max(margin, left), maxLeft);
  top = Math.min(Math.max(margin, top), maxTop);
  return { left, top };
}
