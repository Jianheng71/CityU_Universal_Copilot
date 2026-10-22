import { findHighlightTarget } from './domTarget';
import { clipSelector, type GuideResponse } from '../guide/protocol';
import { injectGlassSpotlight, removeSpotlight, spotlightCovers } from './spotlightOverlay';

export type PageGuideArm = {
  selector: string;
  guideText: string;
  searchFrames?: boolean;
  guideToken?: string;
  onComplete?: (selector: string, departureUrl: string) => void;
};

type ArmedGuide = {
  selector: string;
  guideText: string;
  searchFrames: boolean;
  guideToken: string;
  onComplete?: (selector: string, departureUrl: string) => void;
};

let armed: ArmedGuide | null = null;
let notified = false;
let activationDoc: Document | null = null;
let observer: MutationObserver | null = null;
let observedDoc: Document | null = null;
let ensureFrame = 0;

function isTextEntry(element: Element): boolean {
  if (element instanceof HTMLTextAreaElement) {
    return true;
  }
  if (!(element instanceof HTMLInputElement)) {
    return false;
  }
  const inputType = (element.getAttribute('type') || 'text').toLowerCase();
  return !['button', 'submit', 'image', 'checkbox', 'radio', 'reset', 'file', 'hidden', 'range', 'color'].includes(inputType);
}

function elementLooksVisible(element: Element): boolean {
  const box = element.getBoundingClientRect();
  if (box.width <= 0 || box.height <= 0) {
    return false;
  }
  const view = element.ownerDocument?.defaultView;
  if (!view) {
    return false;
  }
  const style = view.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
    return false;
  }
  return true;
}

function resolveArmed(selector: string): Element | null {
  if (!armed || armed.selector !== selector) {
    return null;
  }
  const found = findHighlightTarget(document, selector, armed.searchFrames);
  if (found.invalid) {
    return null;
  }
  return found.element;
}

function unbindActivation(): void {
  if (!activationDoc) {
    return;
  }
  activationDoc.removeEventListener('click', onActivate, true);
  activationDoc.removeEventListener('keydown', onActivate, true);
  activationDoc = null;
}

function bindActivation(doc: Document): void {
  if (activationDoc === doc) {
    return;
  }
  unbindActivation();
  activationDoc = doc;
  doc.addEventListener('click', onActivate, true);
  doc.addEventListener('keydown', onActivate, true);
}

function disconnectObserver(): void {
  observer?.disconnect();
  observer = null;
  const view = observedDoc?.defaultView;
  if (ensureFrame && view) {
    view.cancelAnimationFrame(ensureFrame);
  }
  ensureFrame = 0;
  observedDoc = null;
}

function watchDocument(doc: Document): void {
  if (observedDoc === doc && observer) {
    return;
  }
  disconnectObserver();
  const root = doc.body ?? doc.documentElement;
  const view = doc.defaultView;
  if (!root || !view) {
    return;
  }

  observer = new MutationObserver(() => {
    if (!armed || ensureFrame) {
      return;
    }
    ensureFrame = view.requestAnimationFrame(() => {
      ensureFrame = 0;
      ensureArmedSpotlight();
    });
  });
  observer.observe(root, { childList: true, subtree: true });
  observedDoc = doc;
}

function drawArmed(target: Element): GuideResponse {
  if (!armed) {
    return { ok: false, code: 'no-selector', reason: 'No guide is active in this frame.' };
  }

  const doc = target.ownerDocument ?? document;
  if (!elementLooksVisible(target)) {
    watchDocument(doc);
    return {
      ok: false,
      code: 'element-not-visible',
      reason: 'The AIMS element has no visible size to highlight.'
    };
  }

  const selector = armed.selector;
  const drawn = injectGlassSpotlight(target, armed.guideText, {
    resolveTarget: () => resolveArmed(selector)
  });
  if (!drawn.ok) {
    watchDocument(doc);
    return drawn;
  }

  bindActivation(doc);
  watchDocument(doc);
  return { ok: true, code: 'ok', selector, visible: elementLooksVisible(target) };
}

function ensureArmedSpotlight(): void {
  if (!armed || spotlightCovers(armed.selector)) {
    return;
  }
  const found = findHighlightTarget(document, armed.selector, armed.searchFrames);
  if (found.invalid || !found.element) {
    return;
  }
  drawArmed(found.element);
}

function activatedTarget(raw: Element): Element | null {
  if (!armed) {
    return null;
  }
  const found = findHighlightTarget(document, armed.selector, armed.searchFrames);
  const target = found.element;
  if (!target || found.invalid) {
    return null;
  }
  if (raw === target || target.contains(raw)) {
    return target;
  }
  return null;
}

function onActivate(event: Event): void {
  if (!armed || notified) {
    return;
  }
  const raw = event.target;
  if (!(raw instanceof Element)) {
    return;
  }

  const match = activatedTarget(raw);
  if (!match) {
    return;
  }

  if (event.type === 'keydown') {
    const keyEvent = event as KeyboardEvent;
    if (keyEvent.metaKey || keyEvent.ctrlKey || keyEvent.altKey || keyEvent.repeat) {
      return;
    }
    if (isTextEntry(match)) {
      if (keyEvent.key !== 'Enter') {
        return;
      }
    } else if (keyEvent.key !== 'Enter' && keyEvent.key !== ' ') {
      return;
    }
  } else {
    const mouse = event as MouseEvent;
    if (typeof mouse.button === 'number' && mouse.button !== 0) {
      return;
    }
    if (mouse.metaKey || mouse.ctrlKey || mouse.shiftKey || mouse.altKey) {
      return;
    }
    if (isTextEntry(match)) {
      return;
    }
  }

  notified = true;
  const selector = armed.selector;
  const departureUrl = window.location.href;
  try {
    armed.onComplete?.(selector, departureUrl);
  } catch {
    // Completion still sticks when the notifier fails. The next page can restore the guide.
  }
}

export function disarmPageGuide(): void {
  armed = null;
  notified = false;
  unbindActivation();
  disconnectObserver();
  removeSpotlight();
}

export function armPageGuide(guide: PageGuideArm): GuideResponse {
  const selector = guide.selector.trim();
  if (!selector || selector === 'body') {
    return { ok: false, code: 'no-selector', reason: 'No target selector was provided.' };
  }

  const searchFrames = guide.searchFrames === true;
  const guideToken = guide.guideToken ?? '';
  const sameStep = Boolean(armed && armed.selector === selector && armed.guideText === guide.guideText && armed.guideToken === guideToken);
  if (sameStep && spotlightCovers(selector)) {
    armed = { selector, guideText: guide.guideText, searchFrames, guideToken, onComplete: guide.onComplete };
    const existing = findHighlightTarget(document, selector, searchFrames);
    if (existing.element?.ownerDocument) {
      bindActivation(existing.element.ownerDocument);
      watchDocument(existing.element.ownerDocument);
    }
    return {
      ok: true,
      code: 'ok',
      selector,
      visible: existing.element ? elementLooksVisible(existing.element) : true
    };
  }

  const found = findHighlightTarget(document, selector, searchFrames);
  if (found.invalid) {
    return {
      ok: false,
      code: 'invalid-selector',
      reason: `The highlight selector is not valid CSS (${clipSelector(selector)}).`
    };
  }
  if (!found.element) {
    // Keep a spotlight that is already showing the previous step. Watch this
    // document so the highlight appears when the next target is inserted,
    // including after a navigation that has not finished rendering.
    if (!sameStep) {
      notified = false;
    }
    armed = { selector, guideText: guide.guideText, searchFrames, guideToken, onComplete: guide.onComplete };
    watchDocument(document);
    return {
      ok: false,
      code: 'element-not-found',
      reason: 'The requested AIMS element was not found in this frame.'
    };
  }

  if (!sameStep) {
    notified = false;
  }
  armed = { selector, guideText: guide.guideText, searchFrames, guideToken, onComplete: guide.onComplete };
  return drawArmed(found.element);
}
