package com.midnightcuriosity.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun GradeSelectionScreen(onGradeSelected: (String) -> Unit) {
    // UPDATED: Matches Admin Default ("Grade 10", "Grade 11", "Grade 12")
    val grades = listOf("Grade 10", "Grade 11", "Grade 12", "IGCSE")
    var selectedGrade by remember { mutableStateOf("Grade 10") }
    var expanded by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {

        // Top Nav Placeholder
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("EduQuest", color = Color(0xFF0056D2), fontWeight = FontWeight.Bold, fontSize = 20.sp)
            Text("Sign In", color = Color(0xFF757575), fontSize = 14.sp)
        }

        Spacer(modifier = Modifier.height(40.dp))

        // Hero Section
        Text(
            text = "Master Algebra\nin 10 Minutes a Day.",
            fontSize = 32.sp,
            fontWeight = FontWeight.Bold,
            color = Color(0xFF1E1E1E), // Dark Text
            lineHeight = 40.sp,
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(modifier = Modifier.height(24.dp))

        // Grade Selector (Simulated Dropdown)
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .border(1.dp, Color(0xFF0056D2), RoundedCornerShape(8.dp))
                .clip(RoundedCornerShape(8.dp))
                .clickable { expanded = !expanded }
                .padding(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text("I am studying in: $selectedGrade", color = Color(0xFF1E1E1E))
                Text("▼", color = Color(0xFF0056D2))
            }
        }
        
        if (expanded) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFFF5F7FA))
                    .border(1.dp, Color(0xFFE0E0E0))
            ) {
                grades.forEach { grade ->
                    Text(
                        text = grade,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { 
                                selectedGrade = grade
                                expanded = false
                            }
                            .padding(16.dp),
                        color = Color(0xFF1E1E1E)
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(30.dp))

        Spacer(modifier = Modifier.weight(1f)) // Push button to bottom

        Button(
            onClick = { onGradeSelected(selectedGrade) },
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0056D2)),
            shape = RoundedCornerShape(12.dp)
        ) {
            Text("Start Learning", fontSize = 18.sp, fontWeight = FontWeight.Bold)
        }
        

    }
}
