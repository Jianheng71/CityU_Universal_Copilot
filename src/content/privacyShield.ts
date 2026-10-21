import { SPOTLIGHT_HOST_ID } from './constants';

const FIELD_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
const SECRET_TOKENS = ['password', 'passwd', 'pwd', 'passcode', 'pin', 'otp', 'hkid', 'passport', 'ssn', 'cvv'];

export type SensitiveFieldMeta = {
  tagName: string;
  inputType?: string;
  autocomplete?: string;
  id?: string;
  name?: string;
  placeholder?: string;
  ariaLabel?: string;
  dataSensitive?: string | null;
  spotlightHost?: boolean;
};

function containsToken(haystack: string, token: string): boolean {
  let from = 0;
  while (from <= haystack.length - token.length) {
    const at = haystack.indexOf(token, from);
    if (at < 0) {
      return false;
    }
    const before = at === 0 ? '' : haystack.charAt(at - 1);
    const after = haystack.charAt(at + token.length);
    const boundary = (char: string): boolean => char === '' || !/[a-z0-9]/i.test(char);
    if (boundary(before) && boundary(after)) {
      return true;
    }
    from = at + token.length;
  }
  return false;
}

export function isSensitiveFieldMeta(meta: SensitiveFieldMeta): boolean {
  if (meta.spotlightHost) {
    return false;
  }

  const marked = (meta.dataSensitive ?? '').trim().toLowerCase();
  if (marked && marked !== 'false' && marked !== '0') {
    return true;
  }

  const tag = meta.tagName.toUpperCase();
  const inputType = (meta.inputType ?? '').toLowerCase();
  if (tag === 'INPUT' && inputType === 'password') {
    return true;
  }

  const autocomplete = (meta.autocomplete ?? '').toLowerCase();
  if (
    autocomplete.includes('cc-number') ||
    autocomplete.includes('current-password') ||
    autocomplete.includes('new-password')
  ) {
    return true;
  }

  if (!FIELD_TAGS.has(tag) || inputType === 'hidden') {
    return false;
  }

  const haystack = [meta.id, meta.name, meta.autocomplete, meta.placeholder, meta.ariaLabel]
    .filter((part): part is string => Boolean(part))
    .join(' ')
    .toLowerCase();

  return SECRET_TOKENS.some((token) => containsToken(haystack, token));
}

export function isSensitiveElement(element: HTMLElement): boolean {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const inputNode = element instanceof HTMLInputElement ? element : null;
  return isSensitiveFieldMeta({
    tagName: element.tagName,
    inputType: inputNode ? inputNode.type : (element.getAttribute('type') ?? ''),
    autocomplete: inputNode?.autocomplete || element.getAttribute('autocomplete') || '',
    id: element.id,
    name: element.getAttribute('name') ?? '',
    placeholder: element.getAttribute('placeholder') ?? '',
    ariaLabel: element.getAttribute('aria-label') ?? '',
    dataSensitive: element.getAttribute('data-sensitive'),
    spotlightHost: element.id === SPOTLIGHT_HOST_ID
  });
}

export function initDynamicPrivacyShield(onTriggerPrivacy: () => void): void {
  if (typeof document === 'undefined') {
    return;
  }

  const trigger = (event: Event): void => {
    const target = event.target as HTMLElement | null;
    if (!target || !isSensitiveElement(target)) {
      return;
    }
    onTriggerPrivacy();
  };

  document.addEventListener('focusin', trigger, true);
  document.addEventListener('input', trigger, true);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      const addedNodes = Array.from(mutation.addedNodes ?? []) as Element[];
      for (const node of addedNodes) {
        if (!(node instanceof HTMLElement)) {
          continue;
        }

        if (isSensitiveElement(node)) {
          onTriggerPrivacy();
          return;
        }

        const nested = node.querySelectorAll?.('input, textarea, select');
        if (nested && Array.from(nested).some((element) => isSensitiveElement(element as HTMLElement))) {
          onTriggerPrivacy();
          return;
        }
      }
    }
  });

  const observeRoot = document.body ?? document.documentElement;
  if (observeRoot) {
    observer.observe(observeRoot, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['type', 'name', 'id', 'autocomplete', 'placeholder', 'aria-label', 'data-sensitive']
    });
  }

  const cleanup = (): void => {
    document.removeEventListener('focusin', trigger, true);
    document.removeEventListener('input', trigger, true);
    observer.disconnect();
  };

  if (typeof window !== 'undefined') {
    (window as typeof window & { __cityuPrivacyCleanup?: () => void }).__cityuPrivacyCleanup = cleanup;
  }
}
