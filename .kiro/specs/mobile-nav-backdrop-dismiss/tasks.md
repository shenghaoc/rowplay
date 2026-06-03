# Implementation Plan

## Overview

Add a cross-browser backdrop-dismiss handler to the mobile `<dialog>` in
`src/routes/+layout.svelte`. The fix is a single `onclick` attribute addition;
no CSS or structural changes are required.

## Tasks

- [x] 1. Add `onclick` backdrop-dismiss handler to `<dialog>`
  - Open `src/routes/+layout.svelte`
  - Add the following `onclick` attribute to the `#mobile-nav` dialog element:
    ```svelte
    onclick={(e) => {
        if (e.target === mobileNav) {
            const rect = mobileNav.getBoundingClientRect();
            if (
                e.clientX < rect.left ||
                e.clientX > rect.right ||
                e.clientY < rect.top ||
                e.clientY > rect.bottom
            ) {
                closeMenu();
            }
        }
    }}
    ```
  - Keep the existing `closedby="any"` attribute (progressive enhancement for
    Chrome 133+)
  - Do NOT change any CSS, HTML structure, or other script logic
  - _Requirements: 1, 2_

- [x] 2. Verify quality gate
  - Run `npm run check` → 0 errors
  - Run `npm run build` → succeeds
  - _Requirements: 4_

- [x] 3. Manual verification
  - Open `/dashboard` in a WebKit browser (iOS Safari or desktop Safari)
  - Open the hamburger menu
  - Tap/click outside the drawer panel — menu MUST close (_Requirement 1_)
  - Tap inside the drawer panel — menu MUST stay open (_Requirement 2_)
  - Press Escape — menu MUST close (_Requirement 3_)
