/* =========================================================
   ASSESSAI - COMPLETE ADMIN DASHBOARD
   Employee | Quiz | Questions | CSV | Assessments
   Assignments | Submissions | Performance | Attempts

   Uses api(), requireLogin(), logout(), showUser(),
   and escapeHtml() from frontend/js/app.js.
========================================================= */

requireLogin();

let employees = [];
let quizzes = [];
let assessments = [];
let performanceEmployees = [];
let attemptRecords = [];

const performanceCharts = {};

const $ = (id) => document.getElementById(id);

const safeText = (value) =>
    typeof escapeHtml === "function"
        ? escapeHtml(String(value ?? ""))
        : String(value ?? "").replace(/[&<>"']/g, ch => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[ch]);

function message(id, text, success = true) {
    const el = $(id);
    if (!el) return;

    el.textContent = text;
    el.className = success ? "message success" : "message error";
}

function formatDate(value) {
    if (!value) return "Not scheduled";

    const date = new Date(value);

    return Number.isNaN(date.getTime())
        ? String(value)
        : date.toLocaleString();
}

function statusBadge(status) {
    const value = String(status || "unknown");

    const className = value
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "");

    return `
        <span class="status-badge status-${className}">
            ${safeText(value.replaceAll("_", " "))}
        </span>
    `;
}

function emptyMessage(text) {
    return `<p class="empty-state">${safeText(text)}</p>`;
}

function getSelectedValues(select) {
    if (!select) return [];

    return Array.from(select.selectedOptions)
        .map(option => Number(option.value))
        .filter(Number.isInteger);
}

function setOptions(selectId, items, placeholder, labelFn) {
    const select = $(selectId);
    if (!select) return;

    const previousValue = select.value;

    select.innerHTML =
        `<option value="">${safeText(placeholder)}</option>` +
        items.map(item => `
            <option value="${Number(item.id)}">
                ${safeText(labelFn(item))}
            </option>
        `).join("");

    if (items.some(item => String(item.id) === previousValue)) {
        select.value = previousValue;
    }
}

/* =========================================================
   ADMIN NOTIFICATION
========================================================= */

function showAdminNotice(text, type = "success") {
    let notice = $("adminNotice");

    if (!notice) {
        notice = document.createElement("div");
        notice.id = "adminNotice";

        notice.style.cssText = `
            position: fixed;
            top: 25px;
            right: 25px;
            z-index: 100001;
            max-width: 360px;
            padding: 15px 20px;
            border-radius: 10px;
            font-size: 14px;
            font-weight: 600;
            box-shadow: 0 8px 25px rgba(0,0,0,.15);
        `;

        document.body.appendChild(notice);
    }

    notice.style.background =
        type === "error" ? "#fff0ee" : "#eaf8f1";

    notice.style.color =
        type === "error" ? "#b42318" : "#16816b";

    notice.textContent = text;

    clearTimeout(notice._hideTimer);

    notice._hideTimer = setTimeout(() => {
        notice.remove();
    }, 4000);
}

/* =========================================================
   SIDEBAR NAVIGATION
========================================================= */

function showDashboardView(viewId) {
    const selectedView = $(viewId);

    if (!selectedView) {
        console.error("Dashboard section not found:", viewId);
        return;
    }

    document.querySelectorAll(".dashboard-view").forEach(section => {
        section.hidden = true;
        section.classList.remove("active");
    });

    selectedView.hidden = false;
    selectedView.classList.add("active");

    document.querySelectorAll(".nav-item[data-target]").forEach(link => {
        link.classList.toggle(
            "active",
            link.dataset.target === viewId
        );
    });

    const activeLink = document.querySelector(
        `.nav-item[data-target="${viewId}"]`
    );

    const label = activeLink?.querySelector(".nav-label");

    const pageName = (
        label?.textContent ||
        activeLink?.textContent ||
        ""
    ).trim();

    if ($("pageHeading") && pageName) {
        $("pageHeading").textContent = pageName;
    }

    if ($("currentPage") && pageName) {
        $("currentPage").textContent = pageName;
    }

    history.replaceState(null, "", `#${viewId}`);
}

function initializeNavigation() {
    document.querySelectorAll(".nav-item[data-target]").forEach(link => {
        link.addEventListener("click", event => {
            event.preventDefault();
            showDashboardView(link.dataset.target);
        });
    });

    const requested = location.hash.slice(1);

    showDashboardView(
        $(requested) ? requested : "overview"
    );
}

/* =========================================================
   ADMIN INITIALIZATION
========================================================= */

async function initializeAdmin() {
    try {
        const me = await api("/api/auth/me");

        if (!me || me.role !== "admin") {
            logout();
            return;
        }

        localStorage.setItem("user", JSON.stringify(me));

        if (typeof showUser === "function") {
            showUser();
        }

        initializeNavigation();
        updateAssessmentType();
        bindDashboardFilters();

        await loadAdmin();

    } catch (error) {
        console.error("Admin initialization failed:", error);
        logout();
    }
}

/* =========================================================
   LOAD DASHBOARD
========================================================= */

async function loadAdmin() {
    const jobs = [
        loadOverview(),
        loadEmployees(),
        loadQuizzes(),
        loadAssessments(),
        loadSubmissions(),
        loadPerformance(),
        loadAttempts()
    ];

    await Promise.allSettled(jobs);
}

async function refreshDashboard() {
    await loadAdmin();
    showAdminNotice("Dashboard refreshed.");
}

/* =========================================================
   OVERVIEW
========================================================= */

async function loadOverview() {
    try {
        const data = await api("/api/admin/overview");

        const stats = [
            ["Total Employees", data.employees ?? 0, "♙"],
            ["Total Quizzes", data.quizzes ?? 0, "▤"],
            ["Total Questions", data.questions ?? 0, "✎"],
            ["Total Attempts", data.attempts ?? 0, "◷"],
            ["Average Score", `${data.average_score ?? 0}%`, "★"],
            ["Assessments", data.assessments ?? 0, "▣"],
            ["Pending Assignments", data.pending_assignments ?? 0, "◴"],
            ["Document Submissions", data.document_submissions ?? 0, "▧"]
        ];

        if ($("stats")) {
            $("stats").innerHTML = stats.map(([title, value, icon]) => `
                <div class="stat-card stat">
                    <div class="stat-icon">${icon}</div>
                    <div>
                        <p>${safeText(title)}</p>
                        <h3>${safeText(value)}</h3>
                    </div>
                </div>
            `).join("");
        }

    } catch (error) {
        if ($("stats")) {
            $("stats").innerHTML = emptyMessage(error.message);
        }
    }
}
/* =========================================================
   EMPLOYEE MANAGEMENT
========================================================= */

async function loadEmployees() {
    try {
        const data = await api("/api/admin/users");

        employees = (Array.isArray(data) ? data : [])
            .filter(user => user.role === "employee");

        renderEmployees();

        setOptions(
            "assignmentEmployees",
            employees.filter(user => user.is_active),
            "Select employees",
            user => `${user.name} (${user.email})`
        );

    } catch (error) {
        if ($("employeeList")) {
            $("employeeList").innerHTML = emptyMessage(error.message);
        }
    }
}

function renderEmployees() {
    const list = $("employeeList");
    if (!list) return;

    const search = ($("employeeSearch")?.value || "").toLowerCase().trim();
    const status = $("employeeStatusFilter")?.value || "all";

    const filtered = employees.filter(user => {
        const matchesSearch =
            `${user.name || ""} ${user.email || ""}`.toLowerCase().includes(search);

        const matchesStatus =
            status === "all" ||
            (status === "active" && user.is_active) ||
            (status === "inactive" && !user.is_active);

        return matchesSearch && matchesStatus;
    });

    if (!filtered.length) {
        list.innerHTML = emptyMessage("No matching employees found.");
        return;
    }

    list.innerHTML = filtered.map(employee => `
        <div class="data-row">
            <div class="data-info">
                <strong>${safeText(employee.name)}</strong>
                <span>${safeText(employee.email)}</span>
                <small>ID: ${safeText(employee.id)}</small>
            </div>

            <div class="data-actions">
                ${statusBadge(employee.is_active ? "active" : "inactive")}

                <button type="button" class="secondary-button"
                    onclick="editEmployee(${Number(employee.id)})">
                    Edit
                </button>

                <button type="button" class="secondary-button"
                    onclick="toggleEmployee(${Number(employee.id)}, ${!employee.is_active})">
                    ${employee.is_active ? "Deactivate" : "Activate"}
                </button>
            </div>
        </div>
    `).join("");
}

if ($("employeeForm")) {
    $("employeeForm").addEventListener("submit", async event => {
        event.preventDefault();

        const form = new FormData(event.currentTarget);

        const payload = {
            name: String(form.get("name") || "").trim(),
            email: String(form.get("email") || "").trim(),
            password: String(form.get("password") || "")
        };

        if (!payload.name || !payload.email || payload.password.length < 8) {
            message(
                "employeeMessage",
                "Enter a name, valid email and password of at least 8 characters.",
                false
            );
            return;
        }

        try {
            const result = await api("/api/admin/users", {
                method: "POST",
                body: JSON.stringify(payload)
            });

            message(
                "employeeMessage",
                result.message || "Employee created successfully."
            );

            event.currentTarget.reset();

            await Promise.all([
                loadEmployees(),
                loadOverview()
            ]);

        } catch (error) {
            message("employeeMessage", error.message, false);
        }
    });
}

async function editEmployee(id) {
    const employee = employees.find(
        user => Number(user.id) === Number(id)
    );

    if (!employee) return;

    const name = prompt("Employee name:", employee.name);
    if (name === null) return;

    const email = prompt("Employee email:", employee.email);
    if (email === null) return;

    if (!name.trim() || !email.trim()) {
        showAdminNotice("Name and email cannot be empty.", "error");
        return;
    }

    try {
        await api(`/api/admin/users/${id}`, {
            method: "PATCH",
            body: JSON.stringify({
                name: name.trim(),
                email: email.trim()
            })
        });

        showAdminNotice("Employee updated successfully.");
        await loadEmployees();

    } catch (error) {
        showAdminNotice(error.message, "error");
    }
}

async function toggleEmployee(id, active) {
    const action = active ? "activate" : "deactivate";

    if (!confirm(`Are you sure you want to ${action} this employee?`)) {
        return;
    }

    try {
        await api(`/api/admin/users/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ is_active: active })
        });

        await Promise.all([
            loadEmployees(),
            loadOverview()
        ]);

        showAdminNotice(`Employee ${action}d successfully.`);

    } catch (error) {
        showAdminNotice(error.message, "error");
    }
}

/* =========================================================
   QUIZ MANAGEMENT
========================================================= */

function resetQuizForm() {
    $("quizForm")?.reset();

    if ($("quizEditId")) $("quizEditId").value = "";
    if ($("quizDuration")) $("quizDuration").value = 20;

    if ($("quizSubmitButton")) {
        $("quizSubmitButton").textContent = "Create Quiz";
    }

    if ($("cancelQuizEdit")) {
        $("cancelQuizEdit").style.display = "none";
    }
}

async function loadQuizzes() {
    try {
        const data = await api("/api/admin/quizzes");

        quizzes = Array.isArray(data) ? data : [];

        renderQuizzes();

        const activeQuizzes = quizzes.filter(
            quiz => quiz.is_active
        );

        setOptions(
            "csvQuizSelect",
            activeQuizzes,
            "Select a quiz",
            quiz => quiz.title
        );

        setOptions(
            "assessmentQuizSelect",
            activeQuizzes,
            "Select a quiz",
            quiz => quiz.title
        );

        // Include inactive quizzes here so their questions
        // can still be viewed and managed by the administrator.
        setOptions(
            "quizSelect",
            quizzes,
            "Select a quiz",
            quiz => quiz.title
        );

        if ($("quizSelect")?.value) {
            await loadQuestions($("quizSelect").value);
        } else if ($("questionList")) {
            $("questionList").innerHTML = emptyMessage(
                "Select a quiz to view its questions."
            );
        }

    } catch (error) {
        console.error("Quiz loading error:", error);

        if ($("quizList")) {
            $("quizList").innerHTML = emptyMessage(error.message);
        }
    }
}

function renderQuizzes() {
    const list = $("quizList");
    if (!list) return;

    const search = (
        $("quizSearch")?.value || ""
    ).toLowerCase().trim();

    const filter = $("quizStatusFilter")?.value || "all";

    const filtered = quizzes.filter(quiz => {
        const matchesSearch =
            `${quiz.title || ""} ${quiz.description || ""}`
                .toLowerCase()
                .includes(search);

        const matchesStatus =
            filter === "all" ||
            (filter === "active" && quiz.is_active) ||
            (filter === "inactive" && !quiz.is_active);

        return matchesSearch && matchesStatus;
    });

    if (!filtered.length) {
        list.innerHTML = emptyMessage("No matching quizzes found.");
        return;
    }

    list.innerHTML = filtered.map(quiz => `
        <div class="data-row">
            <div class="data-info">
                <strong>${safeText(quiz.title)}</strong>

                <span>
                    ${safeText(quiz.description || "No description")}
                </span>

                <small>
                    ${safeText(quiz.duration_minutes)} minutes ·
                    ${safeText(quiz.question_count ?? 0)} questions
                </small>
            </div>

            <div class="data-actions">
                ${statusBadge(quiz.is_active ? "active" : "inactive")}

                <button type="button"
                    class="secondary-button"
                    onclick="editQuiz(${Number(quiz.id)})">
                    Edit
                </button>

                <button type="button"
                    class="secondary-button"
                    onclick="toggleQuiz(${Number(quiz.id)}, ${!quiz.is_active})">
                    ${quiz.is_active ? "Deactivate" : "Activate"}
                </button>
            </div>
        </div>
    `).join("");
}

$("quizSearch")?.addEventListener("input", renderQuizzes);
$("quizStatusFilter")?.addEventListener("change", renderQuizzes);

function editQuiz(id) {
    const quiz = quizzes.find(
        item => Number(item.id) === Number(id)
    );

    if (!quiz) {
        showAdminNotice("Quiz not found.", "error");
        return;
    }

    if ($("quizEditId")) $("quizEditId").value = quiz.id;
    if ($("quizTitle")) $("quizTitle").value = quiz.title || "";
    if ($("quizDescription")) $("quizDescription").value = quiz.description || "";
    if ($("quizDuration")) {
        $("quizDuration").value = quiz.duration_minutes || 20;
    }

    if ($("quizSubmitButton")) {
        $("quizSubmitButton").textContent = "Update Quiz";
    }

    if ($("cancelQuizEdit")) {
        $("cancelQuizEdit").style.display = "inline-block";
    }

    $("quizForm")?.scrollIntoView({
        behavior: "smooth",
        block: "center"
    });

    $("quizTitle")?.focus();

    message(
        "quizMessage",
        "Edit the quiz details and click Update Quiz."
    );
}

if ($("cancelQuizEdit")) {
    $("cancelQuizEdit").addEventListener("click", () => {
        resetQuizForm();
        message("quizMessage", "Quiz editing cancelled.");
    });
}

if ($("quizForm")) {
    $("quizForm").addEventListener("submit", async event => {
        event.preventDefault();

        const editId = $("quizEditId")?.value || "";

        const payload = {
            title: $("quizTitle")?.value.trim() || "",
            description: $("quizDescription")?.value.trim() || "",
            duration_minutes: Number($("quizDuration")?.value)
        };

        if (payload.title.length < 3) {
            message(
                "quizMessage",
                "Quiz title must contain at least 3 characters.",
                false
            );
            return;
        }

        if (
            !Number.isInteger(payload.duration_minutes) ||
            payload.duration_minutes < 1 ||
            payload.duration_minutes > 240
        ) {
            message(
                "quizMessage",
                "Duration must be between 1 and 240 minutes.",
                false
            );
            return;
        }

        try {
            const endpoint = editId
                ? `/api/admin/quizzes/${Number(editId)}`
                : "/api/admin/quizzes";

            const result = await api(endpoint, {
                method: editId ? "PATCH" : "POST",
                body: JSON.stringify(payload)
            });

            message(
                "quizMessage",
                result.message ||
                    (editId
                        ? "Quiz updated successfully."
                        : "Quiz created successfully.")
            );

            resetQuizForm();

            await Promise.all([
                loadQuizzes(),
                loadOverview()
            ]);

        } catch (error) {
            message("quizMessage", error.message, false);
        }
    });
}

async function toggleQuiz(id, active) {
    const action = active ? "activate" : "deactivate";

    if (!confirm(`Are you sure you want to ${action} this quiz?`)) {
        return;
    }

    try {
        const result = await api(`/api/admin/quizzes/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ is_active: active })
        });

        showAdminNotice(
            result.message || `Quiz ${action}d successfully.`
        );

        await Promise.all([
            loadQuizzes(),
            loadOverview()
        ]);

    } catch (error) {
        showAdminNotice(error.message, "error");
    }
}
/* =========================================================
   QUESTION MANAGEMENT
========================================================= */

async function loadQuestions(quizId) {
    const list = $("questionList");
    if (!list) return;

    if (!quizId) {
        list.innerHTML = emptyMessage(
            "Select a quiz to view questions."
        );
        return;
    }

    try {
        const questions = await api(
            `/api/admin/quizzes/${Number(quizId)}/questions`
        );

        if (!Array.isArray(questions) || !questions.length) {
            list.innerHTML = emptyMessage(
                "No questions added to this quiz yet."
            );
            return;
        }

        list.innerHTML = questions.map((q, index) => `
            <div class="data-row">
                <div class="data-info">
                    <strong>
                        Question ${index + 1}: ${safeText(q.question_text)}
                    </strong>

                    <small>A. ${safeText(q.option_a)}</small>
                    <small>B. ${safeText(q.option_b)}</small>
                    <small>C. ${safeText(q.option_c)}</small>
                    <small>D. ${safeText(q.option_d)}</small>

                    <small>
                        Correct answer: ${safeText(q.correct_option)}
                    </small>

                    <small>
                        Explanation:
                        ${safeText(q.explanation || "Not provided")}
                    </small>
                </div>

                <div class="data-actions">
                    <button type="button"
                        class="secondary-button"
                        onclick="editQuestion(${Number(q.id)}, ${Number(quizId)})">
                        Edit
                    </button>

                    <button type="button"
                        class="secondary-button"
                        onclick="deleteQuestion(${Number(q.id)}, ${Number(quizId)})">
                        Delete
                    </button>
                </div>
            </div>
        `).join("");

    } catch (error) {
        console.error("Question loading error:", error);
        list.innerHTML = emptyMessage(error.message);
    }
}

$("quizSelect")?.addEventListener("change", function() {
    loadQuestions(this.value);
});

if ($("questionForm")) {
    $("questionForm").addEventListener("submit", async event => {
        event.preventDefault();

        const quizId = Number($("quizSelect")?.value);

        const payload = {
            question_text: $("questionText")?.value.trim() || "",
            option_a: $("optionA")?.value.trim() || "",
            option_b: $("optionB")?.value.trim() || "",
            option_c: $("optionC")?.value.trim() || "",
            option_d: $("optionD")?.value.trim() || "",
            correct_option: $("correctOption")?.value || "",
            explanation: $("explanation")?.value.trim() || ""
        };

        if (!quizId) {
            message("questionMessage", "Please select a quiz.", false);
            return;
        }

        if (
            !payload.question_text ||
            !payload.option_a ||
            !payload.option_b ||
            !payload.option_c ||
            !payload.option_d
        ) {
            message(
                "questionMessage",
                "Fill in the question and all four options.",
                false
            );
            return;
        }

        if (!["A", "B", "C", "D"].includes(payload.correct_option)) {
            message(
                "questionMessage",
                "Select the correct answer.",
                false
            );
            return;
        }

        try {
            const result = await api(
                `/api/admin/quizzes/${quizId}/questions`,
                {
                    method: "POST",
                    body: JSON.stringify(payload)
                }
            );

            message(
                "questionMessage",
                result.message || "Question added successfully."
            );

            event.currentTarget.reset();

            // Restore the selected quiz after resetting the form.
            if ($("quizSelect")) {
                $("quizSelect").value = String(quizId);
            }

            await Promise.all([
                loadQuestions(quizId),
                loadQuizzes(),
                loadOverview()
            ]);

            if ($("quizSelect")) {
                $("quizSelect").value = String(quizId);
            }

        } catch (error) {
            message("questionMessage", error.message, false);
        }
    });
}

async function editQuestion(questionId, quizId) {
    try {
        const questions = await api(
            `/api/admin/quizzes/${quizId}/questions`
        );

        const question = questions.find(
            item => Number(item.id) === Number(questionId)
        );

        if (!question) {
            showAdminNotice("Question not found.", "error");
            return;
        }

        const questionText = prompt(
            "Question:",
            question.question_text
        );
        if (questionText === null) return;

        const optionA = prompt("Option A:", question.option_a);
        if (optionA === null) return;

        const optionB = prompt("Option B:", question.option_b);
        if (optionB === null) return;

        const optionC = prompt("Option C:", question.option_c);
        if (optionC === null) return;

        const optionD = prompt("Option D:", question.option_d);
        if (optionD === null) return;

        const correct = prompt(
            "Correct option (A, B, C or D):",
            question.correct_option
        );
        if (correct === null) return;

        const explanation = prompt(
            "Explanation:",
            question.explanation || ""
        );
        if (explanation === null) return;

        const payload = {
            question_text: questionText.trim(),
            option_a: optionA.trim(),
            option_b: optionB.trim(),
            option_c: optionC.trim(),
            option_d: optionD.trim(),
            correct_option: correct.trim().toUpperCase(),
            explanation: explanation.trim()
        };

        if (
            Object.values(payload).slice(0, 5).some(value => !value) ||
            !["A", "B", "C", "D"].includes(payload.correct_option)
        ) {
            showAdminNotice(
                "Enter all question fields and a valid correct option.",
                "error"
            );
            return;
        }

        const result = await api(
            `/api/admin/questions/${questionId}`,
            {
                method: "PATCH",
                body: JSON.stringify(payload)
            }
        );

        showAdminNotice(
            result.message || "Question updated successfully."
        );

        await Promise.all([
            loadQuestions(quizId),
            loadQuizzes(),
            loadOverview()
        ]);

    } catch (error) {
        showAdminNotice(error.message, "error");
    }
}

async function deleteQuestion(questionId, quizId) {
    if (!confirm("Delete this question? This cannot be undone.")) {
        return;
    }

    try {
        const result = await api(
            `/api/admin/questions/${questionId}`,
            { method: "DELETE" }
        );

        showAdminNotice(
            result.message || "Question deleted successfully."
        );

        await Promise.all([
            loadQuestions(quizId),
            loadQuizzes(),
            loadOverview()
        ]);

    } catch (error) {
        showAdminNotice(error.message, "error");
    }
}

/* =========================================================
   CSV IMPORT
========================================================= */

if ($("csvImportForm")) {
    $("csvImportForm").addEventListener("submit", async event => {
        event.preventDefault();

        const quizId = Number($("csvQuizSelect")?.value);
        const file = $("csvFile")?.files[0];

        if (!quizId || !file) {
            message(
                "csvMessage",
                "Select a quiz and CSV file.",
                false
            );
            return;
        }

        const formData = new FormData();
        formData.append("file", file);

        try {
            const result = await api(
                `/api/admin/quizzes/${quizId}/import-csv`,
                {
                    method: "POST",
                    body: formData
                }
            );

            message(
                "csvMessage",
                result.message || "CSV imported successfully."
            );

            event.currentTarget.reset();

            await Promise.all([
                loadQuizzes(),
                loadQuestions($("quizSelect")?.value),
                loadOverview()
            ]);

        } catch (error) {
            message("csvMessage", error.message, false);
        }
    });
}

/* =========================================================
   ASSESSMENT TYPE
========================================================= */

function updateAssessmentType() {
    const type = $("assessmentType");
    const quizGroup = $("assessmentQuizGroup");
    const quizSelect = $("assessmentQuizSelect");

    if (!type || !quizGroup || !quizSelect) return;

    const isQuiz = type.value === "quiz";

    quizGroup.style.display = isQuiz ? "" : "none";
    quizSelect.required = isQuiz;

    if (!isQuiz) {
        quizSelect.value = "";
    }
}

$("assessmentType")?.addEventListener(
    "change",
    updateAssessmentType
);

/* =========================================================
   ASSESSMENT MANAGEMENT
========================================================= */

async function loadAssessments() {
    try {
        const data = await api("/api/admin/assessments");

        assessments = Array.isArray(data) ? data : [];

        renderAssessments();

        setOptions(
            "assignmentAssessment",
            assessments.filter(a => a.status === "draft"),
            "Select a draft assessment",
            a => a.title
        );

        setOptions(
            "assignmentViewSelect",
            assessments,
            "Select an assessment",
            a => `${a.title} (${a.status})`
        );

    } catch (error) {
        if ($("assessmentList")) {
            $("assessmentList").innerHTML = emptyMessage(error.message);
        }
    }
}

function renderAssessments() {
    const list = $("assessmentList");
    if (!list) return;

    if (!assessments.length) {
        list.innerHTML = emptyMessage(
            "No assessments created yet."
        );
        return;
    }

    list.innerHTML = assessments.map(a => `
        <div class="data-row assessment-row">
            <div class="data-info">
                <strong>${safeText(a.title)}</strong>

                <span>
                    ${safeText(a.assessment_type?.toUpperCase())}
                    · Maximum ${safeText(a.max_marks)} marks
                </span>

                <small>Start: ${formatDate(a.starts_at)}</small>
                <small>Deadline: ${formatDate(a.deadline_at)}</small>

                <small>
                    Assigned employees:
                    ${safeText(a.assigned_employees ?? 0)}
                </small>
            </div>

            <div class="data-actions">
                ${statusBadge(a.status)}

                ${a.status === "draft" ? `
                    <button type="button"
                        class="secondary-button"
                        onclick="publishAssessment(${Number(a.id)})">
                        Publish
                    </button>
                ` : ""}

                ${a.status !== "closed" ? `
                    <button type="button"
                        class="secondary-button"
                        onclick="closeAssessment(${Number(a.id)})">
                        Close
                    </button>
                ` : ""}

                <button type="button"
                    class="secondary-button"
                    onclick="viewAssignments(${Number(a.id)})">
                    View Assignments
                </button>

                <button type="button"
                    class="secondary-button"
                    onclick="deleteAssessment(${Number(a.id)})">
                    Delete
                </button>
            </div>
        </div>
    `).join("");
}

if ($("assessmentForm")) {
    $("assessmentForm").addEventListener("submit", async event => {
        event.preventDefault();

        const form = new FormData(event.currentTarget);
        const type = form.get("assessment_type");

        const payload = {
            title: String(form.get("title") || "").trim(),
            description: String(form.get("description") || "").trim(),
            assessment_type: type,
            quiz_id: type === "quiz"
                ? Number(form.get("quiz_id"))
                : null,
            duration_minutes: form.get("duration_minutes")
                ? Number(form.get("duration_minutes"))
                : null,
            starts_at: form.get("starts_at") || null,
            deadline_at: form.get("deadline_at") || null,
            max_marks: Number(form.get("max_marks"))
        };

        if (type === "quiz" && !payload.quiz_id) {
            message(
                "assessmentMessage",
                "Please select a quiz.",
                false
            );
            return;
        }

        try {
            const result = await api("/api/admin/assessments", {
                method: "POST",
                body: JSON.stringify(payload)
            });

            message(
                "assessmentMessage",
                result.message || "Assessment created successfully."
            );

            event.currentTarget.reset();

            if ($("assessmentType")) {
                $("assessmentType").value = "quiz";
            }

            updateAssessmentType();

            await Promise.all([
                loadAssessments(),
                loadOverview()
            ]);

        } catch (error) {
            message("assessmentMessage", error.message, false);
        }
    });
}

async function publishAssessment(id) {
    if (!confirm("Publish this assessment?")) return;

    try {
        const result = await api(
            `/api/admin/assessments/${id}/publish`,
            { method: "PATCH" }
        );

        showAdminNotice(
            result.message || "Assessment published."
        );

        await loadAssessments();

    } catch (error) {
        showAdminNotice(error.message, "error");
    }
}

async function closeAssessment(id) {
    if (!confirm("Close this assessment?")) return;

    try {
        const result = await api(
            `/api/admin/assessments/${id}/close`,
            { method: "PATCH" }
        );

        showAdminNotice(
            result.message || "Assessment closed."
        );

        await loadAssessments();

    } catch (error) {
        showAdminNotice(error.message, "error");
    }
}

async function deleteAssessment(id) {
    if (!confirm(
        "Delete this assessment and its associated assignments?"
    )) {
        return;
    }

    try {
        await api(`/api/admin/assessments/${id}`, {
            method: "DELETE"
        });

        showAdminNotice("Assessment deleted successfully.");

        await Promise.all([
            loadAssessments(),
            loadOverview()
        ]);

    } catch (error) {
        showAdminNotice(error.message, "error");
    }
}
/* =========================================================
   ASSIGNMENTS
========================================================= */

if ($("assignmentForm")) {
    $("assignmentForm").addEventListener("submit", async event => {
        event.preventDefault();

        const assessmentId = Number($("assignmentAssessment")?.value);
        const employeeIds = getSelectedValues(
            $("assignmentEmployees")
        );

        if (!assessmentId || !employeeIds.length) {
            message(
                "assignmentMessage",
                "Select an assessment and at least one employee.",
                false
            );
            return;
        }

        try {
            const result = await api(
                `/api/admin/assessments/${assessmentId}/assign`,
                {
                    method: "POST",
                    body: JSON.stringify({
                        employee_ids: employeeIds
                    })
                }
            );

            message(
                "assignmentMessage",
                result.message || "Employees assigned successfully."
            );

            if ($("assignmentEmployees")) {
                Array.from($("assignmentEmployees").options)
                    .forEach(option => option.selected = false);
            }

            await Promise.all([
                loadAssessments(),
                loadOverview()
            ]);

        } catch (error) {
            message("assignmentMessage", error.message, false);
        }
    });
}

async function viewAssignments(id) {
    showDashboardView("assignment-management");

    if ($("assignmentViewSelect")) {
        $("assignmentViewSelect").value = String(id);
    }

    await loadAssignmentDetails(id);
}

async function loadAssignmentDetails(id) {
    const list = $("assignmentList");

    if (!id || !list) return;

    try {
        const data = await api(
            `/api/admin/assessments/${id}/assignments`
        );

        if (!Array.isArray(data) || !data.length) {
            list.innerHTML = emptyMessage("No employees assigned.");
            return;
        }

        list.innerHTML = data.map(item => `
            <div class="data-row">
                <div class="data-info">
                    <strong>${safeText(item.employee_name)}</strong>
                    <span>${safeText(item.employee_email)}</span>
                    <small>Employee ID: ${safeText(item.employee_id)}</small>
                    <small>Assigned: ${formatDate(item.assigned_at)}</small>
                </div>

                <div class="data-actions">
                    ${statusBadge(item.status)}
                </div>
            </div>
        `).join("");

    } catch (error) {
        list.innerHTML = emptyMessage(error.message);
    }
}

$("assignmentViewSelect")?.addEventListener("change", event => {
    loadAssignmentDetails(event.target.value);
});

/* =========================================================
   SUBMISSIONS / DOCUMENT VIEW / EVALUATION
========================================================= */

function getAdminAuthToken() {
    const keys = [
        "access_token",
        "token",
        "authToken",
        "accessToken"
    ];

    for (const key of keys) {
        const value = localStorage.getItem(key);

        if (!value) continue;

        try {
            const parsed = JSON.parse(value);

            if (typeof parsed === "string") return parsed;
            if (parsed.access_token) return parsed.access_token;
            if (parsed.token) return parsed.token;

        } catch {
            return value;
        }
    }

    try {
        const user = JSON.parse(
            localStorage.getItem("user") || "{}"
        );

        return user.access_token || user.token || null;

    } catch {
        return null;
    }
}

async function loadSubmissions() {
    try {
        const data = await api("/api/admin/submissions");
        renderSubmissions(data);

    } catch (error) {
        if ($("submissionList")) {
            $("submissionList").innerHTML = emptyMessage(error.message);
        }
    }
}

function renderSubmissions(submissions) {
    const list = $("submissionList");
    if (!list) return;

    if (!Array.isArray(submissions) || !submissions.length) {
        list.innerHTML = emptyMessage(
            "No document submissions received."
        );
        return;
    }

    list.innerHTML = submissions.map(item => {
        const id = Number(item.id);
        const maxMarks = Number(item.max_marks);

        const existingMarks = item.marks_obtained == null
            ? ""
            : String(Number(item.marks_obtained));

        const feedback = String(item.feedback || "");
        const evaluated = existingMarks !== "";

        return `
            <div class="data-row submission-row">
                <div class="data-info">
                    <strong>${safeText(item.file_name)}</strong>
                    <span>${safeText(item.employee_name)}</span>
                    <small>${safeText(item.employee_email)}</small>
                    <small>Assessment: ${safeText(item.assessment_title)}</small>
                    <small>Submitted: ${formatDate(item.submitted_at)}</small>

                    <small>
                        Score:
                        ${evaluated
                            ? `${safeText(existingMarks)} / ${safeText(maxMarks)}`
                            : "Not evaluated"}
                    </small>

                    <small>
                        Feedback: ${safeText(feedback || "No feedback")}
                    </small>
                </div>

                <div class="data-actions">
                    ${statusBadge(item.status)}

                    ${item.file_available
                        ? `
                            <button type="button"
                                class="secondary-button"
                                onclick="viewSubmissionDocument(${id})">
                                View Document
                            </button>
                        `
                        : `
                            <span class="status-badge status-inactive">
                                File Missing
                            </span>
                        `
                    }

                    <button type="button"
                        class="${evaluated ? "secondary-button" : "primary-button"} evaluate-submission-btn"
                        data-id="${id}"
                        data-max-marks="${safeText(maxMarks)}"
                        data-existing-marks="${safeText(existingMarks)}"
                        data-feedback="${safeText(feedback)}">

                        ${evaluated ? "Update Evaluation" : "Evaluate"}
                    </button>
                </div>
            </div>
        `;
    }).join("");

    // Event delegation: bind only once.
    if (list.dataset.evaluateHandlerBound !== "true") {
        list.dataset.evaluateHandlerBound = "true";

        list.addEventListener("click", event => {
            const button = event.target.closest(
                ".evaluate-submission-btn"
            );

            if (!button || !list.contains(button)) return;

            evaluateSubmission(
                Number(button.dataset.id),
                Number(button.dataset.maxMarks),
                button.dataset.existingMarks === ""
                    ? null
                    : Number(button.dataset.existingMarks),
                button.dataset.feedback || ""
            );
        });
    }
}

/* =========================================================
   VIEW EMPLOYEE DOCUMENT
========================================================= */

async function viewSubmissionDocument(id) {
    const authToken = getAdminAuthToken();

    if (!authToken) {
        showAdminNotice(
            "Authentication token not found. Please log in again.",
            "error"
        );
        return;
    }

    const newTab = window.open("about:blank", "_blank");

    if (!newTab) {
        showAdminNotice(
            "Please allow pop-ups to view employee documents.",
            "error"
        );
        return;
    }

    try {
        const response = await fetch(
            `/api/admin/submissions/${id}/file`,
            {
                headers: {
                    Authorization: `Bearer ${authToken}`
                },
                credentials: "same-origin"
            }
        );

        if (!response.ok) {
            let detail = "Unable to open document.";

            try {
                const data = await response.json();
                detail = data.detail || detail;
            } catch {}

            throw new Error(
                `${detail} (HTTP ${response.status})`
            );
        }

        const blob = await response.blob();

        if (!blob.size) {
            throw new Error("The document is empty.");
        }

        const disposition =
            response.headers.get("content-disposition") || "";

        const match = disposition.match(
            /filename\*?=(?:UTF-8''|")?([^";\n]+)/i
        );

        const fileName = match
            ? decodeURIComponent(match[1].replace(/"/g, ""))
            : `submission-${id}`;

        const contentType = (
            response.headers.get("content-type") ||
            blob.type ||
            ""
        ).toLowerCase();

        const fileUrl = URL.createObjectURL(blob);

        if (
            contentType.includes("application/pdf") ||
            /\.pdf$/i.test(fileName)
        ) {
            newTab.document.title = fileName;
            newTab.location.href = fileUrl;

        } else {
            const link = document.createElement("a");

            link.href = fileUrl;
            link.download = fileName;

            document.body.appendChild(link);
            link.click();
            link.remove();

            newTab.close();
        }

        setTimeout(() => {
            URL.revokeObjectURL(fileUrl);
        }, 60000);

    } catch (error) {
        if (newTab && !newTab.closed) {
            newTab.close();
        }

        showAdminNotice(error.message, "error");
    }
}

/* =========================================================
   EVALUATION MODAL STYLES
========================================================= */

function addEvaluationModalStyles() {
    if ($("evaluationModalStyles")) return;

    const style = document.createElement("style");
    style.id = "evaluationModalStyles";

    style.textContent = `
        .evaluation-overlay {
            position: fixed;
            inset: 0;
            z-index: 100000;
            background: rgba(15,35,32,.65);
            backdrop-filter: blur(5px);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }

        .evaluation-modal {
            background: #fff;
            width: 100%;
            max-width: 480px;
            padding: 30px;
            border-radius: 18px;
            box-shadow: 0 20px 70px rgba(0,0,0,.2);
        }

        .evaluation-modal h2 {
            color: #173c36;
            font-size: 23px;
            margin: 0 0 8px;
        }

        .evaluation-modal .description {
            color: #84938e;
            font-size: 14px;
            margin-bottom: 24px;
        }

        .evaluation-modal .form-group {
            margin-bottom: 20px;
        }

        .evaluation-modal label {
            display: block;
            color: #253b37;
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 8px;
        }

        .evaluation-modal input,
        .evaluation-modal textarea {
            width: 100%;
            box-sizing: border-box;
            padding: 12px 14px;
            border: 1px solid #dce8e2;
            border-radius: 9px;
            outline: none;
            font-size: 14px;
            font-family: inherit;
            color: #253b37;
            background: #fff;
        }

        .evaluation-modal textarea {
            resize: vertical;
            min-height: 110px;
        }

        .evaluation-modal input:focus,
        .evaluation-modal textarea:focus {
            border-color: #2bb99b;
            box-shadow: 0 0 0 3px rgba(43,185,155,.12);
        }

        .evaluation-modal .hint {
            color: #84938e;
            font-size: 12px;
            margin-top: 6px;
        }

        .evaluation-modal .modal-error {
            display: none;
            padding: 11px;
            margin-bottom: 16px;
            border-radius: 8px;
            color: #b42318;
            background: #fff0ee;
            font-size: 13px;
        }

        .evaluation-modal .modal-error.show {
            display: block;
        }

        .evaluation-modal .modal-actions {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            margin-top: 25px;
        }

        .evaluation-modal .modal-actions button {
            border: 0;
            padding: 12px 19px;
            border-radius: 9px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
        }

        .evaluation-modal .cancel-btn {
            background: #f0f5f2;
            color: #52645e;
        }

        .evaluation-modal .submit-btn {
            background: #2bb99b;
            color: #fff;
        }

        .evaluation-modal button:disabled {
            opacity: .6;
            cursor: not-allowed;
        }

        @media(max-width:500px) {
            .evaluation-modal {
                padding: 22px;
            }

            .evaluation-modal .modal-actions {
                flex-direction: column-reverse;
            }

            .evaluation-modal .modal-actions button {
                width: 100%;
            }
        }
    `;

    document.head.appendChild(style);
}

/* =========================================================
   EVALUATE / UPDATE EVALUATION
========================================================= */

function evaluateSubmission(
    id,
    maxMarks,
    existingMarks = null,
    existingFeedback = ""
) {
    id = Number(id);
    maxMarks = Number(maxMarks);

    if (
        !Number.isInteger(id) ||
        id <= 0 ||
        !Number.isFinite(maxMarks) ||
        maxMarks <= 0
    ) {
        showAdminNotice(
            "Invalid submission or maximum marks.",
            "error"
        );
        return;
    }

    addEvaluationModalStyles();
    $("evaluationOverlay")?.remove();

    const hasMarks =
        existingMarks !== null &&
        existingMarks !== undefined &&
        existingMarks !== "";

    const overlay = document.createElement("div");

    overlay.id = "evaluationOverlay";
    overlay.className = "evaluation-overlay";

    overlay.innerHTML = `
        <div class="evaluation-modal">
            <h2>
                ${hasMarks ? "Update Evaluation" : "Evaluate Submission"}
            </h2>

            <p class="description">
                Review the employee's work and provide marks and feedback.
            </p>

            <div id="evaluationError" class="modal-error"></div>

            <form id="evaluationForm">
                <div class="form-group">
                    <label for="evaluationMarks">Marks Obtained</label>

                    <input
                        type="number"
                        id="evaluationMarks"
                        min="0"
                        max="${maxMarks}"
                        step="any"
                        value="${hasMarks ? safeText(existingMarks) : ""}"
                        placeholder="Enter marks"
                        required
                    >

                    <div class="hint">
                        Maximum marks: ${maxMarks}
                    </div>
                </div>

                <div class="form-group">
                    <label for="evaluationFeedback">
                        Employee Feedback
                    </label>

                    <textarea
                        id="evaluationFeedback"
                        placeholder="Write your feedback here..."
                    >${safeText(existingFeedback)}</textarea>
                </div>

                <div class="modal-actions">
                    <button
                        type="button"
                        class="cancel-btn"
                        id="cancelEvaluation">
                        Cancel
                    </button>

                    <button
                        type="submit"
                        class="submit-btn"
                        id="submitEvaluation">
                        ${hasMarks ? "Update Evaluation" : "Submit Evaluation"}
                    </button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(overlay);

    const form = $("evaluationForm");
    const marksInput = $("evaluationMarks");
    const feedbackInput = $("evaluationFeedback");
    const submit = $("submitEvaluation");
    const errorBox = $("evaluationError");

    const close = () => {
        overlay.remove();
        document.removeEventListener("keydown", onKey);
    };

    const onKey = event => {
        if (event.key === "Escape") {
            close();
        }
    };

    document.addEventListener("keydown", onKey);

    $("cancelEvaluation").addEventListener("click", close);

    overlay.addEventListener("click", event => {
        if (event.target === overlay) {
            close();
        }
    });

    marksInput.focus();

    form.addEventListener("submit", async event => {
        event.preventDefault();

        const raw = marksInput.value.trim();
        const marks = Number(raw);

        if (
            !raw ||
            !Number.isFinite(marks) ||
            marks < 0 ||
            marks > maxMarks
        ) {
            errorBox.textContent =
                `Enter marks between 0 and ${maxMarks}.`;

            errorBox.classList.add("show");
            return;
        }

        submit.disabled = true;
        submit.textContent = "Saving...";

        try {
            const result = await api(
                `/api/admin/submissions/${id}/evaluate`,
                {
                    method: "PATCH",
                    body: JSON.stringify({
                        marks_obtained: marks,
                        feedback: feedbackInput.value.trim()
                    })
                }
            );

            close();

            await Promise.all([
                loadSubmissions(),
                loadOverview(),
                loadPerformance()
            ]);

            showAdminNotice(
                result.message || "Evaluation saved successfully."
            );

        } catch (error) {
            errorBox.textContent =
                error.message || "Unable to save evaluation.";

            errorBox.classList.add("show");

            submit.disabled = false;

            submit.textContent = hasMarks
                ? "Update Evaluation"
                : "Submit Evaluation";
        }
    });
}
/* =========================================================
   PERFORMANCE REPORTS
========================================================= */

function destroyPerformanceChart(id) {
    if (performanceCharts[id]) {
        performanceCharts[id].destroy();
        delete performanceCharts[id];
    }
}

function renderPerformanceStats(data) {
    const target = $("performanceStats");
    if (!target) return;

    const totalEmployees = data.length;

    const attempts = data.reduce(
        (sum, item) => sum + Number(item.total_attempts || 0),
        0
    );

    const avgScore = totalEmployees
        ? data.reduce(
            (sum, item) => sum + Number(item.average_score || 0),
            0
        ) / totalEmployees
        : 0;

    const completed = data.reduce(
        (sum, item) => sum + Number(item.completed_assessments || 0),
        0
    );

    const pending = data.reduce(
        (sum, item) => sum + Number(item.pending_assessments || 0),
        0
    );

    const cards = [
        ["Employees", totalEmployees],
        ["Quiz Attempts", attempts],
        ["Average Score", `${avgScore.toFixed(1)}%`],
        ["Completed Assessments", completed],
        ["Pending Assessments", pending]
    ];

    target.innerHTML = cards.map(([label, value]) => `
        <div class="stat-card stat">
            <div>
                <p>${safeText(label)}</p>
                <h3>${safeText(value)}</h3>
            </div>
        </div>
    `).join("");
}

function renderPerformanceCharts(data) {
    if (typeof Chart === "undefined") return;

    const scoreCanvas = $("employeeScoreChart");

    if (scoreCanvas) {
        destroyPerformanceChart("scores");

        const top = [...data]
            .sort((a, b) =>
                Number(b.average_score || 0) -
                Number(a.average_score || 0)
            )
            .slice(0, 10);

        performanceCharts.scores = new Chart(scoreCanvas, {
            type: "bar",

            data: {
                labels: top.map(item => item.name || item.email),

                datasets: [{
                    label: "Average score (%)",
                    data: top.map(
                        item => Number(item.average_score || 0)
                    )
                }]
            },

            options: {
                responsive: true,
                maintainAspectRatio: false,

                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100
                    }
                }
            }
        });
    }

    const completionCanvas = $("completionChart");

    if (completionCanvas) {
        destroyPerformanceChart("completion");

        const completed = data.reduce(
            (sum, item) =>
                sum + Number(item.completed_assessments || 0),
            0
        );

        const pending = data.reduce(
            (sum, item) =>
                sum + Number(item.pending_assessments || 0),
            0
        );

        performanceCharts.completion = new Chart(
            completionCanvas,
            {
                type: "doughnut",

                data: {
                    labels: ["Completed", "Pending"],

                    datasets: [{
                        data: [completed, pending]
                    }]
                },

                options: {
                    responsive: true,
                    maintainAspectRatio: false
                }
            }
        );
    }
}

function renderPerformanceList() {
    const list = $("performanceList");
    if (!list) return;

    const search = (
        $("performanceSearch")?.value || ""
    ).toLowerCase().trim();

    const status = $("performanceStatusFilter")?.value || "all";
    const sort = $("performanceSort")?.value || "name";

    let filtered = performanceEmployees.filter(employee => {
        const matchesSearch =
            `${employee.name || ""} ${employee.email || ""}`
                .toLowerCase()
                .includes(search);

        let matchesStatus = true;

        if (status === "completed") {
            matchesStatus =
                Number(employee.completed_assessments || 0) > 0;

        } else if (status === "pending") {
            matchesStatus =
                Number(employee.pending_assessments || 0) > 0;

        } else if (status === "overdue") {
            // The current API does not provide overdue counts.
            matchesStatus = false;
        }

        return matchesSearch && matchesStatus;
    });

    filtered.sort((a, b) => {
        if (sort === "score-high") {
            return Number(b.average_score || 0) -
                Number(a.average_score || 0);
        }

        if (sort === "score-low") {
            return Number(a.average_score || 0) -
                Number(b.average_score || 0);
        }

        if (sort === "completion") {
            return Number(b.completed_assessments || 0) -
                Number(a.completed_assessments || 0);
        }

        return String(a.name || "").localeCompare(
            String(b.name || "")
        );
    });

    if (!filtered.length) {
        list.innerHTML = status === "overdue"
            ? emptyMessage(
                "The performance API does not currently provide overdue assessment data."
            )
            : emptyMessage("No matching performance records found.");

        return;
    }

    list.innerHTML = filtered.map(employee => `
        <div class="data-row">
            <div class="data-info">
                <strong>${safeText(employee.name)}</strong>
                <span>${safeText(employee.email)}</span>

                <small>
                    Average Score:
                    ${safeText(employee.average_score ?? 0)}%
                </small>

                <small>
                    Quiz Attempts:
                    ${safeText(employee.total_attempts ?? 0)}
                </small>

                <small>
                    Assigned Assessments:
                    ${safeText(employee.assigned_assessments ?? 0)}
                </small>

                <small>
                    Completed:
                    ${safeText(employee.completed_assessments ?? 0)}
                </small>

                <small>
                    Pending:
                    ${safeText(employee.pending_assessments ?? 0)}
                </small>
            </div>

            <div class="data-actions">
                ${statusBadge(employee.is_active ? "active" : "inactive")}
            </div>
        </div>
    `).join("");
}

async function loadPerformance() {
    try {
        const data = await api("/api/admin/performance");

        performanceEmployees = Array.isArray(data) ? data : [];

        renderPerformanceStats(performanceEmployees);
        renderPerformanceCharts(performanceEmployees);
        renderPerformanceList();

    } catch (error) {
        if ($("performanceList")) {
            $("performanceList").innerHTML = emptyMessage(error.message);
        }
    }
}

/* =========================================================
   ATTEMPT HISTORY
========================================================= */

function renderAttempts() {
    const list = $("attemptList");
    if (!list) return;

    const search = (
        $("attemptSearch")?.value || ""
    ).toLowerCase().trim();

    const filtered = attemptRecords.filter(attempt =>
        `${attempt.employee_name || ""} ${attempt.employee_email || ""} ${attempt.quiz_title || ""}`
            .toLowerCase()
            .includes(search)
    );

    if (!filtered.length) {
        list.innerHTML = emptyMessage(
            "No matching quiz attempts found."
        );
        return;
    }

    list.innerHTML = filtered.map(attempt => `
        <div class="data-row">
            <div class="data-info">
                <strong>${safeText(attempt.employee_name)}</strong>
                <span>${safeText(attempt.employee_email)}</span>

                <small>
                    Quiz: ${safeText(attempt.quiz_title)}
                </small>

                <small>
                    Score:
                    ${safeText(attempt.score)} /
                    ${safeText(attempt.total_questions)}
                </small>

                <small>
                    Percentage:
                    ${safeText(attempt.percentage)}%
                </small>

                <small>
                    Submitted:
                    ${formatDate(attempt.submitted_at)}
                </small>
            </div>

            <div class="data-actions">
                <span class="score-value">
                    ${safeText(attempt.percentage)}%
                </span>
            </div>
        </div>
    `).join("");
}

async function loadAttempts() {
    try {
        const data = await api("/api/admin/attempts");

        attemptRecords = Array.isArray(data) ? data : [];

        renderAttempts();

    } catch (error) {
        if ($("attemptList")) {
            $("attemptList").innerHTML = emptyMessage(error.message);
        }
    }
}

/* =========================================================
   FILTER EVENT BINDINGS
========================================================= */

function bindDashboardFilters() {
    $("employeeSearch")?.addEventListener(
        "input",
        renderEmployees
    );

    $("employeeStatusFilter")?.addEventListener(
        "change",
        renderEmployees
    );

    $("performanceSearch")?.addEventListener(
        "input",
        renderPerformanceList
    );

    $("performanceStatusFilter")?.addEventListener(
        "change",
        renderPerformanceList
    );

    $("performanceSort")?.addEventListener(
        "change",
        renderPerformanceList
    );

    $("attemptSearch")?.addEventListener(
        "input",
        renderAttempts
    );
}

/* =========================================================
   START ADMIN DASHBOARD
========================================================= */

initializeAdmin();