package com.midnightcuriosity.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.tasks.await
import androidx.compose.material3.CircularProgressIndicator
import android.util.Log

data class QuizData(
    val question: String,
    val options: List<String>,
    val correctIndex: Int,
    val triggerPercentage: Int
)

@Composable
fun VideoPlayerScreen(grade: String, topic: String, onComplete: () -> Unit) {
    var progress by remember { mutableStateOf(0f) }
    var isPlaying by remember { mutableStateOf(true) }
    var showOverlay by remember { mutableStateOf(false) }
    var hasQuizShown by remember { mutableStateOf(false) } // Ensure quiz shows only once
    
    // Video Data State
    var videoUrl by remember { mutableStateOf("") }
    var videoTitle by remember { mutableStateOf("Loading Lesson...") }
    var quizData by remember { mutableStateOf<QuizData?>(null) }
    var isLoadingVideo by remember { mutableStateOf(true) }

    // Fetch Video from Firestore
    LaunchedEffect(grade, topic) {
        val db = FirebaseFirestore.getInstance()
        android.util.Log.d("VideoPlayerDebug", "Searching for Grade: '$grade', Topic: '$topic'")
        try {
            val query = db.collection("lectures")
                .whereEqualTo("grade", grade)
                .whereEqualTo("topic", topic)
                .limit(1)
                
            val snapshot = query.get().await()
            android.util.Log.d("VideoPlayerDebug", "Found ${snapshot.size()} documents.")
            
            if (!snapshot.isEmpty) {
                val doc = snapshot.documents[0]
                videoUrl = doc.getString("videoUrl") ?: ""
                videoTitle = doc.getString("title") ?: topic
                android.util.Log.d("VideoPlayerDebug", "Video URL: $videoUrl")
                
                // Parse Quiz Data
                val quizMap = doc.get("quiz") as? Map<String, Any>
                if (quizMap != null) {
                    val qText = quizMap["question"] as? String ?: ""
                    val opts = quizMap["options"] as? List<String> ?: emptyList()
                    val correct = (quizMap["correctIndex"] as? Long)?.toInt() ?: 0
                    val trigger = (quizMap["triggerPercentage"] as? Long)?.toInt() ?: 50
                    
                    if (qText.isNotEmpty() && opts.size >= 3) {
                        quizData = QuizData(qText, opts, correct, trigger)
                        android.util.Log.d("VideoPlayerDebug", "Quiz loaded: $qText @ $trigger%")
                    }
                }
                
            } else {
                 videoTitle = "Lesson not uploaded yet"
                 android.util.Log.w("VideoPlayerDebug", "No video found for '$topic'")
            }
        } catch (e: Exception) {
            Log.e("VideoPlayer", "Error fetching lecture: ${e.message}")
             videoTitle = "Error loading lesson"
        } finally {
            isLoadingVideo = false
        }
    }

    Column(
        modifier = Modifier
             .fillMaxSize()
             .background(Color.White)
    ) {
        // VIDEO AREA (Top)
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(16f / 9f)
                .background(Color.Black),
            contentAlignment = Alignment.Center
        ) {
            if (isLoadingVideo) {
                 CircularProgressIndicator(color = Color.White)
            } else if (videoUrl.isNotEmpty()) {
                UniversalVideoPlayer(
                    modifier = Modifier.fillMaxSize(),
                    videoUrl = videoUrl,
                    isPlaying = isPlaying,
                    onProgressUpdate = { currentProgress ->
                        progress = currentProgress
                        // Check if Quiz should trigger
                        val trigger = quizData?.triggerPercentage ?: 50
                        
                        // Show if we pass trigger point, haven't shown it yet, AND we have valid quiz data
                        if (quizData != null && !hasQuizShown && currentProgress > trigger && currentProgress < (trigger + 2)) {
                            isPlaying = false // Pause Video
                            showOverlay = true
                            hasQuizShown = true
                        }
                    },
                    onVideoComplete = {
                        onComplete()
                    }
                )
            } else {
                 Text("No video available for this topic.", color = Color.White)
            }

            // Custom Controls Overlay removed to use Native Controls
            /* 
               If specific overlays (like Skip) are needed, add them back here 
               but position them carefully to not overlap Native Controls (Bottom).
            */
            if (!showOverlay && !isLoadingVideo && videoUrl.isNotEmpty()) {
                // Keep Skip Button as a fallback navigation
                 Box(
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .padding(16.dp)
                        .padding(bottom = 40.dp) // Move up above native controls
                        .clip(RoundedCornerShape(4.dp))
                        .background(Color.Black.copy(alpha = 0.6f))
                        .clickable { onComplete() }
                        .padding(horizontal = 12.dp, vertical = 6.dp)
                ) {
                    Text("Next >", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }

            if (showOverlay && quizData != null) {
                InteractiveOverlay(
                    quizData = quizData!!,
                    onCorrect = { showOverlay = false; isPlaying = true },
                    onWrong = { showOverlay = false; isPlaying = true } // For now, wrong also continues. Can be changed to retry.
                )
            }
        }

        // CONTEXT AREA (Bottom)
        Column(modifier = Modifier.padding(20.dp)) {
            Text(videoTitle, fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Color(0xFF1E1E1E))
            Text("$grade • 5 mins", fontSize = 14.sp, color = Color(0xFF757575))
            
            Spacer(modifier = Modifier.height(24.dp))
            
            // Tabs
            Row(modifier = Modifier.fillMaxWidth()) {
                 TabItem("Overview", isSelected = true)
                 TabItem("Q & A", isSelected = false)
                 TabItem("Notes", isSelected = false)
            }
            Divider(color = Color(0xFFE0E0E0))
            
            Spacer(modifier = Modifier.height(16.dp))
            Text("In this lesson, we will cover the basics of variables and constants...", color = Color(0xFF1E1E1E), fontSize = 14.sp, lineHeight = 20.sp)
        }
    }
}

@Composable
fun ControlBadge(text: String) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(4.dp))
            .background(Color.Black.copy(alpha = 0.5f))
            .padding(horizontal = 8.dp, vertical = 4.dp)
    ) {
        Text(text, color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
fun TabItem(text: String, isSelected: Boolean) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.padding(end = 24.dp).width(IntrinsicSize.Max)
    ) {
        Text(
            text, 
            color = if(isSelected) Color(0xFF0056D2) else Color(0xFF757575),
            fontWeight = if(isSelected) FontWeight.Bold else FontWeight.Medium,
            modifier = Modifier.padding(bottom = 8.dp)
        )
        if (isSelected) {
            Box(
                modifier = Modifier.fillMaxWidth().height(2.dp).background(Color(0xFF0056D2))
            )
        }
    }
}

@Composable
fun Divider(color: Color) {
    Box(modifier = Modifier.fillMaxWidth().height(1.dp).background(color))
}

@Composable
fun InteractiveOverlay(quizData: QuizData, onCorrect: () -> Unit, onWrong: () -> Unit) {
    Box(
         modifier = Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.85f)),
         contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(16.dp)
        ) {
            Text("Quick Check!", color = Color(0xFF00C6FF), fontSize = 18.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 8.dp))
            Text(quizData.question, color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 20.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
            
            // Render Options
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                quizData.options.forEachIndexed { index, optionText ->
                    val isCorrect = index == quizData.correctIndex
                    OverlayButton(
                        text = optionText,
                        onClick = {
                            if (isCorrect) onCorrect() else onWrong()
                        },
                        isPrimary = false // We don't hint which is primary visually before click, or maybe we do? Let's keep generic style logic or randomize.
                        // Actually, let's just use generic style. 
                    )
                }
            }
        }
    }
}

@Composable
fun OverlayButton(text: String, onClick: () -> Unit, isPrimary: Boolean = false) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(if (isPrimary) Color(0xFF0056D2) else Color.White.copy(alpha = 0.1f))
            .clickable { onClick() }
            .padding(horizontal = 24.dp, vertical = 12.dp)
    ) {
        Text(text = text, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 18.sp)
    }
}
