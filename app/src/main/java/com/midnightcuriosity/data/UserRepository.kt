package com.midnightcuriosity.data

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions
import kotlinx.coroutines.tasks.await

data class UserProfile(
    val uid: String = "",
    val name: String = "",
    val phoneNumber: String = "",
    val grade: String = "",
    val joinedAt: Long = System.currentTimeMillis(),
    val completedTopics: List<String> = emptyList(),
    val topics: List<String> = emptyList() // The personalized curriculum
)

class UserRepository {
    private val db = FirebaseFirestore.getInstance()
    private val auth = FirebaseAuth.getInstance()
    
    // ... existing saveUserProfile ...

    // Save Generated Topics
    suspend fun saveUserTopics(topics: List<String>) {
        val user = auth.currentUser ?: return
        try {
             db.collection("users").document(user.uid)
                .update("topics", topics)
                .await()
        } catch (e: Exception) {
             // If update fails (doc might not exist efficiently?), use set with merge
             val data = hashMapOf("topics" to topics)
             db.collection("users").document(user.uid)
                 .set(data, SetOptions.merge())
                 .await()
        }
    }
    
    // ... existing getUserProfile ...
    // ... existing markTopicCompleted ...

    
    // Create or Update User Profile
    suspend fun saveUserProfile(name: String, grade: String) {
        android.util.Log.d("UserRepository", "Saving user profile for $name, $grade")
        val user = auth.currentUser ?: throw Exception("User not logged in")
        
        // We use merge so we don't overwrite existing completedTopics if we update profile later
        val userProfileMap = hashMapOf(
            "uid" to user.uid,
            "name" to name,
            "phoneNumber" to (user.phoneNumber ?: ""),
            "grade" to grade,
            "joinedAt" to System.currentTimeMillis()
        )
        
        // Save to 'users' collection with UID as document ID
        try {
            db.collection("users").document(user.uid)
                .set(userProfileMap, SetOptions.merge())
                .await()
            android.util.Log.d("UserRepository", "Profile saved successfully")
        } catch (e: Exception) {
            android.util.Log.e("UserRepository", "Error saving profile: ${e.message}")
            throw e
        }
    }
    
    // Fetch User Profile
    suspend fun getUserProfile(): UserProfile? {
        val user = auth.currentUser ?: return null
        val snapshot = db.collection("users").document(user.uid).get().await()
        return snapshot.toObject(UserProfile::class.java)
    }

    // Mark Topic as Completed
    suspend fun markTopicCompleted(topicId: String) {
        val user = auth.currentUser ?: return
        try {
            // FieldValue.arrayUnion ensures no duplicates
            db.collection("users").document(user.uid)
                .update("completedTopics", com.google.firebase.firestore.FieldValue.arrayUnion(topicId))
                .await()
            android.util.Log.d("UserRepository", "Topic $topicId marked as completed")
        } catch (e: Exception) {
            android.util.Log.e("UserRepository", "Error marking topic completed: ${e.message}")
            // If the document doesn't exist or field is missing, set() might be safer or initial creation
        }
    }

    // Update Grade
    suspend fun updateUserGrade(grade: String) {
        val user = auth.currentUser ?: return
        try {
            db.collection("users").document(user.uid)
                .update("grade", grade)
                .await()
             android.util.Log.d("UserRepository", "Grade updated to $grade")
        } catch (e: Exception) {
             val data = hashMapOf("grade" to grade)
             db.collection("users").document(user.uid)
                 .set(data, SetOptions.merge())
                 .await()
        }
    }
}
