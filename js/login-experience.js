/* Pamet v1.6.9 — authentication presentation, persistent-session preference, registration entry point, and rotating brand landscapes. */
(function () {
  "use strict";
  const welcome = document.querySelector("#welcome");
  const A = window.PametAuth;
  if (!welcome) return;

  let authSuccessTimer;

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

  function setHidden(element, hidden) {
    if (element && element.hidden !== hidden) element.hidden = hidden;
  }

  function applyRegistrationVisibility(loginForm, switcher, createLink) {
    const hasSavedAccount = !!A?.hasAccount?.();
    const showCreateAccount = !hasSavedAccount;
    setHidden(switcher, !showCreateAccount);
    setHidden(createLink, !showCreateAccount);

    if (hasSavedAccount) {
      const saved = A?.getUser?.();
      const email = loginForm.querySelector("#loginEmail");
      if (saved?.email && email && !email.value.trim()) email.value = saved.email;
    }
  }

  function ensureFormError(form) {
    if (!form) return null;
    let error = form.querySelector(".form-error");
    if (!error) {
      error = document.createElement("p");
      error.className = "form-error";
      error.setAttribute("role", "alert");
      error.hidden = true;
      const submit = form.querySelector('button[type="submit"]');
      if (submit) submit.insertAdjacentElement("beforebegin", error);
      else form.appendChild(error);
    }
    return error;
  }

  function clearFormError(form) {
    const error = form?.querySelector(".form-error");
    if (!error) return;
    error.textContent = "";
    error.hidden = true;
  }

  function setSubmitting(form, submitting, pendingLabel) {
    if (!form) return;
    const submit = form.querySelector('button[type="submit"]');
    if (!submit) return;
    if (!submit.dataset.pametDefaultLabel) submit.dataset.pametDefaultLabel = submit.textContent.trim();
    form.setAttribute("aria-busy", submitting ? "true" : "false");
    submit.disabled = submitting;
    submit.textContent = submitting ? pendingLabel : submit.dataset.pametDefaultLabel;
  }

  function ensureSubmissionState(form, pendingLabel) {
    if (!form || form.dataset.pametSubmitGuard === "true") return;
    form.dataset.pametSubmitGuard = "true";
    form.addEventListener("submit", (event) => {
      if (form.getAttribute("aria-busy") === "true") {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      setSubmitting(form, true, pendingLabel);
    }, true);
  }

  function registrationErrorMessage(message) {
    if (message === "An account already exists for this email.") return "An account already exists for this email. Use Log in below instead.";
    if (message === "An account already exists on this device. Log in or reset its password.") return "This Pamet account is already saved in this browser. Log in instead.";
    return message;
  }

  function ensureErrorRouting() {
    const loginForm = document.querySelector("#loginForm");
    const registerForm = document.querySelector("#registerForm");
    if (!loginForm || !registerForm) return;

    const loginError = ensureFormError(loginForm);
    const registerError = ensureFormError(registerForm);
    if (!loginError || !registerError || loginError.dataset.pametAuthErrorRouter === "true") return;
    loginError.dataset.pametAuthErrorRouter = "true";

    const syncErrors = () => {
      if (!registerForm.hidden) {
        const message = registrationErrorMessage(loginError.textContent.trim());
        registerError.textContent = message;
        registerError.hidden = !message || loginError.hidden;
        if (message) setSubmitting(registerForm, false, "Creating account…");
      } else if (loginError.textContent.trim() && !loginError.hidden) {
        setSubmitting(loginForm, false, "Signing in…");
      }
    };

    const observer = new MutationObserver(syncErrors);
    observer.observe(loginError, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
    syncErrors();
  }

  function announceAccountCreated() {
    document.querySelector("#pametAuthSuccess")?.remove();
    const notice = document.createElement("div");
    notice.id = "pametAuthSuccess";
    notice.className = "pamet-notification";
    notice.setAttribute("role", "status");
    notice.setAttribute("aria-live", "polite");
    notice.setAttribute("aria-atomic", "true");

    const title = document.createElement("strong");
    title.textContent = "Account created";
    const detail = document.createElement("span");
    detail.textContent = "Your Pamet account is ready and you’re signed in.";
    const close = document.createElement("button");
    close.type = "button";
    close.setAttribute("aria-label", "Dismiss account confirmation");
    close.textContent = "×";
    close.addEventListener("click", () => notice.remove());
    notice.append(title, detail, close);
    document.body.appendChild(notice);

    clearTimeout(authSuccessTimer);
    authSuccessTimer = setTimeout(() => notice.remove(), 5500);
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
        clearFormError(loginForm);
        clearFormError(registerForm);
        registerForm.reset();
        loginForm.hidden = true;
        registerForm.hidden = false;
      });
    } else {
      createLink.textContent = "Create an account";
    }

    createLink.setAttribute("aria-label", "Create a new Pamet account");
    applyRegistrationVisibility(loginForm, switcher, createLink);

    if (switcher.dataset.pametRegistrationStateGuard !== "true") {
      switcher.dataset.pametRegistrationStateGuard = "true";
      const registrationStateGuard = new MutationObserver(() => applyRegistrationVisibility(loginForm, switcher, createLink));
      registrationStateGuard.observe(switcher, { attributes: true, attributeFilter: ["hidden"] });
      registrationStateGuard.observe(createLink, { attributes: true, attributeFilter: ["hidden"] });
    }

    if (createLink.dataset.pametAuthClearErrors !== "true") {
      createLink.dataset.pametAuthClearErrors = "true";
      createLink.addEventListener("click", () => {
        clearFormError(loginForm);
        clearFormError(registerForm);
      });
    }

    const loginLink = registerForm.querySelector("#showLogin");
    if (loginLink && loginLink.dataset.pametAuthLoginLink !== "true") {
      loginLink.dataset.pametAuthLoginLink = "true";
      loginLink.addEventListener("click", () => {
        const registrationEmail = registerForm.querySelector("#regEmail")?.value.trim();
        const loginEmail = loginForm.querySelector("#loginEmail");
        if (registrationEmail && loginEmail) loginEmail.value = registrationEmail;
        clearFormError(loginForm);
        clearFormError(registerForm);
        setSubmitting(registerForm, false, "Creating account…");
      });
    }

    ensureSubmissionState(loginForm, "Signing in…");
    ensureSubmissionState(registerForm, "Creating account…");
    ensureErrorRouting();
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
  window.addEventListener("pageshow", ensureRegistrationEntry);
  window.addEventListener("pamet:logout", () => {
    setSubmitting(document.querySelector("#loginForm"), false, "Signing in…");
    rotateScene();
  });
  window.addEventListener("pamet:logout-all", ensureRegistrationEntry);
  window.addEventListener("pamet:account-deleted", () => {
    setSubmitting(document.querySelector("#loginForm"), false, "Signing in…");
    setSubmitting(document.querySelector("#registerForm"), false, "Creating account…");
    ensureRegistrationEntry();
  });
  window.addEventListener("pamet:login", () => setSubmitting(document.querySelector("#loginForm"), false, "Signing in…"));
  window.addEventListener("pamet:registered", () => {
    setSubmitting(document.querySelector("#registerForm"), false, "Creating account…");
    ensureRegistrationEntry();
    announceAccountCreated();
  });
  rotateScene();
})();