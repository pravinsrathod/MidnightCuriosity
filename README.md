# Midnight Curiosity (EduPro)

A multi-tenant educational platform featuring a Student/Parent Mobile App and an Admin Web Portal.

## Architecture Overview
The platform uses a serverless architecture powered by **Firebase**:
- **Authentication**: Firebase Auth (Phone/Email mapping)
- **Database**: Cloud Firestore (Multi-tenant structure)
- **Storage**: Firebase Storage (Homework, Exams, Avatars)
- **Frontend (Admin)**: React.js
- **Mobile (Student/Parent)**: React Native (Expo)

---

## 💻 Admin Portal (`admin-web/`)
The Admin Portal is a React-based web application for institute administrators.

### Core Features:
- **Tenant Management**: Create and configure institute identities.
- **User Management**: Approve/Reject student and parent registrations.
- **Content Creation**: Upload lectures, homework, and schedule exams.
- **AI Integration**: Automatically generate exams from PDF uploads.
- **Analytics**: Track student progress, attendance, and leaderboard.

### Local Setup:
1. Navigate to `admin-web/`
2. Run `npm install`
3. Run `npm run dev`

---

## 📱 Mobile App (`mobile-rn/`)
The Mobile App is a React Native application built with Expo for students and parents.

### Core Features:
- **Knowledge Graph**: Personalized learning paths and topic mapping.
- **Homework & Submissions**: View and upload homework directly via camera.
- **Real-time Polls**: Participate in live classroom interactions.
- **Doubt Solver**: Ask questions and get assistance.
- **Gamification**: Earn rewards, maintain streaks, and view leanboard rankings.
- **Parent View**: Specific dashboard for parents to track child progress.

### Local Setup:
1. Navigate to `mobile-rn/`
2. Run `npm install`
3. Run `npx expo start`

---

## 📂 Project Structure
- `admin-web/`: React frontend for administrators.
- `mobile-rn/`: React Native (Expo) frontend for students/parents.
- `scripts/`: Utility scripts for database migrations and maintenance.
- `firestore.rules`: Security configuration for the database.
- `storage.rules`: Security configuration for storage buckets.
