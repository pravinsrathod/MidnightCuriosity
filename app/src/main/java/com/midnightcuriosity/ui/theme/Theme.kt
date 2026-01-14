package com.midnightcuriosity.ui.theme

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

// EduQuest Design System Colors
val EduBlue = Color(0xFF0056D2)
val EduOrange = Color(0xFFFF8C00)
val EduGreen = Color(0xFF28C76F)
val EduWhite = Color(0xFFFFFFFF)
val EduBackground = Color(0xFFFFFFFF)
val EduSurface = Color(0xFFF5F7FA) // Very light grey for cards
val EduTextPrimary = Color(0xFF1E1E1E)
val EduTextSecondary = Color(0xFF757575)

// Keeping Dark Palette optional, but primary is Light for EduQuest
private val DarkColorScheme = darkColorScheme(
    primary = EduBlue,
    secondary = EduOrange,
    tertiary = EduGreen,
    background = Color(0xFF121212),
    surface = Color(0xFF1E1E1E),
)

private val LightColorScheme = lightColorScheme(
    primary = EduBlue,
    secondary = EduOrange,
    tertiary = EduGreen,
    background = EduBackground,
    surface = EduSurface,
    onPrimary = Color.White,
    onSecondary = Color.White,
    onBackground = EduTextPrimary,
    onSurface = EduTextPrimary
)

@Composable
fun MidnightCuriosityTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    // We want to force our brand identity, so disable dynamic color by default or ignore it for key brand colors
    dynamicColor: Boolean = false,
    content: @Composable () -> Unit
) {
    val colorScheme = LightColorScheme // Force Light Mode for EduQuest Vibe
    
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = colorScheme.primary.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = false // Dark content on status bar? No, Blue bg -> White icons
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content
    )
}
