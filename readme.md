# 🚀 SkillSpire Backend API

SkillSpire is a robust backend server for a full-stack **Contest Creation & Management Platform**.  
It enables users to create, participate in, and judge contests with a secure, role-based architecture.

---

## 🌐 Live Links
- **Server URL:** `https://skill-spire-server.vercel.app/`
- **Frontend Repository:** _[https://github.com/connectdipta/SkillSpire-client]_

---

## 🛠️ Technologies Used
- **Runtime:** Node.js  
- **Framework:** Express.js  
- **Database:** MongoDB (Native Driver)  
- **Security:** JSON Web Token (JWT), bcryptjs  
- **Authentication:** Firebase Admin SDK  
- **Utilities:** dotenv, cors, cookie-parser  

---

## 🔐 Authentication & Roles

SkillSpire uses a **hybrid authentication system**:
- Firebase Authentication (Client-side)
- JWT stored in **HTTP-only cookies** (Server-side)

This ensures secure, persistent user sessions.

### 👥 User Roles

| Role     | Permissions |
|----------|-------------|
| **Admin**   | Manage users, approve/reject contests, full system control |
| **Creator** | Create contests, manage submissions, declare winners |
| **User**    | Join contests, submit tasks, view leaderboard |

---

## 📌 API Endpoints Overview

### 🔑 Authentication
- `POST /jwt` – Generate JWT & sync user data with MongoDB  
- `POST /logout` – Clear authentication cookie  

### 👤 Users Management
- `GET /users/me` – Get logged-in user profile  
- `GET /users` – **(Admin)** Get all users  
- `PATCH /users/role/:email` – **(Admin)** Update user role  
- `PATCH /users/profile/:email` – Update user profile  

### 🏆 Contests
- `GET /contests` – Public/Creator view (search, filter, pagination)  
- `GET /contests/:id` – Get contest details  
- `POST /contests` – **(Creator)** Create contest  
- `PUT /contests/:id` – Update contest *(Pending only)*  
- `DELETE /contests/:id` – Delete contest *(Pending only)*  

### 🛡️ Admin Controls
- `GET /admin/contests` – View all contests  
- `PATCH /admin/contests/:id/status` – Approve or Reject contest  

### 💳 Payments & Registration
- `POST /payments` – Register user for contest (prevents duplicates)  

### 📝 Submissions & Winners
- `POST /submissions` – Submit contest task  
- `GET /submissions?contestId=ID` – **(Creator)** View contest submissions  
- `PATCH /submissions/:id/winner` – **(Creator)** Declare winner  
- `GET /leaderboard` – Rank users by total wins  
- `GET /winners` – Recent winners showcase  

---

## ⚙️ Environment Variables

Create a `.env` file in the project root:

```env
PORT=5000
DB_USER=your_mongodb_username
DB_PASS=your_mongodb_password
ACCESS_TOKEN_SECRET=your_ultra_secure_jwt_secret
NODE_ENV=development
🚀 Local Setup Instructions
1️⃣ Clone the Repository
git clone https://github.com/connectdipta/skillspire-server.git
cd skillspire-server
2️⃣ Install Dependencies
npm install
3️⃣ Run the Server
# Development mode
npm run dev

# Production mode
npm start
🔐 Security Features
JWT Protection: Secures private routes

Role Validation: Middleware (verifyAdmin, verifyCreator)

Data Integrity:

Prevents duplicate contest registrations

Ensures only one winner per contest

CORS: Secure cross-origin configuration

👨‍💻 Author
DIPTA ACHARJEE
Full Stack Developer

