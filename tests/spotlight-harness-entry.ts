import { GUIDE_TARGET_ATTR, SPOTLIGHT_HOST_ID } from '../src/content/constants';
import { findHighlightTarget } from '../src/content/domTarget';
import { startAimsContentScript } from '../src/content/index';
import { armPageGuide, disarmPageGuide } from '../src/content/pageGuide';
import { SPOTLIGHT_PAD } from '../src/content/spotlightGeometry';
import { injectGlassSpotlight, removeSpotlight } from '../src/content/spotlightOverlay';

declare global {
  interface Window {
    __cityuTest: {
      GUIDE_TARGET_ATTR: string;
      SPOTLIGHT_HOST_ID: string;
      SPOTLIGHT_PAD: number;
      findHighlightTarget: typeof findHighlightTarget;
      startAimsContentScript: typeof startAimsContentScript;
      injectGlassSpotlight: typeof injectGlassSpotlight;
      removeSpotlight: typeof removeSpotlight;
      armPageGuide: typeof armPageGuide;
      disarmPageGuide: typeof disarmPageGuide;
    };
  }
}

window.__cityuTest = {
  GUIDE_TARGET_ATTR,
  SPOTLIGHT_HOST_ID,
  SPOTLIGHT_PAD,
  findHighlightTarget,
  startAimsContentScript,
  injectGlassSpotlight,
  removeSpotlight,
  armPageGuide,
  disarmPageGuide
};
