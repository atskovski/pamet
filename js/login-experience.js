/* Pamet v1.6.9 — authentication presentation, persistent-session preference, registration entry point, and rotating brand landscapes. */
(function () {
  "use strict";
  const welcome = document.querySelector("#welcome");
  const A = window.PametAuth;
  if (!welcome) return;

  function ensureRememberMe() {
    const loginForm = document.querySelector("#loginForm");
    const submit = loginForm?.querySelector('button[type="submit"]');
    if (!loginForm || !submit) return;

    let checkbox = loginForm.querySelector("#loginRemember");
    if (!checkbox) {
      const row = document.createElement("label");
      row.className = "remember-me-row";
      row.htmlFor = "loginRemember";

      checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = "loginRemember";
      checkbox.setAttribute("aria-describedby", "loginRememberHelp");

      const copy = document.createElement("span");
      copy.className = "remember-me-copy";
      const title = document.createElement("strong");
      title.textContent = "Remember me";
      const help = document.createElement("small");
      help.id = "loginRememberHelp";
      help.textContent = "Keep me signed in on this device for 30 days. Don’t use this on a shared device.";
      copy.append(title, help);
      row.append(checkbox, copy);
      submit.insertAdjacentElement("beforebegin", row);

      const rememberedEmail = A?.getRememberedEmail?.();
      const email = document.querySelector("#loginEmail");
      if (rememberedEmail && email) {
        email.value = rememberedEmail;
        checkbox.checked = true;
      }
    }

    const secure = document.querySelector("#welcomeSecure");
    if (secure && A?.isSecure) secure.textContent = "🔒 Sign-in uses a secure session. Pamet does not save your plain-text password in the browser.";
  }

  function moveAuthError(form) {
    let error = document.querySelector("#welcome .form-error");
    if (!error) {
      error = document.createElement("p");
      error.className = "form-error";
      error.setAttribute("role", "alert");
    }
    const help = error.nextElementSibling?.classList.contains("pamet-troubleshoot-link") ? error.nextElementSibling : null;
    form.insertBefore(error, form.querySelector('button[type="submit"]'));
    if (help) error.insertAdjacentElement("afterend", help);
    error.textContent = "";
    error.hidden = true;
  }

  function ensureRegistrationEntry() {
    const loginForm = document.querySelector("#loginForm");
    const registerForm = document.querySelector("#registerForm");
    const switcher = loginForm?.querySelector(".welcome-switch");
    const createLink = loginForm?.querySelector("#showRegister");
    if (!loginForm || !registerForm || !switcher || !createLink) return;

    createLink.textContent = "Create an account";
    createLink.setAttribute("aria-label", "Create a new Pamet account");
    const hasSavedAccount = !!A?.hasAccount?.();
    switcher.hidden = hasSavedAccount;
    createLink.hidden = hasSavedAccount;
    moveAuthError(loginForm);

    if (createLink.dataset.pametAuthTarget !== "true") {
      createLink.dataset.pametAuthTarget = "true";
      createLink.addEventListener("click", () => queueMicrotask(() => moveAuthError(registerForm)));
      registerForm.querySelector("#showLogin")?.addEventListener("click", () => queueMicrotask(() => moveAuthError(loginForm)));
    }
    ensureRememberMe();
  }

  if (A?.login && !A.__rememberMeLoginWrapped) {
    const originalLogin = A.login.bind(A);
    A.__rememberMeLoginWrapped = true;
    A.login = function loginWithRememberPreference(email, password, options = {}) {
      const checkbox = document.querySelector("#loginRemember");
      const rememberMe = Object.prototype.hasOwnProperty.call(options, "rememberMe") ? !!options.rememberMe : !!checkbox?.checked;
      return originalLogin(email, password, { ...options, rememberMe });
    };
  }

  const scenes = ["login-sunrise.jpg", "login-dusk.jpg", "login-morning.jpg"];
  let index = Number(sessionStorage.getItem("pamet_login_scene_v105") || -1);
  function rotateScene() {
    index = (index + 1) % scenes.length;
    sessionStorage.setItem("pamet_login_scene_v105", String(index));
    welcome.style.setProperty("--login-scene", `url("/assets/${scenes[index]}")`);
    ensureRegistrationEntry();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ensureRegistrationEntry, { once: true });
  window.addEventListener("pageshow", ensureRegistrationEntry);
  window.addEventListener("pamet:logout", rotateScene);
  window.addEventListener("pamet:logout-all", ensureRegistrationEntry);
  window.addEventListener("pamet:account-deleted", ensureRegistrationEntry);
  rotateScene();
})();
