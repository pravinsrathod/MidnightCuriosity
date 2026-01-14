# Midnight Curiosity - Native Android (Kotlin + Jetpack Compose)

This is a pure **Native Android** application built with **Kotlin** and **Jetpack Compose**, implementing the "First 5 Minutes" user flow with high-fidelity UI and animations.

## Project Structure

*   **Language**: Kotlin
*   **UI Toolkit**: Jetpack Compose (Modern, Declarative UI)
*   **Navigation**: Jetpack Compose Navigation
*   **Build System**: Gradle (Kotlin DSL)

## Directory Layout

*   `app/src/main/java/com/midnightcuriosity/`
    *   `MainActivity.kt`: The single Activity entry point and Navigation Host.
    *   `components/`: Composable screens matching the prototype flow.
        *   `SplashScreen.kt`
        *   `GradeSelectionScreen.kt`
        *   `VideoPlayerScreen.kt`
        *   `QuizScreen.kt`
        *   `RewardScreen.kt`
        *   `AuthGateScreen.kt`
    *   `ui/theme/`: Theme definitions (Typography, Colors).

## How to Run

Since this is a native Android Studio project, you cannot run it directly from the terminal without the Android SDK environment set up.

1.  **Open Android Studio**.
2.  Select **"Open"** and navigate to this folder: `/Users/pravinrathod/Documents/Personal/AI/Coaching/New`.
3.  Wait for Gradle to sync (Internet connection required).
4.  Connect an Android device or start an Emulator.
5.  Click the Green **Run** (Play) button in the toolbar.

## Features Implemented
*   **Dark Theme**: Custom color palette matching the web prototype (`#030014` background).
*   **Animations**: Start-up scaling, fade-ins, and spring animations for rewards using Compose Animation APIs.
*   **Navigation**: Seamless transition between screens.
*   **Components**: Fully native re-implementation of the Video Player (UI only), Quiz, and Auth forms.
