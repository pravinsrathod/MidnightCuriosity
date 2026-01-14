package com.midnightcuriosity.components

import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import kotlin.random.Random

@Composable
fun RewardScreen(onContinue: () -> Unit) {
    var visible by remember { mutableStateOf(false) }
    val userRepository = remember { com.midnightcuriosity.data.UserRepository() }
    val scope = rememberCoroutineScope()

    val scale by animateFloatAsState(
        targetValue = if (visible) 1f else 0.5f,
        animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessLow),
        label = "scale"
    )

    LaunchedEffect(Unit) {
        visible = true
        // Mark "Linear Eq" (ID: 3) as completed
        try {
            userRepository.markTopicCompleted("3")
            android.util.Log.d("RewardScreen", "Topic 3 marked complete")
        } catch (e: Exception) {
            android.util.Log.e("RewardScreen", "Failed to mark complete: ${e.message}")
        }
    }

    // Dark Overlay with Modal functionality visually
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.8f)), // Dimmed background
        contentAlignment = Alignment.Center
    ) {
        // Confetti Canvas (Simple static or animated simulation)
        Canvas(modifier = Modifier.fillMaxSize()) {
            repeat(50) {
                val x = Random.nextFloat() * size.width
                val y = Random.nextFloat() * size.height
                val color = if (Random.nextBoolean()) Color(0xFF00C6FF) else Color(0xFFFF8C00)
                drawCircle(color, radius = 5f + Random.nextFloat() * 10f, center = Offset(x, y))
            }
        }
    
        // Success Card
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier
                .scale(scale)
                .fillMaxWidth(0.85f)
                .clip(RoundedCornerShape(24.dp))
                .background(Color.White)
                .padding(32.dp)
        ) {
            // Badge/Icon
            Box(
                modifier = Modifier
                    .size(100.dp)
                    .background(Color(0xFFFFF0E0), CircleShape) // Light orange bg
                    .padding(20.dp),
                contentAlignment = Alignment.Center
            ) {
                 Text("🏆", fontSize = 48.sp)
            }
            
            Spacer(modifier = Modifier.height(24.dp))

            Text(
                "Lesson Complete!",
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF1E1E1E),
                textAlign = TextAlign.Center
            )
            
            Spacer(modifier = Modifier.height(8.dp))

            Text(
                "You just mastered Algebra Basics.",
                fontSize = 14.sp,
                color = Color(0xFF757575),
                textAlign = TextAlign.Center
            )
            
            Spacer(modifier = Modifier.height(24.dp))
            
            // Rewards Row
            Row(
                verticalAlignment = Alignment.CenterVertically, 
                horizontalArrangement = Arrangement.Center,
                modifier = Modifier.fillMaxWidth()
            ) {
                 Column(horizontalAlignment = Alignment.CenterHorizontally) {
                     Text("+150", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Color(0xFF0056D2))
                     Text("XP Earned", fontSize = 12.sp, color = Color(0xFF757575))
                 }
                 Spacer(modifier = Modifier.width(32.dp))
                 Column(horizontalAlignment = Alignment.CenterHorizontally) {
                     Text("🔥 5", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Color(0xFFFF8C00))
                     Text("Day Streak", fontSize = 12.sp, color = Color(0xFF757575))
                 }
            }

            Spacer(modifier = Modifier.height(32.dp))

            // Primary Button "Next Lesson >"
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(30.dp))
                    .background(Color(0xFFFF8C00)) // Accent Action
                    .clickable { onContinue() }
                    .padding(vertical = 16.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    "Next Lesson >",
                    color = Color.White,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}
