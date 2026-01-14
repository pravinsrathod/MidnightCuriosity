package com.midnightcuriosity.components
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.ArrowBack

import androidx.compose.foundation.Canvas
import kotlinx.coroutines.tasks.await
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

data class TopicNode(
    val id: String,
    val title: String,
    val xOffset: Float, 
    val yOffset: Float, 
    val isLocked: Boolean = false,
    val isCompleted: Boolean = false
)

@Composable
fun KnowledgeGraphScreen(onTopicSelected: (String) -> Unit) {
    val userRepository = remember { com.midnightcuriosity.data.UserRepository() }
    val context = androidx.compose.ui.platform.LocalContext.current
    val db = com.google.firebase.firestore.FirebaseFirestore.getInstance()
    
    // State
    var userName by remember { mutableStateOf<String?>(null) }
    var grade by remember { mutableStateOf("Grade 10") }
    var subjects by remember { mutableStateOf<List<String>>(emptyList()) }
    var selectedSubject by remember { mutableStateOf<String?>(null) }
    var topicTitles by remember { mutableStateOf<List<String>>(emptyList()) }
    var completedTopicIds by remember { mutableStateOf<List<String>>(emptyList()) }

    // Initial Data Load
    LaunchedEffect(Unit) {
        val profile = userRepository.getUserProfile()
        userName = profile?.name ?: "Student"
        completedTopicIds = profile?.completedTopics ?: emptyList() 
        grade = profile?.grade?.ifEmpty { "Grade 10" } ?: "Grade 10"

        // Fetch Subjects dynamically
        try {
             val result = db.collection("lectures")
                .whereEqualTo("grade", grade)
                .get()
                .await()
             
             val liveSubjects = result.documents.mapNotNull { it.getString("subject") }
                 .distinct()
                 .sorted()
             
             subjects = if (liveSubjects.isNotEmpty()) liveSubjects else listOf("Maths", "Physics", "Chemistry")
        } catch (e: Exception) {
             subjects = listOf("Maths", "Physics", "Chemistry")
        }
    }

    // Fetch Topics when Subject is selected
    LaunchedEffect(selectedSubject) {
        if (selectedSubject != null) {
            try {
                val result = db.collection("lectures")
                    .whereEqualTo("grade", grade)
                    .whereEqualTo("subject", selectedSubject)
                    .orderBy("createdAt", com.google.firebase.firestore.Query.Direction.ASCENDING)
                    .get()
                    .await()
                
                val liveTopics = result.documents.mapNotNull { it.getString("topic") }
                                .distinct()
                                .filter { it.isNotEmpty() }
                
                topicTitles = liveTopics
            } catch (e: Exception) {
                 topicTitles = emptyList() // or fallback
            }
        }
    }

    if (selectedSubject == null) {
        // SUBJECT SELECTION VIEW
        Column(
            modifier = Modifier.fillMaxSize().background(Color(0xFFF5F7FA)).padding(16.dp)
        ) {
            // Header
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 24.dp)) {
                Column {
                    Text("Welcome Back,", color = Color(0xFF757575), fontSize = 14.sp)
                    Text(userName ?: "Student", color = Color(0xFF1E1E1E), fontSize = 24.sp, fontWeight = FontWeight.Bold)
                }
                Spacer(Modifier.weight(1f))
                Text(grade, color = Color(0xFF0056D2), fontWeight = FontWeight.Bold, modifier = Modifier.background(Color(0xFFE3F2FD), RoundedCornerShape(8.dp)).padding(horizontal = 12.dp, vertical = 6.dp))
            }
            
            Text("Choose a Subject", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = Color(0xFF1E1E1E), modifier = Modifier.padding(bottom = 16.dp))
            
            subjects.forEach { subject ->
                Card(
                     modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 12.dp)
                        .clickable { selectedSubject = subject },
                     colors = CardDefaults.cardColors(containerColor = Color.White),
                     elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                     shape = RoundedCornerShape(12.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(20.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            modifier = Modifier.size(40.dp).background(Color(0xFFE3F2FD), CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                             Text(subject.take(1), fontWeight = FontWeight.Bold, color = Color(0xFF0056D2))
                        }
                        Spacer(modifier = Modifier.width(16.dp))
                        Text(subject, fontSize = 18.sp, fontWeight = FontWeight.Medium)
                        Spacer(Modifier.weight(1f))
                        Icon(androidx.compose.material.icons.Icons.Default.ArrowForward, contentDescription = null, tint = Color(0xFFBDBDBD))
                    }
                }
            }
        }
    } else {
        // TOPIC MAP VIEW (Existing Logic adapted)
        // ...
        // Re-use existing map logic but scoped to topicTitles
        // Add Back Button
        
        // Coordinates and Nodes Logic
        val coordinates = listOf(
            Pair(0.5f, 0.15f), Pair(0.2f, 0.35f), Pair(0.8f, 0.45f), Pair(0.5f, 0.7f), Pair(0.5f, 0.9f)
        )
        val nodes = topicTitles.mapIndexed { index, title ->
            val id = (index + 1).toString()
            val isCompleted = completedTopicIds.contains(id) // Note: IDs might need to be namespaced by subject if we want unique tracking per subject
            // For now, assuming simple tracking
            val isLocked = index > 0 && !completedTopicIds.contains(index.toString())
            val (x, y) = coordinates.getOrElse(index) { Pair(0.5f, 0.5f) }
            TopicNode(id, title, x, y, isLocked, isCompleted)
        }
        
        val connections = if (nodes.size > 1) {
            (0 until nodes.size - 1).map { (it + 1).toString() to (it + 2).toString() }
        } else emptyList()

        Box(modifier = Modifier.fillMaxSize()) {
             Column(
                modifier = Modifier.fillMaxSize().background(Color(0xFFF5F7FA))
            ) {
                // Header with Back
                Row(
                    modifier = Modifier.fillMaxWidth().background(Color.White).padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        androidx.compose.material.icons.Icons.Default.ArrowBack, 
                        contentDescription = "Back",
                        modifier = Modifier.clickable { selectedSubject = null }
                    )
                    Spacer(modifier = Modifier.width(16.dp))
                    Text(selectedSubject!!, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                }
                
                // Map Area (Simplified reuse of previous code)
                BoxWithConstraints(modifier = Modifier.fillMaxSize().padding(horizontal = 20.dp, vertical = 20.dp)) {
                     Canvas(modifier = Modifier.fillMaxSize()) {
                        connections.forEach { (parentId, childId) ->
                            val parent = nodes.find { it.id == parentId }
                            val child = nodes.find { it.id == childId }
                            if (parent != null && child != null) {
                                val start = Offset(parent.xOffset * size.width, parent.yOffset * size.height)
                                val end = Offset(child.xOffset * size.width, child.yOffset * size.height)
                                drawLine(
                                    color = if (parent.isCompleted) Color(0xFF0056D2) else Color(0xFFE0E0E0),
                                    start = start, end = end, strokeWidth = 8f, cap = Stroke.DefaultCap,
                                    pathEffect = if (!parent.isCompleted) PathEffect.dashPathEffect(floatArrayOf(20f, 20f)) else null
                                )
                            }
                        }
                    }
                    nodes.forEach { node ->
                        TopicNodeView(
                            node = node,
                            modifier = Modifier.offset(
                                x = (maxWidth * node.xOffset) - 40.dp, 
                                y = (maxHeight * node.yOffset) - 40.dp
                            ),
                            onClick = { if (!node.isLocked) onTopicSelected(node.title) }
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun TopicNodeView(node: TopicNode, modifier: Modifier, onClick: () -> Unit) {
    val bgColor = when {
        node.isCompleted -> Color(0xFF28C76F) // Success Green
        node.isLocked -> Color(0xFFE0E0E0) // Locked Grey
        else -> Color(0xFFFF8C00) // Current Active (Orange)
    }
    
    val icon = when {
        node.isCompleted -> "✓"
        node.isLocked -> "🔒"
        else -> "★"
    }

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = modifier
            .width(80.dp)
            .clickable { onClick() }
    ) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .size(60.dp)
                .background(Color.White, CircleShape) // White border effect
                .padding(4.dp) // Gap
                .clip(CircleShape)
                .background(bgColor)
                .padding(8.dp) // Inner padding
        ) {
             Text(
                text = icon,
                color = Color.White,
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold
             )
        }
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = node.title,
            color = if (node.isLocked) Color(0xFF757575) else Color(0xFF1E1E1E),
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1
        )
    }
}
