# System Architecture: Midnight Curiosity (EduPro)

This document visualizes the high-level architecture of the platform, highlighting the interaction between Client Applications, User Roles, and the Serverless Firebase Backend.

## Architectural Diagram

```mermaid
graph TD
    %% Users
    subgraph User_Roles [User Roles]
        Student((Student))
        Parent((Parent))
        Admin((Institute Admin))
    end

    %% Client Layer
    subgraph Client_Layer [Client Applications]
        style Client_Layer fill:#f9f9f9,stroke:#333,stroke-width:2px
        
        MobileApp[📱 Mobile App<br/>(React Native / Expo)]
        AdminWeb[💻 Admin Portal<br/>(React.js)]
    end

    %% Backend Layer
    subgraph Backend_Layer [Firebase Serverless Backend]
        style Backend_Layer fill:#fff4e6,stroke:#ff9900,stroke-width:2px

        FirebaseAuth[🔐 Firebase Authentication<br/>(Identity Management)]
        
        subgraph Data_Storage [Data & Storage]
            Firestore[(Cloud Firestore<br/>NoSQL Database)]
            FBStorage[📂 Firebase Storage<br/>(Files & Images)]
        end
        
        subgraph Security [Security Layer]
            FirestoreRules[🛡️ Firestore Rules]
            StorageRules[🛡️ Storage Rules]
        end
    end

    %% External Services
    subgraph External [External Services]
        AI_Service[🤖 AI Engine<br/>(ExamGen / Doubts)]
    end

    %% Relationships
    Student -->|Uses| MobileApp
    Parent -->|Uses| MobileApp
    Admin -->|Uses| AdminWeb

    %% Mobile Interactions
    MobileApp -->|Login (Phone+Pass)| FirebaseAuth
    MobileApp -->|Read/Write (Homework, Doubts)| Firestore
    MobileApp -->|Upload (Images)| FBStorage

    %% Web Interactions
    AdminWeb -->|Login (Email/Phone+Pass)| FirebaseAuth
    AdminWeb -->|Manage (Tenants, Users, Content)| Firestore
    AdminWeb -->|Review/Upload| FBStorage
    AdminWeb -->|Request Generation| AI_Service

    %% Security Enforcement
    Firestore -.->|Enforces Access| FirestoreRules
    FBStorage -.->|Enforces Access| StorageRules

    %% Logic Connections
    AI_Service -.->|Returns Content| AdminWeb
```

## Component Breakdown

### 1. Client Applications
*   **Mobile App**: Built with **React Native (Expo)**. Serves **Students** and **Parents**. Focuses on consumption (Lectures, Attendance) and interaction (Homework Submission, Doubts, Leaderboard).
*   **Admin Portal**: Built with **React.js**. Serves **Institute Admins**. Focuses on management (User approvals, Content creation, Attendance marking, Analytics).

### 2. Authentication
*   **Service**: **Firebase Auth**.
*   **Mechanism**: Password-based authentication for all roles.
    *   **Mobile**: Maps Phone Numbers to virtual emails (`<phone>@midnightcuriosity.com`) to support "Phone Number as Username".
    *   **Web**: Supports both Email and Phone Number logins.

### 3. Database (Cloud Firestore)
*   **Structure**: Multi-tenant architecture.
*   **Key Collections**:
    *   `users`: Stores profile, role (Student/Parent/Admin), and tenant association.
    *   `tenants`: Stores Institute metadata and configuration.
    *   `homework` / `submissions`: Relational data for assignment workflows.
    *   `attendance`: Daily records per tenant.

### 4. Storage
*   **Service**: **Firebase Storage**.
*   **Usage**: Stores Homework images (Student uploads), Exam PDFs (Admin uploads), and User Avatars.
*   **Security**: Path-based locking (`/homework/{tenant}/{id}/{uid}`) ensures isolation.

### 5. AI Integration
*   Used primarily by the Admin interface to assist in generating content (Exams from PDFs) and potentially resolving student doubts.
