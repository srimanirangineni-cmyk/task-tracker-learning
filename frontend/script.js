// Change this URL once your Render backend is deployed
const API_BASE_URL = "http://127.0.0.1:8000";

let currentToken = localStorage.getItem("jwt_token");
let allTasks = [];
let currentFilter = "today";

// Initialize default date picker value to today's date (YYYY-MM-DD)
function setDefaultDatePicker() {
    const today = new Date().toISOString().split("T")[0];
    const dateInput = document.getElementById("taskDate");
    if (dateInput) dateInput.value = today;
}

// Check if user is logged in
function checkAuthState() {
    if (currentToken) {
        document.getElementById("authSection").classList.add("hidden");
        document.getElementById("appSection").classList.remove("hidden");
        setDefaultDatePicker();
        fetchTasksFromBackend();
    } else {
        document.getElementById("authSection").classList.remove("hidden");
        document.getElementById("appSection").classList.add("hidden");
    }
}

// --- AUTHENTICATION ---
async function register() {
    const email = document.getElementById("emailInput").value.trim();
    const password = document.getElementById("passwordInput").value.trim();
    const msgBox = document.getElementById("authMessage");

    if (!email || !password) {
        msgBox.style.color = "var(--delete-red)";
        msgBox.textContent = "Please provide both email and password.";
        return;
    }

    const response = await fetch("http://127.0.0.1:8000/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
    });
    
    const data = await response.json();
    if (data.error) {
        msgBox.style.color = "var(--delete-red)";
        msgBox.textContent = data.error;
    } else {
        msgBox.style.color = "var(--done-green)";
        msgBox.textContent = "Account created! You can now login.";
    }
}

async function login() {
    const email = document.getElementById("emailInput").value.trim();
    const password = document.getElementById("passwordInput").value.trim();
    const msgBox = document.getElementById("authMessage");

    const response = await fetch("http://127.0.0.1:8000/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
    });

    const data = await response.json();
    if (data.error) {
        msgBox.style.color = "var(--delete-red)";
        msgBox.textContent = data.error;
    } else if (data.access_token) {
        localStorage.setItem("jwt_token", data.access_token);
        currentToken = data.access_token;
        document.getElementById("emailInput").value = "";
        document.getElementById("passwordInput").value = "";
        msgBox.textContent = "";
        checkAuthState();
    }
}

function logout() {
    localStorage.removeItem("jwt_token");
    currentToken = null;
    allTasks = [];
    document.getElementById("taskContainer").innerHTML = "";
    checkAuthState();
}

// --- TASK MANAGEMENT ---
async function sendTaskToBackend() {
    const inputField = document.getElementById("taskInput");
    const dateField = document.getElementById("taskDate");
    const title = inputField.value.trim();
    const dueDate = dateField.value;

    if (!title || !dueDate) return;

    await fetch("http://127.0.0.1:8000/tasks", {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${currentToken}` 
        },
        body: JSON.stringify({ title: title, due_date: dueDate })
    });

    inputField.value = "";
    fetchTasksFromBackend(); 
}

async function fetchTasksFromBackend() {
    const response = await fetch("http://127.0.0.1:8000/tasks", {
        headers: { "Authorization": `Bearer ${currentToken}` }
    });

    if (response.status === 401) {
        logout();
        return;
    }

    allTasks = await response.json();
    renderTasks();
}

// Filter tabs management
function setFilter(filterType) {
    currentFilter = filterType;
    
    // Update active tab buttons
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.classList.remove("active");
        if (btn.textContent.toLowerCase().includes(filterType) || 
           (filterType === "all" && btn.textContent.includes("All"))) {
            btn.classList.add("active");
        }
    });

    renderTasks();
}

// Render filtered task items to the DOM
function renderTasks() {
    const listContainer = document.getElementById("taskContainer");
    listContainer.innerHTML = "";

    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    
    const tomorrow = new Date();
    tomorrow.setDate(now.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    // Filter tasks based on selected tab
    const filteredTasks = allTasks.filter(task => {
        if (currentFilter === "today") return task.due_date === todayStr;
        if (currentFilter === "tomorrow") return task.due_date === tomorrowStr;
        return true; // 'all' tab shows everything
    });

    if (filteredTasks.length === 0) {
        listContainer.innerHTML = `<li style="text-align: center; color: #888; padding: 20px;">No tasks found for this view.</li>`;
        return;
    }

    filteredTasks.forEach(task => {
        const listItem = document.createElement("li");
        listItem.className = `task-item ${task.completed ? "done" : ""}`;

        // Left Container: Checkbox + Title & Date
        const leftDiv = document.createElement("div");
        leftDiv.className = "task-left";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "task-checkbox";
        checkbox.checked = task.completed;
        checkbox.onchange = () => toggleTask(task.id);

        const contentDiv = document.createElement("div");
        contentDiv.className = "task-content";

        const titleSpan = document.createElement("span");
        titleSpan.className = "task-title";
        titleSpan.textContent = task.title;

        const dateBadge = document.createElement("span");
        dateBadge.className = "task-date-badge";
        dateBadge.textContent = `Due: ${task.due_date}`;

        contentDiv.appendChild(titleSpan);
        contentDiv.appendChild(dateBadge);

        leftDiv.appendChild(checkbox);
        leftDiv.appendChild(contentDiv);

        // Delete Button
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "action-btn delete-btn";
        deleteBtn.textContent = "Delete";
        deleteBtn.onclick = () => deleteTask(task.id);

        listItem.appendChild(leftDiv);
        listItem.appendChild(deleteBtn);

        listContainer.appendChild(listItem);
    });
}

async function toggleTask(taskId) {
    await fetch(`http://127.0.0.1:8000/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Authorization": `Bearer ${currentToken}` }
    });
    fetchTasksFromBackend(); 
}

async function deleteTask(taskId) {
    await fetch(`http://127.0.0.1:8000/tasks/${taskId}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${currentToken}` }
    });
    fetchTasksFromBackend(); 
}

// Initial bootstrap check
checkAuthState();