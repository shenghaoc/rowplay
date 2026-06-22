## 2024-10-10 - Add missing ARIA labels to Textareas
**Learning:** Textareas used for user input (like adding/editing notes in the `AnnotationPanel.svelte`) require `aria-label` attributes for accessibility when they are visually identified only by surrounding context or placeholders. Without them, screen readers fail to communicate their purpose.
**Action:** Always ensure that form inputs (`<input>`, `<textarea>`, `<select>`) have an associated label or `aria-label` populated with a translated string.
