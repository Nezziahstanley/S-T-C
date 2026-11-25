const $ = selector => document.querySelector(selector);
const status = $("#adminStatus");

function message(text, isError = false) {
  if (!status) return;
  status.textContent = text || "";
  status.classList.toggle("error", isError);
}

function setMode(mode) {
  $("#passwordForm")?.classList.toggle("hidden", mode !== "password");
  $("#codeRequestForm")?.classList.add("hidden");
  $("#codeVerifyForm")?.classList.add("hidden");
  document.querySelectorAll(".method-tab").forEach(button => {
    const selected = button.dataset.mode === "password";
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
    if (!selected) button.hidden = true;
  });
  message("Password sign-in is currently enabled. Email-code and passkey sign-in will be restored after their Better Auth configuration is completed.");
}

async function requestApi(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || "The request could not be completed.");
  return data;
}

async function authorizeAdmin() {
  const response = await fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" });
  const me = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(me.error || "Could not verify your STC account.");
  const staffRoles = ["manager", "project_manager", "finance", "support", "content_editor"];
  if (!(me.is_admin || staffRoles.includes(me.role))) {
    await fetch("/api/better-auth/sign-out", { method: "POST", credentials: "same-origin" }).catch(() => {});
    throw new Error("This account does not have STC administrator or staff permissions.");
  }
  message("Login successful. Opening the STC admin dashboard…");
  location.replace("/?admin=1");
}

async function init() {
  if ($("#year")) $("#year").textContent = new Date().getFullYear();

  document.querySelectorAll(".method-tab").forEach(button => {
    button.addEventListener("click", () => setMode("password"));
  });
  setMode("password");

  $("#passwordForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    const email = $("#adminEmail").value.trim().toLowerCase();
    const password = $("#adminPassword").value;
    message("Checking your administrator credentials…");
    try {
      await requestApi("/api/better-auth/sign-in/email", { email, password, rememberMe: true });
      await authorizeAdmin();
    } catch (error) {
      message(error.message, true);
    }
  });

  $("#forgotPassword")?.addEventListener("click", async () => {
    const email = $("#adminEmail").value.trim().toLowerCase();
    if (!email) {
      message("Enter your administrator email first.", true);
      return;
    }
    message("Requesting a password reset link…");
    try {
      const result = await requestApi("/api/better-auth/request-password-reset", {
        email,
        redirectTo: location.origin + "/#account/reset-password"
      });
      message(result.message || "If an account exists, a reset link will be sent.");
    } catch (error) {
      message(error.message, true);
    }
  });

  $("#passkeySignIn")?.setAttribute("hidden", "hidden");
  $("#registerPasskey")?.setAttribute("hidden", "hidden");
  $("#openDashboard")?.addEventListener("click", () => { location.href = "/?admin=1"; });
}

init();
