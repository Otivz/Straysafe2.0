# # STRAYSAFE Project Setup Guide

## What this guide does
A gentle walk‑through to get the StraySafe app running on your Windows PC. No deep technical knowledge required – just follow the steps.

## 1️⃣ What you need
- **MySQL** – the database (installed with XAMPP/WAMP or MySQL Workbench)
- **Python 3.12+** – for the server
- **Node.js 20+** – for the web UI
- **Git** (optional) – to copy the code

## 2️⃣ Prepare the database
1. Open your MySQL tool.
2. Run this command to create an empty database:
   ```sql
   CREATE DATABASE straysafe_db;
   ```
3. Import the table design that lives in `Database.txt`. In a command window type:
   ```bash
   mysql -u <your_mysql_user> -p straysafe_db < Database.txt
   ```
   *(Replace `<your_mysql_user>` with the MySQL user you created.)*

## 3️⃣ Get the server ready
### 3.1 Tell the server how to connect to MySQL
Create a file called **`.env`** in the project’s root folder (next to the `backend` folder). Paste this:
```
STRAYSAFE_DB_URL="mysql://<user>:<password>@localhost:3306/straysafe_db"
SECRET_KEY="any‑random‑string"
DEBUG=true
```
Replace `<user>` and `<password>` with the MySQL credentials you used above.

### 3.2 Install Python packages
Open **PowerShell** in the project folder and type:
```powershell
python -m venv .venv          # creates a private Python space
.\.venv\Scripts\Activate      # turns it on
pip install -r backend/requirements.txt   # puts the needed libraries inside
```
### 3.3 Start the API
Now run:
```powershell
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
You should see a message that the server is listening on `http://127.0.0.1:8000`. Opening that URL in a browser shows the API documentation.

## 4️⃣ Prepare the web UI
### 4.1 Tell the UI where the API lives
Inside the **frontend** folder, create a file named **`.env.local`** with one line:
```
VITE_API_URL="http://127.0.0.1:8000"
```
### 4.2 Install the UI code
Back in PowerShell (still in the project root) run:
```powershell
npm ci          # grabs the exact versions the project expects
npm run dev     # starts the web server
```
A new browser tab should open automatically at `http://localhost:5174`. That is the StraySafe app.

## 5️⃣ Create a few test users
You need at least one person of each role to see all screens.
| Role | Example name | Email | Password |
|------|--------------|-------|----------|
| Admin | Alex Admin | admin@straysafe.local | **AdminPass!** |
| Subdivision Leader | Lee Leader | leader@straysafe.local | **LeaderPass!** |
| Barangay Staff | Sam Staff | staff@straysafe.local | **StaffPass!** |
| Resident (Citizen) | Rita Resident | rita@straysafe.local | **ResidentPass!** |

Use the **Sign‑Up** page in the app (or a tool like Postman) to register each account. Choose the appropriate role when registering.

## 6️⃣ Quick test checklist
- Open `http://127.0.0.1:8000/docs` – you should see the API docs.
- Open `http://localhost:5174` – log in with each test user and verify you see the correct screens.
- As a Resident, create a new animal report.
- As the Subdivision Leader, click **Escalate to Barangay** on that report.
- As Barangay Staff, open the request and you should see the endorsement letter and AI suggestions.

If anything looks odd, double‑check the `.env` files and that the servers are still running.

## 7️⃣ Common hiccups
- **Forgot to activate the virtual environment** – you’ll get “pip not found”. Run `\.venv\Scripts\Activate` again.
- **Missing `.env` values** – the server will crash with a 500 error. Make sure the three lines in `.env` are present.
- **Port already in use** – change `8000` or `5174` to a free port in the appropriate `.env` file and restart the servers.
- **Endorsement letters not showing** – they are stored with `is_evidence=true`; the UI hides them from the public feed automatically.

That’s it! Follow the steps in order and the StraySafe app will be up and running on your machine. 🎉

## Overview
This guide walks you through everything required to get the **STRAYSAFE** application up and running locally – from the MySQL database, through the FastAPI backend, to the Vite‑powered React frontend. It also shows how to create the initial user accounts (admin, subdivision leader, barangay staff, and a citizen).

---

## 1️⃣ Prerequisites
- **Operating System**: Windows 10/11 (you’re already on Windows).
- **MySQL**: Install MySQL Community Server (or use XAMPP/WAMP) – ensure the service is running.
- **Python**: 3.12 or newer.
- **Node.js**: v20.x (LTS) with npm (v10.x).
- **Git** (optional, for cloning the repo).

---

## 2️⃣ Database Setup (MySQL)
1. Open a MySQL client (Workbench, CLI, etc.).
2. Create the database:
```sql
CREATE DATABASE straysafe_db;
```
3. Run the schema script that ships with the project to create all tables and columns (including the new AI suggestion fields and `is_evidence` flag):
```bash
# From the project root
mysql -u <your_mysql_user> -p straysafe_db < Database.txt
```
4. (Optional) Seed a default admin account – you can do this via the backend API after the server starts (see **Account Setup** below).

---

## 3️⃣ Backend Setup (FastAPI)
### 3.1 Create a `.env` file
Create a file named **`.env`** in the project root (same level as `backend/`). Use the following as a template:
```dotenv
# MySQL connection string
STRAYSAFE_DB_URL="mysql://<user>:<password>@localhost:3306/straysafe_db"

# FastAPI secret key (any random string)
SECRET_KEY="your‑super‑secret‑key"

# Optional: Debug mode
DEBUG=true
```
Replace `<user>` and `<password>` with your MySQL credentials.
### 3.2 Virtual environment & dependencies
```powershell
# From the project root
python -m venv .venv          # create virtual env (if not present)
.\.venv\Scripts\Activate    # activate it
pip install -r backend/requirements.txt  # install Python deps
```
### 3.3 Run the API
```powershell
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
The server will auto‑create tables on first request, but because we already ran the schema script you’ll see a clean start.

---

## 4️⃣ Frontend Setup (React + Vite)
### 4.1 Create a `.env.local` file
In the **frontend/** folder, add a **`.env.local`** file:
```dotenv
VITE_API_URL="http://127.0.0.1:8000"
```
If you change the backend host/port, update this value accordingly.
### 4.2 Install Node dependencies & start dev server
```powershell
# From the project root (or cd frontend)
npm ci        # install exact lock‑file versions
npm run dev   # start Vite – opens http://localhost:5174
```
The app should now be reachable at `http://localhost:5174`.

---

## 5️⃣ Account Setup (Initial Users)
You can create the initial accounts via the API (e.g., using **Postman** or **curl**) or directly through the UI after the app is running.
### 5.1 Admin (already seeded via DB script if you added a row, otherwise):
```json
POST /users/register
{
  "name": "Admin",
  "email": "admin@straysafe.local",
  "password": "StrongPassword123!",
  "role_id": 4,
  "position_id": 1
}
```
### 5.2 Subdivision Leader
```json
POST /users/register
{
  "name": "Leader Jane",
  "email": "leader@straysafe.local",
  "password": "LeaderPass!",
  "role_id": 2,
  "position_id": 2,
  "subdivision_id": 1
}
```
### 5.3 Barangay Staff
```json
POST /users/register
{
  "name": "Staff Kyle",
  "email": "staff@straysafe.local",
  "password": "StaffPass!",
  "role_id": 3,
  "position_id": 3,
  "barangay_id": 1
}
```
### 5.4 Citizen (Resident) – for testing the public feed:
```json
POST /users/register
{
  "name": "Resident Rita",
  "email": "rita@straysafe.local",
  "password": "ResidentPass!",
  "role_id": 1,
  "subdivision_id": 1
}
```
After creating these accounts you can log in via the UI to verify the different role‑based views.

---

## 6️⃣ Verify Everything Works
1. **Backend** – open `http://127.0.0.1:8000/docs` – you should see the automatically generated OpenAPI docs.
2. **Frontend** – open `http://localhost:5174` and log in with each of the accounts above.
3. **Escalation flow** – Submit a report as the citizen, then as the subdivision leader click **Escalate to Barangay** and verify the endorsement letter appears only in the Rescue Case Intelligence view (not the public feed).
4. **AI panel** – Ensure the AI suggestion panel shows values (they may be `null` until the AI service runs).

---

## 7️⃣ Common Pitfalls & Tips
- **Forgot to activate the virtual environment** before `pip install` – the packages would be installed globally.
- **Missing `.env` variables** – the API will crash with a 500 error if `STRAYSAFE_DB_URL` is absent.
- **Port conflicts** – if another service uses `8000` or `5174`, change the ports in the `.env` / Vite config.
- **Evidence flag** – make sure `is_evidence` is set to `true` when uploading endorsement letters (the UI does this automatically now).
- **Browser cache** – after changing env files, restart both backend and frontend servers to pick up new values.

---

You now have a complete, step‑by‑step setup guide that covers database creation, environment configuration, backend & frontend installation, and initial user provisioning. Happy coding! 🎉
=============================

This guide provides step-by-step instructions on how to set up and run both the Backend and Frontend of the STRAYSAFE application.

---

## 1. Database Setup (MySQL)

The backend connects to a local MySQL database. You need to create this database before running the backend.

1. Ensure MySQL is installed and running on your machine (e.g., via XAMPP, WAMP, or MySQL Workbench).
2. The database connection details are managed in the `.env` file at the project root.
3. Create the database by running the following SQL command in your MySQL tool:

   CREATE DATABASE straysafe_db;

4. The backend will automatically create the necessary tables on the first run.
5. To seed the database with a default admin account, see the Backend Setup section below.

---

## 2. Backend Setup (FastAPI)

Your backend is built with FastAPI and runs using Python within a virtual environment.

### Prerequisites:
- Python 3.12+ 
- Virtual Environment (located in .venv)

### Initial Environment Setup (One-time):

If the `.venv` folder is missing or you are setting up for the first time, run these commands from the **project root**:

1. Create the virtual environment:
   ```powershell
   python -m venv .venv
   ```

2. Activate the virtual environment:
   ```powershell
   .venv\Scripts\activate
   ```

3. Install all required dependencies:
   ```powershell
   pip install -r backend/requirements.txt
   ```

### Steps to Run the Backend:

1. Open a new terminal and navigate to the `backend` directory:
   ```powershell
   cd backend
   ```

2. Activate the virtual environment:
   ```powershell
   # If you are in the backend folder:
   ..\.venv\Scripts\activate
   ```

3. Seed the Database (Roles, Positions, and Test Accounts):
   a. Ensure your `.env` file in the root directory contains the admin credentials:
      ```env
      ADMIN_EMAIL=admin@straysafe.com
      ADMIN_PASSWORD=password123
      ```
   b. Run the seeding script:
      ```powershell
      ..\.venv\Scripts\python scripts/seed_admin.py
      ```

   *This script will automatically create/update the 4 core test accounts:*
   - **Citizen**: `emmanuelvitocruz@gmail.com` (pw: `password123`)
   - **Subdivision Leader**: `kylajoyarriola@gmail.com` (pw: `password123`)
   - **Barangay Staff**: `kylabiancafrias@gmail.com` (pw: `password123`)
   - **Admin**: `(Your ADMIN_EMAIL from .env)` (pw: `Your ADMIN_PASSWORD`)


4. Start the development server using uvicorn:
   ```powershell
   ..\.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
   ```

   Note: If port 8000 is occupied, you can specify a different port (e.g., `--port 8001`), but ensure the frontend configuration matches.

5. The backend will now be running. You can access the API at `http://127.0.0.1:8000`.
6. You can view the interactive API documentation at `http://127.0.0.1:8000/docs`.

---

## 3. Frontend Setup (React/Vite)

Your frontend is built with React and Vite.

### Prerequisites:
- Node.js installed on your system.

### Steps to Run the Frontend:

1. Open another terminal and navigate to the `frontend` directory:
   ```powershell
   cd frontend
   ```

2. Install dependencies (if not already done):
   ```powershell
   npm install
   ```

3. Start the frontend development server:
   ```powershell
   npm run dev
   ```

4. The terminal will output a local URL (usually `http://localhost:5173/`).
5. Open that URL in your browser to access the StraySafe portal.

---

## Troubleshooting

### "WinError 10013" (Permission Denied)
If you get this error when starting the backend, it means something is already using port 8000. 
- Try running uvicorn on a different port: `uvicorn app.main:app --port 8001 --reload`.
- Or check for hung python processes in Task Manager and terminate them.

### "ModuleNotFoundError"
Ensure your VS Code Python Interpreter is set to the virtual environment:
1. Press `Ctrl + Shift + P`.
2. Select `Python: Select Interpreter`.
3. Choose the one pointing to `.\.venv\Scripts\python.exe` (at the project root).

### "RuntimeError: 'cryptography' package is required"
If you see this error when the backend tries to connect to MySQL:
- This happens because MySQL 8+ uses a more secure authentication method.
- Fix it by running: `pip install cryptography` while the virtual environment is active.

### "'uvicorn' is not recognized"
If you get this error when trying to start the backend:
1. Ensure you are inside the `backend` directory: `cd backend`.
2. Ensure your virtual environment is active (you should see `(.venv)` in your terminal).
3. Use `python -m uvicorn` instead of just `uvicorn`.

### "No module named uvicorn"
If you see this error despite having the virtual environment active:
- It means your terminal is using the wrong Python version (the system one).
- Use the direct path to the environment's python: 
  `..\.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload`
