# Production Readiness Roadmap: Midnight Curiosity

This document outlines the step-by-step plan to transform the current high-fidelity prototype into a scalable, secure, and production-ready Android application.

## Phase 1: Architecture & Foundation (The "Skeleton")
**Goal**: Decouple the UI from logic to ensure maintainability and testability.

1.  **Adopt MVVM / Clean Architecture**:
    *   **Logic Extraction**: Move logic (e.g., video progress calculation, quiz validation) out of Composable functions into `ViewModel` classes.
    *   **State Management**: Use `StateFlow` or `LiveData` for exposing UI state from ViewModels.
    *   **Separation**: Create dedicated packages for `domain` (use cases, models), `data` (repositories, sources), and `presentation` (UI).

2.  **Dependency Injection (Hilt/Dagger)**:
    *   Implement Hilt to manage dependencies (ViewMdoels, Repositories, API configurations).
    *   Remove manual instantiation of classes in Activities/Composables.

3.  **Navigation Type Safety**:
    *   Replace string-based route navigation ("grade", "hook") with Type-Safe Navigation (likely using Kotlin Serialization or sealed classes) to prevent runtime crashes from typoed routes.

## Phase 2: Data Layer & Backend Integration (The "Brain")
**Goal**: Replace hardcoded mocks with real, persistent data.

1.  **Backend Connectivity (Retrofit)**:
    *   Set up **Retrofit** and **OkHttp** for API communication.
    *   Define API endpoints for: `GET /curriculum`, `GET /video/{id}`, `POST /progress`, `POST /auth/login`.

2.  **Local Persistence (Room Database)**:
    *   Implement **Room** for offline caching (critical for "Offline Mode").
    *   Create tables for `User`, `Course`, `VideoProgress`, and `QuizResult`.
    *   Implement a "Repository Pattern" to arbitrate between API (Live) and Database (Offline).

3.  **Authentication**:
    *   Integrate a real Auth provider (e.g., **Firebase Auth** or **Auth0**) instead of the mock form.
    *   Securely store tokens using `EncryptedSharedPreferences`.

## Phase 3: Core Feature Realization (The "Muscle")
**Goal**: Replace simulated features with production-grade implementations.

1.  **Professional Video Player (Media3 / ExoPlayer)**:
    *   Replace the "Mock Box" with **Jetpack Media3 (ExoPlayer)**.
    *   Implement real buffering, streaming (HLS/DASH), and seeking capabilities.
    *   Implement functionality to overlay Composable UI *on top* of the SurfaceView for the interactive questions.

2.  **Dynamic Knowledge Graph**:
    *   Replace the hardcoded node list with a recursive/dynamic layout algorithm that can render any arbitrary tree structure returned by the backend.
    *   Handle different screen sizes and orientations for the graph.

## Phase 4: UI/UX Polish & Quality (The "Skin")
**Goal**: Ensure the app feels professional and handles edge cases.

1.  **Resource Management**:
    *   Extract all hardcoded strings ("Save Progress", "Quick Check!") to `strings.xml` for localization support.
    *   Extract colors and dimensions to theme files.

2.  **Error Handling & Edge Cases**:
    *   Add Empty States (what if no courses are found?).
    *   Add Error States (visual handling for "No Internet", "Server Error").
    *   Add Loading Skeletons/Spinners for async data fetching.

3.  **Accessibility (a11y)**:
    *   Add `contentDescription` to all images/icons.
    *   Ensure touch targets are at least 48dp.
    *   Test with TalkBack enabled.

## Phase 5: Release Engineering (The "Delivery")
**Goal**: Prepare the artifact for the Play Store.

1.  **Build Configuration**:
    *   Configure **ProGuard / R8** rules to obfuscate code and shrink app size.
    *   Set up robust Logging (Timber) that only logs in DEBUG builds.

2.  **CI/CD Pipeline**:
    *   Set up GitHub Actions or Bitrise to automatically run tests and build APKs/Bundles on push.

3.  **Analytics & Crash Reporting**:
    *   Integrate **Firebase Crashlytics** to track crashes in the wild.
    *   Integrate **Firebase Analytics** to track user conversion through the funnel.

## Immediate Next Steps (Priority)

1.  **Refactor to generic ViewModels**: Start by creating a `VideoPlayerViewModel` to hold the `progress`, `isPlaying`, and `showOverlay` state.
2.  **Setup ExoPlayer**: This is the most complex technical piece; swapping the mock for the real player should be done early.

