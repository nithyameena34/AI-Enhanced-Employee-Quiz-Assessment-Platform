function setupRolePicker(formId, hiddenId, submitLabel) {
  const form = document.getElementById(formId);
  if (!form) return;
  const hidden = document.getElementById(hiddenId);
  const submit = form.querySelector('button[type="submit"]');
  form
    .closest(".auth-content")
    .querySelectorAll(".role-option")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const role = button.dataset.role;
        hidden.value = role;
        form
          .closest(".auth-content")
          .querySelectorAll(".role-option")
          .forEach((item) => item.classList.toggle("active", item === button));
        if (submit)
          submit.innerHTML = `${submitLabel} ${role === "admin" ? "Admin" : "Employee"} <span>→</span>`;
        const code = document.getElementById("adminCodeWrap");
        if (code) code.classList.toggle("hidden", role !== "admin");
      });
    });
}
setupRolePicker("loginForm", "loginRole", "Sign in as");
setupRolePicker("registerForm", "registerRole", "Create");
const loginForm = document.getElementById("loginForm");
if (loginForm)
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("message");
    msg.textContent = "";
    msg.className = "message";
    const form = Object.fromEntries(new FormData(loginForm));
    try {
      const data = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(form),
      });
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("user", JSON.stringify(data.user));
      location.href =
        data.user.role === "admin"
          ? "admin/dashboard.html"
          : "employee/dashboard.html";
    } catch (err) {
      msg.textContent = err.message;
    }
  });
const registerForm = document.getElementById("registerForm");
if (registerForm)
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("message");
    msg.textContent = "";
    msg.className = "message";
    const form = new FormData(registerForm);
    const password = form.get("password");
    if (password !== document.getElementById("confirmPassword").value) {
      msg.textContent =
        "The passwords do not match. Please check and try again.";
      return;
    }
    const payload = {
      name: form.get("name"),
      email: form.get("email"),
      password,
      role: form.get("role"),
      admin_code: form.get("admin_code") || "",
    };
    try {
      await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      msg.classList.add("success-message");
      msg.textContent =
        "Account created successfully. Taking you to sign in...";
      setTimeout(() => (location.href = "/static/login.html"), 1100);
    } catch (err) {
      msg.textContent = err.message;
    }
  });
