# EduPro Multi-Tenancy Architecture Plan

## 1. Overview
This document outlines the architectural changes required to transform **EduPro** from a single-tenant application into a **Multi-Tenant SaaS Platform**. This allows multiple coaching institutes to use the same underlying infrastructure while keeping their data, students, and content completely isolated.

---

## 2. Terminology
- **Platform:** The EduPro software instance.
- **Tenant:** A specific coaching institute or school (e.g., "Sunrise Academy").
- **Tenant ID (`tenantId`):** A unique identifier for each institute (e.g., `sunrise-academy`).
- **User:** A student or teacher belonging to a specific Tenant.

---

## 3. Data Architecture (Firestore)
We will use **Field-Level Isolation** combined with **Custom Auth Claims**. This is the most scalable approach for Firebase-based SaaS apps as it prevents "Collection Depth" limits and simplifies querying.

### 3.1 Schema Changes
Every core collection must typically include a `tenantId` field.

#### **Collections**

**1. `tenants` (Root Collection - NEW)**
Stores metadata about the institutes.
```json
{
  "id": "sunrise-academy",
  "name": "Sunrise Academy",
  "logoUrl": "...",
  "primaryColor": "#FF5733",
  "plan": "pro", // subscription tier
  "createdAt": "timestamp"
}
```

**2. `users` (Modified)**
Students and Admins.
```json
{
  "uid": "user_123",
  "tenantId": "sunrise-academy",  // <--- CRITICAL
  "role": "student", // or 'admin', 'teacher'
  "name": "John Doe",
  "grade": "Grade 10",
  ...
}
```

**3. `lectures` (Modified)**
Content uploaded by institutes.
```json
{
  "id": "lec_123",
  "tenantId": "sunrise-academy",  // <--- CRITICAL
  "title": "Laws of Motion",
  "videoUrl": "...",
  ...
}
```

**4. `polls`, `exams`, `assignments` (Modified)**
All must have `tenantId`.

---

## 4. Authentication Flow

### 4.1 Custom Claims (Security)
We cannot rely on client-side logic alone to separate data. We must use **Firebase Custom Claims**.

1.  **Sign Up (Admin):** When an Institute registers, a Cloud Function creates their Tenant ID and assigns the `admin` role + `tenantId` claim to their Auth UID.
2.  **Sign Up (Student):**
    *   **Institute Code:** Students must enter an "Institute Code" (Tenant ID) during signup.
    *   **Cloud Function:** Verifies the code and assigns the `tenantId` claim to the student's Auth Token.

### 4.2 Security Rules (Enforcement)
The `firestore.rules` will strictly enforce isolation at the database kernel level.

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper function to check tenant isolation
    function isSameTenant(resourceTenantId) {
      return request.auth.token.tenantId == resourceTenantId;
    }

    // Helper to check if user is a tenant admin
    function isTenantAdmin() {
      return request.auth.token.role == 'admin';
    }

    // Tenant Metadata (Public Read for login verification, Write by Super Admin only)
    match /tenants/{tenantId} {
      allow read: if true; 
      allow write: if false; // Only via Cloud Functions
    }

    // Users
    match /users/{userId} {
      // Users can read/write their own profile OR Admins of the same tenant can access
      allow read, write: if request.auth.uid == userId || 
                         (isTenantAdmin() && isSameTenant(resource.data.tenantId));
    }

    // Generic Resources (Lectures, Exams, etc.)
    match /{collection}/{docId} {
      // Read: Application logic (must filter by tenantId)
      // Write: Tenant Admin only
      allow read: if resource.data.tenantId == request.auth.token.tenantId;
      allow write: if isTenantAdmin() && request.resource.data.tenantId == request.auth.token.tenantId;
    }
  }
}
```

---

## 5. Application Logic Updates

### 5.1 Mobile App (Student View)
1.  **Login Screen Update:**
    *   Add **"Institute Code"** input field.
    *   Store `tenantId` in `AsyncStorage` alongside `user_uid`.
2.  **Tenant Context:**
    *   Wrap the app in a `<TenantProvider>`.
    *   This provider ensures all subsequent API calls are aware of the current context.
3.  **Data Fetching:**
    *   Update all Firestore `query()` calls to include `.where("tenantId", "==", currentTenantId)`.

### 5.2 Admin Portal (Teacher View)
1.  **Registration Flow:** A new "Create Organization" page.
2.  **Dashboard:** When an Admin creates a lecture/exam, the app automatically attaches their `tenantId` to the data object before saving.

---

## 6. Migration Steps (Immediate Actions)

1.  **Phase 1: Database Prep:**
    *   Manually create a `tenants` collection with one default tenant (`default`).
    *   Run a migration script to add `tenantId: "default"` to all existing current docs (`users`, `lectures`, etc.).

2.  **Phase 2: Code Implementation:**
    *   Modify `auth.tsx` to accepting Institute Code.
    *   Update `firebaseConfig.ts` or a hook to provide the tenant context.

3.  **Phase 3: Security:**
    *   Deploy the new Firestore Rules.

4.  **Phase 4: Multi-Tenant Expansion:**
    *   Allow creation of new tenants via the Admin panel.
