// Use the same-origin API when served by FastAPI. If the frontend is opened
// with VS Code Live Server on localhost:5500, call the local FastAPI server.
const API = (
  ["localhost", "127.0.0.1"].includes(location.hostname) &&
  location.port && location.port !== "8000"
) ? "http://127.0.0.1:8000" : "";
function token() {
  return localStorage.getItem("access_token");
}
function authHeaders() {
  return token() ? { Authorization: "Bearer " + token() } : {};
}
async function api(path, options = {}) {
  const headers = { ...(options.headers || {}), ...authHeaders() };
  if (options.body && !(options.body instanceof FormData))
    headers["Content-Type"] = "application/json";
  const response = await fetch(API + path, { ...options, headers });
  const data = await response
    .json()
    .catch(() => ({ detail: "Unexpected server response" }));
  if (!response.ok) throw new Error(data.detail || "Request failed");
  return data;
}
function logout() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("user");
  location.href = "../login.html";
}
function requireLogin() {
  if (!token()) location.href = "../login.html";
}
function currentUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "{}");
  } catch {
    return {};
  }
}
function showUser() {
  const el = document.getElementById("userName");
  if (el) el.textContent = currentUser().name || "";
}
function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
