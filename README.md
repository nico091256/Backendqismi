# IT Support Backend API

A simple, clean REST API for an internal IT Support problem-reporting system.  
Employees submit problems via the frontend. IT staff can view, resolve, and delete them.

---

## Tech Stack

| Tool | Purpose |
|------|---------|
| Node.js + Express | HTTP server & routing |
| Prisma ORM | Database access |
| SQLite | Local database (file-based) |
| dotenv | Environment config |
| CORS | Cross-origin access |
| express-rate-limit | Basic rate limiting |

---

## 1. Install Dependencies

```bash
cd backend
npm install
```

---

## 2. Configure Environment Variables

Copy `.env.example` to `.env` and adjust if needed:

```bash
cp .env.example .env
```

Default values:

```env
PORT=5000
DATABASE_URL="file:./dev.db"
NODE_ENV=development
ALLOWED_ORIGINS="http://localhost:3000,http://localhost:5173,http://localhost:5174"
ADMIN_PASSWORD="ITadmin2026"
```

---

## 3. Initialize Prisma & Create the SQLite Database

Generate the Prisma client and run the first migration (this creates `prisma/dev.db`):

```bash
npm run prisma:generate
npm run prisma:migrate
```

When prompted for a migration name, type something like `init`.

---

## 4. Run the Development Server

```bash
npm run dev
```

The server starts at **http://localhost:5000**.

---

## 5. Available API Endpoints

| Method | Endpoint | Description | Ruxsat (Auth) |
|---|---|---|---|
| GET | `/api/health` | Health check | Ochiq |
| POST | `/api/problems` | Submit a new problem | Ochiq (Xodimlar) |
| POST | `/api/auth/verify-admin` | Verify admin PIN / password | Ochiq |
| GET | `/api/problems` | List all problems (newest first) | 🔒 Faqat IT Support (`x-admin-key`) |
| GET | `/api/problems/:id` | Get one problem by ID | 🔒 Faqat IT Support (`x-admin-key`) |
| PATCH | `/api/problems/:id/resolve` | Mark a problem as resolved | 🔒 Faqat IT Support (`x-admin-key`) |
| DELETE | `/api/problems/:id` | Permanently delete a problem | 🔒 Faqat IT Support (`x-admin-key`) |
| GET | `/api/stats` | Monthly stats & analytics | 🔒 Faqat IT Support (`x-admin-key`) |


---

## 6. Example Requests & Responses

### Health Check

```http
GET http://localhost:5000/api/health
```

```json
{
  "success": true,
  "message": "IT Support API is running"
}
```

---

### Submit a Problem

```http
POST http://localhost:5000/api/problems
Content-Type: application/json

{
  "room": "204",
  "computer": "PC-07",
  "description": "Kompyuter yoqilmayapti"
}
```

```json
{
  "success": true,
  "problem": {
    "id": 1,
    "ticketNumber": "#1001",
    "room": "204",
    "computer": "PC-07",
    "description": "Kompyuter yoqilmayapti",
    "status": "NEW",
    "createdAt": "2026-08-14T10:30:00.000Z",
    "resolvedAt": null
  }
}
```

---

### Get All Problems

```http
GET http://localhost:5000/api/problems
```

```json
{
  "success": true,
  "problems": [
    {
      "id": 2,
      "ticketNumber": "#1002",
      "room": "301",
      "computer": "PC-12",
      "description": "Internet ishlamayapti",
      "status": "NEW",
      "createdAt": "2026-08-14T10:35:00.000Z",
      "resolvedAt": null
    }
  ]
}
```

---

### Get One Problem

```http
GET http://localhost:5000/api/problems/1
```

---

### Resolve a Problem

```http
PATCH http://localhost:5000/api/problems/1/resolve
```

```json
{
  "success": true,
  "problem": {
    "id": 1,
    "ticketNumber": "#1001",
    "status": "RESOLVED",
    "resolvedAt": "2026-08-14T11:20:00.000Z"
  }
}
```

---

### Delete a Problem

```http
DELETE http://localhost:5000/api/problems/1
```

```json
{
  "success": true,
  "message": "Problem deleted successfully"
}
```

---

### Validation Error (400)

```json
{
  "success": false,
  "message": "Room, computer and description are required"
}
```

### Not Found (404)

```json
{
  "success": false,
  "message": "Problem not found"
}
```

---

## 7. Connecting the Frontend

The frontend only needs to make plain HTTP requests. No tokens or authentication required.

```js
// Submit a problem
const res = await fetch('http://localhost:5000/api/problems', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ room: '204', computer: 'PC-07', description: 'No internet' }),
});
const data = await res.json();

// Get all problems
const res = await fetch('http://localhost:5000/api/problems');
const { problems } = await res.json();

// Resolve
await fetch(`http://localhost:5000/api/problems/${id}/resolve`, { method: 'PATCH' });

// Delete
await fetch(`http://localhost:5000/api/problems/${id}`, { method: 'DELETE' });
```

For production, update `ALLOWED_ORIGINS` in `.env` to your deployed frontend URL.

---

## 8. Project Structure

```
backend/
├── prisma/
│   └── schema.prisma       ← Database schema
├── src/
│   ├── controllers/
│   │   └── problemController.js  ← Business logic
│   ├── routes/
│   │   └── problemRoutes.js      ← Express routes
│   ├── app.js              ← Middleware & route setup
│   └── server.js           ← Entry point
├── .env                    ← Environment variables (not in git)
├── .env.example            ← Template for .env
├── .gitignore
├── package.json
└── README.md
```
