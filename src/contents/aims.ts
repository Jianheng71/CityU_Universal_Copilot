import type { PlasmoCSConfig } from 'plasmo';

import { startAimsContentScript } from '../content';

export const config: PlasmoCSConfig & { match_about_blank: boolean } = {
  matches: ['https://*.cityu.edu.hk/*'],
  all_frames: true,
  match_about_blank: true,
  run_at: 'document_idle'
};

startAimsContentScript();
