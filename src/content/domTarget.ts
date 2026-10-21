import { SPOTLIGHT_HOST_ID } from './constants';

export type HighlightSearch = {
  element: Element | null;
  invalid: boolean;
};

function isFrameElement(node: Element): node is HTMLIFrameElement | HTMLFrameElement {
  return node instanceof HTMLIFrameElement || node instanceof HTMLFrameElement;
}

export function querySelectorDeep(root: ParentNode, selector: string): Element | null {
  const matches = root.querySelectorAll(selector);
  for (const match of matches) {
    if (match.id === SPOTLIGHT_HOST_ID) {
      continue;
    }
    return match;
  }

  const nodes = root.querySelectorAll('*');
  for (const node of nodes) {
    if (node.id === SPOTLIGHT_HOST_ID || !node.shadowRoot) {
      continue;
    }
    const found = querySelectorDeep(node.shadowRoot, selector);
    if (found) {
      return found;
    }
  }

  return null;
}

export function findHighlightTarget(doc: Document, selector: string, searchFrames: boolean): HighlightSearch {
  let local: Element | null = null;
  try {
    local = querySelectorDeep(doc, selector);
  } catch {
    return { element: null, invalid: true };
  }

  if (local) {
    return { element: local, invalid: false };
  }

  if (!searchFrames) {
    return { element: null, invalid: false };
  }

  const frames = doc.querySelectorAll('iframe, frame');
  for (const frame of frames) {
    if (!isFrameElement(frame)) {
      continue;
    }

    let child: Document | null = null;
    try {
      child = frame.contentDocument;
    } catch {
      child = null;
    }

    if (!child) {
      continue;
    }

    const nested = findHighlightTarget(child, selector, true);
    if (nested.invalid || nested.element) {
      return nested;
    }
  }

  return { element: null, invalid: false };
}
