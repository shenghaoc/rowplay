1. **Understand the problem**:
   - The user (me, Palette) wants to find one UX/accessibility improvement in the UI.
   - The task is open-ended.
   - I searched for various known issues:
     - Missing ARIA labels (grep for `button`, `a`, etc.)
     - Incomplete accessibility (e.g., `<button>` missing `type="button"`)
     - Missing loading indicators / `aria-busy`
     - Incorrect focus states or keyboard accessibility

2. **Observations**:
   - `WorkoutList.svelte` line 102 has a `<span role="button" tabindex="0" class="cmpbtn" ...>` with a click and keydown handler. Using a custom element for a button is an accessibility anti-pattern. It should ideally be a native `<button type="button">`.
   - Native buttons automatically get keyboard focus behavior, trigger on Enter/Space, and support `disabled` natively.
   - Let's replace the `span role="button"` in `WorkoutList.svelte` with a native `<button type="button" class="cmpbtn" ...>`. This removes the need for `role`, `tabindex`, and custom `onkeydown` handling for Enter/Space, making it more robust.

3. **Plan**:
   - Refactor `span role="button"` to `<button type="button">` in `src/components/WorkoutList.svelte`.
   - Remove redundant `role="button"` and `tabindex="0"`.
   - Remove custom `onkeydown` handler since native buttons support Enter/Space naturally.
   - Verify visually and via tests.
   - Request review and submit.
