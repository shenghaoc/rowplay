## 2026-06-23 - Add missing ARIA labels to Textareas

**Learning:** Textareas used for user input (like adding/editing notes in the `AnnotationPanel.svelte`) require `aria-label` attributes for accessibility when they are visually identified only by surrounding context or placeholders. Without them, screen readers fail to communicate their purpose.
**Action:** Always ensure that form inputs (`<input>`, `<textarea>`, `<select>`) have an associated label or `aria-label` populated with a translated string.

## 2026-05-30 - Added aria-pressed to active toggle buttons\n**Learning:** This app extensively relies on toggle buttons styled with 'class:on' for selections (filters, metrics, bands, speed), but screen readers weren't aware of the active state. Svelte's reactive bindings make adding 'aria-pressed' directly tied to the condition extremely clean.\n**Action:** Whenever identifying 'class:on' or similar active visual state toggles, immediately verify and add 'aria-pressed' to synchronize the semantic state with the visual state.

## 2026-05-30 - Added loading spinners to async buttons

**Learning:** DaisyUI provides a `loading loading-spinner` class which acts as a great visual cue. It's important to add `aria-hidden="true"` to visual loading spinners within buttons so screen readers don't misinterpret them. The `aria-busy` attribute communicates the busy state to assistive technologies.
**Action:** When adding visual loading indicators, always add `aria-hidden="true"` to the spinner and `aria-busy={loading}` to the button so screen readers know the operation is in progress.

## 2026-06-08 - Added aria-pressed to dashboard toggle buttons

## 2025-06-10 - Missing ARIA pressed state on custom button toggles

**Learning:** This app extensively uses Tailwind/DaisyUI utility classes like `btn-active` or custom toggles like `class:on` to indicate selected state visually. However, this is frequently not paired with `aria-pressed` or `aria-selected`, meaning screen readers miss the active state.
**Action:** When working on UI components, actively look for visual state toggles (`class:btn-active={cond}`) and ensure they are always paired with the corresponding semantic ARIA attribute. Use `aria-pressed={cond}` for pure state toggles (e.g. compare-mode pickers). Use `aria-current={cond ? 'true' : undefined}` when the button triggers URL navigation (e.g. sport/distance filter selectors that call `goto`).

## 2026-06-10 - Added aria-hidden to loading spinners

**Learning:** When using visual loading spinners in DaisyUI like `loading loading-spinner`, we must ensure they are properly hidden from screen readers.
**Action:** When adding visual loading indicators, always add `aria-hidden="true"` to prevent screen readers from announcing them redundantly if the text already conveys the state.

## 2026-06-10 - Added aria-busy to async buttons

**Learning:** While buttons disabled during an async action (e.g. `disabled={saving}`) often have visual loading spinners hidden from screen readers (`aria-hidden="true"`), the button itself still needs to broadcast its busy state semantically.
**Action:** When adding or verifying visual loading states on buttons during async actions, always pair them with `aria-busy={stateVariable}` so screen readers know the operation is in progress.

## 2026-06-16 - Added aria-label to missing form select elements and restored focus on edit close

**Learning:** In Svelte components like `WorkoutTagBadge`, inline editing mode using a `<select>` drop-down lacked semantic meaning for screen readers without an explicit `aria-label`. Additionally, unmounting the `<select>` and replacing it with the `<button>` caused focus to reset to `document.body`, forcing keyboard/screen reader users to re-navigate.
**Action:** Always ensure dynamically rendered `<select>` elements used for inline editing have an explicit `aria-label`. Use a `wasEditing` guard inside a `$effect` to restore focus to the trigger button when editing ends, keeping keyboard navigation continuous.

## 2026-06-18 - Added explicit type="button" to interactive buttons

**Learning:** By default, HTML buttons are `type="submit"`. Adding `type="button"` to non-submit buttons is an important micro-UX pattern to prevent unexpected form submissions/page reloads if the buttons are ever nested within a form.
**Action:** Always add `type="button"` to buttons that only trigger JS click handlers and aren't meant to submit forms.

## 2024-06-27 - Proper ARIA Controls Association
**Learning:** Found several components using `aria-expanded` (e.g. `PerformancePredictorCard`, `WorkoutListFilters`) but lacking `aria-controls` bindings to their collapsible panels. When `aria-expanded` is used on a button, it's crucial to pair it with `aria-controls` pointing to the `id` of the panel it opens/closes to give screen reader users context.
**Action:** Pair `aria-expanded` with `aria-controls` across toggles in the application for proper programmatic structure.
## 2024-05-24 - Avoid `span role="button"`
**Learning:** Found an accessibility anti-pattern in `WorkoutList.svelte` where a `span` with `role="button"`, `tabindex="0"`, and custom `onkeydown` handler was used for a comparison action.
**Action:** Always prefer native `<button type="button">` over custom span/div buttons to ensure proper built-in keyboard interaction (Enter/Space) and focus management out of the box without manual handlers.
