
requireLogin();

let employeeQuizzes = [];
let employeeResults = [];
let employeeAssignments = [];
let employeeSubmissions = [];
let employeeFeedbackReports = [];
let currentEmployee = null;

// ========================================================
// HELPER FUNCTIONS
// ========================================================

function safeHtml(value) {
    if (typeof escapeHtml === "function") {
        return escapeHtml(value ?? "");
    }

    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function formatDate(value) {
    if (!value) return "Not specified";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "Not specified";
    }

    return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}

function normalizeStatus(value) {
    return String(value || "pending").toLowerCase().trim();
}

function getElement(id) {
    return document.getElementById(id);
}

function setText(id, value) {
    const element = getElement(id);

    if (element) {
        element.textContent = value ?? "";
    }
}

/*
 * Supports API responses in either format:
 *
 * [ {...}, {...} ]
 *
 * OR
 *
 * { results: [...] }
 * { data: [...] }
 * { items: [...] }
 */
function extractArray(response, possibleKeys = []) {
    if (Array.isArray(response)) {
        return response;
    }

    if (!response || typeof response !== "object") {
        return [];
    }

    for (const key of possibleKeys) {
        if (Array.isArray(response[key])) {
            return response[key];
        }
    }

    if (Array.isArray(response.data)) {
        return response.data;
    }

    if (Array.isArray(response.items)) {
        return response.items;
    }

    return [];
}

/*
 * Returns a reliable percentage even when the API
 * only sends score and total_questions.
 */
function getResultPercentage(result) {
    if (!result) return 0;

    const providedPercentage = Number(result.percentage);

    if (
        result.percentage !== null &&
        result.percentage !== undefined &&
        result.percentage !== "" &&
        Number.isFinite(providedPercentage)
    ) {
        return Math.max(0, Math.min(100, providedPercentage));
    }

    const score = Number(
        result.score ?? result.marks_obtained ?? 0
    );

    const total = Number(
        result.total_questions ??
        result.max_marks ??
        result.total ??
        0
    );

    if (total > 0) {
        return Math.max(
            0,
            Math.min(100, (score / total) * 100)
        );
    }

    return 0;
}

function getAverageScore() {
    if (!employeeResults.length) return 0;

    const total = employeeResults.reduce((sum, result) => {
        return sum + getResultPercentage(result);
    }, 0);

    return total / employeeResults.length;
}

function getLatestResult() {
    if (!employeeResults.length) return null;

    return [...employeeResults].sort((a, b) => {
        return new Date(b.submitted_at || 0) -
               new Date(a.submitted_at || 0);
    })[0];
}

function getAssignmentStatus(assignment) {
    const assignmentStatus = normalizeStatus(
        assignment.assignment_status || assignment.status
    );

    const assessmentStatus = normalizeStatus(
        assignment.assessment_status
    );

    if (assignmentStatus === "overdue") return "overdue";

    if (assessmentStatus === "closed") return "closed";

    return assignmentStatus;
}

// ========================================================
// SIDEBAR NAVIGATION
// ========================================================

function showEmployeeView(viewId) {
    const selectedView = getElement(viewId);

    if (!selectedView) {
        console.warn("Employee view not found:", viewId);
        return;
    }

    document.querySelectorAll(".employee-view").forEach(view => {
        const isSelected = view.id === viewId;

        view.hidden = !isSelected;
        view.classList.toggle("active", isSelected);
    });

    document.querySelectorAll(
        ".employee-nav-item[data-target]"
    ).forEach(item => {
        item.classList.toggle(
            "active",
            item.dataset.target === viewId
        );
    });

    const selectedItem = document.querySelector(
        `.employee-nav-item[data-target="${viewId}"]`
    );

    const title = selectedItem
        ? selectedItem.textContent.trim()
        : "Overview";

    setText("breadcrumbTitle", title);
    setText("pageHeading", title);
}

function setupEmployeeNavigation() {
    document.querySelectorAll(
        ".employee-nav-item[data-target]"
    ).forEach(item => {
        item.addEventListener("click", () => {
            showEmployeeView(item.dataset.target);
        });
    });

    document.querySelectorAll("[data-open-view]").forEach(item => {
        item.addEventListener("click", () => {
            showEmployeeView(item.dataset.openView);
        });
    });

    const feedbackButton = getElement("generateFeedbackButton");

    if (feedbackButton) {
        feedbackButton.addEventListener(
            "click",
            generateAIFeedback
        );
    }

    setupFeedbackReportActions();
}

// ========================================================
// EMPLOYEE PROFILE
// ========================================================

function displayEmployeeInformation(user) {
    currentEmployee = user;

    const name = user.name || user.full_name || "Employee";
    const email = user.email || "";
    const role = user.role || "employee";

    setText("welcomeName", name);
    setText("userName", name);
    setText("profileName", name);
    setText("profileFullName", name);
    setText("profileEmail", email);
    setText("profileRole", role);
    setText("profileRoleValue", role);

    const avatarText = name.charAt(0).toUpperCase();

    ["employeeAvatar", "profileAvatar"].forEach(id => {
        const element = getElement(id);

        if (element) {
            element.textContent = avatarText;
        }
    });
}

// ========================================================
// LOAD EMPLOYEE DATA
// ========================================================

async function loadEmployeeData() {
    const endpoints = [
        "/api/assessments/my-assessments",
        "/api/quizzes",
        "/api/assessments/my-results",
        "/api/assessments/my-submissions"
    ];

    const requests = await Promise.allSettled(
        endpoints.map(endpoint => api(endpoint))
    );

    // Assigned assessments
    employeeAssignments =
        requests[0].status === "fulfilled"
            ? extractArray(requests[0].value, [
                "assignments",
                "assessments",
                "results"
            ])
            : [];

    // Available quizzes
    employeeQuizzes =
        requests[1].status === "fulfilled"
            ? extractArray(requests[1].value, [
                "quizzes",
                "results"
            ])
            : [];

    // Completed assessment results
    employeeResults =
        requests[2].status === "fulfilled"
            ? extractArray(requests[2].value, [
                "results",
                "attempts",
                "assessments"
            ])
            : [];

    // Submitted documents
    employeeSubmissions =
        requests[3].status === "fulfilled"
            ? extractArray(requests[3].value, [
                "submissions",
                "documents",
                "results"
            ])
            : [];

    requests.forEach((request, index) => {
        if (request.status === "rejected") {
            console.error(
                `Employee API request failed: ${endpoints[index]}`,
                request.reason
            );
        }
    });

    console.log("Employee data loaded:", {
        assignments: employeeAssignments.length,
        quizzes: employeeQuizzes.length,
        results: employeeResults.length,
        submissions: employeeSubmissions.length
    });
}

// ========================================================
// EMPLOYEE STATISTICS
// ========================================================

function updateEmployeeStatistics() {
    const completedStatuses = [
        "submitted",
        "evaluated",
        "completed"
    ];

    const completedAssignments = employeeAssignments.filter(item => {
        return completedStatuses.includes(
            normalizeStatus(item.assignment_status || item.status)
        );
    });

    const pendingAssignments = employeeAssignments.filter(item => {
        const status = normalizeStatus(
            item.assignment_status || item.status
        );

        const assessmentStatus = normalizeStatus(
            item.assessment_status
        );

        return (
            ["pending", "in_progress"].includes(status) &&
            assessmentStatus === "published"
        );
    });

    const average = getAverageScore();

    const bestScore = employeeResults.length
        ? Math.max(
            ...employeeResults.map(getResultPercentage)
        )
        : 0;

    setText("assignedCount", employeeAssignments.length);
    setText("completedCount", completedAssignments.length);
    setText("pendingCount", pendingAssignments.length);

    setText("averageScore", `${average.toFixed(1)}%`);

    setText("performanceAttempts", employeeResults.length);
    setText("performanceAverage", `${average.toFixed(1)}%`);
    setText("bestScore", `${bestScore.toFixed(1)}%`);
}

// ========================================================
// ASSIGNED ASSESSMENTS
// ========================================================

function renderAssignments() {
    const box = getElement("assignmentsList");
    const recentBox = getElement("recentAssignments");

    if (!box) return;

    if (!employeeAssignments.length) {
        const emptyMessage = `
            <div class="empty-state">
                <h3>No assessments assigned yet</h3>
                <p>
                    Assessments assigned to your account
                    will appear here.
                </p>
            </div>
        `;

        box.innerHTML = emptyMessage;

        if (recentBox) {
            recentBox.innerHTML = emptyMessage;
        }

        return;
    }

    const cards = employeeAssignments.map(item => {
        const status = getAssignmentStatus(item);

        const assessmentStatus = normalizeStatus(
            item.assessment_status
        );

        const assignmentStatus = normalizeStatus(
            item.assignment_status || item.status
        );

        const assessmentId =
            item.assessment_id ??
            item.id;

        const canStart =
            assessmentStatus === "published" &&
            ["pending", "in_progress"].includes(assignmentStatus) &&
            assessmentId;

        const title = safeHtml(
            item.title ||
            item.assessment_title ||
            "Untitled Assessment"
        );

        const description = safeHtml(
            item.description ||
            "No description available."
        );

        const duration = item.duration_minutes
            ? `${item.duration_minutes} minutes`
            : "Not specified";

        const deadline = formatDate(item.deadline_at);

        let action = "";

        if (canStart) {
            const buttonText = assignmentStatus === "in_progress"
                ? "Resume Assessment"
                : "Start Assessment";

            action = `
                <a class="btn btn-primary"
                   href="assessment.html?assignment=${encodeURIComponent(assessmentId)}">
                    ${buttonText}
                </a>
            `;
        } else if (assessmentStatus !== "published") {
            action = `
                <span class="status-message">
                    Not published yet
                </span>
            `;
        } else if (
            ["submitted", "completed", "evaluated"].includes(status)
        ) {
            action = `
                <span class="status-message">
                    Completed
                </span>
            `;
        } else {
            action = `
                <span class="status-message">
                    Unavailable
                </span>
            `;
        }

        return `
            <article class="assessment-card">
                <div class="assessment-card-content">

                    <h3>${title}</h3>

                    <p>${description}</p>

                    <div class="assessment-meta">
                        <span>
                            Type:
                            ${safeHtml(item.assessment_type || "Assessment")}
                        </span>

                        <span>
                            Duration:
                            ${safeHtml(duration)}
                        </span>

                        <span>
                            Deadline:
                            ${safeHtml(deadline)}
                        </span>
                    </div>

                    <span class="status-badge ${safeHtml(status)}">
                        ${safeHtml(status.replaceAll("_", " "))}
                    </span>

                </div>

                <div class="assessment-card-action">
                    ${action}
                </div>
            </article>
        `;
    }).join("");

    box.innerHTML = cards;

    if (recentBox) {
        recentBox.innerHTML = cards;
    }
}

// ========================================================
// AVAILABLE QUIZZES
// ========================================================


function renderEmployeeQuizzes() {
    const box = getElement("quizList");

    if (!box) return;

    // Keep all active quizzes visible.
    const activeQuizzes = employeeQuizzes.filter(quiz => {
        return quiz.is_active !== false &&
               quiz.is_published !== false;
    });

    if (!activeQuizzes.length) {
        box.innerHTML = `
            <div class="empty-state">
                <h3>No quizzes available</h3>
                <p>
                    Available quizzes will appear here
                    when they are created.
                </p>
            </div>
        `;
        return;
    }

    box.innerHTML = activeQuizzes.map(quiz => {
        const title = safeHtml(
            quiz.title || "Untitled Quiz"
        );

        const description = safeHtml(
            quiz.description ||
            "Test your knowledge with this quiz."
        );

        const questionCount = Number(
            quiz.question_count ??
            (Array.isArray(quiz.questions)
                ? quiz.questions.length
                : 0)
        );

        const duration = Number(
            quiz.duration_minutes || 0
        );

        // Completion is specific to the logged-in employee.
        const completed =
            quiz.completed === true ||
            employeeResults.some(result => {
                return (
                    Number(result.quiz_id) === Number(quiz.id) &&
                    result.quiz_id != null
                );
            });

        let action = "";

        if (completed) {
            action = `
                <span class="status-badge completed">
                    Practice Quiz Completed ✓
                </span>
            `;
        } else {
            action = `
                <a class="btn btn-primary"
                   href="assessment.html?quiz=${encodeURIComponent(quiz.id)}">
                    Start Quiz
                </a>
            `;
        }

        return `
            <article class="assessment-card quiz-card">

                <div class="assessment-card-content">

                    <h3>${title}</h3>

                    <p>${description}</p>

                    <div class="assessment-meta">
                        <span>${questionCount} Questions</span>
                        <span>${duration} Minutes</span>
                    </div>

                </div>

                <div class="assessment-card-action">
                    ${action}
                </div>

            </article>
        `;
    }).join("");
}


// ========================================================
// EMPLOYEE RESULTS
// ========================================================

function renderEmployeeResults() {
    const box = getElement("resultsList");

    if (!box) return;

    if (!employeeResults.length) {
        box.innerHTML = `
            <div class="empty-state">
                <h3>No results available</h3>
                <p>
                    Your assessment results will appear
                    here after submission.
                </p>
            </div>
        `;
        return;
    }

    box.innerHTML = employeeResults.map(result => {
        const title = safeHtml(
            result.quiz_title ||
            result.assessment_title ||
            result.title ||
            "Assessment"
        );

        const score = Number(
            result.score ?? result.marks_obtained ?? 0
        );

        const total = Number(
            result.total_questions ??
            result.max_marks ??
            result.total ??
            0
        );

        const percentage = getResultPercentage(result);

        return `
            <article class="result-card">

                <div>
                    <h3>${title}</h3>

                    <p>
                        Submitted:
                        ${safeHtml(formatDate(result.submitted_at))}
                    </p>
                </div>

                <div class="result-score">
                    <strong>${score} / ${total}</strong>
                    <span>${percentage.toFixed(1)}%</span>
                </div>

            </article>
        `;
    }).join("");
}

// ========================================================
// DOCUMENT SUBMISSIONS
// ========================================================

function renderDocumentSubmissions() {
    const box = getElement("submissionsList");

    if (!box) return;

    if (!employeeSubmissions.length) {
        box.innerHTML = `
            <div class="empty-state">
                <h3>No document submissions</h3>
                <p>
                    Your submitted documents will appear here.
                </p>
            </div>
        `;
        return;
    }

    box.innerHTML = employeeSubmissions.map(item => {
        const title = safeHtml(
            item.assessment_title ||
            item.title ||
            "Document Assessment"
        );

        const fileName = safeHtml(
            item.file_name ||
            "Submitted document"
        );

        const status = safeHtml(
            item.status || "Submitted"
        );

        const marks = item.marks_obtained != null
            ? `${item.marks_obtained} / ${item.max_marks ?? "-"}`
            : "Not evaluated";

        return `
            <article class="submission-card">

                <h3>${title}</h3>

                <p>File: ${fileName}</p>

                <p>
                    Submitted:
                    ${safeHtml(formatDate(item.submitted_at))}
                </p>

                <p>Status: ${status}</p>

                <p>Marks: ${safeHtml(marks)}</p>

                <p>
                    Feedback:
                    ${safeHtml(item.feedback || "Not available")}
                </p>

            </article>
        `;
    }).join("");
}

// ========================================================
// PERFORMANCE CHART
// ========================================================

function renderPerformanceChart() {
    const chart = getElement("performanceChart");
    const summary = getElement("performanceSummary");

    if (!chart) return;

    if (!employeeResults.length) {
        chart.innerHTML = `
            <div class="performance-empty">
                <h3>No performance data yet</h3>
                <p>
                    Complete an assessment to view your performance trend.
                </p>
            </div>
        `;

        if (summary) {
            summary.textContent =
                "Complete assessments to see your performance summary.";
        }

        return;
    }

    // Sort results from oldest to newest.
    const results = [...employeeResults]
        .sort((a, b) => {
            return new Date(a.submitted_at || 0) -
                   new Date(b.submitted_at || 0);
        })
        .slice(-8);

    const width = 760;
    const height = 330;

    const left = 55;
    const right = 25;
    const top = 30;
    const bottom = 65;

    const chartWidth = width - left - right;
    const chartHeight = height - top - bottom;

    const getX = index => {
        if (results.length === 1) {
            return left + chartWidth / 2;
        }

        return left +
            (index / (results.length - 1)) * chartWidth;
    };

    const getY = percentage => {
        return top +
            chartHeight -
            (percentage / 100) * chartHeight;
    };

    const points = results.map((result, index) => {
        const percentage = getResultPercentage(result);

        return {
            x: getX(index),
            y: getY(percentage),
            percentage,
            date: formatDate(result.submitted_at),
            title:
                result.quiz_title ||
                result.assessment_title ||
                result.title ||
                "Assessment"
        };
    });

    // Horizontal grid lines and percentage labels.
    const gridLines = [0, 25, 50, 75, 100].map(value => {
        const y = getY(value);

        return `
            <line
                class="performance-grid-line"
                x1="${left}"
                y1="${y}"
                x2="${width - right}"
                y2="${y}"
            />

            <text
                class="performance-axis-label"
                x="${left - 12}"
                y="${y + 4}"
                text-anchor="end"
            >
                ${value}%
            </text>
        `;
    }).join("");

    const linePoints = points
        .map(point => `${point.x},${point.y}`)
        .join(" ");

    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];

    const areaPoints = [
        `${firstPoint.x},${top + chartHeight}`,
        ...points.map(point => `${point.x},${point.y}`),
        `${lastPoint.x},${top + chartHeight}`
    ].join(" ");

    const circles = points.map((point, index) => {
        return `
            <circle
                class="performance-point"
                cx="${point.x}"
                cy="${point.y}"
                r="6"
            >
                <title>
                    ${safeHtml(point.title)}:
                    ${point.percentage.toFixed(1)}%
                    (${safeHtml(point.date)})
                </title>
            </circle>

            <text
                class="performance-value-label"
                x="${point.x}"
                y="${Math.max(top + 12, point.y - 13)}"
                text-anchor="middle"
            >
                ${point.percentage.toFixed(1)}%
            </text>

            <text
                class="performance-date-label"
                x="${point.x}"
                y="${height - 25}"
                text-anchor="middle"
            >
                ${safeHtml(point.date)}
            </text>
        `;
    }).join("");

    chart.innerHTML = `
        <div class="performance-chart-wrapper">

            <svg
                class="performance-svg"
                viewBox="0 0 ${width} ${height}"
                role="img"
                aria-label="Performance trend showing assessment scores over time"
                xmlns="http://www.w3.org/2000/svg"
            >

                ${gridLines}

                <line
                    class="performance-axis-line"
                    x1="${left}"
                    y1="${top}"
                    x2="${left}"
                    y2="${top + chartHeight}"
                />

                <line
                    class="performance-axis-line"
                    x1="${left}"
                    y1="${top + chartHeight}"
                    x2="${width - right}"
                    y2="${top + chartHeight}"
                />

                <polygon
                    points="${areaPoints}"
                    fill="#16816b"
                    opacity="0.09"
                />

                <polyline
                    class="performance-trend-line"
                    points="${linePoints}"
                />

                ${circles}

            </svg>

        </div>
    `;

    if (summary) {
        const average = getAverageScore();

        const best = Math.max(
            ...employeeResults.map(getResultPercentage)
        );

        const latest = getLatestResult();
        const latestScore = latest
            ? getResultPercentage(latest)
            : 0;

        let trendMessage = "";

        if (points.length >= 2) {
            const firstScore = points[0].percentage;
            const lastScore = points[points.length - 1].percentage;

            if (lastScore > firstScore) {
                trendMessage = " Your latest score is higher than your first recorded score.";
            } else if (lastScore < firstScore) {
                trendMessage = " Your latest score is lower than your first recorded score.";
            } else {
                trendMessage = " Your first and latest recorded scores are the same.";
            }
        }

        summary.textContent =
            `You have completed ${employeeResults.length} assessment(s). ` +
            `Your average score is ${average.toFixed(1)}%, ` +
            `your best score is ${best.toFixed(1)}%, ` +
            `and your latest score is ${latestScore.toFixed(1)}%.` +
            trendMessage;
    }
}

// ========================================================
// AI FEEDBACK - SAVED INDIVIDUAL REPORTS
// ========================================================

// ----------------------------------------
// LOAD SAVED REPORTS
// ----------------------------------------

async function loadFeedbackReports() {
    try {
        const response = await api("/api/feedback/reports");

        employeeFeedbackReports = extractArray(response, [
            "reports",
            "results"
        ]);

    } catch (error) {
        console.error(
            "Could not load AI feedback reports:",
            error
        );

        employeeFeedbackReports = [];
    }
}

// ----------------------------------------
// FIND EXISTING REPORT
// ----------------------------------------

function findSavedFeedback(type, id) {
    return employeeFeedbackReports.find(report => {
        const reportType = normalizeStatus(report.report_type);

        if (type === "quiz") {
            return (
                reportType !== "document" &&
                Number(report.attempt_id) === Number(id)
            );
        }

        return (
            reportType === "document" &&
            Number(report.submission_id) === Number(id)
        );
    });
}

// ----------------------------------------
// FORMAT AI FEEDBACK
// ----------------------------------------

function formatFeedbackText(value) {
    let html = safeHtml(value || "");

    // Convert headings.
    html = html.replace(
        /^### (.+)$/gm,
        "<h4>$1</h4>"
    );

    html = html.replace(
        /^## (.+)$/gm,
        "<h3>$1</h3>"
    );

    html = html.replace(
        /^# (.+)$/gm,
        "<h3>$1</h3>"
    );

    // Convert bold text.
    html = html.replace(
        /\*\*(.*?)\*\*/g,
        "<strong>$1</strong>"
    );

    // Convert bullet points.
    html = html.replace(
        /^\s*[-*]\s+(.+)$/gm,
        "<li>$1</li>"
    );

    // Convert numbered points.
    html = html.replace(
        /^\s*\d+\.\s+(.+)$/gm,
        "<li>$1</li>"
    );

    // Group consecutive list items.
    html = html.replace(
        /(<li>.*?<\/li>\s*)+/gs,
        match => `<ul>${match}</ul>`
    );

    // Convert remaining new lines.
    html = html.replace(/\n/g, "<br>");

    return html;
}

// ----------------------------------------
// RENDER INDIVIDUAL FEEDBACK REPORTS
// ----------------------------------------

function renderFeedbackReports() {
    const output = getElement("aiFeedbackResult");

    if (!output) return;

    const quizItems = employeeResults
        .filter(item => item.attempt_id)
        .map(item => ({
            type: "quiz",
            id: item.attempt_id,
            title:
                item.assessment_title ||
                item.quiz_title ||
                item.title ||
                "Quiz Assessment",
            score: item.score,
            total: item.total_questions,
            percentage: getResultPercentage(item),
            date: item.submitted_at
        }));

    const documentItems = employeeSubmissions
        .filter(item =>
            item.submission_id &&
            item.marks_obtained !== null &&
            item.marks_obtained !== undefined
        )
        .map(item => ({
            type: "document",
            id: item.submission_id,
            title:
                item.assessment_title ||
                item.title ||
                "Document Assessment",
            score: item.marks_obtained,
            total: item.max_marks,
            percentage:
                Number(item.max_marks) > 0
                    ? (Number(item.marks_obtained) /
                       Number(item.max_marks)) * 100
                    : null,
            date: item.evaluated_at || item.submitted_at
        }));

    const allItems = [
        ...quizItems,
        ...documentItems
    ];

    if (
        !allItems.length &&
        !employeeFeedbackReports.length
    ) {
        output.innerHTML = `
            <div class="employee-empty">
                <h3>No completed assessments yet</h3>

                <p>
                    Complete a quiz or wait for your document
                    assessment to be evaluated to receive AI feedback.
                </p>
            </div>
        `;
        return;
    }

    // Saved AI feedback reports.
    const savedReportCards = employeeFeedbackReports.map(report => {
        const type = normalizeStatus(report.report_type) === "document"
            ? "Document Assessment"
            : "Quiz Assessment";

        const percentage = report.percentage != null
            ? `${Number(report.percentage).toFixed(1)}%`
            : "";

        return `
            <article class="employee-card feedback-report-card">

                <div class="employee-section-heading">

                    <div>
                        <h3>${safeHtml(report.title || "AI Feedback Report")}</h3>

                        <p>
                            ${type} ·
                            ${safeHtml(formatDate(report.created_at))}
                        </p>
                    </div>

                    <span class="status-badge completed">
                        Report Saved
                    </span>

                </div>

                <p>
                    Score:
                    ${safeHtml(report.score ?? "-")} /
                    ${safeHtml(report.total ?? "-")}
                    ${percentage ? `(${percentage})` : ""}
                </p>

                <div class="feedback-report-content">
                    ${formatFeedbackText(report.feedback)}
                </div>

                <button
                    type="button"
                    class="employee-button"
                    data-feedback-action="pdf"
                    data-report-id="${safeHtml(report.id)}"
                >
                    Download PDF
                </button>

            </article>
        `;
    }).join("");

    // Find assessments without saved feedback.
    const missingItems = allItems.filter(item => {
        return !findSavedFeedback(item.type, item.id);
    });

    const missingCards = missingItems.map(item => `
        <article class="employee-card feedback-report-card">

            <div class="employee-section-heading">

                <div>
                    <h3>${safeHtml(item.title)}</h3>

                    <p>
                        ${item.type === "quiz"
                            ? "Quiz Assessment"
                            : "Document Assessment"}
                        · ${safeHtml(formatDate(item.date))}
                    </p>
                </div>

                <span class="status-badge pending">
                    Feedback Not Generated
                </span>

            </div>

            <p>
                Score:
                ${safeHtml(item.score ?? "-")} /
                ${safeHtml(item.total ?? "-")}

                ${item.percentage != null
                    ? `(${Number(item.percentage).toFixed(1)}%)`
                    : ""}
            </p>

            <button
                type="button"
                class="employee-button"
                data-feedback-action="generate"
                data-feedback-type="${item.type}"
                data-feedback-id="${safeHtml(item.id)}"
            >
                Generate AI Feedback
            </button>

        </article>
    `).join("");

    output.innerHTML = `
        ${savedReportCards}
        ${missingCards}
    `;

    if (!savedReportCards && !missingCards) {
        output.innerHTML = `
            <div class="employee-empty">
                No feedback reports available.
            </div>
        `;
    }
}

// ----------------------------------------
// GENERATE ONE QUIZ OR DOCUMENT REPORT
// ----------------------------------------

async function generateIndividualFeedback(type, id) {
    const output = getElement("aiFeedbackResult");

    if (!id || !["quiz", "document"].includes(type)) {
        alert("Invalid assessment information.");
        return;
    }

    const loadingId = `feedback-loading-${type}-${id}`;

    try {
        if (output && !getElement(loadingId)) {
            const loading = document.createElement("p");

            loading.id = loadingId;
            loading.className = "feedback-loading-message";
            loading.textContent =
                `Generating ${type} feedback. Please wait...`;

            output.prepend(loading);
        }

        const endpoint = type === "quiz"
            ? `/api/feedback/generate/quiz/${encodeURIComponent(id)}`
            : `/api/feedback/generate/document/${encodeURIComponent(id)}`;

        await api(endpoint, {
            method: "POST"
        });

        await loadFeedbackReports();

        renderFeedbackReports();

    } catch (error) {
        console.error(
            "AI feedback generation error:",
            error
        );

        alert(
            error.message ||
            "Unable to generate AI feedback. Please try again."
        );

        await loadFeedbackReports();

        renderFeedbackReports();

    } finally {
        const loading = getElement(loadingId);

        if (loading) {
            loading.remove();
        }
    }
}

// ----------------------------------------
// GENERATE ALL MISSING REPORTS
// ----------------------------------------

async function generateAIFeedback() {
    const button = getElement("generateFeedbackButton");

    const quizItems = employeeResults.filter(item => {
        return (
            item.attempt_id &&
            !findSavedFeedback("quiz", item.attempt_id)
        );
    });

    const documentItems = employeeSubmissions.filter(item => {
        return (
            item.submission_id &&
            item.marks_obtained !== null &&
            item.marks_obtained !== undefined &&
            !findSavedFeedback("document", item.submission_id)
        );
    });

    const items = [
        ...quizItems.map(item => ({
            type: "quiz",
            id: item.attempt_id
        })),

        ...documentItems.map(item => ({
            type: "document",
            id: item.submission_id
        }))
    ];

    if (!items.length) {
        alert(
            "All available assessment feedback reports have already been generated."
        );
        return;
    }

    if (button) {
        button.disabled = true;
        button.textContent = "Generating Reports...";
    }

    try {
        for (const item of items) {
            await generateIndividualFeedback(
                item.type,
                item.id
            );
        }

        await loadFeedbackReports();
        renderFeedbackReports();

    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = "Generate Missing Reports";
        }
    }
}

// ----------------------------------------
// DOWNLOAD INDIVIDUAL REPORT AS PDF
// ----------------------------------------

function downloadFeedbackPDF(reportId) {
    const report = employeeFeedbackReports.find(
        item => Number(item.id) === Number(reportId)
    );

    if (!report) {
        alert("Feedback report not found.");
        return;
    }

    const printWindow = window.open("", "_blank");

    if (!printWindow) {
        alert(
            "Please allow pop-ups to download your PDF report."
        );
        return;
    }

    const feedbackHtml = formatFeedbackText(report.feedback);

    const percentage = report.percentage != null
        ? `${Number(report.percentage).toFixed(1)}%`
        : "-";

    printWindow.document.open();

    printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="en">

        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">

            <title>
                ${safeHtml(report.title)} - AI Feedback
            </title>

            <style>
                body {
                    font-family: Arial, sans-serif;
                    max-width: 850px;
                    margin: 40px auto;
                    padding: 25px;
                    color: #243b35;
                    line-height: 1.7;
                }

                h1 {
                    color: #16816b;
                    margin-bottom: 8px;
                }

                h2, h3, h4 {
                    color: #16816b;
                    margin-top: 24px;
                }

                .details {
                    background: #eff9f3;
                    padding: 16px;
                    border-radius: 8px;
                    margin: 20px 0;
                }

                li {
                    margin-bottom: 8px;
                }

                @media print {
                    body {
                        margin: 15mm;
                        padding: 0;
                    }
                }
            </style>
        </head>

        <body>

            <h1>AssessAI - AI Feedback Report</h1>

            <h2>${safeHtml(report.title)}</h2>

            <div class="details">

                <p>
                    <strong>Report Type:</strong>
                    ${safeHtml(report.report_type || "Assessment")}
                </p>

                <p>
                    <strong>Score:</strong>
                    ${safeHtml(report.score ?? "-")} /
                    ${safeHtml(report.total ?? "-")}
                </p>

                <p>
                    <strong>Percentage:</strong>
                    ${percentage}
                </p>

                <p>
                    <strong>Generated:</strong>
                    ${safeHtml(formatDate(report.created_at))}
                </p>

            </div>

            <h3>Personalized Feedback</h3>

            <div>${feedbackHtml}</div>

            <hr>

            <p>
                Generated by AssessAI AI Learning Assistant.
            </p>

            <script>
                window.onload = function() {
                    window.print();
                };
            <\/script>

        </body>
        </html>
    `);

    printWindow.document.close();
}

// ----------------------------------------
// AI FEEDBACK BUTTON EVENTS
// ----------------------------------------

function setupFeedbackReportActions() {
    const output = getElement("aiFeedbackResult");

    if (!output) return;

    // Prevent adding duplicate event listeners.
    if (output.dataset.feedbackListenerAttached === "true") {
        return;
    }

    output.dataset.feedbackListenerAttached = "true";

    output.addEventListener("click", async event => {
        const button = event.target.closest(
            "[data-feedback-action]"
        );

        if (!button || button.disabled) return;

        const action = button.dataset.feedbackAction;

        if (action === "generate") {
            const type = button.dataset.feedbackType;
            const id = button.dataset.feedbackId;

            button.disabled = true;
            button.textContent = "Generating...";

            try {
                await generateIndividualFeedback(type, id);
            } finally {
                button.disabled = false;
            }
        }

        if (action === "pdf") {
            downloadFeedbackPDF(button.dataset.reportId);
        }
    });
}

// ----------------------------------------
// UPDATE FEEDBACK HEADING
// ----------------------------------------

function updateFeedbackQuizInfo() {
    const element = getElement("feedbackQuizInfo");

    if (!element) return;

    element.textContent =
        "Individual AI feedback reports for your completed quizzes and evaluated documents.";
}

// ========================================================
// INITIALIZE EMPLOYEE DASHBOARD
// ========================================================

async function initializeEmployeeDashboard() {
    try {
        setupEmployeeNavigation();

        const me = await api("/api/auth/me");

        if (me.role === "admin") {
            location.href = "../admin/dashboard.html";
            return;
        }

        localStorage.setItem(
            "user",
            JSON.stringify(me)
        );

        if (typeof showUser === "function") {
            showUser();
        }

        displayEmployeeInformation(me);

        // Load employee data from the backend.
        await loadEmployeeData();

        // Load previously saved AI reports.
        await loadFeedbackReports();

        // Update dashboard statistics.
        updateEmployeeStatistics();

        // Render dashboard sections.
        renderAssignments();
        renderEmployeeQuizzes();
        renderEmployeeResults();
        renderDocumentSubmissions();

        // Render the performance graph.
        renderPerformanceChart();

        // Render AI feedback reports.
        updateFeedbackQuizInfo();
        renderFeedbackReports();

        // Open the Overview page.
        showEmployeeView("overview");

    } catch (error) {
        console.error(
            "Employee dashboard loading error:",
            error
        );

        alert(
            "Unable to load the employee dashboard. Please login again."
        );

        if (typeof logout === "function") {
            logout();
        } else {
            location.href = "../login.html";
        }
    }
}

// Start dashboard.
initializeEmployeeDashboard();
