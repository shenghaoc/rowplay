# Mobile Nav Backdrop Dismiss — Design

## Root Cause

The drawer is a `<dialog>` opened with `showModal()`. The original code relied
solely on the `closedby="any"` attribute to close the dialog when the backdrop
is tapped:

```svelte
<dialog ... closedby="any" onclose={onNavClose}>
```

`closedby="any"` is part of the CloseWatcher API, supported only in Chrome 133+.
WebKit (iOS Safari) ignores it, so tapping the backdrop had no effect on the
primary test platform.

## How WebKit Handles Backdrop Clicks

When a modal `<dialog>` is open and the user taps/clicks the `::backdrop`
pseudo-element, modern browsers (including WebKit since iOS 15.4) fire a `click`
event on the `<dialog>` element with:

- `event.target === dialogElement` — the event did not originate from a child
- `event.clientX / clientY` — coordinates outside the dialog's rendered box

Without `closedby`, this event fires but nothing closes the dialog. The fix
attaches an `onclick` handler that inspects the event and calls `close()` when
the tap lands outside the panel.

## Fix

**File**: `src/routes/+layout.svelte`

Add an `onclick` handler to the `<dialog>` element:

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

### Why two guards?

**`e.target === mobileNav`** — filters out click events that bubbled up from
child elements (nav links, buttons). When a child is clicked, `e.target` is the
child, not the dialog.

**Bounding-rect check** — the `<dialog>` element's box spans only the top-sheet
content area (`inset: 0 0 auto 0`). Tapping the dialog's own padding area would
also have `e.target === mobileNav`; the rect check distinguishes that from a
genuine backdrop tap (whose `clientY` falls below `rect.bottom`).

This is the approach documented by MDN for cross-browser modal backdrop
dismissal.

### `closedby="any"` is kept

The attribute is retained as progressive enhancement — Chrome 133+ uses it
natively; the `onclick` handler is a no-op on those browsers because the dialog
is already closed before the click propagates.

## No CSS or HTML structural changes

The drawer layout (`inset: 0 0 auto 0`, `::backdrop`, padding) is unchanged.
No wrapper elements are added.
