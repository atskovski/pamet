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
    if (!form) return;
    let error = document.querySelector("#welcome .form-error");
    if (!error) {
      error = document.createElement("p");
      error.className = "form-error";
      error.setAttribute("role", "alert");
      error.hidden = true;
    }
    const support = error.nextElementSibling?.classList.contains("pamet-troubleshoot-link") ? error.nextElementSibling : null;
    const submit = form.querySelector('button[type="submit"]');
    if (submit) form.insertBefore(error, submit);
    else form.appendChild(error);
    if (support) error.insertAdjacentElement("afterend", support);
    error.textContent = "";
    error.hidden = true;
  }

  function applyAccountState(loginForm, switcher, createLink) {
    const hasSavedAccount = !!A?.hasAccount?.();
    switcher.hidden = hasSavedAccount;
    createLink.hidden = hasSavedAccount;
    if (hasSavedAccount) {
      const email = loginForm.querySelector("#loginEmail");
      const savedEmail = A?.getUser?.()?.email;
      if (email && savedEmail && !email.value.trim()) email.value = savedEmail;
    }
  }

  function improveRegistrationConfirmation() {
    setTimeout(() => {
      const toast = document.querySelector("#toast");
      if (!toast || !/Account created/i.test(toast.textContent)) return;
      toast.textContent = "Account created — you’re signed in ✓";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      toast.setAttribute("aria-atomic", "true");
    }, 0);
  }

  function ensureRegistrationEntry() {
    const loginForm = document.querySelector("#loginForm");
    const registerForm = document.querySelector("#registerForm");
    if (!loginForm || !registerForm) return;

    let switcher = loginForm.querySelector(".welcome-switch");
    let createLink = loginForm.querySelector("#showRegister");

    if (!switcher) {
      switcher = document.createElement("p");
      switcher.className = "welcome-switch";
      const submit = loginForm.querySelector('button[type="submit"]');
      if (submit) submit.insertAdjacentElement("afterend", switcher);
      else loginForm.appendChild(switcher);
    }

    if (!createLink) {
      switcher.textContent = "Don’t have an account? ";
      createLink = document.createElement("a");
      createLink.href = "#";
      createLink.id = "showRegister";
      createLink.textContent = "Create an account";
      switcher.appendChild(createLink);
      createLink.addEventListener("click", (event) => {
        event.preventDefault();
        registerForm.reset();
        loginForm.hidden = true;
        registerForm.hidden = false;
      });
    } else {
      createLink.textContent = "Create an account";
    }

    createLink.setAttribute("aria-label", "Create a new Pamet account");
    applyAccountState(loginForm, switcher, createLink);
    moveAuthError(loginForm);

    if (createLink.dataset.pametAuthTarget !== "true") {
      createLink.dataset.pametAuthTarget = "true";
      createLink.addEventListener("click", () => queueMicrotask(() => moveAuthError(registerForm)));
      const loginLink = registerForm.querySelector("#showLogin");
      loginLink?.addEventListener("click", () => {
        const email = registerForm.querySelector("#regEmail")?.value.trim();
        if (email) loginForm.querySelector("#loginEmail").value = email;
        queueMicrotask(() => moveAuthError(loginForm));
      });
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

  ensureRegistrationEntry();
  queueMicrotask(ensureRegistrationEntry);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ensureRegistrationEntry, { once: true });
  window.addEventListener("pageshow", ensureRegistrationEntry);
  window.addEventListener("pamet:logout", rotateScene);
  window.addEventListener("pamet:logout-all", ensureRegistrationEntry);
  window.addEventListener("pamet:account-deleted", ensureRegistrationEntry);
  window.addEventListener("pamet:registered", () => {
    ensureRegistrationEntry();
    improveRegistrationConfirmation();
  });
  rotateScene();
})();
