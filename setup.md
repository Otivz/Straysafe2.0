# StraySafe 2.0 – Setup Guide (Fresh Clone)

## Requirements
- **Python 3.12+**
- **Node.js 20+** (with npm)
- **MySQL** running locally (XAMPP, WAMP, or MySQL Workbench)

---

## 1. Database

1. Open MySQL and run:
   ```sql
   CREATE DATABASE straysafe_db;
   ```
2. Import the schema:
   ```powershell
   mysql -u root -p straysafe_db < Database.txt
   ```

---

## 2. Environment File

Create a `.env` file in the **project root** (next to `backend/`):
```env
STRAYSAFE_DB_URL="mysql://root:yourpassword@localhost:3306/straysafe_db"
SECRET_KEY="any-random-secret-string"
ADMIN_EMAIL=admin@straysafe.com
ADMIN_PASSWORD=password123
DEBUG=true
```
> Replace `root` and `yourpassword` with your actual MySQL credentials.

---

## 3. Backend (FastAPI)

Run all commands from the **project root** (`Straysafe2.0/`):

```powershell
# 1. Create virtual environment (first time only)
python -m venv .venv

# 2. Activate virtual environment
.venv\Scripts\activate

# 3. Install dependencies (first time only)
pip install -r backend/requirements.txt

# 4. Go into the backend folder
cd backend

# 5. Start the backend server
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

> ✅ Backend runs at: http://127.0.0.1:8000  
> 📄 API docs at: http://127.0.0.1:8000/docs

**Every time you reopen the project**, just do steps 2 → 4 → 5.

---

## 4. Seed Test Accounts (First Time Only)

With the backend running, open a **new terminal** in the project root and run:

```powershell
.venv\Scripts\activate
cd backend
..\venv\Scripts\python scripts/seed_admin.py
```

This creates these accounts (all passwords: `password123`):

| Role | Email |
|------|-------|
| Citizen | `emmanuelvitocruz@gmail.com` |
| Subdivision Leader | `kylajoyarriola@gmail.com` |
| Barangay Staff | `kylabiancafrias@gmail.com` |
| Admin | *(your `ADMIN_EMAIL` from `.env`)* |

---

## 5. Frontend (React + Vite)

Open a **separate terminal** and run from the **project root**:

```powershell
# 1. Go into frontend folder
cd frontend

# 2. Install dependencies (first time only)
npm install

# 3. Start the dev server
npm run dev
```

> ✅ Frontend runs at: http://localhost:5173

**Every time you reopen the project**, just do steps 1 → 3.

---

## Running Both Together (Quick Reference)

| Terminal | Command |
|----------|---------|
| Terminal 1 (Backend) | `.venv\Scripts\activate` → `cd backend` → `..\venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload` |
| Terminal 2 (Frontend) | `cd frontend` → `npm run dev` |

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `'uvicorn' is not recognized` | Use `..\venv\Scripts\python -m uvicorn ...` instead |
| `No module named uvicorn` | Make sure `.venv` is activated: `.venv\Scripts\activate` |
| `WinError 10013` (port in use) | Change `--port 8000` to `--port 8001` |
| `cryptography package required` | Run `pip install cryptography` with venv active |
| `ModuleNotFoundError` | Ensure venv is active and `pip install -r backend/requirements.txt` was run |
