# Mobile Nav Backdrop Dismiss — Requirements

## Background

The mobile hamburger menu is a `<dialog>` element opened with `showModal()`. The
intended UX is that tapping anywhere outside the drawer panel (on the backdrop)
closes the menu. This did not work on WebKit/iOS Safari.

## Requirements

### 1. Backdrop tap dismisses the menu

**WHEN** the mobile navigation drawer is open  
**AND** the user taps outside the drawer panel (on the backdrop overlay)  
**THEN** the system SHALL close the drawer.

This MUST work on:

- iOS Safari / WebKit (primary target)
- Firefox
- Chrome / Chromium

### 2. In-drawer taps do not dismiss the menu

**WHEN** the mobile navigation drawer is open  
**AND** the user taps anywhere within the drawer panel (nav links, buttons,
padding area)  
**THEN** the system SHALL NOT close the drawer due to the tap.

(Navigation links close the menu via the existing route-change effect, not via
this mechanism.)

### 3. Escape key continues to work

**WHEN** the mobile navigation drawer is open  
**AND** the user presses Escape  
**THEN** the system SHALL close the drawer.

This is pre-existing native `<dialog>` behaviour and must not regress.

### 4. No visual regression

The fix SHALL NOT change the visual appearance of the drawer or its backdrop.
