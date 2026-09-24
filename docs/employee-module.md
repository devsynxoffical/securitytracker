# Employee CRM / Profile & Work Information Module

**Status**: Phase 5 Verified Complete Specification  
**Client**: DEVSYNX Private Limited  
**Database**: Local SQLite File (`backend/prisma/devsynx.db`) via Prisma ORM

---

## 1. Overview & Business Objective

The Employee CRM / Profile Module is an internal workplace information and work-documentation system connected to the DEVSYNX Activity Tracker. It serves as the central entity to which employee identity, organizational hierarchy, skills, project memberships, work updates, and (in Phase 6+) desktop devices and activity telemetry are linked.

---

## 2. Privacy Boundaries & Attachment Guidelines

### 2.1 Strict Privacy Policy
- **Zero Automatic Content Capture**: The automatic desktop activity tracker does **NOT** collect screenshots, keystrokes, clipboard buffers, passwords, or file contents.
- **Manual Attachments Only**: Employees may voluntarily upload an image or PDF attachment to a Work Update (e.g. attaching a UI design mock or problem diagram to explain progress). This is strictly a manual upload operation initiated by the employee.

---

## 3. Field-Level Permission & Security Model

To prevent unauthorized field tampering, the API enforces a strict distinction between self-service fields and admin-controlled organizational fields:

| Field Group | Field Names | Permitted Editors | Validation Rule |
| :--- | :--- | :--- | :--- |
| **Self-Service** | `avatarUrl`, `bio`, `responsibilities`, `currentFocus`, `workLinksJson` | Employee (Self) or Admin | `PATCH /api/v1/users/:id` |
| **Admin-Controlled** | `employeeId`, `email`, `department`, `jobTitle`, `managerId`, `status`, `role`, `joiningDate` | Admin / Super Admin Only | `PATCH /api/v1/users/:id/admin` |

---

## 4. Manager & Role Access Rules

- **`EMPLOYEE`**: View own profile, edit self-service profile fields, add/remove own skills, post/delete own work updates, view assigned projects. Cannot edit other employees or admin-protected fields.
- **`MANAGER`**: View profiles, skills, projects, and work updates for **direct reports** (`User.managerId === manager.id`). Access to unrelated employees outside their reporting tree is restricted (HTTP 403 `FORBIDDEN`).
- **`ADMIN` / `SUPER_ADMIN`**: Manage all employee profiles, update organizational fields, reassign managers, adjust roles and statuses, and moderate content.

---

## 5. Attachment Storage Architecture

- **Filesystem Storage**: Attachments are stored locally on the backend server at `backend/storage/employee-attachments/`.
- **Database Metadata**: Metadata is stored in SQLite (`Attachment` table): `id`, `workUpdateId`, `originalName`, `storedName`, `mimeType`, `size`, `storagePath`.
- **Security Controls**:
  - **File Size**: Maximum 5 MB per attachment.
  - **MIME Types**: Allowed `image/jpeg`, `image/png`, `image/webp`, `application/pdf`.
  - **Sanitized Filenames**: Random `UUID` stored names to prevent filesystem collision.
  - **Path Traversal Protection**: Target path verified to remain within `STORAGE_DIR`.

---

## 6. Implemented REST API Endpoints

### 6.1 Employee Profiles & Directory
- `GET /api/v1/users`: Lists employee directory with optional `search`, `department`, and `status` query filters.
- `GET /api/v1/users/:id`: Fetches detailed employee profile (Overview, Skills, Projects, Work Updates).
- `PATCH /api/v1/users/:id`: Self-service profile update.
- `PATCH /api/v1/users/:id/admin`: Admin-only organizational profile update.

### 6.2 Skills Management
- `POST /api/v1/users/:id/skills`: Adds a skill (`name`, `proficiency`).
- `DELETE /api/v1/users/:id/skills/:skillId`: Removes a skill.

### 6.3 Work Updates
- `POST /api/v1/users/:id/updates`: Posts a work update (`title`, `description`, optional project & attachment).
- `DELETE /api/v1/users/:id/updates/:updateId`: Deletes a work update.

---

## 7. Future Activity & Device Integration Points (Phase 6+)

In Phase 6, the Employee Profile page (`/employees/:id`) will seamlessly incorporate:
1. **Activity Telemetry Tab**: Displays daily active hours, top applications used, and segregated idle duration charts.
2. **Device Inventory Tab**: Lists assigned desktop workstations (`Device`), online/offline status, agent version, and last seen heartbeat.
