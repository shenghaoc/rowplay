# Requirements Document

## Introduction

Live/near-live mode enables rowplay to automatically detect and display newly completed workouts without requiring manual sync. The system polls the Concept2 Logbook API at configurable intervals to check for new workouts, and is designed to support future webhook integration with ErgData when that capability becomes available.

This feature addresses the friction of manually syncing after every workout, providing a seamless experience where athletes finish a piece on their erg and see it appear in rowplay within seconds or minutes.

## Glossary

- **Live_Mode_System**: The polling and notification subsystem that automatically checks for new workouts
- **Polling_Service**: The background process that periodically queries the Concept2 Logbook API
- **Sync_Engine**: The existing `syncWorkouts` function in `src/lib/server/data.ts`
- **Dashboard**: The main workout list view at `/dashboard`
- **User_Preferences**: Stored settings for live mode (enabled/disabled, polling interval)
- **Demo_Mode**: The development/demo environment where `CONCEPT2_CLIENT_ID` is unset
- **Mock_Poller**: The demo-mode simulation that generates synthetic new workouts
- **Notification_Toast**: A temporary UI message displayed via `svelte-sonner`
- **ErgData_Webhook**: Future webhook endpoint for real-time workout notifications from ErgData app
- **Rate_Limiter**: Protection mechanism to prevent excessive API calls to Concept2

## Requirements

### Requirement 1: Automatic Polling for New Workouts

**User Story:** As an athlete, I want rowplay to automatically check for new workouts, so that I don't have to manually sync after every piece.

#### Acceptance Criteria

1. WHEN live mode is enabled, THE Polling_Service SHALL query the Concept2 Logbook API at the configured interval
2. THE Polling_Service SHALL use the incremental sync mechanism (existing `syncWorkouts` with `from` parameter) to minimize API load
3. WHEN a new workout is detected, THE Sync_Engine SHALL add it to the D1 cache
4. THE Polling_Service SHALL respect Concept2 API rate limits (maximum 1 request per 30 seconds)
5. IF the API returns an error, THEN THE Polling_Service SHALL exponentially back off (30s, 60s, 120s, max 300s) before retrying
6. WHILE the user is viewing the Dashboard, THE Live_Mode_System SHALL poll more frequently than when the tab is inactive
7. WHEN the browser tab becomes inactive, THE Polling_Service SHALL reduce polling frequency to conserve resources

### Requirement 2: User Controls for Live Mode

**User Story:** As a user, I want to control whether live mode is active and how often it checks, so that I can balance freshness with battery life and API usage.

#### Acceptance Criteria

1. THE Dashboard SHALL display a live mode toggle control
2. WHEN the user enables live mode, THE User_Preferences SHALL persist the setting across sessions
3. THE Dashboard SHALL display a polling interval selector with options: 30s, 1min, 2min, 5min
4. THE User_Preferences SHALL default to disabled with 1min interval for new users
5. WHEN live mode is disabled, THE Polling_Service SHALL stop all background polling
6. THE Dashboard SHALL display the last poll time and next scheduled poll time when live mode is enabled
7. THE Dashboard SHALL display a visual indicator (animated icon) when a poll is in progress

### Requirement 3: New Workout Notifications

**User Story:** As an athlete, I want to be notified when a new workout appears, so that I know the sync succeeded without watching the list constantly.

#### Acceptance Criteria

1. WHEN a new workout is detected, THE Live_Mode_System SHALL display a Notification_Toast
2. THE Notification_Toast SHALL show the workout distance, time, and sport
3. THE Notification_Toast SHALL include a "View" action that navigates to the workout replay
4. THE Notification_Toast SHALL auto-dismiss after 8 seconds
5. WHEN multiple new workouts are detected simultaneously, THE Live_Mode_System SHALL display a single toast summarizing the count
6. THE Notification_Toast SHALL use i18n for all text (en and zh translations)
7. THE Live_Mode_System SHALL play a subtle sound effect when a new workout is detected (user preference, default off)

### Requirement 4: Demo Mode Compatibility

**User Story:** As a developer, I want live mode to work in demo mode, so that I can develop and test the feature without Concept2 credentials.

#### Acceptance Criteria

1. WHEN Demo_Mode is active, THE Mock_Poller SHALL simulate new workouts appearing at random intervals (30s to 3min)
2. THE Mock_Poller SHALL generate realistic workout data consistent with `mockData.ts`
3. THE Mock_Poller SHALL respect the user's live mode enabled/disabled preference
4. THE Mock_Poller SHALL display notifications identical to the real polling service
5. THE Dashboard SHALL visually indicate when Demo_Mode is active (existing demo banner)

### Requirement 5: Optimistic UI Updates

**User Story:** As a user, I want new workouts to appear in the list immediately when detected, so that the interface feels responsive.

#### Acceptance Criteria

1. WHEN a new workout is detected, THE Dashboard SHALL prepend it to the workout list without a full page reload
2. THE Dashboard SHALL animate the new workout entry (fade-in or slide-in)
3. THE Dashboard SHALL update aggregate statistics (totals, PBs) to reflect the new workout
4. IF the new workout is a personal best, THEN THE Dashboard SHALL highlight it with a PB badge
5. THE Dashboard SHALL maintain scroll position when new workouts are added
6. WHEN the user has filters active, THE Dashboard SHALL only show the new workout if it matches the current filter

### Requirement 6: Future Webhook Support

**User Story:** As a developer, I want the architecture to support ErgData webhooks, so that we can achieve true real-time sync when that API becomes available.

#### Acceptance Criteria

1. THE Live_Mode_System SHALL abstract the data source (polling vs webhook) behind a common interface
2. THE ErgData_Webhook endpoint SHALL accept POST requests with workout completion notifications
3. WHEN a webhook is received, THE Sync_Engine SHALL fetch and cache the workout immediately
4. THE ErgData_Webhook SHALL validate the request signature to prevent spoofing
5. WHERE webhook support is available, THE Live_Mode_System SHALL prefer webhooks over polling
6. THE User_Preferences SHALL allow users to choose between polling and webhook modes when both are available

### Requirement 7: Background Sync State Management

**User Story:** As a user, I want live mode to handle edge cases gracefully, so that I don't lose data or see duplicate workouts.

#### Acceptance Criteria

1. WHEN the browser tab regains focus after being inactive, THE Polling_Service SHALL immediately trigger a poll
2. IF a manual sync is triggered while live mode is active, THEN THE Polling_Service SHALL reset its timer
3. THE Sync_Engine SHALL deduplicate workouts by ID to prevent duplicates in the D1 cache
4. WHEN the user logs out, THE Polling_Service SHALL stop all polling
5. WHEN the user logs in, THE Live_Mode_System SHALL restore the user's live mode preferences
6. IF the D1 database is unavailable, THEN THE Polling_Service SHALL continue polling but display an error toast

### Requirement 8: Performance and Resource Management

**User Story:** As a user, I want live mode to be efficient, so that it doesn't drain my battery or slow down the app.

#### Acceptance Criteria

1. THE Polling_Service SHALL use a single timer per browser tab (no duplicate pollers)
2. THE Polling_Service SHALL cancel pending requests when the tab becomes inactive
3. THE Live_Mode_System SHALL use the existing D1 cache layer (no additional storage)
4. THE Polling_Service SHALL batch multiple API requests when checking for new workouts across multiple sports
5. THE Dashboard SHALL debounce UI updates when multiple new workouts arrive within 1 second
6. THE Polling_Service SHALL limit memory usage to under 5MB for polling state and timers

### Requirement 9: Error Handling and User Feedback

**User Story:** As a user, I want clear feedback when live mode encounters problems, so that I understand why new workouts aren't appearing.

#### Acceptance Criteria

1. IF the Concept2 API is unreachable, THEN THE Live_Mode_System SHALL display an error toast with retry information
2. IF the user's session expires, THEN THE Polling_Service SHALL stop polling and display a "re-authenticate" message
3. IF the API rate limit is exceeded, THEN THE Live_Mode_System SHALL display a warning and automatically back off
4. THE Dashboard SHALL display a warning icon when polling has failed 3 consecutive times
5. WHEN polling resumes successfully after errors, THE Live_Mode_System SHALL display a success toast
6. THE Live_Mode_System SHALL log polling errors to the browser console for debugging

### Requirement 10: Internationalization

**User Story:** As a non-English user, I want all live mode UI in my language, so that I can understand the feature.

#### Acceptance Criteria

1. THE Live_Mode_System SHALL add all user-visible strings to both `en` and `zh` dictionaries in `src/lib/i18n.ts`
2. THE Notification_Toast SHALL use `i18n.t()` for all text
3. THE Dashboard live mode controls SHALL use `i18n.t()` for labels and tooltips
4. THE error messages SHALL use `i18n.t()` with parameter interpolation for dynamic values (e.g., retry time)
5. THE polling interval options SHALL display localized time units (seconds, minutes)
