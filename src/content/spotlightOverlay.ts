import { GUIDE_TARGET_ATTR, SPOTLIGHT_HOST_ID } from './constants';
import {
  clampTooltip,
  holeBox,
  isMeasurableBox,
  SPOTLIGHT_RADIUS,
  TOOLTIP_MAX_WIDTH,
  type Box
} from './spotlightGeometry';

type Cleanup = () => void;

let generation = 0;
let removing = false;
let shadowHost: HTMLElement | null = null;
let activeTarget: Element | null = null;
let unlisten: Cleanup | null = null;

function viewOf(element: Element): Window | null {
  return element.ownerDocument?.defaultView ?? null;
}

function readBox(element: Element): Box {
  const rect = element.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

export function removeSpotlight(): void {
  if (removing) {
    return;
  }

  removing = true;
  try {
    generation += 1;
    unlisten?.();
    unlisten = null;
    activeTarget?.removeAttribute(GUIDE_TARGET_ATTR);
    activeTarget = null;
    shadowHost?.remove();
    shadowHost = null;
  } finally {
    removing = false;
  }
}

export type SpotlightResult =
  | { ok: true }
  | { ok: false; code: 'element-not-visible' | 'highlight-failed'; reason: string };

export function injectGlassSpotlight(targetElement: Element, guideText: string): SpotlightResult {
  removeSpotlight();
  const token = generation;
  const doc = targetElement.ownerDocument;
  const view = doc?.defaultView ?? null;
  const root = doc?.body ?? doc?.documentElement ?? null;

  if (!doc || !view || !root) {
    return { ok: false, code: 'highlight-failed', reason: 'The AIMS document is not ready for a spotlight.' };
  }

  if (!targetElement.isConnected) {
    return { ok: false, code: 'element-not-visible', reason: 'The AIMS element is not attached to the page.' };
  }

  try {
    targetElement.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
  } catch {
    // Some legacy frame elements reject scroll options; the position update still runs.
  }

  if (token !== generation) {
    return { ok: false, code: 'highlight-failed', reason: 'The spotlight was cleared before it could be drawn.' };
  }

  const targetBox = readBox(targetElement);
  if (!isMeasurableBox(targetBox)) {
    return {
      ok: false,
      code: 'element-not-visible',
      reason: 'The AIMS element has no visible size to highlight.'
    };
  }

  const host = doc.createElement('div');
  host.id = SPOTLIGHT_HOST_ID;
  host.setAttribute('data-cityu-spotlight-root', 'true');
  host.style.position = 'fixed';
  host.style.inset = '0';
  host.style.width = '100%';
  host.style.height = '100%';
  host.style.margin = '0';
  host.style.padding = '0';
  host.style.border = '0';
  host.style.pointerEvents = 'none';
  host.style.zIndex = '2147483646';
  host.style.overflow = 'visible';
  host.style.background = 'transparent';
  root.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });
  const style = doc.createElement('style');
  style.textContent = `
    * { box-sizing: border-box; }
    .cityu-hole {
      position: fixed;
      border-radius: ${SPOTLIGHT_RADIUS}px;
      background: transparent;
      box-shadow: 0 0 0 100vmax rgba(7, 12, 24, 0.66);
    }
    .cityu-ring {
      position: fixed;
      border: 2px solid #bfdbfe;
      border-radius: ${SPOTLIGHT_RADIUS}px;
      box-shadow:
        0 0 0 4px rgba(59, 130, 246, 0.28),
        0 0 22px rgba(96, 165, 250, 0.95);
      animation: cityu-pulse 1.6s ease-out infinite;
    }
    .cityu-tooltip {
      position: fixed;
      max-width: ${TOOLTIP_MAX_WIDTH}px;
      padding: 10px 12px 10px 28px;
      border-radius: 12px;
      background: rgba(15, 23, 42, 0.9);
      border: 1px solid rgba(191, 219, 254, 0.45);
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35);
      color: #f8fafc;
      font: 13px/1.45 "Segoe UI", sans-serif;
      letter-spacing: 0.01em;
      backdrop-filter: blur(12px);
    }
    .cityu-tooltip::before {
      content: "";
      position: absolute;
      left: 12px;
      top: 15px;
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: #60a5fa;
      box-shadow: 0 0 10px rgba(96, 165, 250, 0.95);
    }
    @keyframes cityu-pulse {
      0%, 100% { box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.28), 0 0 16px rgba(96, 165, 250, 0.8); }
      50% { box-shadow: 0 0 0 8px rgba(59, 130, 246, 0.16), 0 0 28px rgba(147, 197, 253, 1); }
    }
    @media (prefers-reduced-motion: reduce) {
      .cityu-ring { animation: none; }
    }
  `;

  const hole = doc.createElement('div');
  hole.className = 'cityu-hole';
  const ring = doc.createElement('div');
  ring.className = 'cityu-ring';
  const tooltip = doc.createElement('div');
  tooltip.className = 'cityu-tooltip';
  tooltip.textContent = guideText;

  shadow.append(style, hole, ring, tooltip);
  targetElement.setAttribute(GUIDE_TARGET_ATTR, 'true');
  shadowHost = host;
  activeTarget = targetElement;

  const place = (): void => {
    if (token !== generation || !activeTarget || !shadowHost) {
      return;
    }

    if (!activeTarget.isConnected) {
      removeSpotlight();
      return;
    }

    const nextTarget = readBox(activeTarget);
    if (!isMeasurableBox(nextTarget)) {
      return;
    }

    const nextHole = holeBox(nextTarget);
    const viewport = { width: view.innerWidth, height: view.innerHeight };
    const spread = Math.max(viewport.width, viewport.height, 1) * 2;
    hole.style.boxShadow = `0 0 0 ${Math.ceil(spread)}px rgba(7, 12, 24, 0.66)`;
    for (const layer of [hole, ring]) {
      layer.style.left = `${nextHole.left}px`;
      layer.style.top = `${nextHole.top}px`;
      layer.style.width = `${nextHole.width}px`;
      layer.style.height = `${nextHole.height}px`;
    }

    const tipWidth = tooltip.offsetWidth || TOOLTIP_MAX_WIDTH;
    const tipHeight = tooltip.offsetHeight || 48;
    const tip = clampTooltip(nextHole, viewport, { width: tipWidth, height: tipHeight });
    tooltip.style.left = `${tip.left}px`;
    tooltip.style.top = `${tip.top}px`;
  };

  let frame = 0;
  const tick = (): void => {
    if (token !== generation) {
      return;
    }
    place();
    if (token !== generation) {
      return;
    }
    frame = view.requestAnimationFrame(tick);
  };

  const onScroll = (): void => {
    if (token === generation) {
      place();
    }
  };
  view.addEventListener('scroll', onScroll, true);
  view.addEventListener('resize', onScroll);
  view.visualViewport?.addEventListener('scroll', onScroll);
  view.visualViewport?.addEventListener('resize', onScroll);

  frame = view.requestAnimationFrame(tick);
  unlisten = () => {
    view.removeEventListener('scroll', onScroll, true);
    view.removeEventListener('resize', onScroll);
    view.visualViewport?.removeEventListener('scroll', onScroll);
    view.visualViewport?.removeEventListener('resize', onScroll);
    if (frame) {
      view.cancelAnimationFrame(frame);
      frame = 0;
    }
  };

  place();
  return { ok: true };
}
