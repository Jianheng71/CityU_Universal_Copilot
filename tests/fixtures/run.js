(async () => {
  const failures = [];
  const write = (report) => {
    document.getElementById('result').textContent = JSON.stringify(report, null, 2);
  };
  const check = (name, condition, detail) => {
    if (!condition) {
      failures.push({ name, detail: detail ?? null });
    }
  };

  const api = window.__cityuTest;
  check('bundle-loaded', Boolean(api), 'spotlight test bundle did not load');
  if (!api) {
    write({ ok: false, failures });
    return;
  }

  const browserChrome = window.chrome && typeof window.chrome === 'object' ? window.chrome : {};
  browserChrome.runtime = {
    lastError: undefined,
    sendMessage(_message, callback) {
      if (typeof callback === 'function') {
        callback({ ok: true });
      }
    },
    onMessage: { addListener() {} }
  };
  browserChrome.storage = {
    sync: {
      get() {
        return Promise.resolve({});
      },
      set() {
        return Promise.resolve();
      }
    }
  };
  window.chrome = browserChrome;

  try {
    api.startAimsContentScript();
  } catch (error) {
    failures.push({ name: 'start-content-script', detail: error instanceof Error ? error.stack : String(error) });
    write({ ok: false, failures });
    return;
  }

  const reg = document.getElementById('reg');
  const frame = document.getElementById('menu');
  const frameDoc = frame.contentDocument;
  if (frameDoc) {
    frameDoc.open();
    frameDoc.write('<!doctype html><html><body style="margin:16px;font-family:Segoe UI,sans-serif;background:#fff"><a id="weekly" href="/pls/PROD/bwskfshd.P_ViewWeeklySchedule" style="display:inline-block;padding:8px 10px;background:#f3f4f6;border-radius:6px;color:#111;text-decoration:none">Weekly Schedule</a></body></html>');
    frameDoc.close();
  }
  const weekly = frame.contentDocument?.getElementById('weekly') ?? null;
  check('menu-frame-loaded', Boolean(weekly), 'embedded menu frame did not expose Weekly Schedule');

  const topHit = api.findHighlightTarget(document, "a[href*='bmenu.P_RegMenu']", false);
  check('top-selector', topHit.element === reg, 'top menu selector missed Course Registration');

  const frameMiss = api.findHighlightTarget(document, "a[href*='bwskfshd.P_ViewWeeklySchedule']", false);
  check('frame-not-in-parent', frameMiss.element === null && frameMiss.invalid === false, 'parent document should not see the framed link');

  const frameHit = api.findHighlightTarget(document, "a[href*='bwskfshd.P_ViewWeeklySchedule']", true);
  check('frame-search', frameHit.element === weekly, 'same-origin frame search missed Weekly Schedule');

  const shadowHost = document.getElementById('shadow-host');
  const shadow = shadowHost.attachShadow({ mode: 'open' });
  const degree = document.createElement('a');
  degree.id = 'degree';
  degree.href = '/pls/PROD/bwskdegw.P_ViewDegreeWorks';
  degree.textContent = 'DegreeWorks';
  shadow.append(degree);
  const shadowHit = api.findHighlightTarget(document, "a[href*='bwskdegw.P_ViewDegreeWorks']", false);
  check('shadow-search', shadowHit.element === degree, 'open shadow root was not searched');

  const invalid = api.findHighlightTarget(document, 'a[href=', false);
  check('invalid-selector', invalid.invalid === true && invalid.element === null, 'broken selector should be rejected');

  const hidden = document.getElementById('hidden-link');
  const hiddenResult = api.injectGlassSpotlight(hidden, 'Hidden control');
  check('hidden-not-visible', hiddenResult.ok === false && hiddenResult.code === 'element-not-visible', JSON.stringify(hiddenResult));
  check('hidden-cleaned', document.getElementById(api.SPOTLIGHT_HOST_ID) === null, 'failed spotlight left a host behind');

  let valueReads = 0;
  const password = document.getElementById('pw');
  password.value = 'do-not-read';
  const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  Object.defineProperty(password, 'value', {
    configurable: true,
    get() {
      valueReads += 1;
      return proto.get.call(this);
    },
    set(next) {
      return proto.set.call(this, next);
    }
  });
  api.findHighlightTarget(document, "a[href*='bmenu.P_RegMenu']", true);
  api.injectGlassSpotlight(reg, 'Click Course Registration');
  api.removeSpotlight();
  check('no-value-read', valueReads === 0, `password value was read ${valueReads} time(s)`);
  delete password.value;

  const guide = "Click 'Course Registration' in the top menu";
  const drawn = api.injectGlassSpotlight(reg, guide);
  check('spotlight-ok', drawn.ok === true, JSON.stringify(drawn));
  const host = document.getElementById(api.SPOTLIGHT_HOST_ID);
  const hole = host?.shadowRoot?.querySelector('.cityu-hole');
  const ring = host?.shadowRoot?.querySelector('.cityu-ring');
  const tip = host?.shadowRoot?.querySelector('.cityu-tooltip');
  check('spotlight-mounted', Boolean(host && hole && ring && tip), 'spotlight layers missing');

  if (host && hole && ring && tip) {
    const targetRect = reg.getBoundingClientRect();
    const ringRect = ring.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    const spread = Math.max(0, ...[...getComputedStyle(hole).boxShadow.matchAll(/(-?\d+(?:\.\d+)?)px/g)].map((match) => Math.abs(Number(match[1]))));
    check('ring-left', Math.abs(ringRect.left - (targetRect.left - api.SPOTLIGHT_PAD)) < 3, `${ringRect.left} vs ${targetRect.left}`);
    check('ring-top', Math.abs(ringRect.top - (targetRect.top - api.SPOTLIGHT_PAD)) < 3, `${ringRect.top} vs ${targetRect.top}`);
    check('ring-width', Math.abs(ringRect.width - (targetRect.width + api.SPOTLIGHT_PAD * 2)) < 3, `${ringRect.width} vs ${targetRect.width}`);
    check('ring-height', Math.abs(ringRect.height - (targetRect.height + api.SPOTLIGHT_PAD * 2)) < 3, `${ringRect.height} vs ${targetRect.height}`);
    check('hole-is-cutout', hole.getBoundingClientRect().width < window.innerWidth * 0.75, 'dim layer was sized to the target instead of a cutout');
    check('dim-spread', spread > window.innerWidth, `box-shadow spread ${spread}`);
    check('host-covers-viewport', hostRect.width > window.innerWidth * 0.9 && hostRect.height > window.innerHeight * 0.9, JSON.stringify(hostRect));
    check('tooltip-text', tip.textContent === guide, tip.textContent);
    const tipRect = tip.getBoundingClientRect();
    check('tooltip-inside', tipRect.left >= -1 && tipRect.top >= -1 && tipRect.right <= window.innerWidth + 1 && tipRect.bottom <= window.innerHeight + 1, JSON.stringify(tipRect));
    check('target-marked', reg.getAttribute(api.GUIDE_TARGET_ATTR) === 'true', 'guide target attribute missing');
  }

  const far = document.getElementById('far');
  api.injectGlassSpotlight(far, 'Master Class Schedule');
  const before = far.getBoundingClientRect();
  const beforeRing = document.getElementById(api.SPOTLIGHT_HOST_ID)?.shadowRoot?.querySelector('.cityu-ring')?.getBoundingClientRect();
  window.scrollTo(0, 360);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const after = far.getBoundingClientRect();
  const afterRing = document.getElementById(api.SPOTLIGHT_HOST_ID)?.shadowRoot?.querySelector('.cityu-ring')?.getBoundingClientRect();
  check('scroll-moves-target', Math.abs(before.top - after.top) > 100, 'page did not scroll');
  check('scroll-aligns-ring', beforeRing && afterRing && Math.abs((afterRing.top + api.SPOTLIGHT_PAD) - after.top) < 3, JSON.stringify({ beforeRing, afterRing, after }));
  api.removeSpotlight();
  check('removed-host', document.getElementById(api.SPOTLIGHT_HOST_ID) === null, 'removeSpotlight left the host');
  check('removed-attr', !far.hasAttribute(api.GUIDE_TARGET_ATTR), 'removeSpotlight left the target attribute');
  window.scrollTo(0, 360);
  check('scroll-after-remove', document.getElementById(api.SPOTLIGHT_HOST_ID) === null, 'scroll recreated the spotlight');

  if (weekly) {
    const framed = api.injectGlassSpotlight(weekly, 'Open Weekly Schedule');
    check('frame-spotlight', framed.ok === true, JSON.stringify(framed));
    const frameHost = frame.contentDocument.getElementById(api.SPOTLIGHT_HOST_ID);
    const topHost = document.getElementById(api.SPOTLIGHT_HOST_ID);
    check('frame-host-inside-iframe', Boolean(frameHost), 'spotlight host was not mounted in the frame document');
    check('frame-host-not-on-top', topHost === null, 'frame target was mounted on the top document');
    const frameRing = frameHost?.shadowRoot?.querySelector('.cityu-ring');
    if (frameRing) {
      const linkRect = weekly.getBoundingClientRect();
      const ringRect = frameRing.getBoundingClientRect();
      check('frame-ring-aligned', Math.abs(ringRect.left - (linkRect.left - api.SPOTLIGHT_PAD)) < 3 && Math.abs(ringRect.top - (linkRect.top - api.SPOTLIGHT_PAD)) < 3, JSON.stringify({ linkRect, ringRect }));
    }
    api.removeSpotlight();
  }

  api.injectGlassSpotlight(reg, guide);
  password.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  check('privacy-clears-spotlight', document.getElementById(api.SPOTLIGHT_HOST_ID) === null, 'sensitive focus left the spotlight up');
  document.querySelectorAll('[data-cityu-privacy-notice="true"]').forEach((node) => node.remove());

  window.scrollTo(0, 0);
  const finalDraw = api.injectGlassSpotlight(reg, guide);
  check('final-spotlight', finalDraw.ok === true, JSON.stringify(finalDraw));
  document.documentElement.dataset.spotlight = failures.length === 0 ? 'ready' : 'failed';
  write({ ok: failures.length === 0, failures });
})().catch((error) => {
  const result = document.getElementById('result');
  if (result) {
    result.textContent = JSON.stringify({
      ok: false,
      failures: [{ name: 'exception', detail: error instanceof Error ? error.stack : String(error) }]
    });
  }
});
