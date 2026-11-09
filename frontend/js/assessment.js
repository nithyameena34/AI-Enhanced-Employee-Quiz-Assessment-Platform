requireLogin();

const params = new URLSearchParams(window.location.search);

const quizId = params.get("quiz");
const assessmentId = params.get("assignment");

let quizData = null;
let assessmentType = "quiz";
let timerInterval = null;
let isSubmitting = false;
let timerExpired = false;

const assessmentHeader = document.getElementById("assessmentHeader");
const questionsBox = document.getElementById("questions");
const assessmentForm = document.getElementById("assessmentForm");
const messageBox = document.getElementById("message");
const resultBox = document.getElementById("result");

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function escapeValue(value) {
    return typeof escapeHtml === "function"
        ? escapeHtml(value ?? "")
        : String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[char]);
}

function showAssessmentMessage(message, type = "error") {
    if (!messageBox) return;

    messageBox.textContent = message;
    messageBox.className = `employee-message ${type}`;
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function stopTimer() {
    if (timerInterval !== null) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function setSubmitButton(disabled, text = "Submit Assessment →") {
    const button = assessmentForm?.querySelector('[type="submit"]');

    if (button) {
        button.disabled = disabled;
        button.textContent = text;
    }
}

function collectAnswers() {
    if (!quizData || !Array.isArray(quizData.questions)) {
        return [];
    }

    return quizData.questions
        .map(question => {
            const selected = document.querySelector(
                `input[name="q_${question.id}"]:checked`
            );

            if (!selected) return null;

            return {
                question_id: question.id,
                selected_option: selected.value
            };
        })
        .filter(answer => answer !== null);
}

// --------------------------------------------------
// TIMER
// --------------------------------------------------

function startTimer(seconds) {
    stopTimer();

    const timerBox = document.getElementById("assessmentTimer");

    if (!timerBox || seconds === null || seconds === undefined) {
        return;
    }

    let remaining = Math.max(0, Number(seconds));

    function updateTimer() {
        if (remaining <= 0) {
            timerExpired = true;

            timerBox.textContent = "Time expired";
            timerBox.classList.remove("success");
            timerBox.classList.add("error");

            stopTimer();

            // Document assessments require a file upload.
            // Do not attempt to submit an empty document.
            if (assessmentType === "document") {
                const uploadButton = document.getElementById(
                    "uploadDocumentButton"
                );

                if (uploadButton) {
                    uploadButton.disabled = true;
                    uploadButton.textContent = "Time expired";
                }

                showAssessmentMessage(
                    "Your assessment time has expired. Document upload is no longer available.",
                    "error"
                );

                return;
            }

            // Prevent further answer changes while submitting.
            questionsBox?.querySelectorAll('input[type="radio"]')
                .forEach(input => {
                    input.disabled = true;
                });

            showAssessmentMessage(
                "Time is over. Your saved answers are being submitted automatically...",
                "success"
            );

            // Automatically submit even if some questions are unanswered.
            submitAssessment(null, true);

            return;
        }

        timerBox.textContent = `Time remaining: ${formatTime(remaining)}`;
        remaining--;
    }

    updateTimer();

    if (remaining >= 0 && !timerExpired) {
        timerInterval = setInterval(updateTimer, 1000);
    }
}

// --------------------------------------------------
// RENDER QUESTIONS
// --------------------------------------------------

function renderAssessment() {
    if (!quizData || !assessmentHeader || !questionsBox) {
        throw new Error("Assessment information could not be displayed.");
    }

    if (!Array.isArray(quizData.questions)) {
        throw new Error("Invalid question data received from the server.");
    }

    const questions = quizData.questions;

    assessmentHeader.innerHTML = `
        <p class="employee-eyebrow">ASSESSMENT</p>
        <h1>${escapeValue(quizData.title)}</h1>
        <p>
            ${questions.length} questions
            ${quizData.duration_minutes
                ? ` · ${escapeValue(quizData.duration_minutes)} minutes`
                : ""}
        </p>
    `;

    if (!questions.length) {
        questionsBox.innerHTML = `
            <div class="employee-card">
                <p class="employee-empty">
                    No questions are available.
                </p>
            </div>
        `;

        setSubmitButton(true);
        return;
    }

    questionsBox.innerHTML = questions.map((question, index) => {
        const options = ["a", "b", "c", "d"];

        return `
            <article class="question-card" id="question-${question.id}">
                <h3>
                    ${index + 1}. ${escapeValue(question.question_text)}
                </h3>

                ${options.map(letter => {
                    const optionText = question[`option_${letter}`];

                    if (!optionText) return "";

                    const upperLetter = letter.toUpperCase();

                    return `
                        <label class="option">
                            <input
                                type="radio"
                                name="q_${question.id}"
                                value="${upperLetter}"
                                required
                            >
                            <span>
                                <b>${upperLetter}.</b>
                                ${escapeValue(optionText)}
                            </span>
                        </label>
                    `;
                }).join("")}
            </article>
        `;
    }).join("");

    setSubmitButton(false);
}

// --------------------------------------------------
// ASSIGNED ASSESSMENT
// --------------------------------------------------

async function loadAssignedAssessment() {
    if (!assessmentId) {
        throw new Error("Assessment ID is missing.");
    }

    const started = await api(
        `/api/assessments/assigned/${encodeURIComponent(assessmentId)}/start`,
        {
            method: "POST"
        }
    );

    assessmentType = started.assessment_type;

    if (assessmentType === "document") {
        renderDocumentAssessment(started);
        return;
    }

    if (assessmentType !== "quiz") {
        throw new Error("Unsupported assessment type.");
    }

    const questions = await api(
        `/api/assessments/assigned/${encodeURIComponent(assessmentId)}/questions`
    );

    quizData = {
        title: started.title,
        duration_minutes: started.duration_minutes,
        questions: questions
    };

    renderAssessment();

    if (started.timer_enabled) {
        const timer = document.createElement("div");

        timer.id = "assessmentTimer";
        timer.className = "employee-message success";

        assessmentHeader.appendChild(timer);

        startTimer(started.remaining_seconds);
    }
}

// --------------------------------------------------
// DOCUMENT ASSESSMENT
// --------------------------------------------------

function renderDocumentAssessment(started) {
    assessmentHeader.innerHTML = `
        <p class="employee-eyebrow">DOCUMENT ASSESSMENT</p>
        <h1>${escapeValue(started.title)}</h1>
        <p>Upload your completed answer document below.</p>
    `;

    questionsBox.innerHTML = `
        <article class="question-card">
            <h3>Document Submission</h3>

            <p>
                Accepted formats: PDF and DOCX.
                Maximum file size: 10 MB.
            </p>

            <label for="documentFile">
                Choose your answer document
            </label>

            <input
                type="file"
                id="documentFile"
                accept=".pdf,.docx"
                required
            >

            <p id="selectedFileName"></p>

            <div
                id="assessmentTimer"
                class="employee-message success"
            ></div>

            <button
                type="button"
                id="uploadDocumentButton"
                class="employee-button"
            >
                Upload and Submit →
            </button>
        </article>
    `;

    const timerBox = document.getElementById("assessmentTimer");

    if (started.timer_enabled) {
        startTimer(started.remaining_seconds);
    } else {
        timerBox.hidden = true;
    }

    const fileInput = document.getElementById("documentFile");

    fileInput.addEventListener("change", () => {
        document.getElementById("selectedFileName").textContent =
            fileInput.files[0]?.name || "";
    });

    document.getElementById("uploadDocumentButton")
        .addEventListener("click", uploadDocument);
}

// --------------------------------------------------
// DOCUMENT UPLOAD
// --------------------------------------------------

async function uploadDocument() {
    const fileInput = document.getElementById("documentFile");
    const button = document.getElementById("uploadDocumentButton");

    if (timerExpired) {
        showAssessmentMessage(
            "Your assessment time has expired. You cannot upload a document now.",
            "error"
        );
        return;
    }

    const file = fileInput?.files[0];

    if (!file) {
        showAssessmentMessage(
            "Please select a PDF or DOCX file.",
            "error"
        );
        return;
    }

    const extension = file.name.split(".").pop().toLowerCase();

    if (!["pdf", "docx"].includes(extension)) {
        showAssessmentMessage(
            "Only PDF and DOCX files are allowed.",
            "error"
        );
        return;
    }

    if (file.size > 10 * 1024 * 1024) {
        showAssessmentMessage(
            "Maximum file size is 10 MB.",
            "error"
        );
        return;
    }

    if (!confirm("Are you sure you want to submit this document?")) {
        return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
        button.disabled = true;
        button.textContent = "Uploading...";

        const result = await api(
            `/api/assessments/assigned/${encodeURIComponent(assessmentId)}/document`,
            {
                method: "POST",
                body: formData
            }
        );

        stopTimer();

        resultBox.hidden = false;

        resultBox.innerHTML = `
            <p class="employee-eyebrow">SUBMISSION COMPLETE</p>
            <h2>Document submitted successfully!</h2>
            <p>File: ${escapeValue(result.file_name)}</p>

            <a class="employee-button" href="dashboard.html">
                Back to Dashboard →
            </a>
        `;

        assessmentForm.hidden = true;

        showAssessmentMessage(
            "Your document was submitted successfully.",
            "success"
        );

    } catch (error) {
        console.error("Document upload error:", error);

        showAssessmentMessage(
            error.message || "Document upload failed.",
            "error"
        );

        button.disabled = false;
        button.textContent = "Upload and Submit →";
    }
}

// --------------------------------------------------
// PRACTICE QUIZ
// --------------------------------------------------

async function loadPracticeQuiz() {
    if (!quizId) {
        throw new Error("No quiz was selected.");
    }

    const data = await api(
        `/api/quizzes/${encodeURIComponent(quizId)}`
    );

    quizData = {
        id: data.id,
        title: data.title,
        description: data.description,
        duration_minutes: data.duration_minutes,
        questions: data.questions
    };

    renderAssessment();

    // Start the timer for practice quizzes.
    const durationMinutes = Number(data.duration_minutes || 0);

    if (durationMinutes > 0) {
        const timer = document.createElement("div");

        timer.id = "assessmentTimer";
        timer.className = "employee-message success";

        assessmentHeader.appendChild(timer);

        startTimer(durationMinutes * 60);
    }
}

// --------------------------------------------------
// SUBMIT QUIZ / ASSIGNED ASSESSMENT
// --------------------------------------------------

async function submitAssessment(event, autoSubmit = false) {
    if (event) {
        event.preventDefault();
    }

    if (isSubmitting || !quizData) return;

    if (!Array.isArray(quizData.questions) ||
        quizData.questions.length === 0) {
        showAssessmentMessage(
            "There are no questions to submit.",
            "error"
        );
        return;
    }

    // If the timer has expired, always allow partial answers.
    const automatic = autoSubmit || timerExpired;

    const answers = collectAnswers();

    if (!automatic && answers.length !== quizData.questions.length) {
        showAssessmentMessage(
            "Please answer every question before submitting.",
            "error"
        );

        const answeredIds = new Set(
            answers.map(answer => answer.question_id)
        );

        const firstQuestion = quizData.questions.find(
            question => !answeredIds.has(question.id)
        );

        if (firstQuestion) {
            document.getElementById(`question-${firstQuestion.id}`)
                ?.scrollIntoView({
                    behavior: "smooth",
                    block: "center"
                });
        }

        return;
    }

    if (!automatic &&
        !confirm("Are you sure you want to submit your assessment?")) {
        return;
    }

    isSubmitting = true;
    stopTimer();

    setSubmitButton(true, automatic ? "Submitting automatically..." : "Submitting...");

    // Stop the employee changing answers during submission.
    if (automatic) {
        questionsBox?.querySelectorAll('input[type="radio"]')
            .forEach(input => {
                input.disabled = true;
            });
    }

    try {
        showAssessmentMessage(
            automatic
                ? "Time is over. Submitting your saved answers..."
                : "Submitting your answers...",
            "success"
        );

        const endpoint = assessmentId
            ? `/api/assessments/assigned/${encodeURIComponent(assessmentId)}/submit`
            : `/api/assessments/${encodeURIComponent(quizId)}/submit`;

        const result = await api(endpoint, {
            method: "POST",
            body: JSON.stringify({ answers })
        });

        const percentage = Number(result.percentage || 0);
        const answeredCount = result.answered_questions ?? answers.length;
        const unansweredCount =
            result.unanswered_questions ??
            Math.max(0, quizData.questions.length - answeredCount);

        resultBox.hidden = false;

        resultBox.innerHTML = `
            <p class="employee-eyebrow">ASSESSMENT COMPLETE</p>

            <div class="result-score">
                ${percentage.toFixed(2)}%
            </div>

            <h2>
                ${escapeValue(result.score)}
                out of
                ${escapeValue(result.total_questions)}
                correct
            </h2>

            <p>
                ${escapeValue(
                    result.message ||
                    "Your assessment was submitted successfully."
                )}
            </p>

            <p>
                Questions answered: ${escapeValue(answeredCount)}
            </p>

            <p>
                Questions unanswered: ${escapeValue(unansweredCount)}
            </p>

            ${automatic
                ? "<p>Your answers were submitted automatically because the time limit ended.</p>"
                : ""}

            <a class="employee-button" href="dashboard.html">
                Back to Dashboard →
            </a>
        `;

        assessmentForm.hidden = true;

        showAssessmentMessage(
            "Your assessment was submitted successfully.",
            "success"
        );

        resultBox.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });

    } catch (error) {
        console.error("Assessment submission error:", error);

        showAssessmentMessage(
            error.message || "Unable to submit your assessment.",
            "error"
        );

        isSubmitting = false;

        if (timerExpired) {
            setSubmitButton(false, "Retry Submission →");
        } else {
            setSubmitButton(false);
        }
    }
}

// --------------------------------------------------
// INITIALIZE
// --------------------------------------------------

async function initializeAssessment() {
    try {
        if (assessmentId && quizId) {
            throw new Error(
                "Invalid assessment URL. Please select only one assessment."
            );
        }

        if (assessmentId) {
            await loadAssignedAssessment();

        } else if (quizId) {
            await loadPracticeQuiz();

        } else {
            throw new Error(
                "No assessment selected. Return to your dashboard."
            );
        }

    } catch (error) {
        console.error("Assessment loading error:", error);

        showAssessmentMessage(
            error.message || "Unable to load this assessment.",
            "error"
        );

        if (assessmentForm) {
            assessmentForm.hidden = true;
        }
    }
}

// --------------------------------------------------
// EVENT LISTENERS
// --------------------------------------------------

if (assessmentForm) {
    assessmentForm.addEventListener(
        "submit",
        submitAssessment
    );
}

window.addEventListener("beforeunload", stopTimer);

initializeAssessment();