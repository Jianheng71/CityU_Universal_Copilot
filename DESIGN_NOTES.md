# Design notes — visual pass

Scope is visual only: tokens, type, spacing, surfaces, focus, and the spotlight chrome. Guide steps, messaging, AI calls, and AIMS selectors are unchanged.

## Before → after

The side panel read as a Gemini-style chat: pill shapes, mixed radii (`rounded-3xl` / `rounded-full`), a 10px privacy line, and raw hex colors (`#5276d8`, `#f0f4f9`, `#72777f`) with no shared tokens. The popup used a second palette (slate + blue + emerald). The spotlight dim was a hard 66% mask with a looping neon pulse (1.6s) and a 13px Segoe-only tooltip.

After this pass the extension shares one neutral canvas, one academic blue accent, a four-step type scale, and 8pt spacing. The spotlight keeps the same cutout geometry and click-through behavior, with a softer dim, a static double focus ring, and a solid tip card.

| Surface | Before | After |
| --- | --- | --- |
| Side panel canvas | Blue-gray `#f0f4f9`, dark `#131314` | Near-white `#f6f7f8`, separate dark map `#101114` |
| Accent | `#5276d8` (white label ~4.3:1) | `#1f4e8c` (white label ~8.3:1); dark fill `#8fb4e8` with ink `#0e1c30` |
| Type | 10 / 12 / 14 / 30px, Segoe UI only | 12 caption, 14 secondary, 16 body, 28 display; CJK stack (PingFang SC, Noto Sans CJK SC, Microsoft YaHei) |
| Cards / bubbles | Shadow + lift on hover, 24px radii | 1px border, 12px radius, hover is a surface change |
| Primary action | Send icon, states incomplete on other controls | One solid action per view; hover / active / focus-visible / disabled colors |
| Popup | Emerald status banner, English-only provider label | Same tokens as the panel; status is icon + sentence; provider label uses the existing catalog |
| Spotlight | Neon pulse, blurred glass tip, 13px | 140ms opacity enter, 60% dim with a soft edge, solid navy + white focus ring, 16px solid tip |
| Privacy toast | Pill, 12px sans, 20px offset | Same tip language: 14px, 12px radius, left accent bar, 16px inset |

## Tokens

Defined on `:root` and overridden by `.dark` in `src/style.css`. Tailwind names map to those variables in `tailwind.config.js`. Components do not use raw palette steps.

- **Canvas / surface / sunken:** `#f6f7f8` / `#ffffff` / `#eef0f3` (dark `#101114` / `#1a1c20` / `#23262b`)
- **Text:** `#1a1d21`, secondary `#3e4651`, tertiary `#4b5563` (dark `#e6e8eb` / `#c2c7ce` / `#a8b0ba`). Body pairs are above 7:1 on their surfaces.
- **Accent:** `#1f4e8c`, hover `#173e70`, active `#123258`, soft `#e7f0fa`, text-on-soft `#143a66` (dark `#8fb4e8` / `#a9c7f0` / `#c5daf6` / `#1c2c42` / `#d6e6fa`)
- **Border:** cards `rgba(16, 24, 40, 0.12)`; controls `#858c96` (~3.4:1 on white) so fields stay visible without a heavy card stroke (dark `#a3acb8`)
- **Disabled:** fill `#e4e7eb` + text `#5c6570` (~4.7:1), not a faded ghost
- **Radius:** controls 10px, cards 12px, composer 16px. The send button is 8px so it sits concentric inside the composer (16 − 8 padding).
- **Motion:** color transitions and the spotlight enter are 120–150ms, ease-out, opacity or color only. `prefers-reduced-motion` drops the breathe indicator, the spotlight enter, and smooth scroll-to-bottom.

Spotlight geometry constants (`SPOTLIGHT_PAD`, radius, tooltip clamp) are unchanged. The dim spread is still set from the viewport; only the paint (feather + color) changed. Overlay layers set `pointer-events: none`.

## Residual recommendations

1. **Official CityU red.** This pass deepens the existing blue instead of adding a second brand hue. If the mark should be CityU red, swap `--color-accent` and the spotlight ring (`#1f4e8c` / `#8fb4e8`) in one place. Do not keep both as competing fills.
2. **Step chrome.** The tip is still a single string (`tooltip.textContent` must match the guide text). A follow-up can pass a step index into the overlay for a “2 / 4” label without changing advance logic.
3. **Notice tone.** Highlight, missing-tab, and failure copy share one info row (icon + sentence). Splitting success / warning / error is styling only, but it needs a code on the notice, which this pass left alone.
4. **Save feedback.** The popup save button does not confirm success. A short inline status would need a small state change.
5. **Dark spotlight on AIMS.** The tip and ring are painted for both light Banner pages and dark patches. They are not tied to the side panel’s theme toggle, because the overlay lives in the page.
6. **Popup packaging.** `src/popup.tsx` now uses the same tokens, but the packaged toolbar action has no `default_popup` — the icon opens the side panel. This pass does not mount the popup, so that behavior stays as it is.
