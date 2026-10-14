let shadowHost: HTMLElement | null = null;
let shadowRoot: ShadowRoot | null = null;
let overlayEl: HTMLElement | null = null;
let ringEl: HTMLElement | null = null;
let tooltipEl: HTMLElement | null = null;
let resizeObserver: ResizeObserver | null = null;
let updateFrame = 0;

const scrollHandler = () => {
  if (!shadowHost || !overlayEl || !ringEl || !tooltipEl) {
    return;
  }

  const target = document.querySelector('[data-cityu-guide-target]') as HTMLElement | null;
  if (!target) {
    return;
  }

  const rect = target.getBoundingClientRect();
  const { width, height, left, top } = rect;

  overlayEl.style.left = `${left - 12}px`;
  overlayEl.style.top = `${top - 12}px`;
  overlayEl.style.width = `${width + 24}px`;
  overlayEl.style.height = `${height + 24}px`;

  ringEl.style.left = `${left - 6}px`;
  ringEl.style.top = `${top - 6}px`;
  ringEl.style.width = `${width + 12}px`;
  ringEl.style.height = `${height + 12}px`;

  tooltipEl.style.left = `${Math.max(20, left + width + 18)}px`;
  tooltipEl.style.top = `${Math.max(20, top + 8)}px`;
};

function ensureShadowRoot(): void {
  if (typeof document === 'undefined') {
    return;
  }

  if (!document.body) {
    return;
  }

  if (!shadowHost) {
    shadowHost = document.createElement('div');
    shadowHost.id = 'cityu-universal-sinno-shadow-host';
    shadowHost.style.position = 'fixed';
    shadowHost.style.inset = '0';
    shadowHost.style.pointerEvents = 'none';
    shadowHost.style.zIndex = '2147483647';
    shadowHost.style.display = 'block';
    shadowHost.style.overflow = 'visible';
    document.body.appendChild(shadowHost);
    shadowRoot = shadowHost.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      * { box-sizing: border-box; }
      .cityu-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.25);
        backdrop-filter: blur(2px);
      }
      .cityu-ring {
        position: fixed;
        border: 2px solid #3b82f6;
        border-radius: 12px;
        box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.25), 0 0 18px rgba(59, 130, 246, 0.75);
        animation: pulse 1.8s ease-out infinite;
      }
      .cityu-tooltip {
        position: fixed;
        display: flex;
        align-items: center;
        max-width: 260px;
        padding: 10px 12px;
        border-radius: 10px;
        background: rgba(15, 23, 42, 0.78);
        border: 1px solid rgba(148, 163, 184, 0.35);
        box-shadow: 0 12px 30px rgba(15, 23, 42, 0.3);
        color: #f8fafc;
        font: 12px/1.4 'Segoe UI', sans-serif;
        letter-spacing: 0.01em;
      }
      .cityu-tooltip::before {
        content: '';
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: #60a5fa;
        margin-right: 8px;
        box-shadow: 0 0 10px rgba(96, 165, 250, 0.9);
      }
      @keyframes pulse {
        0% { transform: scale(1); opacity: 1; }
        70% { transform: scale(1.02); opacity: 0.8; }
        100% { transform: scale(1.04); opacity: 1; }
      }
    `;
    shadowRoot.appendChild(style);

    overlayEl = document.createElement('div');
    overlayEl.className = 'cityu-backdrop';
    ringEl = document.createElement('div');
    ringEl.className = 'cityu-ring';
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'cityu-tooltip';

    shadowRoot.appendChild(overlayEl);
    shadowRoot.appendChild(ringEl);
    shadowRoot.appendChild(tooltipEl);
  }
}

export function injectGlassSpotlight(targetElement: HTMLElement, guideText: string): void {
  ensureShadowRoot();
  if (!shadowRoot || !overlayEl || !ringEl || !tooltipEl) {
    return;
  }

  targetElement.setAttribute('data-cityu-guide-target', 'true');
  const rect = targetElement.getBoundingClientRect();
  const { width, height, left, top } = rect;

  overlayEl.style.left = `${left - 12}px`;
  overlayEl.style.top = `${top - 12}px`;
  overlayEl.style.width = `${width + 24}px`;
  overlayEl.style.height = `${height + 24}px`;

  ringEl.style.left = `${left - 6}px`;
  ringEl.style.top = `${top - 6}px`;
  ringEl.style.width = `${width + 12}px`;
  ringEl.style.height = `${height + 12}px`;

  tooltipEl.textContent = guideText;
  tooltipEl.style.left = `${Math.max(20, left + width + 18)}px`;
  tooltipEl.style.top = `${Math.max(20, top + 8)}px`;

  resizeObserver?.disconnect();
  resizeObserver = new ResizeObserver(() => {
    if (updateFrame) {
      cancelAnimationFrame(updateFrame);
    }
    updateFrame = requestAnimationFrame(scrollHandler);
  });
  resizeObserver.observe(targetElement);

  window.addEventListener('scroll', scrollHandler, true);
  window.addEventListener('resize', scrollHandler);

  const cleanup = () => {
    window.removeEventListener('scroll', scrollHandler, true);
    window.removeEventListener('resize', scrollHandler);
    resizeObserver?.disconnect();
    resizeObserver = null;
  };

  if (typeof window !== 'undefined') {
    (window as typeof window & { __cityuSpotlightCleanup?: () => void }).__cityuSpotlightCleanup = cleanup;
  }
}

export function removeSpotlight(): void {
  if (typeof window !== 'undefined') {
    const cleanup = (window as typeof window & { __cityuSpotlightCleanup?: () => void }).__cityuSpotlightCleanup;
    cleanup?.();
  }

  if (shadowHost && shadowRoot) {
    while (shadowRoot.firstChild) {
      shadowRoot.removeChild(shadowRoot.firstChild);
    }
    shadowHost.remove();
  }

  shadowHost = null;
  shadowRoot = null;
  overlayEl = null;
  ringEl = null;
  tooltipEl = null;
  resizeObserver = null;

  const guideElement = document.querySelector('[data-cityu-guide-target]');
  if (guideElement) {
    guideElement.removeAttribute('data-cityu-guide-target');
  }
}
