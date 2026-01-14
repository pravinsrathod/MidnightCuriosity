package com.midnightcuriosity.components

import android.app.Activity
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.ExperimentalAnimationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.midnightcuriosity.auth.AuthManager
import com.midnightcuriosity.auth.AuthState
import kotlinx.coroutines.launch

@OptIn(ExperimentalAnimationApi::class)
@Composable
fun AuthGateScreen(onAuthSuccess: () -> Unit = {}) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val authManager = remember { AuthManager() }
    val userRepository = remember { com.midnightcuriosity.data.UserRepository() }

    var isSignUp by remember { mutableStateOf(true) }
    var phoneNumber by remember { mutableStateOf("") }
    var otpCode by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    
    // UI State
    var authState by remember { mutableStateOf<AuthState>(AuthState.Idle) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var isSavingProfile by remember { mutableStateOf(false) }
    
    // Logic State
    val isOtpSent = authState is AuthState.CodeSent || (authState is AuthState.Loading && otpCode.isNotEmpty())

    LaunchedEffect(authState) {
        android.util.Log.d("AuthGateScreen", "AuthState changed: $authState")
        if (authState is AuthState.Authenticated) {
            android.util.Log.d("AuthGateScreen", "User Authenticated. isSignUp=$isSignUp")
            if (isSignUp) {
                isSavingProfile = true
                try {
                    android.util.Log.d("AuthGateScreen", "Calling saveUserProfile")
                    // We don't have grade yet, pass empty string. Will be updated in next screen.
                    userRepository.saveUserProfile(name, "")
                    android.util.Log.d("AuthGateScreen", "Profile saved, calling onAuthSuccess")
                    onAuthSuccess()
                } catch (e: Exception) {
                    android.util.Log.e("AuthGateScreen", "Exception in saveUserProfile: ${e.message}")
                    errorMessage = "Failed to save profile: ${e.message}"
                } finally {
                    isSavingProfile = false
                }
            } else {
                onAuthSuccess()
            }
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.White)
            .padding(20.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(24.dp))
                .background(Color(0xFFF5F7FA))
                .padding(30.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Toggle
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 24.dp)
                    .clip(RoundedCornerShape(50))
                    .background(Color.White)
                    .padding(4.dp)
            ) {
                TabButton(
                    text = "Sign Up",
                    isSelected = isSignUp,
                    modifier = Modifier.weight(1f),
                    onClick = { isSignUp = true }
                )
                TabButton(
                    text = "Log In",
                    isSelected = !isSignUp,
                    modifier = Modifier.weight(1f),
                    onClick = { isSignUp = false }
                )
            }

            Text(
                text = if (isSignUp) "Create Account" else "Welcome Back",
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF1E1E1E),
                modifier = Modifier.padding(bottom = 8.dp)
            )
            
            Text(
                "Enter your mobile number to get started",
                fontSize = 14.sp,
                color = Color(0xFF757575),
                modifier = Modifier.padding(bottom = 24.dp),
                textAlign = TextAlign.Center
            )

            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                
                // Name Input (Only for Sign Up)
                AnimatedVisibility(visible = isSignUp && !isOtpSent) {
                    AuthTextField(
                        value = name,
                        onValueChange = { name = it },
                        label = "Full Name",
                        placeholder = "John Doe"
                    )
                }

                // Phone Input
                AuthTextField(
                    value = phoneNumber,
                    onValueChange = { if (it.length <= 15) phoneNumber = it },
                    label = "Mobile Number",
                    placeholder = "+1 555 123 4567",
                    keyboardType = KeyboardType.Phone,
                    enabled = !isOtpSent
                )

                // OTP Input (Visible only after code sent)
                AnimatedVisibility(visible = isOtpSent) {
                    AuthTextField(
                        value = otpCode,
                        onValueChange = { if (it.length <= 6) otpCode = it },
                        label = "Verification Code",
                        placeholder = "123456",
                        keyboardType = KeyboardType.NumberPassword
                    )
                }

                // Error Message
                if (authState is AuthState.VerificationFailed || errorMessage != null) {
                    val msg = (authState as? AuthState.VerificationFailed)?.error ?: errorMessage
                    Text(
                        text = msg ?: "Error",
                        color = Color.Red,
                        fontSize = 12.sp,
                        modifier = Modifier.padding(start = 4.dp)
                    )
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Action Button
                Button(
                    onClick = {
                        errorMessage = null
                        if (!isOtpSent) {
                             if (phoneNumber.isNotEmpty() && (name.isNotEmpty() || !isSignUp)) {
                                 scope.launch {
                                     authManager.sendOtp(phoneNumber, context as Activity).collect {
                                         authState = it
                                     }
                                 }
                             } else {
                                 errorMessage = "Please fill all fields"
                             }
                        } else {
                             if (otpCode.length == 6) {
                                 scope.launch {
                                     authManager.verifyOtp(otpCode).collect {
                                         authState = it
                                     }
                                 }
                             } else {
                                 errorMessage = "Enter 6-digit code"
                             }
                        }
                    },
                    modifier = Modifier.fillMaxWidth().height(50.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0056D2)),
                    shape = RoundedCornerShape(25.dp),
                    enabled = authState !is AuthState.Loading && !isSavingProfile
                ) {
                     if (authState is AuthState.Loading || isSavingProfile) {
                        CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp))
                    } else {
                        Text(
                            text = if (isOtpSent) "Verify & Login" else "Get OTP",
                            color = Color.White,
                            fontWeight = FontWeight.Bold,
                            fontSize = 16.sp
                        )
                    }
                }
                
                if (isOtpSent) {
                   Text(
                       "Change Number",
                       color = Color(0xFF0056D2),
                       fontSize = 14.sp,
                       fontWeight = FontWeight.Bold,
                       modifier = Modifier
                           .padding(top = 10.dp)
                           .clickable {
                               authState = AuthState.Idle
                               otpCode = ""
                               errorMessage = null
                           }
                   )
                }
            }
        }
    }
}

@Composable
fun TabButton(
    text: String,
    isSelected: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(50))
            .background(if (isSelected) Color(0xFF0056D2) else Color.Transparent)
            .clickable { onClick() }
            .padding(vertical = 12.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = text,
            color = if (isSelected) Color.White else Color(0xFF757575),
            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AuthTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    placeholder: String,
    keyboardType: KeyboardType = KeyboardType.Text,
    enabled: Boolean = true
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(label, color = Color(0xFF757575), fontSize = 14.sp, modifier = Modifier.padding(start = 4.dp))
        TextField(
            value = value,
            onValueChange = onValueChange,
            placeholder = { Text(placeholder, color = Color(0xFFBDBDBD)) },
            colors = TextFieldDefaults.colors(
                focusedContainerColor = Color.White,
                unfocusedContainerColor = Color.White,
                focusedIndicatorColor = Color(0xFF0056D2),
                unfocusedIndicatorColor = Color.Transparent,
                focusedTextColor = Color(0xFF1E1E1E),
                unfocusedTextColor = Color(0xFF1E1E1E),
                disabledContainerColor = Color(0xFFEEEEEE),
                disabledTextColor = Color.Gray
            ),
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier
                .fillMaxWidth()
                .border(1.dp, Color(0xFFE0E0E0), RoundedCornerShape(12.dp)),
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
            enabled = enabled,
            singleLine = true
        )
    }
}
