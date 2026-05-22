STRAYSAFE Project Setup Guide
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
