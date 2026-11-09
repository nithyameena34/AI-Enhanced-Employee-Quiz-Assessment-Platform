# AssessAI — AI-Enhanced Employee Quiz & Assessment Platform

AssessAI is a local-first employee assessment application developed using HTML, CSS, JavaScript, FastAPI, SQLAlchemy, SQLite and Scikit-learn. It provides separate employee and administrator dashboards for managing quizzes, assessments, assignments, submissions and performance.

The application also supports optional AI-powered learning feedback and a demonstration machine learning model.

## Features

### Authentication and User Management
- Employee and administrator registration and login.
- Password hashing and JWT-based authentication.
- Role-based access control.
- Employee management by administrators.

### Quiz Management
- Create, edit and manage quizzes.
- Add and manage multiple-choice questions.
- Import questions using CSV files.
- Automatic MCQ evaluation and score calculation.
- Maintain assessment attempt history.

### Assessment and Assignment Management
- Create and manage assessments.
- Assign assessments to employees.
- Publish and close assessments.
- Track employee assessment progress.
- Manage assignment submissions.

### Employee Dashboard
- View available quizzes and assigned assessments.
- Start and complete assessments.
- Submit answers and view results.
- Access performance information and learning feedback.

### Administrator Dashboard
- Manage employees, quizzes and questions.
- Manage assessments and assignments.
- Review employee submissions.
- Evaluate submitted documents.
- Monitor employee performance and assessment attempts.
- View overview statistics and reports.

### AI and Machine Learning
- Optional Groq-powered learning feedback.
- Built-in rule-based feedback fallback when an API key is unavailable.
- Optional Random Forest demonstration model.
- Performance prediction endpoint.

### Additional Features
- FastAPI serves the frontend and backend together.
- SQLite database for local development.
- API documentation through Swagger UI.
- No separate frontend server is required.

## Technology Stack

| Component | Technology |
|---|---|
| Frontend | HTML, CSS, JavaScript |
| Backend | Python, FastAPI |
| Database | SQLite |
| ORM | SQLAlchemy |
| Authentication | JWT, Password Hashing |
| Machine Learning | Scikit-learn |
| Data Processing | Pandas, NumPy |
| Model Storage | Joblib |
| AI Feedback | Groq API (Optional) |
| Document Handling | PDF, DOCX |
| API Documentation | Swagger UI |

## Requirements

- Windows 10 or Windows 11
- Python 3.10 recommended
- Visual Studio Code
- Internet connection for installing dependencies

## Installation and Setup

### 1. Extract and Open the Project

1. Extract the project ZIP file into a folder.
2. Open Visual Studio Code.
3. Select **File → Open Folder**.
4. Open the project folder containing `backend`, `frontend`, `ML` and `requirements.txt`.
5. Open **Terminal → New Terminal**.

### 2. Create a Virtual Environment

Run these commands in PowerShell:

```powershell
py -3.10 -m venv .venv
.\.venv\Scripts\Activate.ps1
```

If PowerShell blocks activation:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

### 3. Install Dependencies

```powershell
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

Verify the Python installation:

```powershell
python --version
python -m pip --version
```

### 4. Configure Environment Variables

Create the local environment file:

```powershell
Copy-Item .env.example .env
```

The application uses SQLite for local development.

If you want to enable optional Groq-powered feedback, configure your `GROQ_API_KEY` in `.env`.

If you want to enable administrator self-registration, configure a private `ADMIN_REGISTRATION_CODE`.

Keep API keys and registration codes private. Never upload `.env` to GitHub.

### 5. Create the First Administrator

Run the administrator creation script from the project root:

```powershell
python -m backend.app.create_admin
```

Enter the administrator's name, email and password when prompted.

Use a password containing at least 8 characters. The application stores a password hash rather than the original password.

**Note:** Confirm that the administrator creation script is located at `backend/app/create_admin.py`. If your project uses a different location, adjust this command accordingly.

### 6. Start the Application

Run:

```powershell
python -m uvicorn backend.app.main:app --reload
```

Open the application in your browser:

- Application: http://127.0.0.1:8000/
- Login: http://127.0.0.1:8000/static/login.html
- Registration: http://127.0.0.1:8000/static/register.html
- Admin Dashboard: http://127.0.0.1:8000/static/admin/dashboard.html
- Employee Dashboard: http://127.0.0.1:8000/static/employee/dashboard.html
- API Documentation: http://127.0.0.1:8000/docs

**Important:** Open the application through FastAPI instead of double-clicking HTML files. Keep the terminal running while using the application.

To stop the server, press `Ctrl + C`.

## First-Time Application Workflow

1. Start the FastAPI application.
2. Log in using the administrator account.
3. Open the Admin Dashboard.
4. Create a quiz.
5. Add multiple-choice questions.
6. Register an employee.
7. Create an assessment and assign it to the employee.
8. Publish the assessment.
9. Log in using the employee account.
10. View assigned assessments and complete the available quizzes.
11. Submit answers or required documents.
12. Review assessment results and learning feedback.
13. Log in as an administrator to review submissions and monitor employee performance.

## Optional Machine Learning Model

The project includes a Random Forest demonstration model.

Train the model from the project root:

```powershell
python ML/scripts/train_model.py
```

The trained model is saved at:

`ML/models/performance_model.joblib`

**Important:** The included training dataset contains synthetic demonstration data. It is intended to demonstrate the machine learning pipeline and does not establish reliable real-world employee performance predictions.

The prediction endpoint is:

`POST /api/ml/predict`

The endpoint requires authentication.

Do not use the demonstration model for hiring, firing, promotion, salary or other employment decisions.

## Optional AI-Powered Feedback

AssessAI supports optional Groq-powered learning feedback.

To enable it:

1. Obtain a Groq API key.
2. Add the key to your `.env` file.
3. Restart the FastAPI application.

If the API key is unavailable or the external request fails, the application can use its built-in rule-based feedback fallback.

Never expose API keys in frontend JavaScript or upload them to GitHub.

## Useful Commands

Start the application:

```powershell
python -m uvicorn backend.app.main:app --reload
```

Create an administrator:

```powershell
python -m backend.app.create_admin
```

Train the demonstration ML model:

```powershell
python ML/scripts/train_model.py
```

Run backend tests:

```powershell
python -m pytest backend/tests -q
```

Check Python syntax:

```powershell
python -m compileall backend ML
```

## Troubleshooting

**Registration returns 409 Conflict**
- The email address may already exist.
- Try logging in with the existing account.

**Login returns 401 Unauthorized**
- Verify the email and password.
- Check that the correct account role is selected.
- Confirm that the account exists.

**Admin registration returns 403 Forbidden**
- Check whether `ADMIN_REGISTRATION_CODE` is configured.
- Alternatively, create the administrator through the terminal command.

**Frontend CSS or JavaScript is missing**
- Open the application through FastAPI.
- Check the browser console for missing file paths.
- Confirm that the static frontend directory is correctly configured.

**Employee cannot see assigned assessments**
- Confirm that the administrator created the assessment.
- Verify that the assessment was assigned to the correct employee.
- Ensure that the assessment was published.

**Port 8000 is already in use**

Run the application on another port:

```powershell
python -m uvicorn backend.app.main:app --reload --port 8001
```

Then open:

http://127.0.0.1:8001/

## Security and Production Readiness

AssessAI is an academic and development project.

Before using it in a real organization, consider adding:

- HTTPS and secure deployment configuration.
- A production database and schema migrations.
- Rate limiting and stronger authentication controls.
- Audit logging and monitoring.
- Secure API key and secret management.
- Database backups and recovery procedures.
- Employee data privacy and retention controls.
- Security testing and review.
- Validation and governance of machine learning models.

Never commit `.env`, database files, private credentials, real employee information or sensitive model artifacts to a public repository.

## Project Purpose

AssessAI aims to simplify employee assessment management by combining quiz creation, assessment assignment, automatic evaluation, employee performance monitoring and AI-assisted learning feedback in a single web application.