from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import sqlite3
from passlib.context import CryptContext
import jwt
from datetime import datetime, timedelta

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- DATABASE SETUP (UPGRADED WITH TIME ENGINE) ---
conn = sqlite3.connect("tasks.db", check_same_thread=False)
cursor = conn.cursor()
cursor.execute("PRAGMA foreign_keys = ON;")

cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL
    )
""")

# NEW: Notice the due_date column. We store dates as TEXT (YYYY-MM-DD).
cursor.execute("""
    CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        completed BOOLEAN DEFAULT 0,
        due_date TEXT NOT NULL, 
        user_id INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
""")
conn.commit()


# --- SECURITY & AUTHENTICATION SETUP ---
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
SECRET_KEY = "my_super_secret_key_change_in_production"
ALGORITHM = "HS256"
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

def get_password_hash(password: str):
    return pwd_context.hash(password)

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(hours=24)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user_id(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
        return int(user_id)
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")


# --- PYDANTIC MODELS ---
class UserCreate(BaseModel):
    email: str
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

# NEW: The API now strictly requires a due_date when creating a task
class TaskCreate(BaseModel):
    title: str
    due_date: str 


# --- AUTHENTICATION ENDPOINTS ---
@app.post("/register")
def register_user(user: UserCreate):
    hashed_password = get_password_hash(user.password)
    try:
        cursor.execute(
            "INSERT INTO users (email, password_hash) VALUES (?, ?)",
            (user.email, hashed_password)
        )
        conn.commit()
        return {"message": "User registered successfully."}
    except sqlite3.IntegrityError:
        return {"error": "Email is already registered."}

@app.post("/login")
def login_user(user: UserLogin):
    cursor.execute("SELECT id, password_hash FROM users WHERE email = ?", (user.email,))
    db_user = cursor.fetchone()
    
    if not db_user or not verify_password(user.password, db_user[1]):
        return {"error": "Invalid email or password"}
    
    user_id = db_user[0]
    access_token = create_access_token(data={"sub": str(user_id)})
    return {"access_token": access_token, "token_type": "bearer"}


# --- TASK ENDPOINTS (UPGRADED WITH DATES) ---
@app.post("/tasks")
def add_new_task(task: TaskCreate, user_id: int = Depends(get_current_user_id)):
    # NEW: We insert the due_date into the database
    cursor.execute(
        "INSERT INTO tasks (title, completed, due_date, user_id) VALUES (?, ?, ?, ?)",
        (task.title, False, task.due_date, user_id)
    )
    conn.commit()
    return {"message": "Task added permanently!"}

@app.get("/tasks")
def get_all_tasks(user_id: int = Depends(get_current_user_id)):
    # NEW: We pull the due_date out of the database
    cursor.execute("SELECT id, title, completed, due_date FROM tasks WHERE user_id = ?", (user_id,))
    rows = cursor.fetchall()
    
    task_list = [{"id": row[0], "title": row[1], "completed": bool(row[2]), "due_date": row[3]} for row in rows]
    return task_list

@app.put("/tasks/{task_id}")
def toggle_task_status(task_id: int, user_id: int = Depends(get_current_user_id)):
    cursor.execute("UPDATE tasks SET completed = NOT completed WHERE id = ? AND user_id = ?", (task_id, user_id))
    conn.commit()
    return {"message": f"Task {task_id} status toggled."}

@app.delete("/tasks/{task_id}")
def delete_task(task_id: int, user_id: int = Depends(get_current_user_id)):
    cursor.execute("DELETE FROM tasks WHERE id = ? AND user_id = ?", (task_id, user_id))
    conn.commit()
    return {"message": f"Task {task_id} permanently deleted."}