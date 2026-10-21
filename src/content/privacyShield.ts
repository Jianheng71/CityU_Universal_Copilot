import { SPOTLIGHT_HOST_ID } from './constants';

const SAFE_ATTRIBUTE_KEYS = [
  'name',
  'id',
  'autocomplete',
  'aria-label',
  'placeholder',
  'class',
  'data-testid',
  'data-field',
  'data-sensitive'
];

const SENSITIVE_TOKENS = [
  'password',
  'passwd',
  'pwd',
  'passcode',
  'pin',
  'secret',
  'token',
  'api',
  'key',
  'passport',
  'hkid',
  'eid',
  'studentid',
  'student_id',
  'nationalid',
  'national_id',
  'idnumber',
  'creditcard',
  'bank',
  'routing',
  'account',
  'cvv',
  'ssn'
];

export function isSensitiveElement(element: HTMLElement): boolean {
  if (!(element instanceof HTMLElement) || element.id === SPOTLIGHT_HOST_ID) {
    return false;
  }

  const inputNode = element instanceof HTMLInputElement ? element : null;
  const type = inputNode?.type?.toLowerCase() ?? '';

  if (inputNode && (type === 'password' || type === 'hidden')) {
    return true;
  }

  const combinedText = SAFE_ATTRIBUTE_KEYS.map((attributeName) => {
    const value = element.getAttribute(attributeName);
    return value ?? '';
  }).join(' ').toLowerCase();

  const normalized = `${element.tagName} ${combinedText}`;

  if (normalized.includes('password') || normalized.includes('passport')) {
    return true;
  }

  if (inputNode && inputNode.autocomplete) {
    const autocomplete = inputNode.autocomplete.toLowerCase();
    if (autocomplete.includes('cc-number') || autocomplete.includes('current-password') || autocomplete.includes('new-password')) {
      return true;
    }
  }

  return SENSITIVE_TOKENS.some((token) => normalized.includes(token));
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
      attributeFilter: ['type', 'name', 'id', 'autocomplete', 'placeholder', 'aria-label', 'class', 'data-sensitive']
    });
  }

  const cleanup = (): void => {
    document.removeEventListener('focusin', trigger, true);
    document.removeEventListener('input', trigger, true);
    observer.disconnect();
  };

  // Expose cleanup in a stable way on the window for callers that need it.
  if (typeof window !== 'undefined') {
    (window as typeof window & { __cityuPrivacyCleanup?: () => void }).__cityuPrivacyCleanup = cleanup;
  }
}
