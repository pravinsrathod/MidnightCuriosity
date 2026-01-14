package com.midnightcuriosity.components

import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay

@Composable
fun SplashScreen(onComplete: () -> Unit) {
    var startAnimation by remember { mutableStateOf(false) }
    
    val scale by animateFloatAsState(
        targetValue = if (startAnimation) 1f else 0.8f,
        animationSpec = tween(durationMillis = 1000, easing = LinearOutSlowInEasing), 
        label = "scale"
    )
    
    val opacity by animateFloatAsState(
        targetValue = if (startAnimation) 1f else 0f,
        animationSpec = tween(durationMillis = 1000), 
        label = "opacity"
    )

    LaunchedEffect(Unit) {
        startAnimation = true
        delay(3000)
        onComplete()
    }

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background), contentAlignment = Alignment.Center) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier
                .scale(scale)
                .alpha(opacity)
        ) {
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier.size(120.dp)
            ) {
                 Canvas(modifier = Modifier.matchParentSize()) {
                     drawCircle(
                         color = Color(0xFF0056D2), // EduBlue
                         alpha = 0.1f
                     )
                 }
                 Box(
                     modifier = Modifier
                        .size(90.dp)
                        .background(Color(0xFF0056D2), shape = androidx.compose.foundation.shape.CircleShape),
                     contentAlignment = Alignment.Center
                 ) {
                     Text(text = "🎓", fontSize = 40.sp)
                 }
            }
            Spacer(modifier = Modifier.height(20.dp))
            Text(
                text = "EduQuest",
                fontSize = 42.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF0056D2), // EduBlue
                lineHeight = 46.sp
            )
            Spacer(modifier = Modifier.height(15.dp))
            Text(
                text = "Master any subject\nin 10 minutes a day.",
                fontSize = 18.sp,
                color = Color(0xFF757575),
                textAlign = TextAlign.Center
            )
        }
    }
}

fun Modifier.alpha(alpha: Float) = this.then(Modifier.graphicsLayer { this.alpha = alpha })
