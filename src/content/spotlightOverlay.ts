import { FONT_SANS } from '../ui/fontStack';
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

const SPOTLIGHT_MISS_GRACE_MS = 800;

let generation = 0;
let removing = false;
let shadowHost: HTMLElement | null = null;
let activeTarget: Element | null = null;
let unlisten: Cleanup | null = null;

export function spotlightCovers(selector: string): boolean {
  if (!shadowHost?.isConnected || !activeTarget?.isConnected) {
    return false;
  }

  try {
    return activeTarget.matches(selector);
  } catch {
    return false;
  }
}

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

export type SpotlightOptions = {
  resolveTarget?: () => Element | null;
};

export function injectGlassSpotlight(
  targetElement: Element,
  guideText: string,
  options?: SpotlightOptions
): SpotlightResult {
  removeSpotlight();
  const token = generation;
  const resolveTarget = options?.resolveTarget;
  let missingSince = 0;
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
    .cityu-hole,
    .cityu-ring,
    .cityu-tooltip {
      pointer-events: none;
    }
    .cityu-hole {
      position: fixed;
      border-radius: ${SPOTLIGHT_RADIUS}px;
      background: transparent;
      --cityu-spread: 100vmax;
      box-shadow:
        0 0 12px 1px rgba(8, 12, 20, 0.32),
        0 0 0 var(--cityu-spread) rgba(8, 12, 20, 0.6);
      animation: cityu-enter 140ms cubic-bezier(0.2, 0, 0, 1) both;
    }
    .cityu-ring {
      position: fixed;
      border: 2px solid #143a66;
      border-radius: ${SPOTLIGHT_RADIUS}px;
      background: transparent;
      box-shadow:
        0 0 0 2px #ffffff,
        0 0 0 5px #1f4e8c;
      animation: cityu-enter 140ms cubic-bezier(0.2, 0, 0, 1) both;
    }
    .cityu-tooltip {
      position: fixed;
      max-width: ${TOOLTIP_MAX_WIDTH}px;
      padding: 12px 14px 12px 18px;
      border-radius: 12px;
      background: #171b22;
      border: 1px solid rgba(255, 255, 255, 0.14);
      box-shadow:
        0 1px 1px rgba(0, 0, 0, 0.18),
        0 12px 28px rgba(0, 0, 0, 0.28);
      color: #f4f6f8;
      font: 500 16px/1.5 ${FONT_SANS};
      letter-spacing: 0;
      overflow-wrap: break-word;
      animation: cityu-enter 140ms cubic-bezier(0.2, 0, 0, 1) both;
    }
    .cityu-tooltip::before {
      content: "";
      position: absolute;
      left: 8px;
      top: 16px;
      width: 3px;
      height: 16px;
      border-radius: 999px;
      background: #8fb4e8;
    }
    @keyframes cityu-enter {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @media (prefers-reduced-motion: reduce) {
      .cityu-hole,
      .cityu-ring,
      .cityu-tooltip { animation: none; }
    }
  `;

  const hole = doc.createElement('div');
  hole.className = 'cityu-hole';
  const ring = doc.createElement('div');
  ring.className = 'cityu-ring';
  const tooltip = doc.createElement('div');
  tooltip.className = 'cityu-tooltip';
  tooltip.setAttribute('role', 'status');
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
      let replacement: Element | null = null;
      try {
        replacement = resolveTarget?.() ?? null;
      } catch {
        replacement = null;
      }

      if (replacement && replacement.isConnected) {
        if (replacement !== activeTarget) {
          activeTarget.removeAttribute(GUIDE_TARGET_ATTR);
          replacement.setAttribute(GUIDE_TARGET_ATTR, 'true');
          activeTarget = replacement;
        }
        missingSince = 0;
      } else {
        const now = view.performance?.now() ?? Date.now();
        if (missingSince === 0) {
          missingSince = now;
        }
        if (now - missingSince < SPOTLIGHT_MISS_GRACE_MS) {
          return;
        }
        removeSpotlight();
        return;
      }
    } else {
      missingSince = 0;
    }

    const nextTarget = readBox(activeTarget);
    if (!isMeasurableBox(nextTarget)) {
      return;
    }

    const nextHole = holeBox(nextTarget);
    const viewport = { width: view.innerWidth, height: view.innerHeight };
    const spread = Math.max(viewport.width, viewport.height, 1) * 2;
    hole.style.setProperty('--cityu-spread', `${Math.ceil(spread)}px`);
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
