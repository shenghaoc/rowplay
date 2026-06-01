# Bugfix Requirements Document

## Introduction

On mobile screens, the stat cards on the dashboard ("Sessions", "Total distance", "Total time", "Avg pace") are visually squeezed — the text inside each card lacks sufficient padding and the cards themselves lack sufficient spacing between them. This makes the stats section hard to read and visually cramped on small screens. The fix must ensure every stat card has adequate internal padding and inter-card gap on mobile without affecting the desktop layout.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the dashboard is viewed on a mobile screen (viewport width ≤ 560px) THEN the system renders the stat cards with reduced `.card` padding (0.95rem 1rem) and no additional stat-specific padding override, causing the label and value text to feel cramped inside each card.

1.2 WHEN the dashboard is viewed on a very small screen (viewport width ≤ 400px) THEN the system reduces the `.stats` grid gap to 0.6rem, further tightening the space between the "Sessions", "Total distance", "Total time", and "Avg pace" cards.

1.3 WHEN the dashboard is viewed on a mobile screen (viewport width ≤ 720px) THEN the system switches the `.stats` grid from 4 columns to 2 columns but does not increase or preserve sufficient padding inside each stat card to compensate for the narrower card width.

### Expected Behavior (Correct)

2.1 WHEN the dashboard is viewed on a mobile screen (viewport width ≤ 560px) THEN the system SHALL apply sufficient padding inside each stat card so that the label and value text have comfortable breathing room and are not visually squeezed.

2.2 WHEN the dashboard is viewed on a very small screen (viewport width ≤ 400px) THEN the system SHALL maintain a gap between stat cards that keeps them visually distinct and readable.

2.3 WHEN the dashboard is viewed on a mobile screen (viewport width ≤ 720px) THEN the system SHALL ensure the 2-column stat grid layout provides adequate internal padding and inter-card spacing so all four stat labels and values are clearly legible.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the dashboard is viewed on a desktop screen (viewport width > 720px) THEN the system SHALL CONTINUE TO render the stats section as a 4-column grid with the existing gap and card padding unchanged.

3.2 WHEN the dashboard is viewed on any screen size THEN the system SHALL CONTINUE TO display all four stat cards ("Sessions", "Total distance", "Total time", "Avg pace") with their correct label and value content.

3.3 WHEN the dashboard is viewed on any screen size THEN the system SHALL CONTINUE TO apply the global `.card` base styles (background, border, border-radius, box-shadow) to each stat card without modification.

3.4 WHEN the dashboard is viewed on any screen size THEN the system SHALL CONTINUE TO render all other dashboard sections (latest session hero, engagement panel, heatmap, PMC, PBs, trend chart, workout list) with their existing layout and spacing unchanged.
