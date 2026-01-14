package com.midnightcuriosity

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.midnightcuriosity.components.*
import com.midnightcuriosity.ui.theme.MidnightCuriosityTheme
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MidnightCuriosityTheme {
                AppNavigator()
            }
        }
    }
}

@Composable
fun AppNavigator() {
    val navController = rememberNavController()
    var grade by remember { mutableStateOf("") }
    var currentTopic by remember { mutableStateOf("") }

    Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            NavHost(navController = navController, startDestination = "splash") {
                composable("splash") {
                    SplashScreen(onComplete = {
                        val auth = com.google.firebase.auth.FirebaseAuth.getInstance()
                        val currentUser = auth.currentUser
                        if (currentUser != null) {
                            navController.navigate("grade") {
                                popUpTo("splash") { inclusive = true }
                            }
                        } else {
                            navController.navigate("auth") {
                                popUpTo("splash") { inclusive = true }
                            }
                        }
                    })
                }
                
                composable("auth") {
                    AuthGateScreen(onAuthSuccess = {
                         navController.navigate("grade") {
                             popUpTo("auth") { inclusive = true }
                         }
                    })
                }

                composable("grade") {
                    val scope = androidx.compose.runtime.rememberCoroutineScope()
                    val userRepository = androidx.compose.runtime.remember { com.midnightcuriosity.data.UserRepository() }
                    
                    GradeSelectionScreen(onGradeSelected = { selected ->
                        grade = selected
                        scope.launch {
                            userRepository.updateUserGrade(selected)
                            navController.navigate("knowledge_graph") 
                        }
                    })
                }

                composable("knowledge_graph") {
                    KnowledgeGraphScreen(onTopicSelected = { topic ->
                        currentTopic = topic
                        navController.navigate("hook")
                    })
                }
                
                composable("hook") {
                    VideoPlayerScreen(
                        grade = grade,
                        topic = currentTopic,
                        onComplete = { navController.navigate("reward") }
                    )
                }
                
                composable("reward") {
                    RewardScreen(onContinue = { navController.navigate("knowledge_graph") })
                }
            }
        }
    }
}
