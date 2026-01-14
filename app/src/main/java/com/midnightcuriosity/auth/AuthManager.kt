package com.midnightcuriosity.auth

import android.app.Activity
import com.google.firebase.FirebaseException
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.PhoneAuthCredential
import com.google.firebase.auth.PhoneAuthOptions
import com.google.firebase.auth.PhoneAuthProvider
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import java.util.concurrent.TimeUnit

sealed class AuthState {
    object Idle : AuthState()
    object Loading : AuthState()
    object CodeSent : AuthState()
    class VerificationFailed(val error: String) : AuthState()
    class Authenticated(val userId: String) : AuthState()
}

class AuthManager {
    private val auth: FirebaseAuth = FirebaseAuth.getInstance()
    private var verificationId: String? = null
    private var resendToken: PhoneAuthProvider.ForceResendingToken? = null

    init {
        // Force Recaptcha/Web flow to bypass broken Play Integrity on Emulator
        auth.firebaseAuthSettings.forceRecaptchaFlowForTesting(true)
    }

    fun sendOtp(phoneNumber: String, activity: Activity): Flow<AuthState> = callbackFlow {
        trySend(AuthState.Loading)
        
        val callbacks = object : PhoneAuthProvider.OnVerificationStateChangedCallbacks() {
            override fun onVerificationCompleted(credential: PhoneAuthCredential) {
                // Auto-retrieval or instant verification
                signInWithCredential(credential) { success, result ->
                    if (success) {
                        trySend(AuthState.Authenticated(result ?: "unknown"))
                    } else {
                        trySend(AuthState.VerificationFailed("Auto-verification failed"))
                    }
                }
            }

            override fun onVerificationFailed(e: FirebaseException) {
                trySend(AuthState.VerificationFailed(e.message ?: "Verification failed"))
            }

            override fun onCodeSent(
                vId: String,
                token: PhoneAuthProvider.ForceResendingToken
            ) {
                verificationId = vId
                resendToken = token
                trySend(AuthState.CodeSent)
            }
        }

        val options = PhoneAuthOptions.newBuilder(auth)
            .setPhoneNumber(phoneNumber)
            .setTimeout(60L, TimeUnit.SECONDS)
            .setActivity(activity)
            .setCallbacks(callbacks)
            .build()
        
        PhoneAuthProvider.verifyPhoneNumber(options)
        
        awaitClose { }
    }

    fun verifyOtp(code: String): Flow<AuthState> = callbackFlow {
        android.util.Log.d("AuthManager", "Verifying OTP: $code with ID: $verificationId")
        trySend(AuthState.Loading)
        val vId = verificationId
        if (vId == null) {
            android.util.Log.e("AuthManager", "Verification ID is null")
            trySend(AuthState.VerificationFailed("No verification ID found"))
            close()
            return@callbackFlow
        }

        val credential = PhoneAuthProvider.getCredential(vId, code)
        signInWithCredential(credential) { success, result ->
            if (success) {
                android.util.Log.d("AuthManager", "SignIn Success: $result")
                trySend(AuthState.Authenticated(result ?: "unknown"))
            } else {
                android.util.Log.e("AuthManager", "SignIn Failed - Invalid OTP or other error")
                trySend(AuthState.VerificationFailed("Invalid OTP"))
            }
        }
        awaitClose { }
    }

    private fun signInWithCredential(credential: PhoneAuthCredential, onResult: (Boolean, String?) -> Unit) {
        auth.signInWithCredential(credential)
            .addOnCompleteListener { task ->
                if (task.isSuccessful) {
                    val user = task.result?.user
                    onResult(true, user?.uid)
                } else {
                    android.util.Log.e("AuthManager", "FirebaseAuth Error: ${task.exception?.message}")
                    onResult(false, null)
                }
            }
    }

    fun getCurrentUser() = auth.currentUser
    
    fun signOut() = auth.signOut()
}
