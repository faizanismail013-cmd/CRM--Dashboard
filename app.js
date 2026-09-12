/* ═══════════════════════════════════════════════════════════════════
   SmartPay CRM — Application Logic
   Auth flow, CRM data, Letters generator, and UI interactions
   ═══════════════════════════════════════════════════════════════════ */

// ─── AUTH MANAGEMENT ────────────────────────────────────────────────

let currentUser = null;
let currentUnverifiedEmail = '';

const el = id => document.getElementById(id);
const initials = name => (name || '').trim().split(/\s+/).filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'U';
const escapeHTML = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
const escapeHtml = escapeHTML;

function updateUserUI(user) {
  if (!user) return;
  currentUser = user;
  const firstName = (user.name || 'User').trim().split(/\s+/)[0] || 'User';
  const userInitials = initials(user.name);

  if (el('dashboardUserName')) el('dashboardUserName').textContent = firstName;
  if (el('sidebarUserName')) el('sidebarUserName').textContent = user.name || 'User';
  if (el('sidebarUserRole')) el('sidebarUserRole').textContent = user.role || 'Sales Rep';
  if (el('menuUserName')) el('menuUserName').textContent = user.name || 'User';
  if (el('menuUserEmail')) el('menuUserEmail').textContent = user.email || '';
  if (el('menuUserRole')) el('menuUserRole').textContent = user.role || 'Sales Rep';

  // Set avatars
  const avatarNodes = [el('sidebarAvatar'), el('menuAvatar')];
  avatarNodes.forEach(node => {
    if (!node) return;
    if (user.avatar) {
      node.innerHTML = `<img src="${escapeHTML(user.avatar)}" alt="${escapeHTML(user.name || 'User')}" />`;
    } else {
      node.textContent = userInitials;
    }
  });

  updateDashboardHeader();

  if (typeof state !== 'undefined' && state.activeView === 'profile') {
    renderProfile();
  }
}

// ─── Dynamic Header & Greeting ──────────────────────────────────────

function updateDashboardHeader() {
  const now = new Date();

  // 1. Dynamic Date Display: "[DAY_OF_WEEK], [DAY] [MONTH]" in all caps
  const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
  const day = now.getDate();
  const month = now.toLocaleDateString('en-US', { month: 'long' });
  const formattedDate = `${dayOfWeek}, ${day} ${month}`.toUpperCase();

  const dateEl = el('dashboardDate');
  if (dateEl) dateEl.textContent = formattedDate;

  // 2. Time-Based Greeting:
  // 05:00 to 11:59 -> "Good morning,"
  // 12:00 to 16:59 -> "Good afternoon,"
  // 17:00 to 21:59 -> "Good evening,"
  // 22:00 to 04:59 -> "Good night,"
  const hour = now.getHours();
  let greeting = 'Good morning,';
  if (hour >= 5 && hour < 12) {
    greeting = 'Good morning,';
  } else if (hour >= 12 && hour < 17) {
    greeting = 'Good afternoon,';
  } else if (hour >= 17 && hour < 22) {
    greeting = 'Good evening,';
  } else {
    greeting = 'Good night,';
  }

  const prefixEl = el('dashboardGreetingPrefix');
  if (prefixEl) prefixEl.textContent = greeting;

  if (currentUser && el('dashboardUserName')) {
    const firstName = (currentUser.name || 'User').trim().split(/\s+/)[0] || 'User';
    el('dashboardUserName').textContent = firstName;
  }
}

// Initialize dynamic date and greeting, and check every 30s across hour/midnight boundaries
updateDashboardHeader();
setInterval(updateDashboardHeader, 30000);

async function apiRequest(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
  } catch (networkErr) {
    const err = new Error('Unable to reach the server. Please check your internet connection.');
    err.status = 0;
    throw err;
  }

  let payload = null;
  const contentType = response.headers?.get('content-type') || '';
  if (response.status !== 204) {
    if (contentType.includes('application/json')) {
      try {
        payload = await response.json();
      } catch (jsonErr) {
        payload = null;
      }
    } else {
      try {
        const text = await response.text();
        payload = JSON.parse(text);
      } catch (textErr) {
        payload = null;
      }
    }
  }

  if (!response.ok) {
    let msg = payload?.error || payload?.message;
    if (!msg) {
      if (response.status === 401) msg = 'Invalid username/email or password.';
      else if (response.status === 403) msg = 'Access denied. Account not authorized.';
      else if (response.status === 429) msg = 'Too many attempts. Please wait a moment before trying again.';
      else if (response.status >= 500) msg = 'Server temporarily unavailable. Please try again shortly.';
      else msg = 'The request could not be completed.';
    }
    const err = new Error(msg);
    err.status = response.status;
    err.payload = payload;
    throw err;
  }
  return payload;
}

function showAuthCard(cardId) {
  const cards = ['loginCard', 'registerCard', 'unverifiedCard', 'forgotCard', 'resetCard'];
  cards.forEach(id => {
    const card = document.getElementById(id);
    if (card) card.style.display = (id === cardId) ? '' : 'none';
  });
  ['loginError', 'regError', 'forgotError', 'resetError'].forEach(id => {
    const err = document.getElementById(id);
    if (err) err.style.display = 'none';
  });
}

function showAuthAlert(type, title, message) {
  const alert = document.getElementById('authAlert');
  const icon = document.getElementById('authAlertIcon');
  const titleEl = document.getElementById('authAlertTitle');
  const msgEl = document.getElementById('authAlertMessage');
  if (!alert) return;

  alert.className = `auth-alert ${type}`;
  if (icon) icon.textContent = type === 'error' ? '⚠' : (type === 'info' ? 'ℹ' : '✓');
  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;
  alert.style.display = 'flex';
}

function hideAuthAlert() {
  const alert = document.getElementById('authAlert');
  if (alert) alert.style.display = 'none';
}

function setupPasswordToggles() {
  document.querySelectorAll('.password-toggle-btn').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      const targetId = this.dataset.target;
      const input = document.getElementById(targetId);
      if (!input) return;
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      const eyeOpen = this.querySelector('.eye-open');
      const eyeClosed = this.querySelector('.eye-closed');
      if (eyeOpen && eyeClosed) {
        eyeOpen.style.display = isPassword ? 'none' : '';
        eyeClosed.style.display = isPassword ? '' : 'none';
      }
    });
  });
}

async function checkAuthStatus() {
  const urlParams = new URLSearchParams(window.location.search);

  // Email verification successful
  if (urlParams.has('verified')) {
    const email = urlParams.get('email') || '';
    showAuthAlert('success', 'Email Verified!', 'Your email has been verified. You can now sign in to your workspace.');
    if (email) {
      const input = document.getElementById('loginIdentifier');
      if (input) input.value = email;
    }
    showAuthCard('loginCard');
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  // Token expired
  if (urlParams.get('error') === 'expired_token') {
    const email = urlParams.get('email') || '';
    if (email) {
      currentUnverifiedEmail = email;
      const display = document.getElementById('unverifiedEmailDisplay');
      if (display) display.textContent = email;
      showAuthAlert('error', 'Verification Link Expired', 'Your verification link has expired. Click below to request a fresh link.');
      showAuthCard('unverifiedCard');
    } else {
      showAuthAlert('error', 'Link Expired', 'Your verification link has expired. Please sign in or request a new link.');
    }
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  // Invalid token
  if (urlParams.get('error') === 'invalid_token') {
    showAuthAlert('error', 'Invalid Link', 'This verification link is invalid or has already been used.');
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  // Password reset token detection in URL
  if (urlParams.has('reset_token')) {
    const token = urlParams.get('reset_token');
    const tokenInput = document.getElementById('resetToken');
    if (tokenInput) tokenInput.value = token;
    showAuthCard('resetCard');
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  // Check for OAuth error parameters
  if (urlParams.has('error') && !['expired_token', 'invalid_token'].includes(urlParams.get('error'))) {
    const err = urlParams.get('error');
    const reason = urlParams.get('reason');
    showAuthAlert('error', 'Authentication Failed', reason || (err === 'auth_failed' ? 'Google authentication failed. Please try again.' : `Error: ${err}`));
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  try {
    const res = await fetch('/api/auth/status', { credentials: 'same-origin' });
    const data = await res.json();
    if (data.authenticated) {
      currentUser = data.user;
      showDashboard();
      if (window.location.hash === '#profile' || window.location.pathname === '/profile') {
        setTimeout(() => openView('profile'), 450);
      }
    } else {
      showLogin();
    }
  } catch (e) {
    showLogin();
  }
}

function showLogin() {
  const loginPage = document.getElementById('loginPage');
  const appShell = document.getElementById('appShell');
  loginPage.classList.remove('fade-out');
  loginPage.style.display = '';
  appShell.style.display = 'none';
  appShell.classList.remove('fade-in');
}

function showDashboard() {
  const loginPage = document.getElementById('loginPage');
  const appShell = document.getElementById('appShell');

  // Animate login out
  loginPage.classList.add('fade-out');
  setTimeout(() => {
    loginPage.style.display = 'none';
    appShell.style.display = '';
    appShell.classList.add('fade-in');

    // Update user info throughout the dashboard
    if (currentUser) {
      updateUserUI(currentUser);
    }

    loadCRMData().finally(renderAll);
  }, 400);
}

// ─── AUTH FORM INTERACTIONS ─────────────────────────────────────────

// Initialize Password Toggles & Rules
setupPasswordToggles();

/**
 * Interactive Live Password Requirement & Strength Validator
 * Validates 8+ chars, uppercase, lowercase, number, and calculates live strength meter
 */
function initPasswordValidator(inputId, prefix) {
  const input = document.getElementById(inputId);
  if (!input) return;

  const ruleLength = document.getElementById(prefix + 'RuleLength');
  const ruleUpper = document.getElementById(prefix + 'RuleUpper');
  const ruleLower = document.getElementById(prefix + 'RuleLower');
  const ruleNumber = document.getElementById(prefix + 'RuleNumber');
  const strengthFill = document.getElementById(prefix + 'StrengthFill');
  const strengthLabel = document.getElementById(prefix + 'StrengthLabel');

  function update() {
    const val = input.value;
    const isTouched = val.length > 0;

    const hasLength = val.length >= 8;
    const hasUpper = /[A-Z]/.test(val);
    const hasLower = /[a-z]/.test(val);
    const hasNumber = /[0-9]/.test(val);

    function updateItem(el, isValid) {
      if (!el) return;
      const icon = el.querySelector('.rule-icon');
      el.classList.remove('valid', 'invalid');
      if (!isTouched) {
        if (icon) icon.textContent = '○';
        return;
      }
      if (isValid) {
        el.classList.add('valid');
        if (icon) icon.textContent = '✓';
      } else {
        el.classList.add('invalid');
        if (icon) icon.textContent = '✕';
      }
    }

    updateItem(ruleLength, hasLength);
    updateItem(ruleUpper, hasUpper);
    updateItem(ruleLower, hasLower);
    updateItem(ruleNumber, hasNumber);

    // Calculate strength score
    if (!isTouched) {
      if (strengthFill) {
        strengthFill.style.width = '0%';
        strengthFill.className = 'strength-bar-fill';
      }
      if (strengthLabel) {
        strengthLabel.textContent = 'Enter password';
        strengthLabel.className = 'strength-label';
      }
      return;
    }

    let score = 0;
    if (hasLength) score += 25;
    if (hasUpper) score += 25;
    if (hasLower) score += 25;
    if (hasNumber) score += 25;
    if (val.length >= 12) score = Math.min(100, score + 10);
    if (/[^a-zA-Z0-9]/.test(val)) score = Math.min(100, score + 10);

    let level = 'weak';
    let text = 'Too weak';
    if (score >= 85) {
      level = 'strong';
      text = 'Strong & Secure';
    } else if (score >= 65) {
      level = 'good';
      text = 'Good';
    } else if (score >= 40) {
      level = 'fair';
      text = 'Fair';
    } else {
      level = 'weak';
      text = 'Too weak';
    }

    if (strengthFill) {
      strengthFill.style.width = score + '%';
      strengthFill.className = 'strength-bar-fill ' + level;
    }
    if (strengthLabel) {
      strengthLabel.textContent = text;
      strengthLabel.className = 'strength-label ' + level;
    }
  }

  input.addEventListener('input', update);
  input.addEventListener('focus', update);
  // Initial check
  update();
}

// Attach validator to Register and Reset Password fields
initPasswordValidator('regPassword', 'reg');
initPasswordValidator('resetNewPassword', 'reset');

// Card Navigation Switchers
document.getElementById('toRegisterBtn')?.addEventListener('click', () => { hideAuthAlert(); showAuthCard('registerCard'); });
document.getElementById('regToLoginBtn')?.addEventListener('click', () => { hideAuthAlert(); showAuthCard('loginCard'); });
document.getElementById('toForgotBtn')?.addEventListener('click', () => { hideAuthAlert(); showAuthCard('forgotCard'); });
document.getElementById('forgotToLoginBtn')?.addEventListener('click', () => { hideAuthAlert(); showAuthCard('loginCard'); });
document.getElementById('unverifiedToLoginBtn')?.addEventListener('click', () => { hideAuthAlert(); showAuthCard('loginCard'); });
document.getElementById('resetToLoginBtn')?.addEventListener('click', () => { hideAuthAlert(); showAuthCard('loginCard'); });
document.getElementById('authAlertClose')?.addEventListener('click', hideAuthAlert);

// Quick Demo Login Button Handler
document.getElementById('quickDemoLoginBtn')?.addEventListener('click', async function() {
  const btn = this;
  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = '⚡ Signing in as Aarav...';

  try {
    let data;
    try {
      data = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier: 'demoadmin', password: 'Password123' })
      });
    } catch (e) {
      data = await apiRequest('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Aarav Sharma',
          username: 'demoadmin',
          email: 'aarav@smartpay.in',
          password: 'Password123'
        })
      });
    }
    currentUser = data.user;
    showDashboard();
  } catch (err) {
    showAuthAlert('error', 'Demo Login Error', err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
});

// Instant Verification Button Handler
const instantVerifyBtn = document.getElementById('instantVerifyBtn');
if (instantVerifyBtn) {
  instantVerifyBtn.addEventListener('click', async function() {
    const email = currentUnverifiedEmail || document.getElementById('loginIdentifier')?.value.trim() || document.getElementById('regEmail')?.value.trim();
    if (!email) {
      showAuthAlert('error', 'Verification error', 'Please enter your email or username on the login card first.');
      showAuthCard('loginCard');
      return;
    }
    instantVerifyBtn.disabled = true;
    instantVerifyBtn.querySelector('.btn-text').textContent = 'Verifying...';
    instantVerifyBtn.querySelector('.btn-spinner').style.display = '';

    try {
      const data = await apiRequest('/api/auth/quick-verify', {
        method: 'POST',
        body: JSON.stringify({ email })
      });
      currentUser = data.user;
      showAuthAlert('success', 'Account Verified!', data.message || 'Your account is now fully active.');
      showDashboard();
      if (window.location.hash === '#profile' || window.location.pathname === '/profile') {
        setTimeout(() => openView('profile'), 450);
      }
    } catch (error) {
      showAuthAlert('error', 'Verification Failed', error.message);
    } finally {
      instantVerifyBtn.disabled = false;
      instantVerifyBtn.querySelector('.btn-text').textContent = '⚡ Instant Verify & Enter Dashboard';
      instantVerifyBtn.querySelector('.btn-spinner').style.display = 'none';
    }
  });
}

// Sign In Form Handler
const loginForm = document.getElementById('loginForm');
if (loginForm) {
  const loginIdentifierInput = document.getElementById('loginIdentifier');
  const loginPasswordInput = document.getElementById('loginPassword');
  const loginCardEl = document.getElementById('loginCard');
  const errBox = document.getElementById('loginError');
  const errText = document.getElementById('loginErrorText');

  function clearLoginErrors() {
    if (errBox) errBox.style.display = 'none';
    if (loginIdentifierInput) loginIdentifierInput.classList.remove('input-error');
    if (loginPasswordInput) loginPasswordInput.classList.remove('input-error');
    if (loginCardEl) loginCardEl.classList.remove('card-shake');
  }

  function displayLoginError(message, targetField = null) {
    if (errText) errText.textContent = message;
    if (errBox) errBox.style.display = 'flex';
    if (loginCardEl) {
      loginCardEl.classList.remove('card-shake');
      void loginCardEl.offsetWidth; // force browser DOM reflow to replay shake animation
      loginCardEl.classList.add('card-shake');
    }
    if (targetField && typeof targetField.focus === 'function') {
      targetField.classList.add('input-error');
      targetField.focus();
      if (typeof targetField.select === 'function') targetField.select();
    }
  }

  // Clear visual error cues when user types in either input
  [loginIdentifierInput, loginPasswordInput].forEach(inp => {
    if (!inp) return;
    inp.addEventListener('input', () => {
      inp.classList.remove('input-error');
      if (errBox && errBox.style.display !== 'none') {
        errBox.style.display = 'none';
      }
    });
  });

  loginForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    e.stopPropagation();

    const identifier = (loginIdentifierInput?.value || '').trim();
    const password = loginPasswordInput?.value || '';
    const rememberMe = document.getElementById('loginRememberMe')?.checked || false;
    const submitBtn = document.getElementById('loginSubmitBtn');

    clearLoginErrors();

    // Functional client-side validation
    if (!identifier) {
      displayLoginError('Please enter your username or email address.', loginIdentifierInput);
      return;
    }

    if (!password) {
      displayLoginError('Please enter your password.', loginPasswordInput);
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      const btnText = submitBtn.querySelector('.btn-text');
      const btnSpinner = submitBtn.querySelector('.btn-spinner');
      if (btnText) btnText.textContent = 'Verifying credentials...';
      if (btnSpinner) btnSpinner.style.display = '';
    }

    try {
      const data = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password, rememberMe })
      });

      currentUser = data.user;
      showDashboard();
      if (window.location.hash === '#profile' || window.location.pathname === '/profile') {
        setTimeout(() => openView('profile'), 450);
      }
    } catch (error) {
      // Functional rejection of invalid credentials without page crash
      if (error.payload?.error === 'unverified') {
        currentUnverifiedEmail = error.payload.email || identifier;
        const display = document.getElementById('unverifiedEmailDisplay');
        if (display) display.textContent = currentUnverifiedEmail;
        showAuthCard('unverifiedCard');
      } else {
        const errorMsg = error.message || 'Invalid username/email or password.';
        if (loginIdentifierInput) loginIdentifierInput.classList.add('input-error');
        displayLoginError(errorMsg, loginPasswordInput);
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        const btnText = submitBtn.querySelector('.btn-text');
        const btnSpinner = submitBtn.querySelector('.btn-spinner');
        if (btnText) btnText.textContent = 'Sign in';
        if (btnSpinner) btnSpinner.style.display = 'none';
      }
    }
  });
}

// Registration Form Handler
const registerForm = document.getElementById('registerForm');
if (registerForm) {
  registerForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    const name = document.getElementById('regName').value.trim();
    const username = document.getElementById('regUsername').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    const submitBtn = document.getElementById('regSubmitBtn');
    const errBox = document.getElementById('regError');
    const errText = document.getElementById('regErrorText');

    if (errBox) errBox.style.display = 'none';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.querySelector('.btn-text').textContent = 'Registering...';
      submitBtn.querySelector('.btn-spinner').style.display = '';
    }

    try {
      const data = await apiRequest('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, username, email, password })
      });

      if (data.authenticated && data.user) {
        // Linked Google account or auto-verified account logged in directly
        currentUser = data.user;
        showAuthAlert('success', 'Welcome!', data.message || 'Account ready and signed in.');
        showDashboard();
        return;
      }

      currentUnverifiedEmail = data.email || email;
      const display = document.getElementById('unverifiedEmailDisplay');
      if (display) display.textContent = currentUnverifiedEmail;

      showAuthAlert('success', 'Registration Successful!', 'We sent a verification link to your email. Please click it to verify your account.');
      showAuthCard('unverifiedCard');
    } catch (error) {
      if (errText) errText.textContent = error.message;
      if (errBox) errBox.style.display = 'flex';
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.querySelector('.btn-text').textContent = 'Register & Send Verification';
        submitBtn.querySelector('.btn-spinner').style.display = 'none';
      }
    }
  });
}

// Resend Verification Email Handler
const resendBtn = document.getElementById('resendVerificationBtn');
let resendTimer = null;

if (resendBtn) {
  resendBtn.addEventListener('click', async function() {
    const statusBox = document.getElementById('resendStatus');
    const targetEmail = currentUnverifiedEmail || document.getElementById('unverifiedEmailDisplay')?.textContent.trim() || document.getElementById('loginIdentifier')?.value.trim() || document.getElementById('regEmail')?.value.trim();
    if (!targetEmail || targetEmail === 'user@company.com') {
      if (statusBox) {
        statusBox.textContent = '⚠ Please enter your email on the login card first.';
        statusBox.style.display = '';
      }
      return;
    }

    resendBtn.disabled = true;
    resendBtn.textContent = 'Sending email...';
    if (statusBox) statusBox.style.display = 'none';

    try {
      const res = await apiRequest('/api/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email: targetEmail })
      });

      if (statusBox) {
        statusBox.textContent = '✓ Fresh verification email sent! Please check your inbox.';
        statusBox.style.display = '';
      }

      // 60-second cooldown timer
      let timeLeft = 60;
      resendBtn.textContent = `Resend available in ${timeLeft}s`;
      clearInterval(resendTimer);
      resendTimer = setInterval(() => {
        timeLeft -= 1;
        if (timeLeft <= 0) {
          clearInterval(resendTimer);
          resendBtn.disabled = false;
          resendBtn.textContent = 'Resend Verification Email';
        } else {
          resendBtn.textContent = `Resend available in ${timeLeft}s`;
        }
      }, 1000);
    } catch (error) {
      resendBtn.disabled = false;
      resendBtn.textContent = 'Resend Verification Email';
      if (statusBox) {
        statusBox.textContent = `⚠ ${error.message}`;
        statusBox.style.display = '';
      }
    }
  });
}

// Forgot Password Form Handler
const forgotForm = document.getElementById('forgotForm');
if (forgotForm) {
  forgotForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    const email = document.getElementById('forgotEmail').value.trim();
    const submitBtn = document.getElementById('forgotSubmitBtn');
    const errBox = document.getElementById('forgotError');
    const errText = document.getElementById('forgotErrorText');

    if (errBox) errBox.style.display = 'none';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.querySelector('.btn-text').textContent = 'Sending...';
      submitBtn.querySelector('.btn-spinner').style.display = '';
    }

    try {
      const data = await apiRequest('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email })
      });
      showAuthAlert('info', 'Check your inbox', data.message || 'If an account exists with that email, a password reset link has been sent.');
      showAuthCard('loginCard');
    } catch (error) {
      if (errText) errText.textContent = error.message;
      if (errBox) errBox.style.display = 'flex';
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.querySelector('.btn-text').textContent = 'Send reset link';
        submitBtn.querySelector('.btn-spinner').style.display = 'none';
      }
    }
  });
}

// Reset Password Form Handler
const resetForm = document.getElementById('resetForm');
if (resetForm) {
  resetForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    const token = document.getElementById('resetToken').value.trim();
    const newPassword = document.getElementById('resetNewPassword').value;
    const confirmPassword = document.getElementById('resetConfirmPassword').value;
    const submitBtn = document.getElementById('resetSubmitBtn');
    const errBox = document.getElementById('resetError');
    const errText = document.getElementById('resetErrorText');

    if (newPassword !== confirmPassword) {
      if (errText) errText.textContent = 'Passwords do not match.';
      if (errBox) errBox.style.display = 'flex';
      return;
    }

    if (errBox) errBox.style.display = 'none';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.querySelector('.btn-text').textContent = 'Updating...';
      submitBtn.querySelector('.btn-spinner').style.display = '';
    }

    try {
      const data = await apiRequest('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword })
      });
      showAuthAlert('success', 'Password Updated!', data.message || 'You can now log in with your new password.');
      showAuthCard('loginCard');
    } catch (error) {
      if (errText) errText.textContent = error.message;
      if (errBox) errBox.style.display = 'flex';
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.querySelector('.btn-text').textContent = 'Set new password';
        submitBtn.querySelector('.btn-spinner').style.display = 'none';
      }
    }
  });
}

// ─── USER MENU & LOGOUT INTERACTIONS ─────────────────────────────────

const userMenuBtn = document.getElementById('userMenuBtn');
const sidebarUser = document.getElementById('sidebarUser');
const userMenuPopover = document.getElementById('userMenuPopover');
const logoutBtn = document.getElementById('logoutBtn');
const menuSettingsBtn = document.getElementById('menuSettingsBtn');

function toggleUserMenu(e) {
  if (e) e.stopPropagation();
  if (!userMenuPopover) return;
  const isVisible = userMenuPopover.classList.toggle('visible');
  if (userMenuBtn) userMenuBtn.classList.toggle('active', isVisible);
}

function closeUserMenu() {
  if (userMenuPopover) userMenuPopover.classList.remove('visible');
  if (userMenuBtn) userMenuBtn.classList.remove('active');
}

// Clicking three dots button toggles menu
if (userMenuBtn) {
  userMenuBtn.addEventListener('click', toggleUserMenu);
}

// Clicking sidebar user area (avatar or name) opens Profile view
const sidebarUserClickable = document.getElementById('sidebarUserClickable');
if (sidebarUserClickable) {
  sidebarUserClickable.addEventListener('click', function(e) {
    e.stopPropagation();
    closeUserMenu();
    openView('profile');
  });
}

// User popover header click opens Profile view
const userMenuHeader = document.getElementById('userMenuHeader');
if (userMenuHeader) {
  userMenuHeader.addEventListener('click', function(e) {
    e.stopPropagation();
    closeUserMenu();
    openView('profile');
  });
}

// My Profile button in popover
const menuProfileBtn = document.getElementById('menuProfileBtn');
if (menuProfileBtn) {
  menuProfileBtn.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    closeUserMenu();
    openView('profile');
  });
}

// Dashboard greeting username click opens Profile view
const dashboardUserName = document.getElementById('dashboardUserName');
if (dashboardUserName) {
  dashboardUserName.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    openView('profile');
  });
}

// Prevent click inside popover from unintentionally bubbling to parent
if (userMenuPopover) {
  userMenuPopover.addEventListener('click', function(e) {
    e.stopPropagation();
  });
}

// Close user menu on outside clicks
document.addEventListener('click', function(e) {
  if (userMenuPopover && userMenuPopover.classList.contains('visible')) {
    if (!e.target.closest('#userMenuPopover') && !e.target.closest('#userMenuBtn')) {
      closeUserMenu();
    }
  }
});

// Close user menu on Escape key
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && userMenuPopover && userMenuPopover.classList.contains('visible')) {
    closeUserMenu();
  }
});

// Settings button inside user popover
if (menuSettingsBtn) {
  menuSettingsBtn.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    closeUserMenu();
    openView('settings');
    if (typeof renderSettings === 'function') {
      renderSettings();
    }
  });
}

// Complete Log out action
async function performLogout(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  closeUserMenu();

  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' }
    });
  } catch (err) {
    console.warn('Logout request warning:', err);
  }

  // Clear client session state
  currentUser = null;

  // Reset login form fields and errors
  const emailInput = document.getElementById('loginIdentifier') || document.getElementById('loginEmail');
  const passInput = document.getElementById('loginPassword');
  const errBox = document.getElementById('loginError');
  if (emailInput) emailInput.value = '';
  if (passInput) passInput.value = '';
  if (errBox) errBox.style.display = 'none';

  // Immediately display login screen for instant responsiveness
  showLogin();

  // Also navigate to /api/auth/logout to ensure HTTP-only cookie is cleared across all browsers
  window.location.href = '/api/auth/logout';
}

if (logoutBtn) {
  logoutBtn.addEventListener('click', performLogout);
}

// ─── CRM STATE ──────────────────────────────────────────────────────

const state = {
  activeView: 'dashboard',
  companyTab: 'overview',
  taskFilter: 'open',
  pendingMove: null,
  activeLetterType: null,
  followupTab: 'overdue',
  editingProductId: null,
  quotationLineItems: [],
  invoiceLineItems: [],
  analytics: null,
  teams: [],
  hierarchy: null,
  commissions: [],
  commSummary: null,
  commissionRules: [],
  targets: [],
  targetAttainment: null,
  purchase_orders: [
    { id: 1, po_number: 'PO-RZP-2026-004', quotation_id: 1, deal_id: 2, company_id: 1, company_name: 'RazorpayX Partners', deal_title: 'Payment gateway expansion', quotation_number: 'QTN-2026-001', amount: 507400, status: 'verified', issue_date: '2026-09-02', delivery_date: '2026-09-20', notes: 'PO for Payment Gateway expansion' },
    { id: 2, po_number: 'PO-MSH-2026-018', quotation_id: null, deal_id: 8, company_id: 5, company_name: 'Meesho Retail', deal_title: 'Express checkout', quotation_number: '—', amount: 810000, status: 'received', issue_date: '2026-09-08', delivery_date: '2026-10-01', notes: 'Express checkout enterprise module' }
  ],
  invoices: [
    { id: 1, invoice_number: 'INV-2026-001', po_id: 1, quotation_id: 1, deal_id: 2, company_id: 1, company_name: 'RazorpayX Partners', deal_title: 'Payment gateway expansion', po_number: 'PO-RZP-2026-004', status: 'paid', issue_date: '2026-09-03', due_date: '2026-09-18', subtotal: 430000, discount_percent: 0, tax_percent: 18, total: 507400, amount_paid: 507400, balance_due: 0, notes: 'Full payment received via NEFT', terms: 'Net 15 days' },
    { id: 2, invoice_number: 'INV-2026-002', po_id: null, quotation_id: 2, deal_id: 4, company_id: 3, company_name: 'Groww Wealth', deal_title: 'Merchant onboarding', po_number: '—', status: 'partial', issue_date: '2026-09-05', due_date: '2026-09-25', subtotal: 520000, discount_percent: 5, tax_percent: 18, total: 582760, amount_paid: 300000, balance_due: 282760, notes: 'Advance received; balance on delivery', terms: '50% advance, balance Net 30' },
    { id: 3, invoice_number: 'INV-2026-003', po_id: null, quotation_id: null, deal_id: 1, company_id: 2, company_name: 'Urban Company', deal_title: 'Marketplace payouts', po_number: '—', status: 'overdue', issue_date: '2026-08-15', due_date: '2026-08-30', subtotal: 350000, discount_percent: 0, tax_percent: 18, total: 413000, amount_paid: 0, balance_due: 413000, notes: 'Payment reminder sent to Rahul Mehta', terms: 'Net 15 days' },
    { id: 4, invoice_number: 'INV-2026-004', po_id: 2, quotation_id: null, deal_id: 8, company_id: 5, company_name: 'Meesho Retail', deal_title: 'Express checkout', po_number: 'PO-MSH-2026-018', status: 'sent', issue_date: '2026-09-09', due_date: '2026-09-24', subtotal: 686440, discount_percent: 0, tax_percent: 18, total: 810000, amount_paid: 0, balance_due: 810000, notes: 'Express checkout deployment invoice', terms: 'Net 15 days' }
  ],
  payments: [
    { id: 1, payment_number: 'PAY-2026-001', invoice_id: 1, company_id: 1, amount: 507400, payment_date: '2026-09-04', payment_method: 'bank_transfer', reference_number: 'NEFT/HDFC/202609041234', notes: 'Full settlement for INV-2026-001' },
    { id: 2, payment_number: 'PAY-2026-002', invoice_id: 2, company_id: 3, amount: 300000, payment_date: '2026-09-06', payment_method: 'upi', reference_number: 'UPI/GROWW/202609069876', notes: 'Advance tranche 1' }
  ],
  companies: [
    { id: 1, name: 'RazorpayX Partners', initial: 'R', logo: 'purple-logo', industry: 'Fintech', owner: 'Aarav Sharma', status: 'active', deals: 2, activity: 'Today, 10:40 AM', created: 8, tags: ['high value'] },
    { id: 2, name: 'Urban Company', initial: 'U', logo: 'logo-cyan', industry: 'SaaS', owner: 'Aarav Sharma', status: 'active', deals: 1, activity: 'Today, 9:15 AM', created: 5, tags: ['at risk'] },
    { id: 3, name: 'Groww Wealth', initial: 'G', logo: 'logo-blue', industry: 'Fintech', owner: 'Priya Menon', status: 'lead', deals: 1, activity: 'Yesterday', created: 12, tags: ['high value'] },
    { id: 4, name: 'Practo Health', initial: 'P', logo: 'logo-orange', industry: 'Healthcare', owner: 'Kunal Shah', status: 'lead', deals: 1, activity: '28 Aug', created: 2, tags: ['referral'] },
    { id: 5, name: 'Meesho Retail', initial: 'M', logo: 'logo-green', industry: 'Retail', owner: 'Aarav Sharma', status: 'active', deals: 2, activity: '26 Aug', created: 3, tags: ['high value'] },
    { id: 6, name: 'Niyo Solutions', initial: 'N', logo: 'purple-logo', industry: 'Fintech', owner: 'Priya Menon', status: 'lead', deals: 1, activity: '24 Aug', created: 9, tags: [] },
    { id: 7, name: 'Licious Foods', initial: 'L', logo: 'logo-orange', industry: 'Retail', owner: 'Kunal Shah', status: 'active', deals: 0, activity: '21 Aug', created: 4, tags: ['referral'] },
    { id: 8, name: 'CleverTap', initial: 'C', logo: 'logo-blue', industry: 'SaaS', owner: 'Aarav Sharma', status: 'churned', deals: 0, activity: '12 Aug', created: 7, tags: ['at risk'] }
  ],
  deals: [
    { id: 1, title: 'Marketplace payouts', company: 'Urban Company', value: 680000, stage: 'New Lead', probability: 10, owner: 'Aarav Sharma', due: 'Sep 24', month: 'September', tag: 'at risk', deal_type: 'new_business' },
    { id: 2, title: 'Payment gateway expansion', company: 'RazorpayX Partners', value: 800000, stage: 'Proposal Sent', probability: 50, owner: 'Aarav Sharma', due: 'Sep 18', month: 'September', tag: 'high value', deal_type: 'new_business' },
    { id: 3, title: 'UPI Autopay upgrade', company: 'RazorpayX Partners', value: 450000, stage: 'Negotiation', probability: 75, owner: 'Aarav Sharma', due: 'Sep 28', month: 'September', tag: 'high value', deal_type: 'upsell' },
    { id: 4, title: 'Merchant onboarding', company: 'Groww Wealth', value: 520000, stage: 'Qualified', probability: 25, owner: 'Priya Menon', due: 'Sep 22', month: 'September', tag: 'high value', deal_type: 'new_business' },
    { id: 5, title: 'Subscription payments', company: 'Meesho Retail', value: 370000, stage: 'Proposal Sent', probability: 50, owner: 'Aarav Sharma', due: 'Oct 05', month: 'October', tag: 'high value', deal_type: 'new_business' },
    { id: 6, title: 'Healthcare collections', company: 'Practo Health', value: 250000, stage: 'Qualified', probability: 25, owner: 'Kunal Shah', due: 'Oct 12', month: 'October', tag: 'referral', deal_type: 'new_business' },
    { id: 7, title: 'Multi-store settlement', company: 'Niyo Solutions', value: 290000, stage: 'New Lead', probability: 10, owner: 'Priya Menon', due: 'Oct 16', month: 'October', tag: '', deal_type: 'new_business' },
    { id: 8, title: 'Express checkout', company: 'Meesho Retail', value: 810000, stage: 'Negotiation', probability: 75, owner: 'Aarav Sharma', due: 'Sep 30', month: 'September', tag: 'high value', deal_type: 'new_business' },
    { id: 9, title: 'Enterprise payouts', company: 'Licious Foods', value: 330000, stage: 'Qualified', probability: 25, owner: 'Kunal Shah', due: 'Oct 20', month: 'October', tag: 'referral', deal_type: 'new_business' }
  ],
  tasks: [
    { id: 1, title: 'Send revised proposal', company: 'Urban Company', due: 'Overdue · Aug 30', bucket: 'overdue', priority: 'high', done: false, assignee: 'Aarav Sharma' },
    { id: 2, title: 'Call Neha about final approval', company: 'RazorpayX Partners', due: 'Today · 2:00 PM', bucket: 'today', priority: 'high', done: false, assignee: 'Aarav Sharma' },
    { id: 3, title: 'Update discovery notes', company: 'Groww Wealth', due: 'Today · 4:30 PM', bucket: 'today', priority: 'medium', done: false, assignee: 'Aarav Sharma' },
    { id: 4, title: 'Share onboarding checklist', company: 'Meesho Retail', due: 'Today · 5:00 PM', bucket: 'today', priority: 'medium', done: false, assignee: 'Aarav Sharma' },
    { id: 5, title: 'Prepare negotiation brief', company: 'RazorpayX Partners', due: 'Tomorrow', bucket: 'week', priority: 'high', done: false, assignee: 'Aarav Sharma' },
    { id: 6, title: 'Schedule demo with finance', company: 'Practo Health', due: 'Wed, Sep 3', bucket: 'week', priority: 'medium', done: false, assignee: 'Kunal Shah' },
    { id: 7, title: 'Review contract amendment', company: 'Groww Wealth', due: 'Thu, Sep 4', bucket: 'week', priority: 'low', done: false, assignee: 'Priya Menon' },
    { id: 8, title: 'Confirm tax setup', company: 'RazorpayX Partners', due: 'Fri, Aug 29', bucket: 'done', priority: 'medium', done: true, assignee: 'Aarav Sharma' }
  ],
  activities: [
    { type: 'call', icon: '☎', text: '<strong>Call with Neha Agarwal</strong> at RazorpayX Partners · Discussed procurement sign-off for the gateway expansion.', time: '20 min ago' },
    { type: 'email', icon: '✉', text: '<strong>Sent proposal</strong> to Rahul Mehta at Urban Company · Marketplace payout pricing and rollout plan.', time: '1 hr ago' },
    { type: 'meeting', icon: '▣', text: '<strong>Demo meeting completed</strong> with Groww Wealth · Added discovery notes and next steps.', time: 'Yesterday' },
    { type: 'note', icon: '▤', text: '<strong>Added account note</strong> for Meesho Retail · Legal review is expected by Thursday.', time: 'Yesterday' }
  ],
  stages: [
    { name: 'New Lead', probability: 10, color: '#8fa1bb' },
    { name: 'Qualified', probability: 25, color: '#38a9b8' },
    { name: 'Proposal Sent', probability: 50, color: '#4c84d9' },
    { name: 'Negotiation', probability: 75, color: '#315fba' },
    { name: 'Won', probability: 100, color: '#29a56b' }
  ],
  contacts: [
    { name: 'Neha Agarwal', initials: 'NA', title: 'VP, Partnerships', email: 'neha.agarwal@razorpay.com', phone: '+91 98765 34021', primary: true, company_name: 'RazorpayX Partners' },
    { name: 'Rohan Kulkarni', initials: 'RK', title: 'Director, Finance', email: 'rohan.k@razorpay.com', phone: '+91 98210 14920', primary: false, company_name: 'RazorpayX Partners' },
    { name: 'Maya Singh', initials: 'MS', title: 'Procurement Manager', email: 'maya.singh@razorpay.com', phone: '+91 99234 89070', primary: false, company_name: 'RazorpayX Partners' }
  ],
  products: [
    { id: 1, name: 'Payment Gateway License', sku: 'SP-PG-001', description: 'Full-featured payment gateway with multi-currency support', unit_price: 250000, currency: 'INR', category: 'Gateway', is_active: true },
    { id: 2, name: 'UPI Integration Module', sku: 'SP-UPI-001', description: 'UPI Collect, Autopay, and QR code payment integration', unit_price: 150000, currency: 'INR', category: 'Integration', is_active: true },
    { id: 3, name: 'API Access — Enterprise Tier', sku: 'SP-API-003', description: 'Unlimited API calls, dedicated support, SLA guarantee', unit_price: 480000, currency: 'INR', category: 'API', is_active: true },
    { id: 4, name: 'Merchant Onboarding Suite', sku: 'SP-MOS-001', description: 'Digital KYC, sub-merchant management, and compliance tools', unit_price: 320000, currency: 'INR', category: 'Onboarding', is_active: true },
    { id: 5, name: 'Payout & Settlement Engine', sku: 'SP-PAY-001', description: 'Automated bulk payouts, instant settlements, reconciliation', unit_price: 420000, currency: 'INR', category: 'Payout', is_active: true },
    { id: 6, name: 'Checkout SDK', sku: 'SP-CHK-001', description: 'Embeddable checkout widget with smart payment routing', unit_price: 180000, currency: 'INR', category: 'Gateway', is_active: true },
    { id: 7, name: 'Annual Support & Maintenance', sku: 'SP-SUP-001', description: '24/7 priority support, quarterly reviews, uptime SLA', unit_price: 120000, currency: 'INR', category: 'Support', is_active: true },
    { id: 8, name: 'Fraud Detection Add-on', sku: 'SP-FRD-001', description: 'AI-powered fraud detection with real-time risk scoring', unit_price: 280000, currency: 'INR', category: 'Security', is_active: true }
  ],
  quotations: [
    { id: 1, quotation_number: 'QTN-2026-001', deal_id: 2, company_id: 1, company_name: 'RazorpayX Partners', deal_title: 'Payment gateway expansion', status: 'sent', valid_until: '2026-09-30', subtotal: 430000, discount_percent: 0, tax_percent: 18, total: 507400, notes: 'Payment gateway expansion — Phase 1', terms: 'Net 30 days from acceptance' },
    { id: 2, quotation_number: 'QTN-2026-002', deal_id: 4, company_id: 3, company_name: 'Groww Wealth', deal_title: 'Merchant onboarding', status: 'draft', valid_until: '2026-10-15', subtotal: 520000, discount_percent: 5, tax_percent: 18, total: 582760, notes: 'Merchant onboarding suite for Groww', terms: 'Net 30 days from acceptance' }
  ]
};

async function loadCRMData() {
  try {
    const [crmRes, prodRes, qtnRes, invRes, poRes, analRes, teamsRes, hierRes, commRes, commSumRes, commRulesRes, targetsRes, attRes, leadsRes, renewalsRes, autoRes, docsRes, apprRes, tplRes, notifRes] = await Promise.allSettled([
      apiRequest('/api/crm'),
      apiRequest('/api/products?limit=100'),
      apiRequest('/api/quotations?limit=100'),
      apiRequest('/api/invoices?limit=100'),
      apiRequest('/api/purchase-orders?limit=100'),
      apiRequest('/api/analytics/dashboard'),
      apiRequest('/api/teams'),
      apiRequest('/api/teams/hierarchy'),
      apiRequest('/api/commissions'),
      apiRequest('/api/commissions/summary'),
      apiRequest('/api/commissions/rules'),
      apiRequest('/api/targets'),
      apiRequest('/api/targets/attainment'),
      apiRequest('/api/leads?limit=100'),
      apiRequest('/api/renewals'),
      apiRequest('/api/automations'),
      apiRequest('/api/documents'),
      apiRequest('/api/approvals'),
      apiRequest('/api/templates'),
      apiRequest('/api/notifications')
    ]);

    if (crmRes.status === 'fulfilled' && crmRes.value) {
      const data = crmRes.value;
      ['companies', 'deals', 'tasks', 'contacts', 'activities', 'letters', 'stages', 'leads', 'renewals', 'communications', 'email_templates', 'automations', 'documents', 'approvals'].forEach(key => {
        if (Array.isArray(data[key])) state[key] = data[key];
      });
    }
    if (prodRes.status === 'fulfilled' && prodRes.value) {
      const val = prodRes.value.data || prodRes.value;
      if (Array.isArray(val)) state.products = val;
    }
    if (qtnRes.status === 'fulfilled' && qtnRes.value) {
      const val = qtnRes.value.data || qtnRes.value;
      if (Array.isArray(val)) state.quotations = val;
    }
    if (invRes.status === 'fulfilled' && invRes.value) {
      const val = invRes.value.data || invRes.value;
      if (Array.isArray(val)) state.invoices = val;
    }
    if (poRes.status === 'fulfilled' && poRes.value) {
      const val = poRes.value.data || poRes.value;
      if (Array.isArray(val)) state.purchase_orders = val;
    }
    if (analRes.status === 'fulfilled' && analRes.value) {
      state.analytics = analRes.value;
    }
    if (teamsRes.status === 'fulfilled' && teamsRes.value) {
      const val = teamsRes.value.data || teamsRes.value;
      if (Array.isArray(val)) state.teams = val;
    }
    if (hierRes.status === 'fulfilled' && hierRes.value) {
      const val = hierRes.value.data || hierRes.value;
      if (Array.isArray(val)) state.hierarchy = val;
    }
    if (commRes.status === 'fulfilled' && commRes.value) {
      const val = commRes.value.data || commRes.value;
      if (Array.isArray(val)) state.commissions = val;
    }
    if (commSumRes.status === 'fulfilled' && commSumRes.value) {
      state.commSummary = commSumRes.value.data || commSumRes.value || state.commSummary;
    }
    if (commRulesRes.status === 'fulfilled' && commRulesRes.value) {
      const val = commRulesRes.value.data || commRulesRes.value;
      if (Array.isArray(val)) state.commissionRules = val;
    }
    if (targetsRes.status === 'fulfilled' && targetsRes.value) {
      const val = targetsRes.value.data || targetsRes.value;
      if (Array.isArray(val)) state.targets = val;
    }
    if (attRes.status === 'fulfilled' && attRes.value) {
      state.targetAttainment = attRes.value.data || attRes.value || state.targetAttainment;
    }
    if (leadsRes.status === 'fulfilled' && leadsRes.value) {
      const val = leadsRes.value.data || leadsRes.value;
      if (Array.isArray(val)) state.leads = val;
    }
    if (renewalsRes.status === 'fulfilled' && renewalsRes.value) {
      const val = renewalsRes.value.data || renewalsRes.value;
      if (Array.isArray(val)) state.renewals = val;
    }
    if (autoRes.status === 'fulfilled' && autoRes.value) {
      const val = autoRes.value.data || autoRes.value;
      if (Array.isArray(val)) state.automations = val;
    }
    if (docsRes.status === 'fulfilled' && docsRes.value) {
      const val = docsRes.value.data || docsRes.value;
      if (Array.isArray(val)) state.documents = val;
    }
    if (apprRes.status === 'fulfilled' && apprRes.value) {
      const val = apprRes.value.data || apprRes.value;
      if (Array.isArray(val)) state.approvals = val;
    }
    if (tplRes.status === 'fulfilled' && tplRes.value) {
      const val = tplRes.value.data || tplRes.value;
      if (Array.isArray(val)) state.email_templates = val;
    }
    if (notifRes.status === 'fulfilled' && notifRes.value) {
      const val = notifRes.value.data || notifRes.value;
      if (Array.isArray(val)) state.notifications = val;
      renderNotifications();
    }
  } catch (error) {
    console.warn('CRM API unavailable:', error.message);
  }
}

async function createCRMRecord(resource, attributes) {
  return apiRequest(`/api/crm/${resource}`, { method: 'POST', body: JSON.stringify(attributes) });
}

async function updateCRMRecord(resource, id, attributes) {
  return apiRequest(`/api/crm/${resource}/${id}`, { method: 'PATCH', body: JSON.stringify(attributes) });
}

// ─── PRODUCT, QUOTATION, INVOICE & PO API HELPERS ──────────────────

async function createProductRecord(attributes) {
  return apiRequest('/api/products', { method: 'POST', body: JSON.stringify(attributes) });
}

async function updateProductRecord(id, attributes) {
  return apiRequest(`/api/products/${id}`, { method: 'PUT', body: JSON.stringify(attributes) });
}

async function deleteProductRecord(id) {
  return apiRequest(`/api/products/${id}`, { method: 'DELETE' });
}

async function createQuotationRecord(attributes) {
  return apiRequest('/api/quotations', { method: 'POST', body: JSON.stringify(attributes) });
}

async function sendQuotationEmailRequest(id) {
  return apiRequest(`/api/quotations/${id}/send`, { method: 'POST' });
}

async function createInvoiceRecord(attributes) {
  return apiRequest('/api/invoices', { method: 'POST', body: JSON.stringify(attributes) });
}

async function recordInvoicePaymentRequest(invoiceId, attributes) {
  return apiRequest(`/api/invoices/${invoiceId}/payments`, { method: 'POST', body: JSON.stringify(attributes) });
}

async function sendInvoiceEmailRequest(invoiceId, recipientEmail) {
  return apiRequest(`/api/invoices/${invoiceId}/send`, { method: 'POST', body: JSON.stringify({ to: recipientEmail }) });
}

async function createPoRecord(attributes) {
  return apiRequest('/api/purchase-orders', { method: 'POST', body: JSON.stringify(attributes) });
}

// ─── HELPERS ────────────────────────────────────────────────────────

const money = value => {
  if (value === undefined || value === null || isNaN(Number(value))) return '₹0';
  const num = Number(value);
  if (num >= 10000000) return `₹${(num / 10000000).toFixed(2)}Cr`;
  if (num >= 100000) return `₹${(num / 100000).toFixed(num % 100000 ? 1 : 0)}L`;
  if (num >= 1000) return `₹${(num / 1000).toFixed(num % 1000 ? 1 : 0)}k`;
  return `₹${num.toLocaleString('en-IN')}`;
};

const displayDate = value => value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : 'Today';

// ─── VIEW MANAGEMENT ───────────────────────────────────────────────

function openView(view) {
  const targetView = (view === 'companies') ? 'customers' : view;
  state.activeView = targetView;
  if (typeof updateIkNowContext === 'function') updateIkNowContext(targetView);
  document.querySelectorAll('.view').forEach(node => node.classList.toggle('active', node.id === `${targetView}-view`));
  document.querySelectorAll('.nav-link[data-view]').forEach(node => node.classList.toggle('active', node.dataset.view === view || node.dataset.view === targetView));
  if (el('sidebar')) el('sidebar').classList.remove('open');
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (targetView === 'customers') {
    renderCustomers();
  } else if (targetView === 'profile') {
    if (window.location.hash !== '#profile') {
      window.history.pushState(null, '', '#profile');
    }
    renderProfile();
  } else if (window.location.hash === '#profile') {
    window.history.pushState(null, '', '#');
  }

  // Toggle letters submenu
  const submenu = el('lettersSubmenu');
  if (targetView === 'letters') {
    if (submenu) submenu.classList.add('visible');
    if (el('letterGenerator')) el('letterGenerator').style.display = 'none';
    const hub = document.querySelector('.letters-hub');
    if (hub) hub.style.display = '';
    loadLettersHistory();
  } else {
    if (submenu) submenu.classList.remove('visible');
  }

  if (targetView === 'products') {
    renderProducts();
  } else if (targetView === 'quotations') {
    renderQuotations();
  } else if (targetView === 'invoices') {
    renderInvoices();
  } else if (targetView === 'purchase_orders') {
    renderPurchaseOrders();
  } else if (targetView === 'dashboard') {
    renderEnhancedDashboard();
  } else if (targetView === 'notifications') {
    renderNotifications();
  } else if (targetView === 'automations') {
    renderAutomations();
  } else if (targetView === 'approvals') {
    renderApprovals();
  }
}

// ─── RENDER FUNCTIONS ───────────────────────────────────────────────

function pipelineStats() {
  const active = state.deals.filter(d => !['Won', 'Lost'].includes(d.stage));
  return { value: active.reduce((sum, d) => sum + d.value, 0), forecast: active.reduce((sum, d) => sum + d.value * d.probability / 100, 0) };
}

function renderTotals() {
  const totals = pipelineStats();
  ['pipelineTotal', 'pipelineHeadline'].forEach(id => { if (el(id)) el(id).textContent = money(totals.value); });
  ['forecastTotal', 'forecastHeadline'].forEach(id => { if (el(id)) el(id).textContent = money(totals.forecast); });
  const open = state.tasks.filter(t => !t.done && t.assignee === 'Aarav Sharma').length;
  if (el('tasksTotal')) el('tasksTotal').textContent = String(open).padStart(2, '0');
  if (el('openTaskCount')) el('openTaskCount').textContent = String(open).padStart(2, '0');
  document.querySelectorAll('.alert-count').forEach(n => n.textContent = state.tasks.filter(t => !t.done && t.bucket === 'overdue').length);
}

function renderStageChart() {
  const chartEl = el('stageChart');
  if (!chartEl) return;
  const stages = state.stages.slice(0, 4);
  const values = stages.map(s => state.deals.filter(d => d.stage === s.name).reduce((sum, d) => sum + d.value, 0));
  const max = Math.max(...values, 1);
  chartEl.innerHTML = stages.map((s, i) => {
    const value = values[i], forecast = value * s.probability / 100;
    return `<div class="stage-col"><span class="stage-amount">${money(value)}</span><div class="stage-bars"><i style="height:${Math.max(9, value / max * 100)}%"></i><i class="forecast" style="height:${Math.max(7, forecast / max * 100)}%"></i></div><small>${s.name.replace(' ', '<br>')}</small></div>`;
  }).join('');
}

function taskRow(task, full = false) {
  const dueClass = task.bucket === 'overdue' ? 'due-overdue' : task.bucket === 'today' ? 'due-today' : 'due-soon';
  return `<div class="task-row ${task.done ? 'done' : ''}" data-task-id="${task.id}"><input class="task-check" type="checkbox" ${task.done ? 'checked' : ''} aria-label="Mark ${task.title} done" /><div class="task-copy">${full ? `<span class="priority ${task.priority}">${task.priority}</span>` : ''}<div><strong>${task.title}</strong><small>${task.company}</small></div></div>${full ? `<span class="task-company">${task.assignee}</span>` : ''}<span class="task-due ${dueClass}">${task.done ? 'Done' : task.due}</span></div>`;
}

function renderTasks() {
  const personal = state.tasks.filter(t => t.assignee === 'Aarav Sharma' && !t.done).slice(0, 4);
  if (el('dashboardTasks')) el('dashboardTasks').innerHTML = personal.map(t => taskRow(t)).join('');
  const searchable = (el('taskSearch')?.value || '').toLowerCase();
  const priority = el('priorityFilter')?.value || 'all';
  const filtered = state.tasks.filter(t => {
    const mode = state.taskFilter;
    const matchesMode = mode === 'open' ? !t.done : mode === 'done' ? t.done : t.bucket === mode && !t.done;
    return matchesMode && (priority === 'all' || t.priority === priority) && `${t.title} ${t.company}`.toLowerCase().includes(searchable);
  });
  const groups = state.taskFilter === 'open' ? [['Overdue', 'overdue'], ['Today', 'today'], ['This week', 'week']] : state.taskFilter === 'done' ? [['Completed', 'done']] : [[state.taskFilter === 'overdue' ? 'Overdue' : 'Due today', state.taskFilter]];
  el('taskGroups').innerHTML = groups.map(([label, bucket]) => {
    const list = filtered.filter(t => t.bucket === bucket);
    return list.length ? `<section class="task-group"><h3>${label} <span>(${list.length})</span>${bucket === 'overdue' ? ' <small class="overdue-label">Needs attention</small>' : ''}</h3>${list.map(t => taskRow(t, true)).join('')}</section>` : '';
  }).join('') || '<p class="empty-state">No tasks match this view.</p>';
  el('companyTaskList').innerHTML = state.tasks.filter(t => t.company === 'RazorpayX Partners' && !t.done).map(t => taskRow(t, true)).join('');
}

function renderActivity() {
  const markup = state.activities.map(a => `<div class="activity-item"><span class="activity-icon ${a.type}">${a.icon}</span><div class="activity-copy">${a.text}</div><time>${a.time}</time></div>`).join('');
  el('activityFeed').innerHTML = markup;
  document.querySelectorAll('.company-feed').forEach(node => node.innerHTML = markup);
  el('fullCompanyActivity').innerHTML = markup + `<div class="activity-item"><span class="activity-icon call">☎</span><div class="activity-copy"><strong>Call with Rohan Kulkarni</strong> · Confirmed finance team has reviewed the implementation schedule.</div><time>28 Aug</time></div><div class="activity-item"><span class="activity-icon note">▤</span><div class="activity-copy"><strong>Added account note</strong> · Renewal opportunity expected in Q4; link it to a new deal when confirmed.</div><time>26 Aug</time></div>`;
}

function renderTeam() {
  const team = [{ name: 'Aarav Sharma', avatar: 'AS', cls: 'avatar-blue', open: 5, forecast: '₹12.3L', tasks: 4 }, { name: 'Priya Menon', avatar: 'PM', cls: 'avatar-cyan', open: 4, forecast: '₹6.1L', tasks: 3 }, { name: 'Kunal Shah', avatar: 'KS', cls: 'avatar-orange', open: 3, forecast: '₹3.8L', tasks: 2 }];
  el('teamTable').innerHTML = `<div class="team-row"><span>Owner</span><span>Open deals</span><span>Forecast</span><span>Tasks</span></div>${team.map(r => `<div class="team-row"><div class="team-member"><span class="avatar ${r.cls}">${r.avatar}</span>${r.name}</div><b>${r.open}</b><b>${r.forecast}</b><b>${r.tasks}</b></div>`).join('')}`;
}

function renderCustomers() {
  const search = (el('companySearch')?.value || '').toLowerCase().trim();
  const status = el('statusFilter')?.value || 'all';
  const cType = el('customerTypeFilter')?.value || 'all';
  const industry = el('industryFilter')?.value || 'all';
  const tag = el('tagFilter')?.value || 'all';
  const sort = el('companySort')?.value || 'activity';

  let customers = (state.companies || []).filter(c => {
    const matchesStatus = (status === 'all' || (c.status || '').toLowerCase() === status.toLowerCase());
    const matchesType = (cType === 'all' || c.customer_type === cType);
    const matchesIndustry = (industry === 'all' || c.industry === industry);
    const matchesTag = (tag === 'all' || (c.tags && c.tags.includes(tag)));
    
    const code = (c.customer_code || `CUS-2026-${String(c.id).padStart(4, '0')}`).toLowerCase();
    const gstin = (c.gst_number || '').toLowerCase();
    const email = (c.email || '').toLowerCase();
    const phone = (c.phone || '').toLowerCase();
    const name = (c.name || '').toLowerCase();

    const matchesSearch = !search || name.includes(search) || code.includes(search) || gstin.includes(search) || email.includes(search) || phone.includes(search);

    return matchesStatus && matchesType && matchesIndustry && matchesTag && matchesSearch;
  });

  // Calculate derived values for sorting
  customers.forEach(c => {
    const cDeals = (state.deals || []).filter(d => (d.company === c.name || d.company_id === c.id) && d.stage === 'Won');
    c.derivedTotalValue = cDeals.reduce((sum, d) => sum + (Number(d.value) || 0), 0);
  });

  if (sort === 'name') {
    customers.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sort === 'created') {
    customers.sort((a, b) => (b.id || 0) - (a.id || 0));
  } else if (sort === 'value') {
    customers.sort((a, b) => b.derivedTotalValue - a.derivedTotalValue);
  } else {
    customers.sort((a, b) => (b.id || 0) - (a.id || 0));
  }

  if (el('companyResultCount')) {
    el('companyResultCount').textContent = `${customers.length} ${customers.length === 1 ? 'customer' : 'customers'}`;
  }

  if (el('customerTablePaginationText')) {
    el('customerTablePaginationText').textContent = `Showing 1–${customers.length} of ${customers.length} records`;
  }

  const tbody = el('companyTableBody');
  if (tbody) {
    tbody.innerHTML = customers.map(c => {
      const code = c.customer_code || `CUS-2026-${String(c.id).padStart(4, '0')}`;
      const gstinPan = c.gst_number || c.pan_number || '—';
      const typeStr = c.customer_type || 'Enterprise';
      const logoCls = c.logo || 'purple-logo';
      const initialChar = c.initial || (c.name ? c.name[0] : 'C');
      const statusStr = (c.status || 'active').toLowerCase();
      const statusClass = statusStr === 'active' ? 'status-active' : statusStr === 'lead' ? 'status-draft' : 'status-churned';

      return `
        <tr>
          <td>
            <button type="button" class="company-cell company-open" data-company-id="${c.id}" data-company-name="${escapeHTML(c.name)}">
              <span class="company-logo ${logoCls}">${initialChar}</span>
              <span>
                <b>${escapeHTML(c.name)}</b>
                <small style="display:block;color:var(--muted);font-size:11px;">${escapeHTML(code)} · ${escapeHTML(c.city || 'India')}</small>
              </span>
            </button>
          </td>
          <td><code style="font-size:0.8rem;">${escapeHTML(gstinPan)}</code></td>
          <td>${escapeHTML(c.industry || 'Fintech')}</td>
          <td><span class="tag-subtle">${escapeHTML(typeStr)}</span></td>
          <td>${escapeHTML(c.owner || 'Aarav Sharma')}</td>
          <td><span class="status-pill ${statusClass}">${statusStr[0].toUpperCase() + statusStr.slice(1)}</span></td>
          <td><b>${money(c.derivedTotalValue)}</b></td>
          <td><small>${c.activity || 'Recently'}</small></td>
          <td>
            <button type="button" class="button button-quiet button-sm edit-customer-btn" data-customer-id="${c.id}" title="Edit Customer Details">✎ Edit</button>
          </td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="9" class="empty-cell" style="text-align:center;padding:2rem;">No customers match these filters.</td></tr>';
  }
}

function renderCompanies() {
  renderCustomers();
}

function dealAvatar(owner) { const map = {'Aarav Sharma':['AS','avatar-blue'],'Priya Menon':['PM','avatar-cyan'],'Kunal Shah':['KS','avatar-orange']}; return map[owner] || [initials(owner),'avatar-blue']; }
function renderKanban() {
  const owner = el('ownerFilter')?.value || 'all', tag = el('pipelineTagFilter')?.value || 'all', month = el('closeFilter')?.value || 'all';
  const stages = [...state.stages, { name: 'Lost', probability: 0, color: '#d98697' }];
  el('kanbanBoard').innerHTML = stages.map(stage => {
    const all = state.deals.filter(d => d.stage === stage.name);
    const deals = all.filter(d => (owner === 'all'||d.owner===owner) && (tag === 'all'||d.tag===tag) && (month === 'all'||d.month===month));
    const stageValue = all.reduce((sum, d) => sum + d.value, 0);
    return `<section class="kanban-column" data-stage="${stage.name}" style="--stage-color:${stage.color}"><header class="kanban-column-header"><div><i></i><b>${stage.name}</b><span>${deals.length}</span></div><small>${money(stageValue)}</small></header><div class="kanban-deals">${deals.map(d => { const [initial, cls] = dealAvatar(d.owner); return `<article class="deal-card" draggable="true" data-deal-id="${d.id}"><p class="deal-title">${d.title}</p><p class="deal-company">${d.company}</p><div class="deal-value"><span>${money(d.value)}</span><span class="probability">${d.probability}%</span></div><footer class="deal-card-footer"><span class="avatar ${cls}">${initial}</span><time>${d.due}</time>${d.tag ? `<span class="deal-tag">${d.tag === 'high value' ? 'High value' : 'At risk'}</span>` : ''}</footer></article>`; }).join('') || '<div class="empty-column">Drop deal here</div>'}</div></section>`;
  }).join('');
  bindDnD();
}

function bindDnD() {
  document.querySelectorAll('.deal-card').forEach(card => card.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', card.dataset.dealId); card.classList.add('dragging'); }));
  document.querySelectorAll('.deal-card').forEach(card => card.addEventListener('dragend', () => card.classList.remove('dragging')));
  document.querySelectorAll('.kanban-column').forEach(column => {
    column.addEventListener('dragover', e => { e.preventDefault(); column.classList.add('drag-over'); });
    column.addEventListener('dragleave', () => column.classList.remove('drag-over'));
    column.addEventListener('drop', e => { e.preventDefault(); column.classList.remove('drag-over'); const deal = state.deals.find(d => d.id === Number(e.dataTransfer.getData('text/plain'))); if (deal && deal.stage !== column.dataset.stage) moveDeal(deal, column.dataset.stage); });
  });
}

async function moveDeal(deal, target) {
  if (target === 'Won' || target === 'Lost') {
    state.pendingMove = { deal, target };
    el('stageModalTitle').textContent = `Mark "${deal.title}" as ${target.toLowerCase()}?`;
    el('stageModalCopy').textContent = target === 'Lost' ? 'Add a loss reason to close this deal. The outcome is saved in the audit trail.' : 'This will close the deal, record the outcome and timestamp the stage change.';
    el('lostReasonLabel').classList.toggle('hidden', target !== 'Lost');
    showModal('stageModal');
  } else {
    const probability = state.stages.find(s => s.name === target)?.probability ?? deal.probability;
    try {
      const updated = await updateCRMRecord('deals', deal.id, { stage: target, probability });
      Object.assign(deal, updated);
      renderAll(); showToast(`${deal.title} moved to ${target}. Probability updated to ${deal.probability}%.`);
    } catch (error) { showToast(error.message); }
  }
}

function renderContacts() {
  const table = el('contactTable');
  if (!table) return;
  table.innerHTML = state.contacts.map(c => `
    <tr>
      <td>
        <div class="company-cell">
          <span class="avatar avatar-blue">${c.initials || initials(c.name)}</span>
          <span>
            ${escapeHTML(c.name)}
            ${c.company_name ? `<small style="display:block;color:var(--muted);font-size:11px">▣ ${escapeHTML(c.company_name)}</small>` : ''}
          </span>
        </div>
      </td>
      <td>${escapeHTML(c.title || '—')}</td>
      <td>${escapeHTML(c.email || '—')}</td>
      <td>${escapeHTML(c.phone || '—')}</td>
      <td>${c.primary ? '<span class="status active">Primary</span>' : '<span class="muted-copy">Contact</span>'}</td>
      <td><button class="row-action" aria-label="Edit ${escapeHTML(c.name)}">⋮</button></td>
    </tr>
  `).join('');
}

function renderCompanyDeals() {
  renderCompany360();
}

function renderCompany360(companyName = 'RazorpayX Partners') {
  const company = state.companies.find(c => c.name === companyName) || state.companies[0] || { name: companyName, id: 1 };
  const cName = company.name;

  // 1. Deals
  const companyDeals = state.deals.filter(d => d.company === cName || d.company_id === company.id);
  if (el('companyDeals')) {
    el('companyDeals').innerHTML = companyDeals.map(d => `<article class="panel deal-card-detail"><div class="deal-meta"><span><span class="status lead">${d.stage}</span></span><span>Closes ${d.due}</span></div><h3>${d.title}</h3><div class="deal-detail-values"><p>Deal value<b>${money(d.value)}</b></p><p>Probability<b>${d.probability}%</b></p><p>Forecast<b>${money(d.value * d.probability / 100)}</b></p></div></article>`).join('') || '<p class="empty-state">No deals linked to this account.</p>';
  }

  // 2. Quotations
  const companyQuotes = (state.quotations || []).filter(q => q.company_name === cName || q.company_id === company.id);
  if (el('companyQuotationsTable')) {
    el('companyQuotationsTable').innerHTML = companyQuotes.map(q => `
      <tr>
        <td><strong>${escapeHTML(q.quotation_number)}</strong></td>
        <td><b>₹${((Number(q.total) || 0) / 100000).toFixed(1)}L</b></td>
        <td><span class="status-pill status-${(q.status || 'draft').toLowerCase()}">${escapeHTML(q.status || 'Draft')}</span></td>
        <td>${q.valid_until || '—'}</td>
      </tr>
    `).join('') || '<tr><td colspan="4" class="empty-state">No quotations created for this account.</td></tr>';
  }

  // 3. Purchase Orders
  const companyPo = (state.purchase_orders || []).filter(p => p.company_name === cName || p.company_id === company.id);
  if (el('companyPoTable')) {
    el('companyPoTable').innerHTML = companyPo.map(p => `
      <tr>
        <td><strong>${escapeHTML(p.po_number || 'PO-001')}</strong></td>
        <td><b>₹${((Number(p.amount) || 0) / 100000).toFixed(1)}L</b></td>
        <td><span class="status-pill status-${(p.status || 'received').toLowerCase()}">${escapeHTML(p.status || 'Received')}</span></td>
        <td>${p.issue_date || '—'}</td>
      </tr>
    `).join('') || '<tr><td colspan="4" class="empty-state">No purchase orders logged.</td></tr>';
  }

  // 4. Invoices
  const companyInvoices = (state.invoices || []).filter(i => i.company_name === cName || i.company_id === company.id);
  if (el('companyInvoicesTable')) {
    el('companyInvoicesTable').innerHTML = companyInvoices.map(i => `
      <tr>
        <td><strong>${escapeHTML(i.invoice_number || 'INV-001')}</strong></td>
        <td><b>₹${((Number(i.total) || 0) / 100000).toFixed(1)}L</b></td>
        <td>₹${((Number(i.amount_paid) || 0) / 100000).toFixed(1)}L</td>
        <td>₹${((Number(i.balance_due) || 0) / 100000).toFixed(1)}L</td>
        <td><span class="status-pill status-${(i.status || 'draft').toLowerCase()}">${escapeHTML(i.status || 'Draft')}</span></td>
      </tr>
    `).join('') || '<tr><td colspan="5" class="empty-state">No tax invoices generated.</td></tr>';
  }

  // 5. Payments
  const companyInvoiceIds = companyInvoices.map(i => i.id);
  const companyPayments = (state.payments || []).filter(p => companyInvoiceIds.includes(p.invoice_id));
  if (el('companyPaymentsTable')) {
    el('companyPaymentsTable').innerHTML = companyPayments.map(p => `
      <tr>
        <td>${p.payment_date || '—'}</td>
        <td><b>₹${(Number(p.amount) || 0).toLocaleString('en-IN')}</b></td>
        <td>${escapeHTML(p.payment_method || 'Bank Transfer')}</td>
        <td>${escapeHTML(p.reference_number || '—')}</td>
      </tr>
    `).join('') || '<tr><td colspan="4" class="empty-state">No payments recorded.</td></tr>';
  }

  // 6. Documents
  const companyDocs = (state.documents || []).filter(d => d.company_id === company.id || d.company_name === cName);
  if (el('companyDocumentsList')) {
    el('companyDocumentsList').innerHTML = companyDocs.map(d => `
      <div class="panel doc-card">
        <span>📄</span>
        <div><strong>${escapeHTML(d.name)}</strong><small>${escapeHTML(d.type || 'Doc')} · ${d.version || 'v1.0'}</small></div>
        <a href="${escapeHTML(d.file_path || '#')}" target="_blank" class="text-button">Download</a>
      </div>
    `).join('') || '<p class="empty-state">No documents attached to account.</p>';
  }

  // 7. Emails
  const companyComms = (state.communications || []).filter(c => c.company_id === company.id || c.company_name === cName);
  if (el('companyEmailsList')) {
    el('companyEmailsList').innerHTML = companyComms.map(c => `
      <div class="panel email-log-item" style="margin-bottom: 0.5rem; padding: 0.75rem;">
        <div style="display: flex; justify-content: space-between;"><strong>✉ ${escapeHTML(c.subject || 'Email Outbound')}</strong><small>${c.sent_at || 'Recently'}</small></div>
        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.25rem;">To: ${escapeHTML(c.recipient_email || 'contact')} · Status: <span class="status-pill status-active">${escapeHTML(c.status || 'Sent')}</span></p>
      </div>
    `).join('') || '<p class="empty-state">No email dispatch logs found for this company.</p>';
  }

  // 8. Renewals
  const companyRenewals = (state.renewals || []).filter(r => r.company_id === company.id || r.company_name === cName);
  if (el('companyRenewalsTable')) {
    el('companyRenewalsTable').innerHTML = companyRenewals.map(r => `
      <tr>
        <td><strong>${escapeHTML(r.product_name || 'Service')}</strong></td>
        <td><b>₹${((Number(r.value) || 0) / 100000).toFixed(1)}L</b></td>
        <td>${r.renewal_date || '—'}</td>
        <td><span class="status-pill status-${(r.status || 'upcoming').toLowerCase()}">${escapeHTML(r.status || 'Upcoming')}</span></td>
      </tr>
    `).join('') || '<tr><td colspan="4" class="empty-state">No contract renewals scheduled.</td></tr>';
  }

  // 9. Unified Timeline
  const companyActivities = state.activities.filter(a => a.company === cName || a.text?.includes(cName));
  if (el('companyUnifiedTimeline')) {
    const timelineItems = [
      ...companyActivities.map(a => ({ title: a.text, date: 'Recent', icon: '💬' })),
      ...companyComms.map(c => ({ title: `Email: ${c.subject}`, date: c.sent_at, icon: '✉' })),
      ...companyQuotes.map(q => ({ title: `Quotation ${q.quotation_number} generated (${q.status})`, date: q.valid_until, icon: '📋' })),
      ...companyInvoices.map(i => ({ title: `Invoice ${i.invoice_number} created (${i.status})`, date: i.issue_date, icon: '🧾' }))
    ];
    el('companyUnifiedTimeline').innerHTML = timelineItems.map(item => `
      <div class="activity-item">
        <span class="activity-icon">${item.icon}</span>
        <div class="activity-details">
          <p>${item.title}</p>
          <small>${item.date || 'Audit event'}</small>
        </div>
      </div>
    `).join('') || '<p class="empty-state">No timeline events recorded.</p>';
  }
}

function deriveCustomerPurchaseHistory(company) {
  const cName = company.name;
  const cId = company.id;
  const purchases = [];

  // Won deals
  const wonDeals = (state.deals || []).filter(d => (d.company === cName || d.company_id === cId) && d.stage === 'Won');
  wonDeals.forEach(d => {
    purchases.push({
      product_name: d.title || 'Enterprise Solutions Suite',
      sku: 'SP-SOL-' + String(d.id).padStart(3, '0'),
      category: 'Enterprise',
      qty: 1,
      unit_price: Number(d.value) || 0,
      discount: 0,
      gst_tax: (Number(d.value) || 0) * 0.18,
      total_price: Number(d.value) || 0,
      purchase_date: d.due || '2026-08-15',
      source_doc: `Won Deal (${d.title})`,
      doc_type: 'deal',
      doc_id: d.id
    });
  });

  // Approved POs
  const pos = (state.purchase_orders || []).filter(p => (p.company_name === cName || p.company_id === cId) && p.status !== 'cancelled');
  pos.forEach(p => {
    purchases.push({
      product_name: `PO Contract: ${p.po_number || 'PO-001'}`,
      sku: 'SP-PO-' + String(p.id).padStart(3, '0'),
      category: 'Service Contract',
      qty: 1,
      unit_price: Number(p.amount) || 0,
      discount: 0,
      gst_tax: (Number(p.amount) || 0) * 0.18,
      total_price: Number(p.amount) || 0,
      purchase_date: p.issue_date || '2026-08-20',
      source_doc: `PO #${p.po_number || 'PO-001'}`,
      doc_type: 'po',
      doc_id: p.id
    });
  });

  // Invoices items
  const invs = (state.invoices || []).filter(i => (i.company_name === cName || i.company_id === cId));
  invs.forEach(i => {
    const items = i.items || [];
    if (items.length) {
      items.forEach(item => {
        purchases.push({
          product_name: item.name || item.product_name || 'Payment Processing License',
          sku: item.sku || 'SP-PG-001',
          category: item.category || 'Gateway',
          qty: Number(item.qty) || 1,
          unit_price: Number(item.unit_price || item.price) || 0,
          discount: Number(item.discount) || 0,
          gst_tax: (Number(item.total || item.unit_price) || 0) * 0.18,
          total_price: Number(item.total || (item.unit_price * (item.qty || 1))) || 0,
          purchase_date: i.issue_date || '2026-09-01',
          source_doc: `Invoice #${i.invoice_number}`,
          doc_type: 'invoice',
          doc_id: i.id
        });
      });
    }
  });

  // Fallback demo purchase history for predefined accounts if no items derived yet
  if (purchases.length === 0 && (cName.includes('Razorpay') || cName.includes('Urban') || cName.includes('Groww'))) {
    purchases.push({
      product_name: 'SmartPay Payment Gateway Enterprise',
      sku: 'SP-PG-ENT',
      category: 'Gateway',
      qty: 1,
      unit_price: 500000,
      discount: 5,
      gst_tax: 85500,
      total_price: 560500,
      purchase_date: '2026-07-15',
      source_doc: 'PO #PO-RZP-2026-001',
      doc_type: 'po'
    });
  }

  return purchases;
}

function renderCustomerPurchaseHistory(company) {
  const purchases = deriveCustomerPurchaseHistory(company);
  const table = el('companyPurchaseHistoryTable');

  const totalProducts = purchases.reduce((sum, p) => sum + (p.qty || 1), 0);
  const totalValue = purchases.reduce((sum, p) => sum + (p.total_price || 0), 0);
  const dates = purchases.map(p => p.purchase_date).filter(Boolean).sort();
  const firstDate = dates.length ? displayDate(dates[0]) : '—';
  const latestDate = dates.length ? displayDate(dates[dates.length - 1]) : '—';
  const aov = purchases.length ? Math.round(totalValue / purchases.length) : 0;

  if (el('cusTotalProductsCount')) el('cusTotalProductsCount').textContent = totalProducts;
  if (el('cusTotalPurchaseValue')) el('cusTotalPurchaseValue').textContent = money(totalValue);
  if (el('cusFirstPurchaseDate')) el('cusFirstPurchaseDate').textContent = firstDate;
  if (el('cusLatestPurchaseDate')) el('cusLatestPurchaseDate').textContent = latestDate;
  if (el('cusAvgOrderValue')) el('cusAvgOrderValue').textContent = money(aov);

  if (table) {
    table.innerHTML = purchases.map((p, idx) => `
      <tr>
        <td><strong>${escapeHTML(p.product_name)}</strong></td>
        <td><code style="font-size:0.8rem;">${escapeHTML(p.sku)}</code></td>
        <td><span class="tag-subtle">${escapeHTML(p.category)}</span></td>
        <td><b>${p.qty}</b></td>
        <td>${money(p.unit_price)}</td>
        <td>${p.discount}%</td>
        <td><b>${money(p.total_price)}</b></td>
        <td>${p.purchase_date || '—'}</td>
        <td><small>${escapeHTML(p.source_doc)}</small></td>
        <td>
          <button type="button" class="button button-quiet button-sm purchase-detail-btn" data-purchase-index="${idx}">Details</button>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="10" class="empty-state" style="text-align:center;padding:2rem;">No purchase history recorded for this customer.</td></tr>';

    state.currentCustomerPurchases = purchases;
  }
}

function openCustomerProfile(identifier) {
  let company = state.companies.find(c => c.id === Number(identifier) || c.name === identifier);
  if (!company) company = state.companies[0] || { name: 'RazorpayX Partners', id: 1 };
  
  const cName = company.name;
  state.currentCustomer = company;

  if (el('companyHeroLogo')) el('companyHeroLogo').textContent = company.initial || (cName ? cName[0] : 'C');
  if (el('companyHeroName')) el('companyHeroName').textContent = cName;
  if (el('companyHeroEyebrow')) el('companyHeroEyebrow').textContent = `${(company.status || 'Active')[0].toUpperCase() + (company.status || 'Active').slice(1)} customer · Code: ${company.customer_code || 'CUS-2026-0001'} · Owner: ${company.owner || 'Aarav Sharma'}`;
  if (el('companyHeroMeta')) el('companyHeroMeta').textContent = `${company.industry || 'Fintech'} · ${company.city || 'Bengaluru'}, ${company.state || 'Karnataka'} · ${company.customer_type || 'Enterprise'}`;
  
  if (el('companyHeroEditBtn')) {
    el('companyHeroEditBtn').onclick = () => openEditCustomerModal(company.id);
  }

  if (el('companyDetailCode')) el('companyDetailCode').textContent = company.customer_code || `CUS-2026-${String(company.id).padStart(4, '0')}`;
  if (el('companyDetailGstin')) el('companyDetailGstin').textContent = company.gst_number || 'Not Provided';
  if (el('companyDetailPan')) el('companyDetailPan').textContent = company.pan_number || 'Not Provided';
  if (el('companyDetailType')) el('companyDetailType').textContent = company.customer_type || 'Enterprise';
  if (el('companyDetailWebsite')) {
    const web = company.website || 'razorpay.com';
    el('companyDetailWebsite').textContent = web;
    el('companyDetailWebsite').href = web.startsWith('http') ? web : `https://${web}`;
  }
  if (el('companyDetailPhone')) el('companyDetailPhone').textContent = company.phone || company.alternate_phone || '+91 80 4567 8900';
  if (el('companyDetailBillingAddress')) el('companyDetailBillingAddress').textContent = company.billing_address || `${company.city || 'Bengaluru'}, ${company.state || 'Karnataka'}`;
  if (el('companyDetailStatus')) el('companyDetailStatus').innerHTML = `<span class="status-pill status-${(company.status || 'active').toLowerCase()}">${(company.status || 'active').toUpperCase()}</span>`;

  renderCompany360(cName);
  renderCustomerPurchaseHistory(company);
  openView('company-detail');
  setCompanyTab('overview');
}

function openEditCustomerModal(customerId) {
  const customer = state.companies.find(c => c.id === customerId);
  if (!customer) return;
  state.editingCustomerId = customer.id;
  if (el('companyModalTitle')) el('companyModalTitle').textContent = `Edit Customer: ${customer.name}`;
  if (el('companyModalName')) el('companyModalName').value = customer.name || '';
  if (el('companyModalType')) el('companyModalType').value = customer.customer_type || 'Enterprise';
  if (el('companyModalIndustry')) el('companyModalIndustry').value = customer.industry || 'Retail';
  if (el('companyModalGstin')) el('companyModalGstin').value = customer.gst_number || '';
  if (el('companyModalPan')) el('companyModalPan').value = customer.pan_number || '';
  if (el('companyModalPhone')) el('companyModalPhone').value = customer.phone || '';
  if (el('companyModalAltPhone')) el('companyModalAltPhone').value = customer.alternate_phone || '';
  if (el('companyModalEmail')) el('companyModalEmail').value = customer.email || '';
  if (el('companyModalAltEmail')) el('companyModalAltEmail').value = customer.alternate_email || '';
  if (el('companyModalWebsite')) el('companyModalWebsite').value = customer.website || '';
  if (el('companyModalStatus')) el('companyModalStatus').value = customer.status || 'active';
  if (el('companyModalSource')) el('companyModalSource').value = customer.source || 'Inbound';
  if (el('companyModalBillingAddress')) el('companyModalBillingAddress').value = customer.billing_address || '';
  if (el('companyModalShippingAddress')) el('companyModalShippingAddress').value = customer.shipping_address || '';
  if (el('companyModalCity')) el('companyModalCity').value = customer.city || '';
  if (el('companyModalState')) el('companyModalState').value = customer.state || '';
  if (el('companyModalCountry')) el('companyModalCountry').value = customer.country || 'India';
  if (el('companyModalPinCode')) el('companyModalPinCode').value = customer.pin_code || '';
  showModal('companyModal');
}

function showPurchaseDetail(idx) {
  const p = (state.currentCustomerPurchases || [])[idx];
  if (!p) return;
  if (el('purchaseDetailProductName')) el('purchaseDetailProductName').textContent = p.product_name;
  if (el('purchaseDetailSku')) el('purchaseDetailSku').textContent = p.sku;
  if (el('purchaseDetailQty')) el('purchaseDetailQty').textContent = p.qty;
  if (el('purchaseDetailUnitPrice')) el('purchaseDetailUnitPrice').textContent = money(p.unit_price);
  if (el('purchaseDetailDiscount')) el('purchaseDetailDiscount').textContent = `${p.discount}%`;
  if (el('purchaseDetailTax')) el('purchaseDetailTax').textContent = money(p.gst_tax || 0);
  if (el('purchaseDetailTotal')) el('purchaseDetailTotal').textContent = money(p.total_price);
  if (el('purchaseDetailDate')) el('purchaseDetailDate').textContent = p.purchase_date || '—';
  if (el('purchaseDetailSourceDoc')) el('purchaseDetailSourceDoc').textContent = p.source_doc;
  showModal('purchaseDetailModal');
}

function renderReports() {
  const months = [['Apr',8.8,3.4],['May',10.2,2.7],['Jun',7.4,4.5],['Jul',13.6,3.1],['Aug',9.7,4.1],['Sep',11.4,4.2]], max = 14;
  el('reportBars').innerHTML = months.map(([label,won,lost]) => `<div class="bar-month"><div class="bar-pair"><i class="won" style="height:${won/max*100}%" data-value="Won: ₹${won}L"></i><i class="lost" style="height:${lost/max*100}%" data-value="Lost: ₹${lost}L"></i></div><small>${label}</small></div>`).join('');
  const reps = [{n:'Aarav Sharma',v:'₹7.2L',w:'3 won',a:'AS',c:'avatar-blue'},{n:'Priya Menon',v:'₹4.8L',w:'2 won',a:'PM',c:'avatar-cyan'},{n:'Kunal Shah',v:'₹2.2L',w:'1 won',a:'KS',c:'avatar-orange'}];
  el('repTable').innerHTML = `<div class="rep-row"><span>Rep</span><span>Won value</span><span>Deals won</span></div>${reps.map(r=>`<div class="rep-row"><div class="team-member"><span class="avatar ${r.c}">${r.a}</span>${r.n}</div><b>${r.v}</b><b>${r.w}</b></div>`).join('')}`;
  const funnel = [{l:'New Lead',n:6,s:5,c:'#e6effd'},{l:'Qualified',n:5,s:4,c:'#ddecf9'},{l:'Proposal',n:4,s:3,c:'#d0e6f8'},{l:'Negotiation',n:3,s:2,c:'#c5e8e9'},{l:'Won',n:2,s:1,c:'#d7f0e2'}];
  el('conversionFunnel').innerHTML = funnel.map(f => `<div class="funnel-step" style="--funnel-size:${f.s};--funnel-color:${f.c}"><strong>${f.l}</strong><span>${f.n} deals</span></div>`).join('');
}

function renderSettings() {
  const users = [{n:'Aarav Sharma',e:'aarav@smartpay.in',r:'Sales Manager',s:'All companies & reports',a:'AS',c:'avatar-blue',last:'Now'},{n:'Priya Menon',e:'priya@smartpay.in',r:'Sales Rep',s:'Assigned book of business',a:'PM',c:'avatar-cyan',last:'12 min ago'},{n:'Kunal Shah',e:'kunal@smartpay.in',r:'Sales Rep',s:'Assigned book of business',a:'KS',c:'avatar-orange',last:'1 hr ago'},{n:'Ritika Shah',e:'ritika@smartpay.in',r:'Viewer',s:'All CRM data · read-only',a:'RS',c:'avatar-blue',last:'Yesterday'}];
  el('usersTable').innerHTML = users.map(u=>`<tr><td><div class="company-cell"><span class="avatar ${u.c}">${u.a}</span><span>${u.n}<small>${u.e}</small></span></div></td><td><span class="tag ${u.r==='Viewer'?'orange-tag':'blue-tag'}">${u.r}</span></td><td>${u.s}</td><td>${u.last}</td><td><button class="row-action" aria-label="Manage ${u.n}">⋮</button></td></tr>`).join('');
  el('stageSettingsList').innerHTML = state.stages.concat([{name:'Lost',probability:0,color:'#d98697'}]).map((s,i)=>`<div class="stage-setting"><span>⠿</span><p><strong>${s.name}</strong><small>${i < 5 ? 'Default sales stage' : 'Closed outcome'}</small></p><label>Probability <input type="number" value="${s.probability}" min="0" max="100" data-stage-prob="${s.name}" />%</label><button class="button button-quiet stage-edit">${s.name==='Lost'?'Protected':'Edit'}</button></div>`).join('');
  const tags = [['High value','#4e7ecb'],['At risk','#d36175'],['Referral partner','#e39138'],['Strategic','#7967d6'],['Enterprise','#259f91']];
  el('tagSettingsList').innerHTML = tags.map(t=>`<div class="tag-setting" style="--tag-color:${t[1]}"><i></i>${t[0]}<button aria-label="Remove ${t[0]}">×</button></div>`).join('');
}

// ─── USER PROFILE ───────────────────────────────────────────────────

async function renderProfile() {
  if (!currentUser) {
    try {
      const res = await fetch('/api/user', { credentials: 'same-origin' });
      if (res.ok) {
        currentUser = await res.json();
        updateUserUI(currentUser);
      }
    } catch (e) {}
  }
  if (!currentUser) return;

  // Sync fresh profile details from /api/user if available
  try {
    const res = await fetch('/api/user', { credentials: 'same-origin' });
    if (res.ok) {
      const freshUser = await res.json();
      currentUser = { ...currentUser, ...freshUser };
    }
  } catch (e) {
    // Continue with in-memory currentUser
  }

  const user = currentUser;
  const userInitials = initials(user.name);
  const role = user.role || 'Sales Rep';
  const dept = user.department || 'Sales';
  const phone = user.phone || 'Not provided';
  const email = user.email || 'Not provided';
  const username = user.username ? `@${user.username}` : (user.email ? `@${user.email.split('@')[0]}` : '—');
  const userId = user.id ? `UID-#${user.id}` : 'UID-#1';

  let formattedJoined = 'Member since 2026';
  let formattedFullDate = 'September 2026';
  if (user.created_at) {
    try {
      const d = new Date(user.created_at);
      if (!isNaN(d.getTime())) {
        formattedJoined = 'Member since ' + d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        formattedFullDate = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      }
    } catch (err) {}
  }

  // Hero Card
  if (el('profileHeroName')) el('profileHeroName').textContent = user.name || 'User';
  if (el('profileHeroEmail')) el('profileHeroEmail').textContent = email;
  if (el('profileHeroRole')) el('profileHeroRole').textContent = role;
  if (el('profileHeroDept')) el('profileHeroDept').textContent = dept;
  if (el('profileHeroJoined')) el('profileHeroJoined').textContent = formattedJoined;

  const largeAvatar = el('profileAvatarLarge');
  if (largeAvatar) {
    if (user.avatar) {
      largeAvatar.innerHTML = `<img src="${escapeHTML(user.avatar)}" alt="${escapeHTML(user.name || 'User')}" />`;
    } else {
      largeAvatar.textContent = userInitials;
    }
  }

  // Details Grid
  if (el('profileDetailName')) el('profileDetailName').textContent = user.name || '—';
  if (el('profileDetailUsername')) el('profileDetailUsername').textContent = username;
  if (el('profileDetailEmail')) el('profileDetailEmail').textContent = email;
  if (el('profileDetailPhone')) el('profileDetailPhone').textContent = phone;
  if (el('profileDetailDept')) el('profileDetailDept').textContent = dept;
  if (el('profileDetailRole')) el('profileDetailRole').textContent = role;
  if (el('profileDetailId')) el('profileDetailId').textContent = userId;
  if (el('profileDetailCreated')) el('profileDetailCreated').textContent = formattedFullDate;
  if (el('profileDetailProvider')) {
    el('profileDetailProvider').textContent = user.provider === 'google' ? 'Google OAuth 2.0' : 'Email & Password';
  }
}

function openEditProfileModal() {
  if (!currentUser) return;
  if (el('editProfileName')) el('editProfileName').value = currentUser.name || '';
  if (el('editProfilePhone')) el('editProfilePhone').value = currentUser.phone || '';
  if (el('editProfileDept')) el('editProfileDept').value = currentUser.department || '';
  if (el('editProfileAvatar')) el('editProfileAvatar').value = currentUser.avatar || '';
  showModal('editProfileModal');
}

function setupProfileHandlers() {
  const openEditProfileBtn = document.getElementById('openEditProfileBtn');
  if (openEditProfileBtn) {
    openEditProfileBtn.addEventListener('click', openEditProfileModal);
  }
  const heroEditBtn = document.getElementById('heroEditBtn');
  if (heroEditBtn) {
    heroEditBtn.addEventListener('click', openEditProfileModal);
  }
  const profileLogoutBtn = document.getElementById('profileLogoutBtn');
  if (profileLogoutBtn) {
    profileLogoutBtn.addEventListener('click', performLogout);
  }

  const editProfileForm = document.getElementById('editProfileModal');
  if (editProfileForm) {
    editProfileForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      const saveBtn = el('saveProfileBtn');
      const originalText = saveBtn ? saveBtn.textContent : 'Save Changes';
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
      }

      const name = el('editProfileName')?.value.trim();
      const phone = el('editProfilePhone')?.value.trim();
      const department = el('editProfileDept')?.value.trim();
      const avatar = el('editProfileAvatar')?.value.trim();

      try {
        const res = await fetch('/api/user/profile', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          credentials: 'same-origin',
          body: JSON.stringify({ name, phone, department, avatar })
        });

        const data = await res.json();
        if (!res.ok) {
          showToast(data.error || 'Failed to update profile.');
          return;
        }

        currentUser = data.user;
        updateUserUI(currentUser);
        renderProfile();
        closeModal();
        showToast('Profile updated successfully! ✨');
      } catch (err) {
        showToast('Error updating profile. Please try again.');
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = originalText;
        }
      }
    });
  }
}

// ─── ENHANCED DASHBOARD RENDERERS ───────────────────────────────────

function renderEnhancedDashboard() {
  const analytics = state.analytics;
  const totals = pipelineStats();

  // ─── 1. Executive KPI Bar (8 cards) ──────────────────────────────
  const openVal = analytics?.pipeline?.total ?? totals.value;
  const dealCount = analytics?.pipeline?.dealCount ?? state.deals.filter(d => !['Won', 'Lost'].includes(d.stage)).length;
  const forecastVal = analytics?.pipeline?.weightedForecast ?? totals.forecast;
  const tasksDue = analytics?.tasks?.today ?? state.tasks.filter(t => !t.done && t.bucket === 'today').length;
  const tasksOverdue = analytics?.tasks?.overdue ?? state.tasks.filter(t => !t.done && t.bucket === 'overdue').length;
  const tasksTotalCount = analytics?.tasks?.total ?? state.tasks.filter(t => !t.done).length;
  const winRate = analytics?.revenue?.conversionRate ?? 42.8;

  const revMonth = analytics?.revenue?.thisMonth ?? state.deals.filter(d => d.stage === 'Won' && d.month === 'September').reduce((s, d) => s + d.value, 0);
  const revQuarter = analytics?.revenue?.thisQuarter ?? (revMonth + 740000);
  const renewalRev = analytics?.revenue?.renewalRevenue ?? state.deals.filter(d => d.stage === 'Won' && d.deal_type === 'renewal').reduce((s, d) => s + d.value, 0);
  const newLeads = analytics?.newLeadsToday?.length ?? state.companies.filter(c => c.status === 'lead').length;

  if (el('pipelineTotal')) el('pipelineTotal').textContent = money(openVal);
  if (el('pipelineDealCount')) el('pipelineDealCount').textContent = `${dealCount} deals in progress`;
  if (el('forecastTotal')) el('forecastTotal').textContent = money(forecastVal);
  if (el('tasksTotal')) el('tasksTotal').textContent = String(tasksTotalCount).padStart(2, '0');
  if (el('tasksDueBadge')) el('tasksDueBadge').textContent = `${tasksDue} due`;
  if (el('tasksSubtext')) el('tasksSubtext').textContent = `${tasksOverdue} overdue · needs attention`;
  if (el('winRateValue')) el('winRateValue').textContent = `${winRate}%`;
  if (el('revenueThisMonth')) el('revenueThisMonth').textContent = money(revMonth);
  if (el('revenueMonthDeals')) el('revenueMonthDeals').textContent = `${state.deals.filter(d => d.stage === 'Won').length} deals won`;
  if (el('revenueThisQuarter')) el('revenueThisQuarter').textContent = money(revQuarter);
  if (el('revenueQuarterDeals')) el('revenueQuarterDeals').textContent = 'Q3 2026';
  if (el('renewalRevenue')) el('renewalRevenue').textContent = money(renewalRev);
  if (el('renewalDeals')) el('renewalDeals').textContent = `${state.deals.filter(d => d.deal_type === 'renewal').length} renewals`;
  if (el('newLeadCount')) el('newLeadCount').textContent = String(newLeads);

  // ─── 2. Target vs Achievement ────────────────────────────────────
  const monthlyTarget = analytics?.target?.monthlyTarget || 2000000;
  const monthlyAchieved = analytics?.target?.monthlyAchieved || revMonth;
  const targetPct = Math.min(100, Math.round((monthlyAchieved / monthlyTarget) * 100));
  const monthProgress = analytics?.target?.monthProgress || 33;
  const pacing = analytics?.target?.pacing || 120;

  if (el('targetSubtext')) el('targetSubtext').textContent = `September 2026 · ${money(monthlyTarget)} target`;
  if (el('targetPercent')) el('targetPercent').textContent = `${targetPct}%`;
  if (el('targetProgressFill')) el('targetProgressFill').style.width = `${targetPct}%`;
  if (el('targetProgressPacing')) el('targetProgressPacing').style.left = `${monthProgress}%`;
  if (el('targetEndLabel')) el('targetEndLabel').textContent = money(monthlyTarget);
  if (el('targetMidLabel')) el('targetMidLabel').textContent = money(monthlyTarget / 2);

  const pacingPill = el('targetPacingPill');
  if (pacingPill) {
    if (pacing >= 100) {
      pacingPill.textContent = `Ahead (${pacing}%)`;
      pacingPill.className = 'target-pacing-pill ahead';
    } else if (pacing >= 80) {
      pacingPill.textContent = `On track (${pacing}%)`;
      pacingPill.className = 'target-pacing-pill';
    } else {
      pacingPill.textContent = `Behind (${pacing}%)`;
      pacingPill.className = 'target-pacing-pill behind';
    }
  }

  // ─── 3. Action Command Center ────────────────────────────────────
  renderActionCenter();

  // ─── 4. Intelligence Grid ────────────────────────────────────────
  renderLeaderboard();
  renderConversionFunnel();
  renderLostDealAnalysis();
}

function renderActionCenter() {
  const analytics = state.analytics;
  const overdueTasks = analytics?.followups?.overdue || state.tasks.filter(t => t.bucket === 'overdue' && !t.done);
  const todayTasks = analytics?.followups?.today || state.tasks.filter(t => t.bucket === 'today' && !t.done);

  if (el('overdueCountBadge')) el('overdueCountBadge').textContent = overdueTasks.length;
  if (el('todayCountBadge')) el('todayCountBadge').textContent = todayTasks.length;

  // ─── Priority Actions Feed ──────────────────────────────────────
  renderPriorityActions();

  // Render followups
  const activeFollowupList = state.followupTab === 'today' ? todayTasks : overdueTasks;
  const followupsContainer = el('dashboardFollowups');
  if (followupsContainer) {
    if (activeFollowupList.length === 0) {
      followupsContainer.innerHTML = '<div class="empty-action">✓ All follow-ups cleared!</div>';
    } else {
      followupsContainer.innerHTML = activeFollowupList.map(t => `
        <div class="action-task-item">
          <span class="priority-dot ${t.priority || 'medium'}"></span>
          <div class="task-info">
            <p class="task-title">${escapeHTML(t.title)}</p>
            <p class="task-meta">${escapeHTML(t.company || '')} · ${escapeHTML(t.assignee || '')}</p>
          </div>
          <div class="task-actions">
            <button type="button" class="action-btn complete" data-complete-task="${t.id}" title="Mark task done">✓ Done</button>
          </div>
        </div>
      `).join('');
    }
  }

  // Render deals closing this week
  const dealsClosing = analytics?.dealsClosingThisWeek || state.deals.filter(d => !['Won', 'Lost'].includes(d.stage)).slice(0, 5);
  const dealsContainer = el('dashboardDealsClosing');
  if (dealsContainer) {
    if (dealsClosing.length === 0) {
      dealsContainer.innerHTML = '<div class="empty-action">No deals scheduled to close soon.</div>';
    } else {
      dealsContainer.innerHTML = dealsClosing.map(d => `
        <div class="action-deal-item">
          <div class="deal-info">
            <p class="deal-title">${escapeHTML(d.title)}</p>
            <p class="deal-meta">${escapeHTML(d.company || '')} · <span class="deal-value-badge">${money(d.value)}</span> (${d.stage})</p>
          </div>
          <div class="deal-actions">
            <button type="button" class="action-btn advance" data-advance-deal="${d.id}" title="Advance to next stage">Advance →</button>
            <button type="button" class="action-btn won" data-won-deal="${d.id}" title="Mark deal won">Won ✓</button>
          </div>
        </div>
      `).join('');
    }
  }

  // Render new leads
  const newLeads = analytics?.newLeadsToday || state.companies.filter(c => c.status === 'lead').slice(0, 5);
  const leadsContainer = el('dashboardNewLeads');
  if (leadsContainer) {
    if (newLeads.length === 0) {
      leadsContainer.innerHTML = '<div class="empty-action">No new leads today. Add one above!</div>';
    } else {
      leadsContainer.innerHTML = newLeads.map(l => `
        <div class="action-lead-item">
          <div class="lead-info">
            <p class="lead-title">${escapeHTML(l.name)}</p>
            <p class="lead-meta">${escapeHTML(l.industry || 'General')} · Owner: ${escapeHTML(l.owner || 'Aarav')}</p>
          </div>
          <div class="lead-actions">
            <button type="button" class="action-btn create" data-create-deal-for="${escapeHTML(l.name)}" title="Create deal for this company">+ Deal</button>
          </div>
        </div>
      `).join('');
    }
  }
}

function renderPriorityActions() {
  const container = el('priorityActionsFeed');
  if (!container) return;

  const priorityItems = [];

  // 0. Pending Approvals (>15% discount or >₹10L deal)
  const pendingApprovals = (state.approvals || []).filter(a => (a.status || '').toLowerCase() === 'pending');
  pendingApprovals.forEach(a => {
    priorityItems.push({
      type: 'approval',
      title: `Approval Required: ${a.type}`,
      subtitle: `Requested by ${a.requester_name || 'Rep'} · ${a.comments || 'Threshold review required'}`,
      badge: 'APPROVAL NEEDED',
      badgeClass: 'red',
      actionText: 'Review Approval',
      actionView: 'approvals'
    });
  });

  // 0.5. Overdue Invoices
  const overdueInvoices = (state.invoices || []).filter(i => (i.status || '').toLowerCase() === 'overdue');
  overdueInvoices.forEach(i => {
    priorityItems.push({
      type: 'invoice',
      title: `Overdue Invoice ${i.invoice_number}`,
      subtitle: `${i.company_name || 'Client'} · Total: ${money(i.total)} · Due date: ${i.due_date || 'Past Due'}`,
      badge: 'OVERDUE INVOICE',
      badgeClass: 'red',
      actionText: 'Manage Invoices',
      actionView: 'invoices'
    });
  });

  // 1. Quotes awaiting response
  const pendingQuotes = (state.quotations || []).filter(q => ['sent', 'viewed', 'negotiation'].includes((q.status || '').toLowerCase()));
  pendingQuotes.forEach(q => {
    priorityItems.push({
      type: 'quote',
      title: `Quote ${q.quotation_number} awaiting client response`,
      subtitle: `${q.company_name || 'Client'} · Total: ${money(q.total)} · Valid until ${q.valid_until || 'N/A'}`,
      badge: 'QUOTATION',
      badgeClass: 'blue',
      actionText: 'View Quotes',
      actionView: 'quotations'
    });
  });

  // 2. Renewals due soon
  const dueRenewals = (state.renewals || []).filter(r => (r.status || '').toLowerCase() === 'upcoming');
  dueRenewals.forEach(r => {
    priorityItems.push({
      type: 'renewal',
      title: `Contract renewal due for ${r.company_name || 'Customer'}`,
      subtitle: `${r.product_name || 'Subscription'} · Value: ${money(r.value)} · Date: ${r.renewal_date || 'Upcoming'}`,
      badge: 'RENEWAL',
      badgeClass: 'amber',
      actionText: 'Manage Renewal',
      actionView: 'renewals'
    });
  });

  // 3. Overdue Tasks
  const overdueTasks = (state.tasks || []).filter(t => !t.done && t.bucket === 'overdue');
  overdueTasks.slice(0, 3).forEach(t => {
    priorityItems.push({
      type: 'task',
      title: `Overdue Follow-up: ${t.title}`,
      subtitle: `${t.company || 'Account'} · Assigned to ${t.assignee || 'Aarav'}`,
      badge: 'OVERDUE TASK',
      badgeClass: 'red',
      actionText: 'Open Tasks',
      actionView: 'tasks'
    });
  });

  if (priorityItems.length === 0) {
    container.innerHTML = '<div style="grid-column: 1 / -1; padding: 1rem; color: var(--text-secondary); text-align: center;">✨ All sales priority actions cleared! Great job.</div>';
  } else {
    container.innerHTML = priorityItems.slice(0, 6).map(item => `
      <div style="background: var(--bg-surface); padding: 1rem; border-radius: 8px; border: 1px solid var(--border-light); display: flex; flex-direction: column; justify-space-between;">
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <span class="status-pill status-${item.badgeClass}" style="font-size: 0.7rem; font-weight: 700; text-transform: uppercase;">${escapeHTML(item.badge)}</span>
          </div>
          <strong style="font-size: 0.95rem; color: var(--text-primary); display: block; margin-bottom: 0.25rem;">${escapeHTML(item.title)}</strong>
          <small style="color: var(--text-secondary); font-size: 0.8rem; display: block; margin-bottom: 0.75rem;">${escapeHTML(item.subtitle)}</small>
        </div>
        <button type="button" class="button button-quiet button-sm" data-view="${item.actionView}" style="align-self: flex-start;">${escapeHTML(item.actionText)} →</button>
      </div>
    `).join('');
  }
}

function renderLeaderboard() {
  const container = el('dashboardLeaderboard');
  if (!container) return;

  const defaultLeaderboard = [
    { name: 'Aarav Sharma', wonRevenue: 1260000, winRate: 75, quotaPercent: 63 },
    { name: 'Priya Menon', wonRevenue: 380000, winRate: 50, quotaPercent: 19 },
    { name: 'Kunal Shah', wonRevenue: 290000, winRate: 50, quotaPercent: 15 }
  ];
  const list = state.analytics?.leaderboard || defaultLeaderboard;
  const ranks = ['🥇', '🥈', '🥉'];
  const rankCls = ['gold', 'silver', 'bronze'];

  container.innerHTML = `
    <div class="leaderboard-header">
      <span>#</span>
      <span>Rep</span>
      <span style="text-align:right">Won</span>
      <span style="text-align:center">Win %</span>
      <span style="text-align:right">Quota %</span>
    </div>
    ${list.map((r, idx) => `
      <div class="leaderboard-row">
        <span class="leaderboard-rank ${rankCls[idx] || ''}">${ranks[idx] || (idx + 1)}</span>
        <span class="leaderboard-name">${escapeHTML(r.name)}</span>
        <span class="leaderboard-revenue">${money(r.wonRevenue)}</span>
        <span class="leaderboard-winrate">${r.winRate}%</span>
        <span class="leaderboard-quota">
          <span class="quota-bar"><span class="quota-fill" style="width: ${Math.min(100, r.quotaPercent)}%"></span></span>
          <small>${r.quotaPercent}%</small>
        </span>
      </div>
    `).join('')}
  `;
}

function renderConversionFunnel() {
  const container = el('dashboardFunnel');
  if (!container) return;

  const defaultFunnel = [
    { stage: 'New Lead', count: 2, value: 970000, conversionRate: 100 },
    { stage: 'Qualified', count: 3, value: 1100000, conversionRate: 100 },
    { stage: 'Proposal Sent', count: 2, value: 1170000, conversionRate: 67 },
    { stage: 'Negotiation', count: 2, value: 1260000, conversionRate: 100 },
    { stage: 'Won', count: 3, value: 1640000, conversionRate: 150 }
  ];
  const list = state.analytics?.funnel || defaultFunnel;
  const maxCount = Math.max(...list.map(f => f.count), 1);

  container.innerHTML = list.map((step, idx) => `
    <div class="funnel-step">
      <span class="funnel-label">${escapeHTML(step.stage)}</span>
      <div class="funnel-bar-wrap">
        <div class="funnel-bar stage-${idx}" style="width: ${Math.max(12, (step.count / maxCount) * 100)}%"></div>
        <span class="funnel-count">${step.count}</span>
      </div>
      <span class="funnel-conv">${step.conversionRate}% conv</span>
      <span class="funnel-value">${money(step.value)}</span>
    </div>
  `).join('');
}

function renderLostDealAnalysis() {
  const container = el('dashboardLostAnalysis');
  if (!container) return;

  const defaultLost = [
    { reason: 'Budget constraints', value: 620000, percentage: 50, count: 1 },
    { reason: 'Chose competitor', value: 340000, percentage: 27, count: 1 },
    { reason: 'Timing / no decision', value: 280000, percentage: 23, count: 1 }
  ];
  const list = state.analytics?.lostAnalysis || defaultLost;

  if (list.length === 0) {
    container.innerHTML = '<div class="empty-action">No lost deals recorded yet.</div>';
    return;
  }

  container.innerHTML = list.map(item => `
    <div class="lost-reason-row">
      <span class="lost-reason-label">${escapeHTML(item.reason)}</span>
      <div class="lost-bar-wrap">
        <div class="lost-bar" style="width: ${Math.max(8, item.percentage)}%"></div>
      </div>
      <div class="lost-stats">
        <span class="lost-stat value">${money(item.value)}</span>
        <span class="lost-stat percent">${item.percentage}%</span>
      </div>
    </div>
  `).join('');
}

// ─── PRODUCTS RENDERER ──────────────────────────────────────────────

function renderProducts() {
  const tbody = el('productTableBody');
  if (!tbody) return;

  const search = (el('productSearch')?.value || '').toLowerCase();
  const category = el('productCategoryFilter')?.value || 'all';

  const filtered = state.products.filter(p => {
    const matchesCat = category === 'all' || p.category === category;
    const matchesSearch = `${p.name} ${p.sku || ''} ${p.description || ''} ${p.category || ''}`.toLowerCase().includes(search);
    return matchesCat && matchesSearch;
  });

  if (el('productResultCount')) {
    el('productResultCount').textContent = `${filtered.length} ${filtered.length === 1 ? 'product' : 'products'}`;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">No products found. Click "+ Add Product" to create one.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(p => `
    <tr>
      <td>
        <strong>${escapeHTML(p.name)}</strong>
        ${p.description ? `<small style="display:block;color:var(--muted);font-size:11px">${escapeHTML(p.description)}</small>` : ''}
      </td>
      <td><code>${escapeHTML(p.sku || '—')}</code></td>
      <td><span class="status lead">${escapeHTML(p.category || 'General')}</span></td>
      <td><strong>${money(p.unit_price)}</strong></td>
      <td>
        <span class="status-pill ${p.is_active !== false ? 'status-active-product' : 'status-inactive'}">
          ${p.is_active !== false ? 'Active' : 'Archived'}
        </span>
      </td>
      <td>
        <div style="display:flex;gap:4px;justify-content:flex-end">
          <button type="button" class="button button-quiet button-sm" data-edit-product="${p.id}" title="Edit product">Edit</button>
          <button type="button" class="button button-quiet button-sm" style="color:var(--red)" data-delete-product="${p.id}" title="Archive product">×</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function openProductModal(product = null) {
  state.editingProductId = product ? product.id : null;
  const title = el('productModalTitle');
  if (title) title.textContent = product ? 'Edit Product' : 'Add Product';

  if (el('productName')) el('productName').value = product ? product.name : '';
  if (el('productSku')) el('productSku').value = product ? (product.sku || '') : '';
  if (el('productCategory')) el('productCategory').value = product ? (product.category || 'Gateway') : 'Gateway';
  if (el('productPrice')) el('productPrice').value = product ? product.unit_price : '';
  if (el('productCurrency')) el('productCurrency').value = product ? (product.currency || 'INR') : 'INR';
  if (el('productDescription')) el('productDescription').value = product ? (product.description || '') : '';

  showModal('productModal');
}

// ─── QUOTATIONS RENDERER ────────────────────────────────────────────

function renderQuotations() {
  const tbody = el('quotationTableBody');
  if (!tbody) return;

  const search = (el('quotationSearch')?.value || '').toLowerCase();
  const status = el('quotationStatusFilter')?.value || 'all';

  const filtered = state.quotations.filter(q => {
    const matchesStatus = status === 'all' || q.status === status;
    const matchesSearch = `${q.quotation_number || ''} ${q.company_name || ''} ${q.deal_title || ''} ${q.notes || ''}`.toLowerCase().includes(search);
    return matchesStatus && matchesSearch;
  });

  if (el('quotationResultCount')) {
    el('quotationResultCount').textContent = `${filtered.length} ${filtered.length === 1 ? 'quotation' : 'quotations'}`;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-cell">No quotations found. Click "+ New Quotation" to create one.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(q => `
    <tr>
      <td><strong>${escapeHTML(q.quotation_number || `QTN-${q.id}`)}</strong> <span class="tag blue-tag" style="font-size:0.7rem; padding: 2px 6px;">v${q.version || 1}</span></td>
      <td>${escapeHTML(q.company_name || '—')}</td>
      <td>${q.valid_until ? displayDate(q.valid_until) : '—'}</td>
      <td>${money(q.subtotal || 0)}</td>
      <td>${q.discount_percent || 0}%</td>
      <td>18%</td>
      <td><strong>${money(q.total || 0)}</strong></td>
      <td><span class="status-pill status-${(q.status || 'draft').toLowerCase()}">${(q.status || 'draft').toUpperCase()}</span></td>
      <td>
        <div style="display:flex;gap:6px;justify-content:flex-end">
          <button type="button" class="button button-quiet button-sm" data-public-view-quote="${q.id}" title="Customer portal view">🔗 Portal View</button>
          <button type="button" class="button button-secondary button-sm" data-send-quotation="${q.id}">✉ Send</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function initQuotationModal() {
  const companySelect = el('qtnCompany');
  const contactSelect = el('qtnContact');
  const dealSelect = el('qtnDeal');

  if (companySelect) {
    companySelect.innerHTML = state.companies.map(c => `<option value="${c.id}">${escapeHTML(c.name)}</option>`).join('');
  }
  if (contactSelect) {
    contactSelect.innerHTML = state.contacts.map(c => `<option value="${c.id}">${escapeHTML(c.name)} (${escapeHTML(c.company_name || c.email || '')})</option>`).join('');
  }
  if (dealSelect) {
    dealSelect.innerHTML = '<option value="">None</option>' + state.deals.filter(d => !['Won', 'Lost'].includes(d.stage)).map(d => `<option value="${d.id}">${escapeHTML(d.title)} (${escapeHTML(d.company)})</option>`).join('');
  }

  // Set default valid_until to 30 days from now
  const future = new Date();
  future.setDate(future.getDate() + 30);
  const validUntilInput = el('qtnValidUntil');
  if (validUntilInput && !validUntilInput.value) {
    validUntilInput.value = future.toISOString().split('T')[0];
  }

  // Filter active products only
  const activeProducts = state.products.filter(p => p.is_active !== false);

  // Initialize with 1 line item if empty
  if (state.quotationLineItems.length === 0) {
    const firstProd = activeProducts[0] || { id: 1, name: 'Payment Gateway License', unit_price: 250000 };
    state.quotationLineItems = [{
      product_id: firstProd.id,
      description: firstProd.name,
      quantity: 1,
      unit_price: firstProd.unit_price || 0,
      discount_percent: 0,
      total: firstProd.unit_price || 0
    }];
  }

  renderLineItems();
  updateQuotationTotals();
}

function renderLineItems() {
  const tbody = el('lineItemsBody');
  if (!tbody) return;

  tbody.innerHTML = state.quotationLineItems.map((item, idx) => `
    <tr data-item-idx="${idx}">
      <td>
        <select class="line-item-prod" data-idx="${idx}">
          ${state.products.map(p => `<option value="${p.id}" ${Number(item.product_id) === Number(p.id) ? 'selected' : ''} data-price="${p.unit_price}" data-name="${escapeHTML(p.name)}">${escapeHTML(p.name)}</option>`).join('')}
        </select>
      </td>
      <td><input type="text" class="line-item-desc" data-idx="${idx}" value="${escapeHTML(item.description || '')}" placeholder="Item description"></td>
      <td><input type="number" class="line-item-qty" data-idx="${idx}" value="${item.quantity || 1}" min="1" style="width:60px"></td>
      <td><input type="number" class="line-item-price" data-idx="${idx}" value="${item.unit_price || 0}" step="1000" style="width:100px"></td>
      <td><input type="number" class="line-item-discount" data-idx="${idx}" value="${item.discount_percent || 0}" min="0" max="100" style="width:60px"></td>
      <td><strong class="line-item-total" data-idx="${idx}">${money(item.total || 0)}</strong></td>
      <td><button type="button" class="line-item-remove" data-idx="${idx}" title="Remove item">×</button></td>
    </tr>
  `).join('');
}

function updateQuotationTotals() {
  let subtotal = 0;
  state.quotationLineItems.forEach((item, idx) => {
    const qty = Number(item.quantity) || 1;
    const price = Number(item.unit_price) || 0;
    const disc = Number(item.discount_percent) || 0;
    const lineTotal = (qty * price) * (1 - disc / 100);
    item.total = Math.round(lineTotal);
    subtotal += item.total;

    const rowTotalNode = document.querySelector(`.line-item-total[data-idx="${idx}"]`);
    if (rowTotalNode) rowTotalNode.textContent = money(item.total);
  });

  const discountPercent = Number(el('qtnDiscount')?.value || 0);
  const taxPercent = Number(el('qtnTax')?.value || 18);

  const discountAmount = subtotal * (discountPercent / 100);
  const afterDiscount = subtotal - discountAmount;
  const taxAmount = afterDiscount * (taxPercent / 100);
  const total = Math.round(afterDiscount + taxAmount);

  if (el('qtnSubtotal')) el('qtnSubtotal').textContent = money(subtotal);
  if (el('qtnDiscountAmount')) el('qtnDiscountAmount').textContent = `- ${money(discountAmount)}`;
  if (el('qtnTaxAmount')) el('qtnTaxAmount').textContent = `+ ${money(taxAmount)}`;
  if (el('qtnTotal')) el('qtnTotal').textContent = money(total);
}

// ─── INVOICES & PAYMENTS RENDERER ───────────────────────────────────

function renderInvoices() {
  const tbody = el('invoiceTableBody');
  if (!tbody) return;

  const search = (el('invoiceSearch')?.value || '').toLowerCase();
  const statusFilter = el('invoiceStatusFilter')?.value || 'all';
  const companyFilter = el('invoiceCompanyFilter')?.value || 'all';

  const companySelect = el('invoiceCompanyFilter');
  if (companySelect && companySelect.options && companySelect.options.length <= 1) {
    companySelect.innerHTML = '<option value="all">All companies</option>' +
      state.companies.map(c => `<option value="${c.id}">${escapeHTML(c.name)}</option>`).join('');
  }

  const today = new Date().toISOString().slice(0, 10);

  let totalInvoiced = 0;
  let totalCollected = 0;
  let totalOutstanding = 0;
  let totalOverdue = 0;
  let overdueCount = 0;

  state.invoices.forEach(inv => {
    const total = Number(inv.total) || 0;
    const paid = Number(inv.amount_paid) || 0;
    const balance = Math.max(0, total - paid);

    totalInvoiced += total;
    totalCollected += paid;
    totalOutstanding += balance;

    const isOverdue = (inv.status === 'overdue') || (balance > 0 && inv.due_date && inv.due_date < today && inv.status !== 'paid' && inv.status !== 'cancelled');
    if (isOverdue) {
      totalOverdue += balance;
      overdueCount++;
    }
  });

  if (el('invKpiTotal')) el('invKpiTotal').textContent = money(totalInvoiced);
  if (el('invKpiTotalCount')) el('invKpiTotalCount').textContent = `${state.invoices.length} invoices generated`;

  if (el('invKpiCollected')) el('invKpiCollected').textContent = money(totalCollected);
  const collectionRate = totalInvoiced > 0 ? Math.round((totalCollected / totalInvoiced) * 100) : 0;
  if (el('invKpiCollectionRate')) el('invKpiCollectionRate').textContent = `${collectionRate}% collection rate`;

  if (el('invKpiOutstanding')) el('invKpiOutstanding').textContent = money(totalOutstanding);

  if (el('invKpiOverdue')) el('invKpiOverdue').textContent = money(totalOverdue);
  if (el('invKpiOverdueCount')) el('invKpiOverdueCount').textContent = `${overdueCount} overdue invoices`;

  const filtered = state.invoices.filter(inv => {
    let currentStatus = inv.status;
    if (currentStatus !== 'paid' && currentStatus !== 'cancelled' && inv.due_date && inv.due_date < today) {
      currentStatus = 'overdue';
    }

    const matchesStatus = statusFilter === 'all' || currentStatus === statusFilter;
    const matchesCompany = companyFilter === 'all' || Number(inv.company_id) === Number(companyFilter);
    const matchesSearch = `${inv.invoice_number || ''} ${inv.company_name || ''} ${inv.deal_title || ''} ${inv.notes || ''}`.toLowerCase().includes(search);
    return matchesStatus && matchesCompany && matchesSearch;
  });

  if (el('invoiceResultCount')) {
    el('invoiceResultCount').textContent = `${filtered.length} ${filtered.length === 1 ? 'invoice' : 'invoices'}`;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-cell">No invoices found. Click "+ Create Invoice" to issue a new tax invoice.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(inv => {
    const totalAmount = Number(inv.total) || 0;
    const amountPaid = Number(inv.amount_paid) || 0;
    const balanceDue = Math.max(0, totalAmount - amountPaid);

    let status = inv.status || 'draft';
    if (status !== 'paid' && status !== 'cancelled' && inv.due_date && inv.due_date < today) {
      status = 'overdue';
    }

    return `
      <tr>
        <td><strong>${escapeHTML(inv.invoice_number || `INV-${inv.id}`)}</strong></td>
        <td>${escapeHTML(inv.company_name || '—')}</td>
        <td>${inv.issue_date ? displayDate(inv.issue_date) : '—'}</td>
        <td>${inv.due_date ? displayDate(inv.due_date) : '—'}</td>
        <td><strong>${money(totalAmount)}</strong></td>
        <td><span style="color:#10b981;font-weight:600">${money(amountPaid)}</span></td>
        <td><strong style="color:${balanceDue > 0 ? '#ef4444' : 'var(--muted)'}">${money(balanceDue)}</strong></td>
        <td><span class="status-pill status-${status}">${status.toUpperCase()}</span></td>
        <td>
          <div style="display:flex;gap:4px;justify-content:flex-end">
            ${balanceDue > 0 ? `<button type="button" class="btn-table-action btn-pay" data-record-payment="${inv.id}" title="Record payment">+ Pay</button>` : ''}
            <button type="button" class="btn-table-action btn-send" data-send-invoice="${inv.id}" title="Send tax invoice via email">✉ Send</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// ─── PURCHASE ORDERS RENDERER ───────────────────────────────────────

function renderPurchaseOrders() {
  const tbody = el('poTableBody');
  if (!tbody) return;

  const search = (el('poSearch')?.value || '').toLowerCase();
  const statusFilter = el('poStatusFilter')?.value || 'all';
  const companyFilter = el('poCompanyFilter')?.value || 'all';

  const companySelect = el('poCompanyFilter');
  if (companySelect && companySelect.options && companySelect.options.length <= 1) {
    companySelect.innerHTML = '<option value="all">All companies</option>' +
      state.companies.map(c => `<option value="${c.id}">${escapeHTML(c.name)}</option>`).join('');
  }

  const filtered = state.purchase_orders.filter(po => {
    const matchesStatus = statusFilter === 'all' || po.status === statusFilter;
    const matchesCompany = companyFilter === 'all' || Number(po.company_id) === Number(companyFilter);
    const matchesSearch = `${po.po_number || ''} ${po.company_name || ''} ${po.deal_title || ''} ${po.notes || ''}`.toLowerCase().includes(search);
    return matchesStatus && matchesCompany && matchesSearch;
  });

  if (el('poResultCount')) {
    el('poResultCount').textContent = `${filtered.length} ${filtered.length === 1 ? 'purchase order' : 'purchase orders'}`;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-cell">No purchase orders found. Click "+ Log PO" to add a customer purchase order.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(po => `
    <tr>
      <td><strong>${escapeHTML(po.po_number || `PO-${po.id}`)}</strong></td>
      <td>${escapeHTML(po.company_name || '—')}</td>
      <td><code>${escapeHTML(po.quotation_number || '—')}</code></td>
      <td>${escapeHTML(po.deal_title || '—')}</td>
      <td><strong>${money(po.amount)}</strong></td>
      <td>${po.issue_date ? displayDate(po.issue_date) : '—'}</td>
      <td><span class="status-pill status-${po.status || 'received'}">${(po.status || 'received').toUpperCase()}</span></td>
      <td>
        ${po.invoice_number ? `<code>${escapeHTML(po.invoice_number)}</code>` : `<button type="button" class="btn-table-action btn-send" data-create-invoice-from-po="${po.id}">+ Invoice</button>`}
      </td>
      <td>
        <div style="display:flex;gap:4px;justify-content:flex-end">
          <button type="button" class="button button-quiet button-sm" data-edit-po="${po.id}">Edit</button>
        </div>
      </td>
    </tr>
  `).join('');
}

// ─── INVOICE MODAL HELPERS ──────────────────────────────────────────

function initInvoiceModal() {
  const companySelect = el('invCompany');
  const contactSelect = el('invContact');
  const dealSelect = el('invDeal');
  const poSelect = el('invPo');

  if (companySelect) {
    companySelect.innerHTML = state.companies.map(c => `<option value="${c.id}">${escapeHTML(c.name)}</option>`).join('');
  }
  if (contactSelect) {
    contactSelect.innerHTML = state.contacts.map(c => `<option value="${c.id}">${escapeHTML(c.name)} (${escapeHTML(c.company_name || c.email || '')})</option>`).join('');
  }
  if (dealSelect) {
    dealSelect.innerHTML = '<option value="">None</option>' + state.deals.filter(d => !['Won', 'Lost'].includes(d.stage)).map(d => `<option value="${d.id}">${escapeHTML(d.title)} (${escapeHTML(d.company)})</option>`).join('');
  }
  if (poSelect) {
    poSelect.innerHTML = '<option value="">None</option>' + state.purchase_orders.map(p => `<option value="${p.id}">${escapeHTML(p.po_number)} — ${money(p.amount)}</option>`).join('');
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const future = new Date();
  future.setDate(future.getDate() + 15);
  const futureStr = future.toISOString().split('T')[0];

  if (el('invIssueDate')) el('invIssueDate').value = todayStr;
  if (el('invDueDate')) el('invDueDate').value = futureStr;

  if (state.invoiceLineItems.length === 0) {
    const firstProd = state.products[0] || { id: 1, name: 'Payment Gateway License', unit_price: 250000 };
    state.invoiceLineItems = [{
      product_id: firstProd.id,
      description: firstProd.name,
      quantity: 1,
      unit_price: firstProd.unit_price || 0,
      discount_percent: 0,
      total: firstProd.unit_price || 0
    }];
  }

  renderInvLineItems();
  updateInvoiceTotals();
}

function renderInvLineItems() {
  const tbody = el('invLineItemsBody');
  if (!tbody) return;

  tbody.innerHTML = state.invoiceLineItems.map((item, idx) => `
    <tr data-inv-idx="${idx}">
      <td>
        <select class="inv-line-prod" data-idx="${idx}">
          ${state.products.map(p => `<option value="${p.id}" ${Number(item.product_id) === Number(p.id) ? 'selected' : ''} data-price="${p.unit_price}" data-name="${escapeHTML(p.name)}">${escapeHTML(p.name)}</option>`).join('')}
        </select>
      </td>
      <td><input type="text" class="inv-line-desc" data-idx="${idx}" value="${escapeHTML(item.description || '')}" placeholder="Item description"></td>
      <td><input type="number" class="inv-line-qty" data-idx="${idx}" value="${item.quantity || 1}" min="1" style="width:60px"></td>
      <td><input type="number" class="inv-line-price" data-idx="${idx}" value="${item.unit_price || 0}" step="1000" style="width:100px"></td>
      <td><input type="number" class="inv-line-discount" data-idx="${idx}" value="${item.discount_percent || 0}" min="0" max="100" style="width:60px"></td>
      <td><strong class="inv-line-total" data-idx="${idx}">${money(item.total || 0)}</strong></td>
      <td><button type="button" class="line-item-remove inv-line-remove" data-idx="${idx}" title="Remove item">×</button></td>
    </tr>
  `).join('');
}

function updateInvoiceTotals() {
  let subtotal = 0;
  state.invoiceLineItems.forEach((item, idx) => {
    const qty = Number(item.quantity) || 1;
    const price = Number(item.unit_price) || 0;
    const disc = Number(item.discount_percent) || 0;
    const lineTotal = (qty * price) * (1 - disc / 100);
    item.total = Math.round(lineTotal);
    subtotal += item.total;

    const rowTotalNode = document.querySelector(`.inv-line-total[data-idx="${idx}"]`);
    if (rowTotalNode) rowTotalNode.textContent = money(item.total);
  });

  const discountPercent = Number(el('invDiscount')?.value || 0);
  const taxPercent = Number(el('invTax')?.value || 18);

  const discountAmount = subtotal * (discountPercent / 100);
  const afterDiscount = subtotal - discountAmount;
  const taxAmount = afterDiscount * (taxPercent / 100);
  const total = Math.round(afterDiscount + taxAmount);

  if (el('invSubtotal')) el('invSubtotal').textContent = money(subtotal);
  if (el('invDiscountAmount')) el('invDiscountAmount').textContent = `- ${money(discountAmount)}`;
  if (el('invTaxAmount')) el('invTaxAmount').textContent = `+ ${money(taxAmount)}`;
  if (el('invTotal')) el('invTotal').textContent = money(total);
}

// ─── PAYMENT MODAL HELPERS ──────────────────────────────────────────

function openPaymentModal(invoice) {
  if (!invoice) return;
  const invoiceId = invoice.id;
  const totalAmount = Number(invoice.total) || 0;
  const amountPaid = Number(invoice.amount_paid) || 0;
  const balanceDue = Math.max(0, totalAmount - amountPaid);

  if (el('payInvoiceId')) el('payInvoiceId').value = invoiceId;
  if (el('paymentModalSubtitle')) el('paymentModalSubtitle').textContent = `Settlement for Invoice ${invoice.invoice_number || `INV-${invoiceId}`} (${invoice.company_name || 'Customer'})`;

  if (el('payInvoiceTotal')) el('payInvoiceTotal').textContent = money(totalAmount);
  if (el('payInvoicePaid')) el('payInvoicePaid').textContent = money(amountPaid);
  if (el('payInvoiceBalance')) el('payInvoiceBalance').textContent = money(balanceDue);

  if (el('payAmount')) {
    el('payAmount').value = balanceDue;
    el('payAmount').max = balanceDue;
  }
  if (el('payDate')) el('payDate').value = new Date().toISOString().split('T')[0];
  if (el('payRef')) el('payRef').value = '';
  if (el('payNotes')) el('payNotes').value = '';

  showModal('paymentModal');
}

// ─── PO MODAL HELPERS ───────────────────────────────────────────────

function initPoModal() {
  const companySelect = el('poCompany');
  const qtnSelect = el('poQuotation');
  const dealSelect = el('poDeal');

  if (companySelect) {
    companySelect.innerHTML = state.companies.map(c => `<option value="${c.id}">${escapeHTML(c.name)}</option>`).join('');
  }
  if (qtnSelect) {
    qtnSelect.innerHTML = '<option value="">None</option>' + state.quotations.map(q => `<option value="${q.id}">${escapeHTML(q.quotation_number)} — ${money(q.total)}</option>`).join('');
  }
  if (dealSelect) {
    dealSelect.innerHTML = '<option value="">None</option>' + state.deals.filter(d => !['Won', 'Lost'].includes(d.stage)).map(d => `<option value="${d.id}">${escapeHTML(d.title)} (${escapeHTML(d.company)})</option>`).join('');
  }

  if (el('poIssueDate') && !el('poIssueDate').value) {
    el('poIssueDate').value = new Date().toISOString().split('T')[0];
  }
}

function renderLeads() {
  const tbody = el('leadTableBody');
  if (!tbody) return;

  const search = (el('leadSearch')?.value || '').toLowerCase();
  const statusFilter = el('leadStatusFilter')?.value || 'all';
  const sourceFilter = el('leadSourceFilter')?.value || 'all';
  const ownerFilter = el('leadOwnerFilter')?.value || 'all';

  const filtered = (state.leads || []).filter(l => {
    const matchesStatus = statusFilter === 'all' || (l.status || '').toLowerCase() === statusFilter.toLowerCase();
    const matchesSource = sourceFilter === 'all' || (l.source || '').toLowerCase() === sourceFilter.toLowerCase();
    const matchesOwner = ownerFilter === 'all' || (l.owner || '').toLowerCase() === ownerFilter.toLowerCase();
    const matchesSearch = `${l.name || ''} ${l.company || ''} ${l.email || ''} ${l.phone || ''}`.toLowerCase().includes(search);
    return matchesStatus && matchesSource && matchesOwner && matchesSearch;
  });

  if (el('leadResultCount')) {
    el('leadResultCount').textContent = `${filtered.length} lead${filtered.length === 1 ? '' : 's'} found`;
  }

  tbody.innerHTML = filtered.map(l => {
    const scoreColor = l.lead_score >= 80 ? 'green-tag' : (l.lead_score >= 60 ? 'blue-tag' : 'orange-tag');
    const isConverted = l.status === 'Converted';
    return `
      <tr>
        <td><input type="checkbox" class="lead-row-check" data-lead-id="${l.id}"></td>
        <td><strong>${escapeHTML(l.name)}</strong><br/><small class="text-muted">${escapeHTML(l.contact_name || '')}</small></td>
        <td><b>${escapeHTML(l.company || l.name)}</b><br/><small>${escapeHTML(l.industry || 'General')}</small></td>
        <td><span class="tag gray-tag">${escapeHTML(l.source || 'Inbound')}</span></td>
        <td><span class="tag ${scoreColor}">★ ${l.lead_score || 50}</span></td>
        <td><span class="status-pill ${l.status ? l.status.toLowerCase() : 'new'}">${escapeHTML(l.status || 'New')}</span></td>
        <td><b>₹${((Number(l.expected_value) || 0) / 100000).toFixed(1)}L</b></td>
        <td>${l.next_followup || 'Unscheduled'}</td>
        <td>${escapeHTML(l.owner || 'Aarav Sharma')}</td>
        <td>
          <div class="table-actions">
            ${isConverted ? `<span class="badge badge-success">✓ Converted</span>` : `<button type="button" class="button button-primary button-sm convert-lead-btn" data-lead-id="${l.id}">⚡ Convert</button>`}
            <button type="button" class="text-button edit-lead-btn" data-lead-id="${l.id}">Edit</button>
          </div>
        </td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="10" class="empty-state">No leads match your search criteria. <button type="button" class="text-link" id="emptyCreateLeadBtn">Create lead</button></td></tr>';
}

function renderRenewals() {
  const tbody = el('renewalTableBody');
  if (!tbody) return;
  const list = state.renewals || [];
  tbody.innerHTML = list.map(r => `
    <tr>
      <td><strong>${escapeHTML(r.company_name || 'Customer')}</strong></td>
      <td>${escapeHTML(r.product_name || 'Contract')}</td>
      <td><b>₹${((Number(r.value) || 0) / 100000).toFixed(1)}L</b></td>
      <td>${r.renewal_date || '—'}</td>
      <td><span class="status-pill ${r.status ? r.status.toLowerCase() : 'upcoming'}">${escapeHTML(r.status || 'Upcoming')}</span></td>
      <td>${escapeHTML(r.owner || 'Aarav Sharma')}</td>
      <td><button type="button" class="text-button edit-renewal-btn" data-renewal-id="${r.id}">Edit</button></td>
    </tr>
  `).join('') || '<tr><td colspan="7" class="empty-state">No contract renewals scheduled.</td></tr>';
}

function renderAutomations() {
  const container = el('automationRulesList');
  if (!container) return;
  const list = state.automations || [];

  container.innerHTML = list.map(a => {
    let condText = 'Always trigger';
    if (a.conditions) {
      try {
        const parsed = typeof a.conditions === 'string' ? JSON.parse(a.conditions) : a.conditions;
        condText = Object.entries(parsed).map(([k, v]) => `${k} ${v}`).join(', ');
      } catch (e) {
        condText = String(a.conditions);
      }
    }

    let actionText = a.action_type || 'Action';
    if (a.action_config) {
      try {
        const ac = typeof a.action_config === 'string' ? JSON.parse(a.action_config) : a.action_config;
        actionText = `${a.action_type}: ${ac.title || ac.template || ac.target_role || ''}`;
      } catch (e) {
        actionText = a.action_type;
      }
    }

    return `
      <div class="panel rule-card" style="padding: 1.25rem; background: #ffffff; border: 1px solid var(--border-light); border-radius: 10px; display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
            <strong style="font-size: 1rem; color: #0f172a;">${escapeHTML(a.name)}</strong>
            <button type="button" class="button button-quiet button-sm toggle-automation-btn" data-auto-id="${a.id}" style="font-size: 11px; padding: 2px 8px;">
              ${a.is_active ? '✅ Active' : '⏸ Paused'}
            </button>
          </div>
          <p style="font-size: 0.82rem; color: #64748b; margin-bottom: 12px;">${escapeHTML(a.description || 'No description')}</p>
          <div style="font-size: 0.8rem; background: #f8fafc; padding: 8px 10px; border-radius: 6px; display: flex; flex-direction: column; gap: 4px; border: 1px solid #f1f5f9;">
            <div><span style="color: #6366f1; font-weight: 700;">WHEN:</span> ${escapeHTML(a.event)}</div>
            <div><span style="color: #059669; font-weight: 700;">IF:</span> ${escapeHTML(condText)}</div>
            <div><span style="color: #d97706; font-weight: 700;">THEN:</span> ${escapeHTML(actionText)}</div>
          </div>
        </div>
        <div style="margin-top: 12px; display: flex; gap: 8px; justify-content: flex-end;">
          <button type="button" class="button button-quiet button-sm test-rule-btn" data-auto-id="${a.id}">🧪 Test Rule</button>
          <button type="button" class="button button-quiet button-sm edit-auto-btn" data-auto-id="${a.id}">Edit</button>
        </div>
      </div>
    `;
  }).join('') || '<p class="empty-state">No automation rules configured.</p>';
}

function renderApprovals() {
  const tbody = el('approvalTableBody');
  const list = state.approvals || [];
  
  // Update sidebar approval count
  const pendingList = list.filter(a => (a.status || '').toLowerCase() === 'pending');
  const countEl = el('sidebarApprovalCount');
  if (countEl) {
    if (pendingList.length > 0) {
      countEl.textContent = pendingList.length;
      countEl.style.display = 'inline-block';
    } else {
      countEl.style.display = 'none';
    }
  }

  if (!tbody) return;

  const currentUserId = currentUser?.id;
  const isManagerOrAdmin = ['admin', 'Sales Manager'].includes(currentUser?.role || '');

  tbody.innerHTML = list.map(a => {
    const isPending = (a.status || '').toLowerCase() === 'pending';
    const isRequester = Number(a.requested_by) === Number(currentUserId) || a.requester_name === currentUser?.name;
    const selfApprovalBlocked = isPending && isRequester && !isManagerOrAdmin;

    return `
      <tr>
        <td><strong>${escapeHTML(a.type || a.approval_type || 'Approval')}</strong></td>
        <td>${escapeHTML(a.requester_name || a.requested_by_name || 'Rep')}</td>
        <td>${escapeHTML(a.old_value || '—')} → <b style="color: #2563eb;">${escapeHTML(a.new_value || '—')}</b></td>
        <td><span class="status-pill ${a.status ? a.status.toLowerCase() : 'pending'}">${escapeHTML(a.status || 'Pending')}</span></td>
        <td>${escapeHTML(a.comments || a.rejection_reason || '—')}</td>
        <td>
          ${isPending ? (
            selfApprovalBlocked ? `
              <span style="font-size: 11px; color: #dc2626; font-weight: 600; background: #fef2f2; padding: 4px 8px; border-radius: 4px;" title="Cannot self-approve your own requests unless you are a Manager">⚠️ Cannot Self-Approve</span>
            ` : `
              <div style="display: flex; gap: 6px;">
                <button type="button" class="button button-primary button-sm decide-approval-btn" data-app-id="${a.id}" data-decision="Approved">Approve</button>
                <button type="button" class="button button-quiet button-sm decide-approval-btn" data-app-id="${a.id}" data-decision="Rejected">Reject</button>
              </div>
            `
          ) : `
            <span style="color: #64748b; font-size: 12px;">Decided by ${escapeHTML(a.reviewer_name || 'Manager')}</span>
          `}
        </td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="6" class="empty-state">No pending approval requests.</td></tr>';
}

function renderNotifications() {
  const list = state.notifications || [];
  const unreadList = list.filter(n => !n.is_read);

  // 1. Update badges
  const topbarBadge = el('topbarNotificationBadge');
  if (topbarBadge) {
    topbarBadge.textContent = unreadList.length;
    topbarBadge.style.display = unreadList.length > 0 ? 'inline-block' : 'none';
  }
  const sidebarBadge = el('sidebarNotificationCount');
  if (sidebarBadge) {
    sidebarBadge.textContent = unreadList.length;
    sidebarBadge.style.display = unreadList.length > 0 ? 'inline-block' : 'none';
  }

  // 2. Render topbar dropdown
  const topbarListEl = el('topbarNotificationList');
  if (topbarListEl) {
    if (unreadList.length === 0) {
      topbarListEl.innerHTML = '<div style="text-align: center; color: #94a3b8; padding: 16px; font-size: 13px;">No unread notifications</div>';
    } else {
      topbarListEl.innerHTML = unreadList.slice(0, 5).map(n => `
        <div class="notification-item" data-notif-id="${n.id}" style="padding: 10px; border-radius: 8px; background: ${n.is_read ? '#ffffff' : '#f0f9ff'}; border: 1px solid ${n.is_read ? '#f1f5f9' : '#bae6fd'}; cursor: pointer;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <strong style="font-size: 0.85rem; color: #0f172a;">${escapeHTML(n.title)}</strong>
            <small style="font-size: 0.7rem; color: #94a3b8;">${n.created_at ? new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Now'}</small>
          </div>
          <p style="font-size: 0.8rem; color: #475569; margin: 4px 0 0 0;">${escapeHTML(n.message)}</p>
        </div>
      `).join('');
    }
  }

  // 3. Render full notifications view
  const fullListEl = el('fullNotificationsList');
  if (fullListEl) {
    const filter = state.notifFilter || 'all';
    let filtered = list;
    if (filter === 'unread') filtered = list.filter(n => !n.is_read);
    else if (filter === 'action_required') filtered = list.filter(n => n.type === 'action_required' || n.category === 'approval');
    else if (filter === 'system') filtered = list.filter(n => n.type === 'system' || n.category === 'system');

    if (filtered.length === 0) {
      fullListEl.innerHTML = '<p class="empty-state">No notifications matching selected filter.</p>';
    } else {
      fullListEl.innerHTML = filtered.map(n => `
        <div class="notification-card" style="padding: 1rem; border-radius: 10px; background: ${n.is_read ? '#ffffff' : '#f8fafc'}; border: 1px solid ${n.is_read ? '#e2e8f0' : '#3b82f6'}; display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; gap: 12px; align-items: flex-start;">
            <span style="font-size: 1.5rem;">${n.is_read ? '✉️' : '📩'}</span>
            <div>
              <strong style="font-size: 0.95rem; color: #0f172a; display: block;">${escapeHTML(n.title)}</strong>
              <p style="font-size: 0.85rem; color: #475569; margin: 4px 0 8px 0;">${escapeHTML(n.message)}</p>
              <small style="color: #94a3b8; font-size: 0.75rem;">${n.created_at ? new Date(n.created_at).toLocaleString() : 'Just now'}</small>
            </div>
          </div>
          <div style="display: flex; gap: 8px;">
            ${!n.is_read ? `<button type="button" class="button button-quiet button-sm mark-single-read-btn" data-notif-id="${n.id}">Mark Read</button>` : ''}
            ${n.target_view ? `<button type="button" class="button button-primary button-sm notif-target-btn" data-view="${n.target_view}">View →</button>` : ''}
          </div>
        </div>
      `).join('');
    }
  }
}

function renderDocuments() {
  const container = el('documentList');
  if (!container) return;
  const list = state.documents || [];
  container.innerHTML = list.map(d => `
    <div class="panel doc-card">
      <span>📄</span>
      <div>
        <strong>${escapeHTML(d.name)}</strong>
        <small>${escapeHTML(d.type || 'Other')} · Uploaded by ${escapeHTML(d.uploaded_by || 'Aarav')}</small>
      </div>
      <a href="${escapeHTML(d.file_path || '#')}" target="_blank" class="text-button">Download</a>
    </div>
  `).join('') || '<p class="empty-state">No documents stored in repository.</p>';
}

function renderTemplates() {
  const container = el('emailTemplateList');
  if (!container) return;
  const list = state.email_templates || [];
  container.innerHTML = list.map(t => `
    <div class="panel tpl-card">
      <h3>${escapeHTML(t.name)}</h3>
      <p><b>Subject:</b> ${escapeHTML(t.subject)}</p>
      <small>Variables: ${escapeHTML(t.variables || 'None')}</small>
    </div>
  `).join('') || '<p class="empty-state">No email templates created.</p>';
}

function renderAll() {
  renderTotals();
  renderEnhancedDashboard();
  renderStageChart();
  renderLeads();
  renderTasks();
  renderActivity();
  renderTeam();
  renderCompanies();
  renderKanban();
  renderContacts();
  renderCompanyDeals();
  renderReports();
  renderSettings();
  renderLettersHistory();
  renderProducts();
  renderQuotations();
  renderInvoices();
  renderPurchaseOrders();
  renderRenewals();
  renderAutomations();
  renderApprovals();
  renderNotifications();
  renderDocuments();
  renderTemplates();
  renderTeams();
  renderCommissions();
  renderTargets();
  if (state.activeView === 'profile') {
    renderProfile();
  }
}

// ─── MODALS ─────────────────────────────────────────────────────────

function showModal(id) { el('modalLayer').classList.add('open'); el('modalLayer').setAttribute('aria-hidden','false'); document.querySelectorAll('.modal').forEach(m=>m.classList.toggle('active',m.id===id)); const first=el(id).querySelector('input,select,textarea,button'); if(first) setTimeout(()=>first.focus(),30); }
function closeModal() { el('modalLayer').classList.remove('open'); el('modalLayer').setAttribute('aria-hidden','true'); document.querySelectorAll('.modal').forEach(m=>m.classList.remove('active')); }
let toastTimer; function showToast(message) { const node=el('toast'); node.textContent=message; node.classList.add('visible'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>node.classList.remove('visible'),3600); }

function setCompanyTab(tab) { state.companyTab=tab; document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.companyTab===tab)); document.querySelectorAll('.company-tab').forEach(p=>p.classList.toggle('active',p.id===`${tab}-tab`)); }

// ─── EVENT LISTENERS ────────────────────────────────────────────────

document.addEventListener('click', async event => {
  const viewButton = event.target.closest('[data-view],[data-view-go]'); if(viewButton){ openView(viewButton.dataset.view || viewButton.dataset.viewGo); return; }
  const modalButton = event.target.closest('[data-open-modal]');
  if (modalButton) {
    const modalId = modalButton.dataset.openModal;
    if (modalId === 'quotationModal') initQuotationModal();
    if (modalId === 'invoiceModal') initInvoiceModal();
    if (modalId === 'poModal') initPoModal();
    if (modalId === 'teamModal') initTeamModal();
    if (modalId === 'targetModal') initTargetModal();
    if (modalId === 'commissionRuleModal') initCommissionRuleModal();
    if (modalId === 'productModal') openProductModal(null);
    if (modalId === 'contactModal') {
      const sel = el('contactCompanySelect');
      if (sel) {
        sel.innerHTML = '<option value="">Select company...</option>' + state.companies.map(c => `<option value="${c.id}">${escapeHTML(c.name)}</option>`).join('');
      }
    }
    showModal(modalId);
    return;
  }
  if(event.target.closest('[data-close-modal]') || event.target === el('modalLayer')) { closeModal(); return; }
  const tab = event.target.closest('[data-company-tab],[data-company-tab-go]'); if(tab){ setCompanyTab(tab.dataset.companyTab || tab.dataset.companyTabGo); return; }
  const settings = event.target.closest('[data-settings]'); if(settings){ document.querySelectorAll('.settings-link').forEach(n=>n.classList.toggle('active',n===settings)); document.querySelectorAll('.settings-panel').forEach(n=>n.classList.toggle('active',n.id===`${settings.dataset.settings}-settings`)); return; }
  const editCust = event.target.closest('.edit-customer-btn');
  if (editCust) {
    openEditCustomerModal(Number(editCust.dataset.customerId));
    return;
  }
  const purDetail = event.target.closest('.purchase-detail-btn');
  if (purDetail) {
    showPurchaseDetail(Number(purDetail.dataset.purchaseIndex));
    return;
  }
  const company = event.target.closest('.company-open');
  if (company) {
    openCustomerProfile(company.dataset.companyId || company.dataset.companyName);
    return;
  }
  if (event.target.closest('#ignoreDuplicateSaveBtn')) {
    state.forceSaveCustomer = true;
    const form = el('companyModal');
    if (form) form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    return;
  }
  const taskFilter = event.target.closest('[data-task-filter]'); if(taskFilter){ state.taskFilter=taskFilter.dataset.taskFilter; document.querySelectorAll('[data-task-filter]').forEach(n=>n.classList.toggle('active',n===taskFilter)); renderTasks(); return; }
  if(event.target.closest('#notificationBtn')) { el('notificationPopover').classList.toggle('visible'); return; }
  if(!event.target.closest('.notification-popover')) el('notificationPopover').classList.remove('visible');
  if(event.target.closest('#showReminders')) { state.taskFilter='overdue'; document.querySelectorAll('[data-task-filter]').forEach(n=>n.classList.toggle('active',n.dataset.taskFilter==='overdue')); renderTasks(); return; }
  if(event.target.closest('#mobileMenu')) { el('sidebar').classList.toggle('open'); return; }
  if(event.target.closest('#addStage')) { const name=prompt('New stage name'); if(name){state.stages.splice(-1,0,{name,probability:50,color:'#50a8c6'});renderAll();showToast(`${name} stage added.`)} return; }
  if(event.target.closest('#addTag')) { const name=prompt('New tag name'); if(name){el('tagSettingsList').insertAdjacentHTML('beforeend',`<div class="tag-setting" style="--tag-color:#50a8c6"><i></i>${name}<button aria-label="Remove ${name}">×</button></div>`);showToast(`${name} tag created.`)} return; }
  const exportButton=event.target.closest('.export-data,#exportReport'); if(exportButton){ exportCsv(exportButton.dataset.type || 'report'); return; }

  // Follow-up tab switch
  const followupTab = event.target.closest('[data-followup-tab]');
  if (followupTab) {
    state.followupTab = followupTab.dataset.followupTab;
    document.querySelectorAll('[data-followup-tab]').forEach(n => n.classList.toggle('active', n === followupTab));
    renderActionCenter();
    return;
  }

  // 1-Click task complete from Action Center
  const completeTaskBtn = event.target.closest('[data-complete-task]');
  if (completeTaskBtn) {
    const taskId = Number(completeTaskBtn.dataset.completeTask);
    const task = state.tasks.find(t => t.id === taskId);
    if (task) {
      task.done = true;
      task.bucket = 'done';
      try {
        await updateCRMRecord('tasks', taskId, { done: true });
        showToast(`Follow-up completed: "${task.title}"`);
        loadCRMData().then(renderAll);
      } catch (e) {
        showToast(e.message);
      }
    }
    return;
  }

  // Advance deal from Action Center
  const advanceDealBtn = event.target.closest('[data-advance-deal]');
  if (advanceDealBtn) {
    const dealId = Number(advanceDealBtn.dataset.advanceDeal);
    const deal = state.deals.find(d => d.id === dealId);
    if (deal) {
      const stageOrder = ['New Lead', 'Qualified', 'Proposal Sent', 'Negotiation', 'Won'];
      const currentIndex = stageOrder.indexOf(deal.stage);
      if (currentIndex >= 0 && currentIndex < stageOrder.length - 1) {
        const nextStage = stageOrder[currentIndex + 1];
        moveDeal(deal, nextStage);
      }
    }
    return;
  }

  // Mark Won from Action Center
  const wonDealBtn = event.target.closest('[data-won-deal]');
  if (wonDealBtn) {
    const dealId = Number(wonDealBtn.dataset.wonDeal);
    const deal = state.deals.find(d => d.id === dealId);
    if (deal) moveDeal(deal, 'Won');
    return;
  }

  // Create deal shortcut for Lead
  const createDealLeadBtn = event.target.closest('[data-create-deal-for]');
  if (createDealLeadBtn) {
    const companyName = createDealLeadBtn.dataset.createDealFor;
    const dealCompany = el('dealCompany');
    if (dealCompany) {
      // Find or select company
      dealCompany.value = companyName;
    }
    showModal('dealModal');
    return;
  }

  // Edit product
  const editProductBtn = event.target.closest('[data-edit-product]');
  if (editProductBtn) {
    const productId = Number(editProductBtn.dataset.editProduct);
    const product = state.products.find(p => p.id === productId);
    if (product) openProductModal(product);
    return;
  }

  // Public View Quote Portal Modal
  const publicViewQuoteBtn = event.target.closest('[data-public-view-quote]');
  if (publicViewQuoteBtn) {
    const quoteId = Number(publicViewQuoteBtn.dataset.publicViewQuote);
    const quote = state.quotations.find(q => q.id === quoteId);
    if (quote) {
      state.activePublicQuote = quote;
      if (el('pubQuoteNumber')) el('pubQuoteNumber').textContent = quote.quotation_number || `QTN-${quote.id}`;
      if (el('pubQuoteClient')) el('pubQuoteClient').textContent = quote.company_name || 'Client';
      if (el('pubQuoteStatus')) el('pubQuoteStatus').textContent = (quote.status || 'Draft').toUpperCase();
      if (el('pubQuoteSubtotal')) el('pubQuoteSubtotal').textContent = money(quote.subtotal || 0);
      if (el('pubQuoteTax')) el('pubQuoteTax').textContent = money(Math.round((quote.subtotal || 0) * 0.18));
      if (el('pubQuoteTotal')) el('pubQuoteTotal').textContent = money(quote.total || 0);

      const itemsBody = el('pubQuoteItemsBody');
      if (itemsBody) {
        itemsBody.innerHTML = (quote.items || [{ description: 'Payment Suite License', quantity: 1, unit_price: quote.subtotal || 0, total: quote.subtotal || 0 }]).map(item => `
          <tr>
            <td><strong>${escapeHTML(item.description || 'Line Item')}</strong></td>
            <td>${item.quantity || 1}</td>
            <td>${money(item.unit_price || 0)}</td>
            <td>${item.discount_percent || 0}%</td>
            <td><strong>${money(item.total || 0)}</strong></td>
          </tr>
        `).join('');
      }
      showModal('publicQuoteModal');
    }
    return;
  }

  // Verify Purchase Order
  const verifyPoBtn = event.target.closest('[data-verify-po]');
  if (verifyPoBtn) {
    const poId = Number(verifyPoBtn.dataset.verifyPo);
    try {
      await apiRequest(`/api/purchase-orders/${poId}/verify`, 'POST');
      showToast('Purchase Order verified and approved! ✅');
      await loadCRMData();
      renderAll();
    } catch (e) {
      showToast(e.message);
    }
    return;
  }

  // Reject Purchase Order
  const rejectPoBtn = event.target.closest('[data-reject-po]');
  if (rejectPoBtn) {
    const poId = Number(rejectPoBtn.dataset.rejectPo);
    const reason = prompt('Enter rejection reason for this Purchase Order:');
    if (reason) {
      try {
        await apiRequest(`/api/purchase-orders/${poId}/reject`, 'POST', { reason });
        showToast('Purchase Order rejected.');
        await loadCRMData();
        renderAll();
      } catch (e) {
        showToast(e.message);
      }
    }
    return;
  }

  // Accept Quotation from Public Customer Portal Modal
  if (event.target.closest('#pubAcceptBtn')) {
    const quote = state.activePublicQuote;
    if (quote) {
      const token = quote.public_token || quote.id;
      try {
        await apiRequest(`/api/public/quotations/${token}/accept`, 'POST');
        showToast(`Quotation ${quote.quotation_number} accepted! ⚡`);
        closeModal();
        await loadCRMData();
        renderAll();
      } catch (e) {
        showToast(e.message);
      }
    }
    return;
  }

  // Reject Quotation from Public Customer Portal Modal
  if (event.target.closest('#pubRejectBtn')) {
    const quote = state.activePublicQuote;
    if (quote) {
      const reason = prompt('Optional rejection reason / requested changes:');
      const token = quote.public_token || quote.id;
      try {
        await apiRequest(`/api/public/quotations/${token}/reject`, 'POST', { reason });
        showToast('Feedback submitted.');
        closeModal();
        await loadCRMData();
        renderAll();
      } catch (e) {
        showToast(e.message);
      }
    }
    return;
  }

  // Delete/Archive product
  const deleteProductBtn = event.target.closest('[data-delete-product]');
  if (deleteProductBtn) {
    const productId = Number(deleteProductBtn.dataset.deleteProduct);
    if (confirm('Are you sure you want to archive this product?')) {
      try {
        await deleteProductRecord(productId);
        state.products = state.products.filter(p => p.id !== productId);
        renderProducts();
        showToast('Product archived successfully.');
      } catch (e) {
        showToast(e.message);
      }
    }
    return;
  }

  // Add line item to Quotation
  if (event.target.closest('#addLineItemBtn')) {
    const firstProd = state.products[0] || { id: 1, name: 'Product', unit_price: 100000 };
    state.quotationLineItems.push({
      product_id: firstProd.id,
      description: firstProd.name,
      quantity: 1,
      unit_price: firstProd.unit_price || 0,
      discount_percent: 0,
      total: firstProd.unit_price || 0
    });
    renderLineItems();
    updateQuotationTotals();
    return;
  }

  // Remove line item from Quotation
  const removeLineItemBtn = event.target.closest('.line-item-remove');
  if (removeLineItemBtn) {
    const idx = Number(removeLineItemBtn.dataset.idx);
    state.quotationLineItems.splice(idx, 1);
    renderLineItems();
    updateQuotationTotals();
    return;
  }

  // Send Quotation Email
  const sendQuotationBtn = event.target.closest('[data-send-quotation]');
  if (sendQuotationBtn) {
    const qtnId = Number(sendQuotationBtn.dataset.sendQuotation);
    const origText = sendQuotationBtn.textContent;
    sendQuotationBtn.textContent = 'Sending...';
    sendQuotationBtn.disabled = true;
    try {
      await sendQuotationEmailRequest(qtnId);
      showToast('Quotation sent to client successfully! ✉✨');
      const q = state.quotations.find(item => item.id === qtnId);
      if (q) q.status = 'sent';
      renderQuotations();
    } catch (e) {
      showToast(e.message || 'Quotation email sent.');
    } finally {
      sendQuotationBtn.textContent = origText;
      sendQuotationBtn.disabled = false;
    }
    return;
  }

  // Record Payment
  const recordPayBtn = event.target.closest('[data-record-payment]');
  if (recordPayBtn) {
    const invId = Number(recordPayBtn.dataset.recordPayment);
    const inv = state.invoices.find(i => i.id === invId);
    if (inv) openPaymentModal(inv);
    return;
  }

  // Send Invoice Email
  const sendInvoiceBtn = event.target.closest('[data-send-invoice]');
  if (sendInvoiceBtn) {
    const invId = Number(sendInvoiceBtn.dataset.sendInvoice);
    const inv = state.invoices.find(i => i.id === invId);
    const origText = sendInvoiceBtn.textContent;
    sendInvoiceBtn.textContent = 'Sending...';
    sendInvoiceBtn.disabled = true;
    try {
      await sendInvoiceEmailRequest(invId);
      showToast(`Invoice ${inv?.invoice_number || ''} sent to client! ✉✨`);
      if (inv && inv.status === 'draft') inv.status = 'sent';
      renderInvoices();
    } catch (e) {
      showToast(e.message || 'Invoice sent to customer.');
    } finally {
      sendInvoiceBtn.textContent = origText;
      sendInvoiceBtn.disabled = false;
    }
    return;
  }

  // Create Invoice from PO
  const createInvPoBtn = event.target.closest('[data-create-invoice-from-po]');
  if (createInvPoBtn) {
    const poId = Number(createInvPoBtn.dataset.createInvoiceFromPo);
    const po = state.purchase_orders.find(p => p.id === poId);
    initInvoiceModal();
    if (po) {
      if (el('invCompany')) el('invCompany').value = po.company_id;
      if (el('invDeal') && po.deal_id) el('invDeal').value = po.deal_id;
      if (el('invPo')) el('invPo').value = po.id;
    }
    showModal('invoiceModal');
    return;
  }

  // Add line item to Invoice
  if (event.target.closest('#addInvLineItemBtn')) {
    const firstProd = state.products[0] || { id: 1, name: 'Product', unit_price: 100000 };
    state.invoiceLineItems.push({
      product_id: firstProd.id,
      description: firstProd.name,
      quantity: 1,
      unit_price: firstProd.unit_price || 0,
      discount_percent: 0,
      total: firstProd.unit_price || 0
    });
    renderInvLineItems();
    updateInvoiceTotals();
    return;
  }

  // Remove line item from Invoice
  const removeInvLineBtn = event.target.closest('.inv-line-remove');
  if (removeInvLineBtn) {
    const idx = Number(removeInvLineBtn.dataset.idx);
    state.invoiceLineItems.splice(idx, 1);
    renderInvLineItems();
    updateInvoiceTotals();
    return;
  }

  // Letter type card click
  const letterCard = event.target.closest('.letter-type-card');
  if (letterCard) { openLetterGenerator(letterCard.dataset.letterType); return; }

  // Letter submenu click
  const letterSublink = event.target.closest('.nav-sublink[data-letter-type]');
  if (letterSublink) {
    openView('letters');
    openLetterGenerator(letterSublink.dataset.letterType);
    document.querySelectorAll('.nav-sublink').forEach(n => n.classList.toggle('active', n === letterSublink));
    return;
  }

  // Back to letters hub
  if (event.target.closest('#backToLettersHub')) {
    el('letterGenerator').style.display = 'none';
    document.querySelector('.letters-hub').style.display = '';
    document.querySelectorAll('.nav-sublink').forEach(n => n.classList.remove('active'));
    return;
  }

  // Letter preview button
  if (event.target.closest('#letterPreviewBtn')) { updateLetterPreview(); return; }

  // Letter download button
  if (event.target.closest('#letterDownloadBtn')) { downloadLetterPDF(); return; }
});

document.addEventListener('change', async event => {
  if(event.target.matches('.task-check')) {
    const task=state.tasks.find(t=>t.id===Number(event.target.closest('.task-row').dataset.taskId));
    if (!task) return;
    task.done = event.target.checked;
    if (task.done) {
      task.bucket = 'done';
      showToast(`Task complete — recorded at ${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}.`);
    }
    renderAll();
  }
  if(event.target.matches('#statusFilter,#industryFilter,#tagFilter,#companySort')) renderCompanies();
  if(event.target.matches('#ownerFilter,#pipelineTagFilter,#closeFilter')) renderKanban();
  if(event.target.matches('#priorityFilter')) renderTasks();
  if(event.target.matches('#productCategoryFilter')) renderProducts();
  if(event.target.matches('#quotationStatusFilter')) renderQuotations();
  if(event.target.matches('#invoiceStatusFilter,#invoiceCompanyFilter')) renderInvoices();
  if(event.target.matches('#poStatusFilter,#poCompanyFilter')) renderPurchaseOrders();
  
  // Quotation line item product changed
  if (event.target.matches('.line-item-prod')) {
    const idx = Number(event.target.dataset.idx);
    const selectedOpt = event.target.options[event.target.selectedIndex];
    const price = Number(selectedOpt.dataset.price) || 0;
    const name = selectedOpt.dataset.name || '';
    if (state.quotationLineItems[idx]) {
      state.quotationLineItems[idx].product_id = Number(event.target.value);
      state.quotationLineItems[idx].description = name;
      state.quotationLineItems[idx].unit_price = price;
      const descInput = document.querySelector(`.line-item-desc[data-idx="${idx}"]`);
      if (descInput) descInput.value = name;
      const priceInput = document.querySelector(`.line-item-price[data-idx="${idx}"]`);
      if (priceInput) priceInput.value = price;
      updateQuotationTotals();
    }
  }

  // Invoice line item product changed
  if (event.target.matches('.inv-line-prod')) {
    const idx = Number(event.target.dataset.idx);
    const selectedOpt = event.target.options[event.target.selectedIndex];
    const price = Number(selectedOpt.dataset.price) || 0;
    const name = selectedOpt.dataset.name || '';
    if (state.invoiceLineItems[idx]) {
      state.invoiceLineItems[idx].product_id = Number(event.target.value);
      state.invoiceLineItems[idx].description = name;
      state.invoiceLineItems[idx].unit_price = price;
      const descInput = document.querySelector(`.inv-line-desc[data-idx="${idx}"]`);
      if (descInput) descInput.value = name;
      const priceInput = document.querySelector(`.inv-line-price[data-idx="${idx}"]`);
      if (priceInput) priceInput.value = price;
      updateInvoiceTotals();
    }
  }

  if(event.target.matches('#dateFilter')) {
    const selected = event.target.options[event.target.selectedIndex].text;
    try {
      const data = await apiRequest(`/api/analytics/dashboard?range=${event.target.value}`);
      if (data) state.analytics = data;
    } catch (e) {
      // Fallback
    }
    renderAll();
    showToast(`Dashboard view updated to: ${selected}`);
  }
  if(event.target.matches('[data-stage-prob]')) { const stage=state.stages.find(s=>s.name===event.target.dataset.stageProb); if(stage){stage.probability=Number(event.target.value); renderAll(); showToast(`${stage.name} probability updated.`);} }
});

document.addEventListener('input', event => {
  if(event.target.matches('#companySearch')) renderCompanies();
  if(event.target.matches('#taskSearch')) renderTasks();
  if(event.target.matches('#productSearch')) renderProducts();
  if(event.target.matches('#quotationSearch')) renderQuotations();
  if(event.target.matches('#invoiceSearch')) renderInvoices();
  if(event.target.matches('#poSearch')) renderPurchaseOrders();

  // Quotation line items input live calculation
  if (event.target.matches('.line-item-qty, .line-item-price, .line-item-discount, .line-item-desc, #qtnDiscount, #qtnTax')) {
    const idx = event.target.dataset.idx !== undefined ? Number(event.target.dataset.idx) : null;
    if (idx !== null && state.quotationLineItems[idx]) {
      if (event.target.matches('.line-item-qty')) state.quotationLineItems[idx].quantity = Number(event.target.value) || 1;
      if (event.target.matches('.line-item-price')) state.quotationLineItems[idx].unit_price = Number(event.target.value) || 0;
      if (event.target.matches('.line-item-discount')) state.quotationLineItems[idx].discount_percent = Number(event.target.value) || 0;
      if (event.target.matches('.line-item-desc')) state.quotationLineItems[idx].description = event.target.value;
    }
    updateQuotationTotals();
  }

  // Invoice line items input live calculation
  if (event.target.matches('.inv-line-qty, .inv-line-price, .inv-line-discount, .inv-line-desc, #invDiscount, #invTax')) {
    const idx = event.target.dataset.idx !== undefined ? Number(event.target.dataset.idx) : null;
    if (idx !== null && state.invoiceLineItems[idx]) {
      if (event.target.matches('.inv-line-qty')) state.invoiceLineItems[idx].quantity = Number(event.target.value) || 1;
      if (event.target.matches('.inv-line-price')) state.invoiceLineItems[idx].unit_price = Number(event.target.value) || 0;
      if (event.target.matches('.inv-line-discount')) state.invoiceLineItems[idx].discount_percent = Number(event.target.value) || 0;
      if (event.target.matches('.inv-line-desc')) state.invoiceLineItems[idx].description = event.target.value;
    }
    updateInvoiceTotals();
  }

  if(event.target.matches('#globalSearch')) {
    const q=event.target.value.trim().toLowerCase();
    const results=el('searchResults');
    const matches=[
      ...state.companies.map(c=>({name:c.name,kind:'Company'})),
      ...state.deals.map(d=>({name:d.title,kind:'Deal'})),
      ...state.products.map(p=>({name:p.name,kind:'Product'}))
    ].filter(x=>x.name.toLowerCase().includes(q)).slice(0,5);
    results.innerHTML=q && matches.length ? matches.map(m=>`<button data-view-go="${m.kind==='Company'?'companies':m.kind==='Product'?'products':'pipeline'}"><b>${m.name}</b><small>${m.kind}</small></button>`).join('') : '';
    results.classList.toggle('visible',Boolean(q && matches.length));
  }

  // Live preview for letter form
  if (event.target.closest('#letterForm')) {
    updateLetterPreview();
  }
});

document.querySelectorAll('.form-modal').forEach(form => form.addEventListener('submit', async event => {
  event.preventDefault(); const data = new FormData(form);
  try {
    if (form.id === 'companyModal') {
      const name = String(data.get('companyName')).trim();
      const gst_number = String(data.get('gst_number') || '').trim().toUpperCase();
      const pan_number = String(data.get('pan_number') || '').trim().toUpperCase();
      const email = String(data.get('email') || '').trim();
      const phone = String(data.get('phone') || '').trim();
      
      if (gst_number && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gst_number)) {
        showToast('Invalid Indian GSTIN format. Example: 29AAAAA0000A1Z5');
        return;
      }

      if (!state.forceSaveCustomer) {
        try {
          const dupRes = await fetch('/api/customers/check-duplicate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              gst_number,
              email,
              phone,
              name,
              exclude_id: state.editingCustomerId || null
            })
          });
          const dupData = await dupRes.json();
          if (dupData.hasDuplicates) {
            el('duplicateCustomerList').innerHTML = dupData.duplicates.map(d => `
              <tr>
                <td><b>${escapeHTML(d.name)}</b><br><small>${d.customer_code || ''}</small></td>
                <td><span class="status-pill status-churned">${(d.matched_fields || []).join(', ')}</span></td>
                <td>${escapeHTML(d.owner || 'Aarav Sharma')}</td>
                <td><span class="status-pill status-active">${escapeHTML(d.status || 'Active')}</span></td>
              </tr>
            `).join('');
            state.pendingCustomerForm = {
              name,
              customer_type: data.get('customer_type'),
              industry: data.get('industry'),
              gst_number,
              pan_number,
              phone,
              alternate_phone: data.get('alternate_phone'),
              email,
              alternate_email: data.get('alternate_email'),
              website: data.get('website'),
              status: data.get('status'),
              source: data.get('source'),
              billing_address: data.get('billing_address'),
              shipping_address: data.get('shipping_address'),
              city: data.get('city'),
              state: data.get('state'),
              country: data.get('country'),
              pin_code: data.get('pin_code')
            };
            showModal('duplicateCustomerModal');
            return;
          }
        } catch (e) {
          console.warn('Duplicate check error:', e);
        }
      }

      const payload = state.pendingCustomerForm || {
        name,
        customer_type: data.get('customer_type'),
        industry: data.get('industry'),
        gst_number,
        pan_number,
        phone,
        alternate_phone: data.get('alternate_phone'),
        email,
        alternate_email: data.get('alternate_email'),
        website: data.get('website'),
        status: data.get('status'),
        source: data.get('source'),
        billing_address: data.get('billing_address'),
        shipping_address: data.get('shipping_address'),
        city: data.get('city'),
        state: data.get('state'),
        country: data.get('country'),
        pin_code: data.get('pin_code')
      };

      if (state.editingCustomerId) {
        const updated = await updateCRMRecord('customers', state.editingCustomerId, payload);
        const idx = state.companies.findIndex(c => c.id === state.editingCustomerId);
        if (idx !== -1) state.companies[idx] = { ...state.companies[idx], ...updated };
        showToast(`Customer account "${name}" updated.`);
      } else {
        const created = await createCRMRecord('customers', payload);
        state.companies.unshift(created);
        showToast(`Customer account "${name}" created (${created.customer_code || 'Success'}).`);
      }

      state.editingCustomerId = null;
      state.pendingCustomerForm = null;
      state.forceSaveCustomer = false;
      closeModal();
      renderCustomers();
      return;
    }
    if (form.id === 'contactModal') {
      const name = `${data.get('firstName')} ${data.get('lastName')}`.trim();
      const email = String(data.get('contactEmail')).toLowerCase();
      const companyId = data.get('contactCompany') ? Number(data.get('contactCompany')) : null;
      const companyObj = state.companies.find(c => c.id === companyId);
      const company_name = companyObj ? companyObj.name : null;
      const contact_role = data.get('contactRole') || 'Primary';
      const department = data.get('contactDepartment') || '';

      if (state.contacts.some(contact => contact.email.toLowerCase() === email)) {
        showToast('Potential duplicate email detected — review before continuing.');
      }
      const created = await createCRMRecord('contacts', {
        name,
        title: data.get('contactTitle'),
        email,
        phone: data.get('contactPhone'),
        primary: data.has('isPrimary'),
        company_id: companyId,
        company_name,
        contact_role,
        department
      });
      if (created.primary) state.contacts.forEach(contact => { if (contact.company_id === companyId) contact.primary = false; });
      state.contacts.unshift(created);
      renderContacts();
      showToast(`${name} (${contact_role}) was added as a contact.`);
    }
    if (form.id === 'dealModal') {
      const title = String(data.get('dealTitle')).trim(), stage = String(data.get('dealStage')).split(' ·')[0];
      const dueDate = String(data.get('dealDate'));
      const created = await createCRMRecord('deals', { title, company: data.get('dealCompany'), value: Number(data.get('dealValue')), stage, probability: Number(String(data.get('dealStage')).match(/(\d+)/)?.[0] || 10), owner: data.get('dealOwner'), due: displayDate(dueDate), month: dueDate ? new Date(`${dueDate}T00:00:00`).toLocaleString('en-US', { month: 'long' }) : 'Unscheduled', tag: '' });
      state.deals.unshift(created); renderAll(); showToast(`${title} created in ${stage}.`);
    }
    if (form.id === 'taskModal') {
      const title = String(data.get('taskTitle')).trim(), date = String(data.get('taskDate'));
      const created = await createCRMRecord('tasks', { title, company: data.get('taskLink') === 'No link' ? 'Unlinked task' : data.get('taskLink'), due: displayDate(date), bucket: 'today', priority: data.get('taskPriority'), done: false, assignee: data.get('taskAssignee') });
      state.tasks.unshift(created); state.taskFilter = 'open'; renderAll(); showToast(`Task "${title}" created.`);
    }
    if (form.id === 'activityModal') {
      const type = String(data.get('activityType')), company = escapeHTML(data.get('activityCompany')), body = escapeHTML(data.get('activityBody'));
      const text = `<strong>${type[0].toUpperCase() + type.slice(1)} logged</strong> at ${company} · ${body}`;
      const created = await createCRMRecord('activities', { type, text });
      state.activities.unshift(created); renderActivity(); showToast('Activity saved to the timeline.');
    }
    if (form.id === 'productModal') {
      const name = String(data.get('productName')).trim();
      const sku = String(data.get('productSku') || '').trim();
      const category = String(data.get('productCategory') || 'Gateway');
      const unit_price = Number(data.get('productPrice')) || 0;
      const currency = String(data.get('productCurrency') || 'INR');
      const description = String(data.get('productDescription') || '').trim();

      if (state.editingProductId) {
        const updated = await updateProductRecord(state.editingProductId, { name, sku, category, unit_price, currency, description });
        const idx = state.products.findIndex(p => p.id === state.editingProductId);
        if (idx >= 0) state.products[idx] = updated;
        showToast(`Product "${name}" updated.`);
      } else {
        const created = await createProductRecord({ name, sku, category, unit_price, currency, description });
        state.products.unshift(created);
        showToast(`Product "${name}" added to catalog.`);
      }
      state.editingProductId = null;
      renderProducts();
    }
    if (form.id === 'quotationModal') {
      const company_id = Number(data.get('qtnCompany'));
      const contact_id = Number(data.get('qtnContact')) || null;
      const deal_id = Number(data.get('qtnDeal')) || null;
      const valid_until = data.get('qtnValidUntil') || null;
      const discount_percent = Number(data.get('qtnDiscount')) || 0;
      const tax_percent = Number(data.get('qtnTax')) || 18;
      const notes = data.get('qtnNotes') || '';

      const items = state.quotationLineItems.map(item => ({
        product_id: item.product_id,
        description: item.description,
        quantity: Number(item.quantity) || 1,
        unit_price: Number(item.unit_price) || 0,
        discount_percent: Number(item.discount_percent) || 0
      }));

      const created = await createQuotationRecord({
        company_id,
        contact_id,
        deal_id,
        valid_until,
        discount_percent,
        tax_percent,
        notes,
        items
      });

      state.quotations.unshift(created);
      state.quotationLineItems = [];
      renderQuotations();
      showToast(`Quotation ${created.quotation_number || ''} created!`);
    }
    if (form.id === 'invoiceModal') {
      const company_id = Number(data.get('invCompany'));
      const contact_id = Number(data.get('invContact')) || null;
      const deal_id = Number(data.get('invDeal')) || null;
      const po_id = Number(data.get('invPo')) || null;
      const issue_date = data.get('invIssueDate') || null;
      const due_date = data.get('invDueDate') || null;
      const discount_percent = Number(data.get('invDiscount')) || 0;
      const tax_percent = Number(data.get('invTax')) || 18;
      const terms = data.get('invTerms') || '';
      const notes = data.get('invNotes') || '';

      const items = state.invoiceLineItems.map(item => ({
        product_id: item.product_id,
        description: item.description,
        quantity: Number(item.quantity) || 1,
        unit_price: Number(item.unit_price) || 0,
        discount_percent: Number(item.discount_percent) || 0
      }));

      const created = await createInvoiceRecord({
        company_id,
        contact_id,
        deal_id,
        po_id,
        issue_date,
        due_date,
        discount_percent,
        tax_percent,
        terms,
        notes,
        items
      });

      const company = state.companies.find(c => c.id === company_id);
      state.invoices.unshift({
        ...created,
        company_name: company ? company.name : '—',
        balance_due: created.total || 0,
        amount_paid: 0
      });
      state.invoiceLineItems = [];
      renderInvoices();
      showToast(`Tax Invoice ${created.invoice_number || ''} created!`);
    }
    if (form.id === 'paymentModal') {
      const invoiceId = Number(data.get('invoiceId'));
      const amount = Number(data.get('amount'));
      const payment_date = data.get('paymentDate');
      const payment_method = data.get('paymentMethod');
      const reference_number = data.get('referenceNumber') || '';
      const notes = data.get('notes') || '';

      const res = await recordInvoicePaymentRequest(invoiceId, {
        amount,
        payment_date,
        payment_method,
        reference_number,
        notes
      });

      const inv = state.invoices.find(i => i.id === invoiceId);
      if (inv) {
        inv.amount_paid = (Number(inv.amount_paid) || 0) + amount;
        inv.balance_due = Math.max(0, Number(inv.total) - inv.amount_paid);
        if (inv.amount_paid >= Number(inv.total)) inv.status = 'paid';
        else inv.status = 'partial';
      }

      if (res.payment) state.payments.unshift(res.payment);
      renderInvoices();
      showToast(`Payment of ₹${amount.toLocaleString('en-IN')} recorded for Invoice ${inv?.invoice_number || ''}! 💰`);
    }
    if (form.id === 'poModal') {
      const po_number = String(data.get('poNumber') || '').trim();
      const company_id = Number(data.get('poCompany'));
      const quotation_id = Number(data.get('poQuotation')) || null;
      const deal_id = Number(data.get('poDeal')) || null;
      const amount = Number(data.get('amount'));
      const status = data.get('status') || 'received';
      const issue_date = data.get('issueDate');
      const delivery_date = data.get('deliveryDate') || null;
      const notes = data.get('notes') || '';

      const created = await createPoRecord({
        po_number,
        company_id,
        quotation_id,
        deal_id,
        amount,
        status,
        issue_date,
        delivery_date,
        notes
      });

      const company = state.companies.find(c => c.id === company_id);
      state.purchase_orders.unshift({
        ...created,
        company_name: company ? company.name : '—'
      });
      renderPurchaseOrders();
      showToast(`Purchase Order ${created.po_number || ''} logged! 📦`);
    }
    if (form.id === 'leadModal') {
      const name = String(data.get('name')).trim();
      const company = String(data.get('company') || '').trim();
      const email = String(data.get('email') || '').trim();
      const phone = String(data.get('phone') || '').trim();
      const source = data.get('source') || 'Inbound';
      const industry = data.get('industry') || 'General';
      const status = data.get('status') || 'New';
      const expected_value = Number(data.get('expected_value')) || 0;
      const next_followup = data.get('next_followup') || null;
      const owner = data.get('owner') || 'Aarav Sharma';
      const notes = data.get('notes') || '';

      const created = await apiRequest('/api/leads', 'POST', {
        name, company, email, phone, source, industry, status, expected_value, next_followup, owner, notes
      });
      state.leads.unshift(created);
      renderLeads();
      showToast(`Lead "${name}" created! ⚡`);
    }
    if (form.id === 'leadConvertModal') {
      const leadId = Number(el('convertLeadId').value);
      const company_name = String(el('convertCompanyName').value).trim();
      const email = String(el('convertContactEmail').value).trim();
      const deal_title = String(el('convertDealTitle').value).trim();
      const deal_value = Number(el('convertDealValue').value) || 0;

      await apiRequest(`/api/leads/${leadId}/convert`, 'POST', {
        company_name, email, deal_title, deal_value
      });

      const lead = state.leads.find(l => l.id === leadId);
      if (lead) lead.status = 'Converted';

      await loadCRMData();
      renderAll();
      showToast(`Lead successfully converted to Customer 360! 🎯`);
    }
    if (form.id === 'automationModal') {
      const name = String(data.get('name')).trim();
      const event_type = data.get('event');
      const conditions_json = data.get('conditions') || '{}';
      const action_json = JSON.stringify({ type: data.get('action_type') });

      const created = await apiRequest('/api/automations', 'POST', {
        name, event: event_type, conditions_json, action_json, is_active: true
      });
      state.automations.unshift(created);
      renderAutomations();
      showToast(`Automation rule "${name}" created! ⚙`);
    }
    if (form.id === 'documentModal') {
      const name = String(data.get('name')).trim();
      const type = data.get('type');
      const file_path = data.get('file_path');
      const version = data.get('version') || 'v1.0';
      const company_id = Number(data.get('company_id')) || null;

      const created = await apiRequest('/api/documents', 'POST', {
        name, type, file_path, version, company_id
      });
      state.documents.unshift(created);
      renderDocuments();
      showToast(`Document "${name}" saved! 📁`);
    }
    if (form.id === 'templateModal') {
      const name = String(data.get('name')).trim();
      const subject = data.get('subject');
      const body_html = data.get('body_html');
      const variables = data.get('variables');

      const created = await apiRequest('/api/templates', 'POST', {
        name, subject, body_html, variables
      });
      state.email_templates.unshift(created);
      renderTemplates();
      showToast(`Email template "${name}" created! ✉`);
    }
    if (form.id === 'inviteModal') showToast(`Invite sent to ${data.get('inviteEmail')}. It expires in 72 hours.`);
    if (form.id === 'letterEmailModal') { await sendLetterEmail(data); return; }
    closeModal(); form.reset();
  } catch (error) { showToast(error.message); }
}));

el('confirmStageMove').addEventListener('click', async () => {
  if (!state.pendingMove) return;
  const { deal, target } = state.pendingMove;
  try {
    const updated = await updateCRMRecord('deals', deal.id, { stage: target, probability: target === 'Won' ? 100 : 0 });
    Object.assign(deal, updated); renderAll(); closeModal();
    showToast(target === 'Lost' ? `${deal.title} marked lost · reason recorded: ${el('lostReason').value}.` : `${deal.title} marked won — congratulations!`);
    state.pendingMove = null;
  } catch (error) { showToast(error.message); }
});
el('clearCompanyFilters').addEventListener('click',()=>{['companySearch','statusFilter','industryFilter','tagFilter'].forEach(id=>{if(id==='companySearch')el(id).value='';else el(id).value='all'});renderCompanies();});

// Cmd + K Global Search Modal Logic
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    showModal('searchModal');
    const input = el('globalSearchInput');
    if (input) { input.focus(); input.select(); }
  }
  if (e.key === 'Escape') {
    closeModal();
  }
});

let searchDebounceTimer;
el('globalSearchInput')?.addEventListener('input', e => {
  clearTimeout(searchDebounceTimer);
  const q = e.target.value.trim();
  const resultsContainer = el('globalSearchResultsList');
  if (!resultsContainer) return;

  if (q.length < 2) {
    resultsContainer.innerHTML = '<p class="search-empty-state">Type at least 2 characters to search across your CRM workspace.</p>';
    return;
  }

  searchDebounceTimer = setTimeout(async () => {
    try {
      const res = await apiRequest(`/api/search?q=${encodeURIComponent(q)}`);
      const results = res.results || [];
      if (results.length === 0) {
        resultsContainer.innerHTML = `<p class="search-empty-state">No matching records found for "${escapeHTML(q)}".</p>`;
        return;
      }
      resultsContainer.innerHTML = results.map(r => `
        <div class="search-result-item" data-type="${r.type}" data-id="${r.id}" style="padding: 10px 14px; border-bottom: 1px solid var(--border-light); cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <strong style="display: block; font-size: 0.95rem; color: var(--text-primary);">${escapeHTML(r.title)}</strong>
            <small style="color: var(--text-secondary);">${escapeHTML(r.subtitle)}</small>
          </div>
          <span class="status-pill" style="font-size: 0.75rem; text-transform: uppercase;">${escapeHTML(r.type)}</span>
        </div>
      `).join('');
    } catch (err) {
      resultsContainer.innerHTML = `<p class="search-empty-state" style="color: #ef4444;">Error performing search: ${escapeHTML(err.message)}</p>`;
    }
  }, 250);
});

function exportCsv(type) { const rows=type==='companies'?[['Name','Industry','Owner','Status'],...state.companies.map(c=>[c.name,c.industry,c.owner,c.status])]:type==='contacts'?[['Name','Email','Phone'],...state.contacts.map(c=>[c.name,c.email,c.phone])]:type==='deals'?[['Title','Company','Value','Stage','Probability'],...state.deals.map(d=>[d.title,d.company,d.value,d.stage,d.probability])]:[['Rep','Won value','Deals won'],['Aarav Sharma','720000','3'],['Priya Menon','480000','2'],['Kunal Shah','220000','1']]; const csv=rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\n'); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=`smartpay-${type}-export.csv`;a.click();URL.revokeObjectURL(a.href);showToast(`${type[0].toUpperCase()+type.slice(1)} CSV download started.`); }

// ═══════════════════════════════════════════════════════════════════
// LETTERS GENERATOR
// ═══════════════════════════════════════════════════════════════════

const letterTemplates = {
  offer: {
    title: 'Offer Letter',
    fields: [
      { name: 'employeeName', label: 'Employee Name', placeholder: 'e.g. Ananya Rao', required: true },
      { name: 'position', label: 'Position / Title', placeholder: 'e.g. Senior Account Manager', required: true },
      { name: 'department', label: 'Department', placeholder: 'e.g. Sales & Partnerships', required: true },
      { name: 'joiningDate', label: 'Joining Date', type: 'date', required: true },
      { name: 'salary', label: 'Annual CTC (₹)', placeholder: 'e.g. 1200000', type: 'number', required: true },
      { name: 'reportingTo', label: 'Reporting To', placeholder: 'e.g. Aarav Sharma, Sales Manager', required: true },
      { name: 'workLocation', label: 'Work Location', placeholder: 'e.g. Bengaluru, Karnataka' },
      { name: 'probationPeriod', label: 'Probation Period', placeholder: 'e.g. 6 months' },
      { name: 'companyName', label: 'Company Name', placeholder: 'SmartPay India', value: 'SmartPay India Pvt. Ltd.' },
      { name: 'companyAddress', label: 'Company Address', placeholder: 'Company address', value: '12th Floor, One World Centre, Bengaluru, Karnataka 560001', span: true },
      { name: 'signatoryName', label: 'Authorized Signatory', placeholder: 'e.g. Rashi Kumar, HR Director', required: true },
      { name: 'signatoryTitle', label: 'Signatory Designation', placeholder: 'e.g. HR Director' }
    ]
  },
  appointment: {
    title: 'Appointment Letter',
    fields: [
      { name: 'employeeName', label: 'Employee Name', placeholder: 'e.g. Ananya Rao', required: true },
      { name: 'employeeId', label: 'Employee ID', placeholder: 'e.g. SP-2026-045' },
      { name: 'position', label: 'Designation', placeholder: 'e.g. Senior Account Manager', required: true },
      { name: 'department', label: 'Department', placeholder: 'e.g. Sales & Partnerships', required: true },
      { name: 'joiningDate', label: 'Date of Joining', type: 'date', required: true },
      { name: 'salary', label: 'Annual CTC (₹)', placeholder: 'e.g. 1200000', type: 'number', required: true },
      { name: 'reportingTo', label: 'Reporting Manager', placeholder: 'e.g. Aarav Sharma' },
      { name: 'workLocation', label: 'Work Location', placeholder: 'e.g. Bengaluru, Karnataka' },
      { name: 'noticePeriod', label: 'Notice Period', placeholder: 'e.g. 30 days' },
      { name: 'probationPeriod', label: 'Probation Period', placeholder: 'e.g. 6 months' },
      { name: 'companyName', label: 'Company Name', value: 'SmartPay India Pvt. Ltd.' },
      { name: 'companyAddress', label: 'Company Address', value: '12th Floor, One World Centre, Bengaluru, Karnataka 560001', span: true },
      { name: 'signatoryName', label: 'Authorized Signatory', placeholder: 'e.g. Rashi Kumar', required: true },
      { name: 'signatoryTitle', label: 'Signatory Designation', placeholder: 'e.g. HR Director' }
    ]
  },
  resignation: {
    title: 'Resignation Acceptance Letter',
    fields: [
      { name: 'employeeName', label: 'Employee Name', placeholder: 'e.g. Kunal Shah', required: true },
      { name: 'employeeId', label: 'Employee ID', placeholder: 'e.g. SP-2024-019' },
      { name: 'position', label: 'Designation', placeholder: 'e.g. Sales Representative', required: true },
      { name: 'department', label: 'Department', placeholder: 'e.g. Sales' },
      { name: 'resignationDate', label: 'Resignation Submitted On', type: 'date', required: true },
      { name: 'lastWorkingDay', label: 'Last Working Day', type: 'date', required: true },
      { name: 'reason', label: 'Reason (optional)', placeholder: 'e.g. Personal reasons', span: true },
      { name: 'companyName', label: 'Company Name', value: 'SmartPay India Pvt. Ltd.' },
      { name: 'companyAddress', label: 'Company Address', value: '12th Floor, One World Centre, Bengaluru, Karnataka 560001', span: true },
      { name: 'signatoryName', label: 'Authorized Signatory', placeholder: 'e.g. Rashi Kumar', required: true },
      { name: 'signatoryTitle', label: 'Signatory Designation', placeholder: 'e.g. HR Director' }
    ]
  },
  termination: {
    title: 'Termination Letter',
    fields: [
      { name: 'employeeName', label: 'Employee Name', placeholder: 'e.g. Name of employee', required: true },
      { name: 'employeeId', label: 'Employee ID', placeholder: 'e.g. SP-2023-008' },
      { name: 'position', label: 'Designation', placeholder: 'e.g. Sales Representative', required: true },
      { name: 'department', label: 'Department', placeholder: 'e.g. Sales' },
      { name: 'terminationDate', label: 'Effective Termination Date', type: 'date', required: true },
      { name: 'lastWorkingDay', label: 'Last Working Day', type: 'date', required: true },
      { name: 'reason', label: 'Reason for Termination', placeholder: 'e.g. Performance issues', required: true, span: true },
      { name: 'settlementNote', label: 'Settlement Details', placeholder: 'e.g. Full & final settlement within 45 days', span: true },
      { name: 'companyName', label: 'Company Name', value: 'SmartPay India Pvt. Ltd.' },
      { name: 'companyAddress', label: 'Company Address', value: '12th Floor, One World Centre, Bengaluru, Karnataka 560001', span: true },
      { name: 'signatoryName', label: 'Authorized Signatory', placeholder: 'e.g. Rashi Kumar', required: true },
      { name: 'signatoryTitle', label: 'Signatory Designation', placeholder: 'e.g. HR Director' }
    ]
  },
  experience: {
    title: 'Experience Letter',
    fields: [
      { name: 'employeeName', label: 'Employee Name', placeholder: 'e.g. Ananya Rao', required: true },
      { name: 'employeeId', label: 'Employee ID', placeholder: 'e.g. SP-2023-018' },
      { name: 'position', label: 'Designation / Role', placeholder: 'e.g. Senior Account Manager', required: true },
      { name: 'department', label: 'Department', placeholder: 'e.g. Sales & Partnerships', required: true },
      { name: 'joiningDate', label: 'Date of Joining', type: 'date', required: true },
      { name: 'relievingDate', label: 'Date of Relieving', type: 'date', required: true },
      { name: 'conductNote', label: 'Conduct & Performance Note', placeholder: 'e.g. Conduct was exemplary and performance consistently exceeded targets.', span: true },
      { name: 'companyName', label: 'Company Name', value: 'SmartPay India Pvt. Ltd.' },
      { name: 'companyAddress', label: 'Company Address', value: '12th Floor, One World Centre, Bengaluru, Karnataka 560001', span: true },
      { name: 'signatoryName', label: 'Authorized Signatory', placeholder: 'e.g. Rashi Kumar', required: true },
      { name: 'signatoryTitle', label: 'Signatory Designation', placeholder: 'e.g. HR Director' }
    ]
  }
};

function openLetterGenerator(type) {
  state.activeLetterType = type;
  const template = letterTemplates[type];
  if (!template) return;

  // Show generator, hide hub
  document.querySelector('.letters-hub').style.display = 'none';
  el('letterGenerator').style.display = '';

  // Set title
  el('letterFormTitle').textContent = template.title;

  // Build form fields
  el('letterFormFields').innerHTML = template.fields.map(f => {
    const inputType = f.type || 'text';
    const spanClass = f.span ? 'span-2' : '';
    const value = f.value || '';
    return `<label class="${spanClass}">${f.label} <input name="${f.name}" type="${inputType}" placeholder="${f.placeholder || ''}" ${f.required ? 'required' : ''} value="${value}" /></label>`;
  }).join('');

  // Update active submenu
  document.querySelectorAll('.nav-sublink').forEach(n => n.classList.toggle('active', n.dataset.letterType === type));

  // Clear preview
  el('letterPaperContent').innerHTML = '<p class="letter-placeholder-text">Fill in the form to see a live preview of your letter here.</p>';
}

function getLetterFormData() {
  const form = el('letterForm');
  const data = {};
  const inputs = form.querySelectorAll('input');
  inputs.forEach(input => {
    data[input.name] = input.value;
  });
  return data;
}

function formatDate(dateStr) {
  if (!dateStr) return '_______________';
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatSalary(amount) {
  if (!amount) return '_______________';
  const num = Number(amount);
  if (num >= 100000) return `₹${(num/100000).toFixed(1)}L per annum`;
  return `₹${num.toLocaleString('en-IN')} per annum`;
}

function generateLetterHTML(type, data) {
  const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const companyName = data.companyName || 'SmartPay India Pvt. Ltd.';
  const companyAddress = data.companyAddress || '12th Floor, One World Centre, Bengaluru, Karnataka 560001';
  const employeeName = data.employeeName || '_______________';
  const position = data.position || '_______________';
  const signatoryName = data.signatoryName || '_______________';
  const signatoryTitle = data.signatoryTitle || 'HR Director';

  let body = '';

  if (type === 'offer') {
    body = `
      <div class="letter-body">
        <p>Dear ${employeeName},</p>
        <p>We are delighted to extend this offer of employment for the position of <strong>${position}</strong> in the <strong>${data.department || '___'}</strong> department at ${companyName}.</p>
        <p>Please find the key details of your offer below:</p>
        <p><strong>Position:</strong> ${position}<br/>
        <strong>Department:</strong> ${data.department || '___'}<br/>
        <strong>Date of Joining:</strong> ${formatDate(data.joiningDate)}<br/>
        <strong>Annual CTC:</strong> ${formatSalary(data.salary)}<br/>
        <strong>Reporting To:</strong> ${data.reportingTo || '___'}<br/>
        <strong>Work Location:</strong> ${data.workLocation || 'Bengaluru, Karnataka'}<br/>
        <strong>Probation Period:</strong> ${data.probationPeriod || '6 months'}</p>
        <p>This offer is contingent upon successful completion of background verification and submission of all required documents. During the probation period, your performance will be reviewed, and upon successful completion, you will be confirmed as a permanent employee.</p>
        <p>We believe you will be a valuable addition to our team and look forward to welcoming you aboard. Please confirm your acceptance of this offer by signing and returning a copy of this letter within 7 working days.</p>
        <p>We look forward to a mutually rewarding association.</p>
      </div>
    `;
  } else if (type === 'appointment') {
    body = `
      <div class="letter-body">
        <p>Dear ${employeeName},</p>
        <p>With reference to your application and the subsequent discussions, we are pleased to confirm your appointment as <strong>${position}</strong> in the <strong>${data.department || '___'}</strong> department at ${companyName}, effective ${formatDate(data.joiningDate)}.</p>
        ${data.employeeId ? `<p><strong>Employee ID:</strong> ${data.employeeId}</p>` : ''}
        <p>The terms and conditions of your appointment are as follows:</p>
        <p><strong>Designation:</strong> ${position}<br/>
        <strong>Department:</strong> ${data.department || '___'}<br/>
        <strong>Date of Joining:</strong> ${formatDate(data.joiningDate)}<br/>
        <strong>Annual CTC:</strong> ${formatSalary(data.salary)}<br/>
        <strong>Reporting Manager:</strong> ${data.reportingTo || '___'}<br/>
        <strong>Work Location:</strong> ${data.workLocation || 'Bengaluru, Karnataka'}<br/>
        <strong>Probation Period:</strong> ${data.probationPeriod || '6 months'}<br/>
        <strong>Notice Period:</strong> ${data.noticePeriod || '30 days'}</p>
        <p>You are expected to adhere to the company's policies, code of conduct, and any other guidelines applicable to your role. The detailed employee handbook will be shared with you on your date of joining.</p>
        <p>We are confident that your skills and experience will be an asset to our organization. We welcome you to the ${companyName} family and wish you a successful career with us.</p>
      </div>
    `;
  } else if (type === 'resignation') {
    body = `
      <div class="letter-body">
        <p>Dear ${employeeName},</p>
        <p>This letter is to formally acknowledge the receipt of your resignation letter dated ${formatDate(data.resignationDate)} from your position as <strong>${position}</strong>${data.department ? ` in the <strong>${data.department}</strong> department` : ''} at ${companyName}.</p>
        ${data.employeeId ? `<p><strong>Employee ID:</strong> ${data.employeeId}</p>` : ''}
        <p>We accept your resignation, and your last working day with the company will be <strong>${formatDate(data.lastWorkingDay)}</strong>.</p>
        ${data.reason ? `<p>We understand your decision to resign due to ${data.reason.toLowerCase()} and respect your choice.</p>` : ''}
        <p>During the notice period, we request you to ensure a smooth handover of all ongoing projects, responsibilities, and any company assets in your possession. Please coordinate with your reporting manager for the handover process.</p>
        <p>Your full and final settlement, including any pending salary, reimbursements, and other dues, will be processed within 45 working days from your last working day, subject to completion of the exit formalities.</p>
        <p>We appreciate your contributions to ${companyName} during your tenure with us and wish you all the best in your future endeavors.</p>
      </div>
    `;
  } else if (type === 'termination') {
    body = `
      <div class="letter-body">
        <p>Dear ${employeeName},</p>
        <p>This letter is to formally inform you that your employment with ${companyName} as <strong>${position}</strong>${data.department ? ` in the <strong>${data.department}</strong> department` : ''} is terminated effective <strong>${formatDate(data.terminationDate)}</strong>.</p>
        ${data.employeeId ? `<p><strong>Employee ID:</strong> ${data.employeeId}</p>` : ''}
        <p><strong>Reason for Termination:</strong> ${data.reason || 'As discussed during the review meeting.'}</p>
        <p>Your last working day will be <strong>${formatDate(data.lastWorkingDay)}</strong>. You are required to hand over all company property, documents, access cards, and any other assets by your last working day.</p>
        <p>${data.settlementNote || 'Your full and final settlement will be processed within 45 working days from your last working day, subject to the return of all company property and completion of exit formalities.'}</p>
        <p>Please note that you continue to be bound by the confidentiality and non-disclosure obligations as outlined in your employment agreement even after the termination of your employment.</p>
        <p>We wish you all the best in your future endeavors.</p>
      </div>
    `;
  } else if (type === 'experience') {
    body = `
      <div class="letter-body">
        <p style="text-align:center; font-weight:700; margin: 15px 0; letter-spacing:1px; color:#1f2937;">TO WHOMSOEVER IT MAY CONCERN</p>
        <p>This is to certify that <strong>${employeeName}</strong>${data.employeeId ? ` (Employee ID: <strong>${data.employeeId}</strong>)` : ''} was employed with <strong>${companyName}</strong> as <strong>${position}</strong> in the <strong>${data.department || 'Sales'}</strong> department from <strong>${formatDate(data.joiningDate)}</strong> to <strong>${formatDate(data.relievingDate || data.lastWorkingDay)}</strong>.</p>
        <p>During their tenure with us, ${employeeName} demonstrated high professional integrity, diligence, and strong team spirit.</p>
        <p>${data.conductNote || 'Their conduct and character during employment were found to be satisfactory and commendable.'}</p>
        <p>They have been officially relieved of all company responsibilities at the close of business hours on ${formatDate(data.relievingDate || data.lastWorkingDay)}. We wish them success in all their future endeavors.</p>
      </div>
    `;
  }

  return `
    <p class="letter-company-name">${companyName}</p>
    <p class="letter-company-address">${companyAddress}</p>
    <p class="letter-date">Date: ${today}</p>
    <p>To,<br/><strong>${employeeName}</strong></p>
    <p class="letter-subject">Subject: ${letterTemplates[type]?.title || 'Letter'}</p>
    ${body}
    <div class="letter-signature">
      <p>Yours sincerely,</p>
      <strong>${signatoryName}</strong>
      <small>${signatoryTitle}<br/>${companyName}</small>
    </div>
  `;
}

function updateLetterPreview() {
  const type = state.activeLetterType;
  if (!type) return;

  const data = getLetterFormData();
  const html = generateLetterHTML(type, data);
  el('letterPaperContent').innerHTML = html;
}

function downloadLetterPDF() {
  updateLetterPreview();
  const content = el('letterPaperContent').innerHTML;
  const printContainer = el('printContainer');
  printContainer.innerHTML = content;
  window.print();
  showToast('Print dialog opened — save as PDF to download.');
}

async function loadLettersHistory() {
  try {
    const res = await fetch('/api/crm/letters?limit=25&sort=id&order=desc');
    if (res.ok) {
      const data = await res.json();
      state.letters = data.data || [];
      renderLettersHistory();
    }
  } catch (e) {
    console.warn('Failed to load letters history:', e.message);
  }
}

function renderLettersHistory() {
  const tbody = el('lettersHistoryTableBody');
  if (!tbody) return;

  const letters = state.letters || [];
  if (letters.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="table-empty">No letters generated or sent yet. Select a letter type above to create one.</td></tr>';
    return;
  }

  tbody.innerHTML = letters.map(letter => {
    const isSent = letter.status === 'sent';
    const statusBadge = isSent
      ? `<span class="badge-sent">✓ Sent</span>`
      : `<span class="badge-failed" title="${(letter.error_message || 'Delivery failed').replace(/"/g, '&quot;')}">✕ Failed</span>`;
    
    const type = letter.type || 'offer';
    const typeLabel = letterTemplates[type]?.title || (type.charAt(0).toUpperCase() + type.slice(1));
    const typeBadge = `<span class="badge-letter-type badge-type-${type}">${typeLabel}</span>`;
    const formattedDate = letter.created_at || letter.createdAt
      ? new Date(letter.created_at || letter.createdAt).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : 'Just now';

    return `
      <tr>
        <td><strong>${escapeHTML(letter.employeeName || 'Recipient')}</strong></td>
        <td>${typeBadge}</td>
        <td>${escapeHTML(letter.recipientEmail || '—')}</td>
        <td style="max-width:240px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHTML(letter.subject || '')}">${escapeHTML(letter.subject || '—')}</td>
        <td><small class="muted">${formattedDate}</small></td>
        <td>${statusBadge}</td>
      </tr>
    `;
  }).join('');
}

// Wire refresh button
const refreshLettersBtn = el('refreshLettersBtn');
if (refreshLettersBtn) {
  refreshLettersBtn.addEventListener('click', loadLettersHistory);
}

async function sendLetterEmail(formData) {
  const email = (formData.get('letterRecipientEmail') || '').trim();
  const subject = (formData.get('letterEmailSubject') || '').trim();
  const letterType = state.activeLetterType || 'offer';
  const letterData = getLetterFormData();

  const submitBtn = el('letterEmailSubmitBtn');
  const spinner = el('letterEmailSpinner');
  const submitText = el('letterEmailSubmitText');

  if (!email) {
    showToast('Recipient email is required.');
    return;
  }

  // Update button loading state
  if (submitBtn) submitBtn.disabled = true;
  if (spinner) spinner.classList.remove('hidden');
  if (submitText) submitText.textContent = 'Sending letter & PDF...';

  updateLetterPreview();
  const html = el('letterPaperContent').innerHTML;

  try {
    const res = await fetch('/api/send-letter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: email,
        subject,
        letterType,
        letterData: { ...letterData, recipientEmail: email },
        html: `<div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 40px 20px;">${html}</div>`
      })
    });

    const result = await res.json();
    if (res.ok && result.success) {
      showToast(`Letter and official PDF sent successfully to ${email}`);
      closeModal();
      if (result.letter) {
        state.letters = [result.letter, ...(state.letters || []).filter(l => l.id !== result.letter.id)];
        renderLettersHistory();
      } else {
        await loadLettersHistory();
      }
    } else {
      const errMsg = result.error || 'Email dispatch failed';
      showToast(`Failed to send: ${errMsg}`);
      if (result.letter) {
        state.letters = [result.letter, ...(state.letters || []).filter(l => l.id !== result.letter.id)];
        renderLettersHistory();
      }
    }
  } catch (error) {
    showToast(`Failed to send: ${error.message}`);
  } finally {
    if (submitBtn) submitBtn.disabled = false;
    if (spinner) spinner.classList.add('hidden');
    if (submitText) submitText.textContent = '✉ Send Letter & PDF';
  }
}

// Handle letter email button — prefill and show email modal
el('letterEmailBtn').addEventListener('click', function(e) {
  e.preventDefault();
  updateLetterPreview();

  const data = getLetterFormData();
  const type = state.activeLetterType || 'offer';
  const typeTitle = letterTemplates[type]?.title || 'Offer Letter';
  const empName = data.employeeName ? data.employeeName.trim() : 'Candidate';

  const subjectInput = el('letterEmailSubject');
  if (subjectInput) {
    subjectInput.value = `${typeTitle} — ${empName} | SmartPay India`;
  }

  const emailInput = el('letterRecipientEmail');
  if (emailInput) {
    emailInput.value = data.recipientEmail || data.email || '';
  }

  const attachmentNameEl = el('modalAttachmentName');
  if (attachmentNameEl) {
    const safeEmp = empName.replace(/[^a-zA-Z0-9_-]/g, '_');
    attachmentNameEl.textContent = `${type.charAt(0).toUpperCase() + type.slice(1)}_Letter_${safeEmp}.pdf`;
  }

  showModal('letterEmailModal');
});

// ─── INIT ───────────────────────────────────────────────────────────

setupProfileHandlers();

window.addEventListener('hashchange', () => {
  const hash = window.location.hash.replace('#', '');
  if (hash === 'profile' && state.activeView !== 'profile') {
    openView('profile');
  } else if (hash && hash !== state.activeView && el(`${hash}-view`)) {
    openView(hash);
  }
});

// Check auth on load
checkAuthStatus();

// ─── WEBSOCKET CLIENT (Real-time) ──────────────────────────────────

let ws = null;
let wsReconnectTimer = null;
let wsReconnectDelay = 1000;

function connectWebSocket() {
  if (ws && ws.readyState <= 1) return; // Already connected/connecting

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${location.host}/ws`;

  try {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('🔌 WebSocket connected');
      wsReconnectDelay = 1000; // Reset backoff
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleWsEvent(msg.event, msg.data);
      } catch (e) { /* ignore invalid JSON */ }
    };

    ws.onclose = (event) => {
      if (event.code !== 4001) { // Don't reconnect on auth failure
        clearTimeout(wsReconnectTimer);
        wsReconnectTimer = setTimeout(() => {
          wsReconnectDelay = Math.min(wsReconnectDelay * 1.5, 30000);
          connectWebSocket();
        }, wsReconnectDelay);
      }
    };

    ws.onerror = () => { /* handled by onclose */ };
  } catch (e) {
    console.warn('WebSocket connection failed:', e.message);
  }
}

function handleWsEvent(event, data) {
  if (event === 'connected') {
    console.log(`✅ Real-time connected as ${data.name} (${data.role})`);
    return;
  }

  if (event === 'letters:create') {
    if (data) {
      state.letters = [data, ...(state.letters || []).filter(l => l.id !== data.id)];
      renderLettersHistory();
    }
    return;
  }

  if (event === 'crm:created' || event === 'crm:updated' || event === 'crm:deleted') {
    // Refresh the current view if it matches the changed resource
    if (data.resource && state.activeView) {
      // Quietly refresh data
      refreshCrmData();
    }
    if (event === 'crm:created' && !data.bulk) {
      showToast(`New ${data.resource.slice(0, -1)} created`, 'info');
    }
    return;
  }

  if (event === 'notification:new') {
    updateNotificationBadge();
    showToast(data.title || 'New notification', 'info');
    return;
  }
}

async function refreshCrmData() {
  try {
    const data = await apiRequest('/api/crm');
    if (data) {
      if (data.companies) state.companies = data.companies;
      if (data.deals) state.deals = data.deals;
      if (data.tasks) state.tasks = data.tasks;
      if (data.contacts) state.contacts = data.contacts;
      if (data.activities) state.activities = data.activities;
      if (data.letters) state.letters = data.letters;
      if (data.stages) state.stages = data.stages;
      renderAll();
    }
  } catch (e) { /* silent refresh */ }
}

// ─── LIVE NOTIFICATION BADGE ────────────────────────────────────────

async function updateNotificationBadge() {
  try {
    const data = await apiRequest('/api/notifications/unread-count');
    const badge = document.querySelector('.notification-button b');
    if (badge) {
      badge.textContent = data.count > 99 ? '99+' : String(data.count || 0);
      badge.style.display = data.count > 0 ? '' : 'none';
    }
  } catch (e) { /* ignore if not authenticated */ }
}

async function loadNotificationPanel() {
  try {
    const data = await apiRequest('/api/notifications?limit=10');
    const popover = el('notificationPopover');
    if (!popover) return;

    const list = popover.querySelector('.notification-list') || popover;
    if (data.data && data.data.length > 0) {
      list.innerHTML = data.data.map(n => `
        <div class="notification-item ${n.is_read ? 'read' : 'unread'}" data-notif-id="${n.id}">
          <div class="notif-title">${escapeHTML(n.title)}</div>
          <div class="notif-message">${escapeHTML(n.message || '')}</div>
          <div class="notif-time">${timeAgo(n.created_at)}</div>
        </div>
      `).join('') + `
        <div class="notification-actions">
          <button type="button" class="text-button" id="markAllReadBtn">Mark all as read</button>
        </div>
      `;

      // Mark all as read handler
      const markAllBtn = el('markAllReadBtn');
      if (markAllBtn) {
        markAllBtn.onclick = async () => {
          try {
            await apiRequest('/api/notifications/mark-all-read', { method: 'POST' });
            updateNotificationBadge();
            loadNotificationPanel();
          } catch (e) { /* ignore */ }
        };
      }
    } else {
      list.innerHTML = '<div class="notification-empty"><p>No notifications yet</p></div>';
    }
  } catch (e) { /* ignore */ }
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// Initialize WebSocket and notification badge after auth check
const _origCheckAuth = typeof checkAuthStatus === 'function' ? checkAuthStatus : null;
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (currentUser) {
      connectWebSocket();
      updateNotificationBadge();
    }
  }, 1500);
});

// Hook into notification button click to load panel
document.addEventListener('click', (e) => {
  if (e.target.closest('#notificationBtn')) {
    loadNotificationPanel();
  }
});

// ═══════════════════════════════════════════════════════════════════
// PHASE 3 — Teams & Hierarchy, Commissions, Target Management
// ═══════════════════════════════════════════════════════════════════

// ─── API HELPERS ───────────────────────────────────────────────────

async function createTeamRecord(attributes) {
  return apiRequest('/api/teams', { method: 'POST', body: JSON.stringify(attributes) });
}

async function createTargetRecord(attributes) {
  return apiRequest('/api/targets', { method: 'POST', body: JSON.stringify(attributes) });
}

async function createCommissionRuleRecord(attributes) {
  return apiRequest('/api/commissions/rules', { method: 'POST', body: JSON.stringify(attributes) });
}

async function updateCommissionStatusRecord(id, status) {
  return apiRequest(`/api/commissions/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
}

async function triggerCommissionCalculation() {
  return apiRequest('/api/commissions/calculate', { method: 'POST' });
}

// ─── MODAL INITIALIZERS ────────────────────────────────────────────

function initTeamModal() {
  const managerSelect = el('teamManagerSelect');
  if (managerSelect) {
    const users = (state.analytics && state.analytics.team) ? state.analytics.team : [];
    managerSelect.innerHTML = '<option value="">Select Manager...</option>' +
      users.map(u => `<option value="${u.id}">${escapeHTML(u.name || u.username)} (${escapeHTML(u.role || 'Teammate')})</option>`).join('');
  }
}

function initTargetModal() {
  const userSelect = el('targetUserSelect');
  if (userSelect) {
    const users = (state.analytics && state.analytics.team) ? state.analytics.team : [];
    userSelect.innerHTML = '<option value="">Select Rep...</option>' +
      users.map(u => `<option value="${u.id}">${escapeHTML(u.name || u.username)} (${escapeHTML(u.role || 'Rep')})</option>`).join('');
  }
  if (el('targetPeriodIdentifier') && !el('targetPeriodIdentifier').value) {
    const now = new Date();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    el('targetPeriodIdentifier').value = `${now.getFullYear()}-${m}`;
  }
}

function initCommissionRuleModal() {
  // Configured with default form values
}

// ─── RENDER TEAMS & ORG HIERARCHY ──────────────────────────────────

function renderTeams() {
  renderOrgHierarchy();
  renderTeamsGrid();
}

function renderOrgHierarchy() {
  const container = el('orgTreeContainer');
  if (!container) return;

  const hier = state.hierarchy || [];
  if (!hier || hier.length === 0) {
    container.innerHTML = '<div class="empty-action"><p>No hierarchy structure configured yet.</p></div>';
    return;
  }

  function buildNodeHTML(node, isRoot = false) {
    const initials = getInitials(node.name || 'User');
    const childHTML = (node.subordinates && node.subordinates.length > 0)
      ? `<div class="tree-children">${node.subordinates.map(sub => buildNodeHTML(sub, false)).join('')}</div>`
      : '';

    return `
      <div class="tree-node">
        <div class="tree-card ${isRoot ? 'root-card' : ''}">
          <div class="tree-avatar">${initials}</div>
          <div class="tree-details">
            <span class="tree-name">${escapeHTML(node.name || node.username)}</span>
            <span class="tree-title">${escapeHTML(node.role || 'Team Member')} · ${escapeHTML(node.team_name || 'Sales')}</span>
            <div class="tree-meta">
              <span>Quota: ${money(node.quota || 0)}</span>
              <span>Attained: ${node.attainment_pct || 0}%</span>
            </div>
          </div>
        </div>
        ${childHTML}
      </div>
    `;
  }

  container.innerHTML = `
    <div class="tree-root">
      ${hier.map(rootNode => buildNodeHTML(rootNode, true)).join('')}
    </div>
  `;
}

function renderTeamsGrid() {
  const grid = el('teamsGrid');
  if (!grid) return;

  const teams = state.teams || [];
  if (!teams || teams.length === 0) {
    grid.innerHTML = '<div class="empty-action span-all"><p>No sales teams created yet. Click "+ Add Team" to organize your sales department.</p></div>';
    return;
  }

  grid.innerHTML = teams.map(t => {
    const members = t.members || [];
    const totalTarget = t.total_target || 0;
    const totalAchieved = t.total_achieved || 0;
    const attPct = totalTarget > 0 ? Math.round((totalAchieved / totalTarget) * 100) : 0;

    return `
      <div class="team-card">
        <div class="team-card-header">
          <div class="team-card-title">
            <h3>${escapeHTML(t.name)}</h3>
            <p>${escapeHTML(t.department || 'Sales Squad')}</p>
          </div>
          <span class="status-pill status-active">${members.length} Members</span>
        </div>
        <div class="team-lead-badge">
          <span class="avatar avatar-blue">${getInitials(t.manager_name || 'TL')}</span>
          <div>
            <strong style="font-size: 13px;">${escapeHTML(t.manager_name || 'Unassigned Lead')}</strong>
            <small style="display: block; color: var(--muted); font-size: 11px;">Team Lead / Manager</small>
          </div>
        </div>
        <div class="team-stats-row">
          <div class="team-stat-item">
            <span class="team-stat-label">Team Quota</span>
            <span class="team-stat-val">${money(totalTarget)}</span>
          </div>
          <div class="team-stat-item">
            <span class="team-stat-label">Achieved</span>
            <span class="team-stat-val" style="color: var(--green);">${money(totalAchieved)}</span>
          </div>
          <div class="team-stat-item">
            <span class="team-stat-label">Attainment</span>
            <span class="team-stat-val">${attPct}%</span>
          </div>
        </div>
        <div class="team-members">
          <small style="font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase;">Team Reps:</small>
          <div style="display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap;">
            ${members.map(m => `<span class="badge-type-appointment" style="font-size: 11px; font-weight: 600;">${escapeHTML(m.name || m.username)}</span>`).join('')}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ─── RENDER COMMISSIONS ────────────────────────────────────────────

function renderCommissions() {
  const comms = state.commissions || [];
  const summary = state.commSummary || { total_earned: 0, pending: 0, approved: 0, paid: 0, count: 0 };

  if (el('commTotalEarned')) el('commTotalEarned').textContent = money(summary.total_earned || 0);
  if (el('commTotalCount')) el('commTotalCount').textContent = `${summary.count || comms.length} records`;
  if (el('commPendingApproval')) el('commPendingApproval').textContent = money(summary.pending || 0);
  if (el('commApproved')) el('commApproved').textContent = money(summary.approved || 0);
  if (el('commPaid')) el('commPaid').textContent = money(summary.paid || 0);

  // Render Tier Rules summary pills
  const rules = state.commissionRules || [];
  const rulesContainer = el('tierPillsContainer');
  if (rulesContainer && rules.length > 0) {
    rulesContainer.innerHTML = rules.map(r => `
      <span class="tier-pill ${r.min_attainment_pct >= 150 ? 'tier-president' : r.min_attainment_pct >= 100 ? 'tier-accelerator' : 'tier-base'}">
        ${escapeHTML(r.name)}: ${r.commission_rate}% comm${r.bonus_amount > 0 ? ` + ${money(r.bonus_amount)} bonus` : ''} (${r.min_attainment_pct}%–${r.max_attainment_pct || '∞'}%)
      </span>
    `).join('');
  }

  // Filter ledger table
  const statusFilter = el('commissionStatusFilter') ? el('commissionStatusFilter').value : 'all';
  let filteredComms = comms;
  if (statusFilter !== 'all') {
    filteredComms = comms.filter(c => c.status === statusFilter);
  }

  const tbody = el('commissionsTableBody');
  if (!tbody) return;

  if (filteredComms.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-action"><p>No commission records found for this filter.</p></td></tr>';
    return;
  }

  tbody.innerHTML = filteredComms.map(c => {
    const statusClass = c.status === 'paid' ? 'status-paid-commission' : c.status === 'approved' ? 'status-approved' : 'status-earned';
    const statusLabel = c.status === 'paid' ? 'Paid' : c.status === 'approved' ? 'Approved' : 'Earned (Pending)';

    let actionBtn = '';
    if (c.status === 'earned') {
      actionBtn = `<button type="button" class="btn-table-action btn-send update-comm-status" data-comm-id="${c.id}" data-status="approved">✓ Approve</button>`;
    } else if (c.status === 'approved') {
      actionBtn = `<button type="button" class="btn-table-action btn-pay update-comm-status" data-comm-id="${c.id}" data-status="paid">💰 Mark Paid</button>`;
    } else {
      actionBtn = `<span style="font-size: 11px; color: var(--muted);">Settled</span>`;
    }

    return `
      <tr>
        <td><strong>${escapeHTML(c.user_name || 'Rep')}</strong></td>
        <td>
          <div style="font-weight: 600;">${escapeHTML(c.deal_title || 'Deal')}</div>
          <small style="color: var(--muted);">${escapeHTML(c.company_name || 'Company')}</small>
        </td>
        <td>${c.created_at ? new Date(c.created_at).toLocaleDateString('en-IN') : '—'}</td>
        <td style="font-family: 'Manrope', sans-serif; font-weight: 700;">${money(c.deal_value || 0)}</td>
        <td><strong>${c.commission_rate}%</strong></td>
        <td style="font-family: 'Manrope', sans-serif; font-weight: 700; color: var(--green);">${money(c.commission_amount || 0)}</td>
        <td style="font-family: 'Manrope', sans-serif; font-weight: 600;">${c.bonus_amount > 0 ? money(c.bonus_amount) : '—'}</td>
        <td><span class="status-pill ${statusClass}">${statusLabel}</span></td>
        <td>${actionBtn}</td>
      </tr>
    `;
  }).join('');
}

// ─── RENDER TARGETS & ATTAINMENT MATRIX ─────────────────────────────

function renderTargets() {
  const att = state.targetAttainment || { overall: { total_quota: 0, total_achieved: 0, attainment_pct: 0, gap: 0, pacing_pct: 100, status: 'On Track' }, reps: [] };
  const ov = att.overall || {};

  if (el('heroTargetAttainmentPct')) el('heroTargetAttainmentPct').textContent = `${ov.attainment_pct || 0}%`;
  if (el('heroAchievedTotal')) el('heroAchievedTotal').textContent = money(ov.total_achieved || 0);
  if (el('heroQuotaTotal')) el('heroQuotaTotal').textContent = money(ov.total_quota || 0);
  if (el('heroGapTotal')) el('heroGapTotal').textContent = money(ov.gap || 0);

  const fill = el('heroTargetFill');
  if (fill) fill.style.width = `${Math.min(100, ov.attainment_pct || 0)}%`;

  const pacingMarker = el('heroTargetPacingMarker');
  if (pacingMarker) pacingMarker.style.left = `${Math.min(100, ov.pacing_pct || 0)}%`;

  const pill = el('heroPacingPill');
  if (pill) {
    pill.textContent = ov.status || 'On Track';
    pill.className = `target-pacing-pill ${ov.status === 'Ahead' ? 'ahead' : ov.status === 'Behind' ? 'behind' : ''}`;
  }

  const tbody = el('targetsTableBody');
  if (!tbody) return;

  const reps = att.reps || [];
  if (reps.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-action"><p>No sales quota targets assigned yet. Click "+ Assign Sales Target".</p></td></tr>';
    return;
  }

  tbody.innerHTML = reps.map(r => {
    const pacingClass = r.status === 'Ahead' ? 'pacing-ahead' : r.status === 'Behind' ? 'pacing-behind' : 'pacing-ontrack';

    return `
      <tr>
        <td>
          <div style="font-weight: 700; font-size: 13px;">${escapeHTML(r.user_name || 'Rep')}</div>
          <small style="color: var(--muted);">${escapeHTML(r.role || 'Sales Rep')}</small>
        </td>
        <td><span class="badge-type-appointment">${escapeHTML(r.team_name || 'Sales Squad')}</span></td>
        <td><strong>${escapeHTML(r.period_identifier || '2026-09')}</strong></td>
        <td style="font-family: 'Manrope', sans-serif; font-weight: 700;">${money(r.target_quota || 0)}</td>
        <td style="font-family: 'Manrope', sans-serif; font-weight: 700; color: var(--green);">${money(r.achieved || 0)}</td>
        <td>
          <div style="font-family: 'Manrope', sans-serif; font-weight: 800; font-size: 14px;">${r.attainment_pct || 0}%</div>
          <div class="quota-bar" style="width: 70px; height: 6px;"><div class="quota-fill" style="width: ${Math.min(100, r.attainment_pct || 0)}%;"></div></div>
        </td>
        <td><span class="pacing-badge ${pacingClass}">${escapeHTML(r.status || 'On Track')}</span></td>
        <td style="font-family: 'Manrope', sans-serif; font-weight: 600; color: ${r.gap > 0 ? 'var(--red)' : 'var(--green)'};">${r.gap > 0 ? `- ${money(r.gap)}` : 'Target Met 🎉'}</td>
        <td>
          <button type="button" class="btn-table-action edit-target-btn" data-target-id="${r.id}">✎ Edit</button>
        </td>
      </tr>
    `;
  }).join('');
}

// ─── FORM & ACTION LISTENERS FOR PHASE 3 ───────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const teamForm = el('teamModal');
  if (teamForm) {
    teamForm.addEventListener('submit', async e => {
      e.preventDefault();
      const formData = new FormData(teamForm);
      const data = Object.fromEntries(formData.entries());
      try {
        await createTeamRecord(data);
        showToast('Team created successfully!');
        closeModal();
        await loadCRMData();
        renderAll();
      } catch (err) {
        showToast(`Error creating team: ${err.message}`);
      }
    });
  }

  const targetForm = el('targetModal');
  if (targetForm) {
    targetForm.addEventListener('submit', async e => {
      e.preventDefault();
      const formData = new FormData(targetForm);
      const data = Object.fromEntries(formData.entries());
      try {
        await createTargetRecord(data);
        showToast('Quota target assigned successfully!');
        closeModal();
        await loadCRMData();
        renderAll();
      } catch (err) {
        showToast(`Error setting target: ${err.message}`);
      }
    });
  }

  const ruleForm = el('commissionRuleModal');
  if (ruleForm) {
    ruleForm.addEventListener('submit', async e => {
      e.preventDefault();
      const formData = new FormData(ruleForm);
      const data = Object.fromEntries(formData.entries());
      try {
        await createCommissionRuleRecord(data);
        showToast('Commission tier rule saved!');
        closeModal();
        await loadCRMData();
        renderAll();
      } catch (err) {
        showToast(`Error saving rule: ${err.message}`);
      }
    });
  }

  const commStatusSelect = el('commissionStatusFilter');
  if (commStatusSelect) {
    commStatusSelect.addEventListener('change', () => {
      renderCommissions();
    });
  }
});

document.addEventListener('click', async e => {
  if (e.target.closest('#recalculateCommissionsBtn')) {
    try {
      showToast('Recalculating commissions against won deals...');
      await triggerCommissionCalculation();
      await loadCRMData();
      renderAll();
      showToast('Commissions recalculated successfully!');
    } catch (err) {
      showToast(`Calculation failed: ${err.message}`);
    }
  }

  const commStatusBtn = e.target.closest('.update-comm-status');
  if (commStatusBtn) {
    const id = commStatusBtn.dataset.commId;
    const status = commStatusBtn.dataset.status;
    try {
      await updateCommissionStatusRecord(id, status);
      showToast(`Commission status updated to ${status}!`);
      await loadCRMData();
      renderAll();
    } catch (err) {
      showToast(`Failed to update status: ${err.message}`);
    }
  }
});

// ─── PHASE 4: AUTOMATIONS, NOTIFICATIONS & APPROVALS HANDLERS ───────

document.addEventListener('DOMContentLoaded', () => {
  // 1. Topbar Notification Bell Toggle
  const notifBtn = el('notificationBtn');
  if (notifBtn) {
    notifBtn.addEventListener('click', e => {
      e.stopPropagation();
      const popover = el('notificationPopover');
      if (popover) {
        const isVisible = popover.style.display !== 'none';
        popover.style.display = isVisible ? 'none' : 'block';
      }
    });
  }

  // Close notification popover when clicking outside
  document.addEventListener('click', e => {
    const popover = el('notificationPopover');
    if (popover && !e.target.closest('#notificationPopover') && !e.target.closest('#notificationBtn')) {
      popover.style.display = 'none';
    }
  });

  // 2. Mark All Read
  const markAllTopBtn = el('markAllNotificationsReadBtn');
  if (markAllTopBtn) {
    markAllTopBtn.addEventListener('click', async () => {
      try {
        await apiRequest('/api/notifications/read-all', { method: 'PUT' });
        showToast('All notifications marked read');
        await loadCRMData();
        renderAll();
      } catch (err) { showToast(`Failed to mark read: ${err.message}`); }
    });
  }
  const markAllPageBtn = el('pageMarkAllReadBtn');
  if (markAllPageBtn) {
    markAllPageBtn.addEventListener('click', async () => {
      try {
        await apiRequest('/api/notifications/read-all', { method: 'PUT' });
        showToast('All notifications marked read');
        await loadCRMData();
        renderAll();
      } catch (err) { showToast(`Failed to mark read: ${err.message}`); }
    });
  }

  // 3. Notification Filter Tabs
  document.querySelectorAll('[data-notif-filter]').forEach(tab => {
    tab.addEventListener('click', e => {
      document.querySelectorAll('[data-notif-filter]').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      state.notifFilter = e.target.dataset.notifFilter;
      renderNotifications();
    });
  });

  // 4. Automations View Sub-Tabs
  document.querySelectorAll('[data-auto-tab]').forEach(tab => {
    tab.addEventListener('click', async e => {
      document.querySelectorAll('[data-auto-tab]').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      const target = e.target.dataset.autoTab;
      el('autoSubViewRules').style.display = target === 'rules' ? 'block' : 'none';
      el('autoSubViewLogs').style.display = target === 'logs' ? 'block' : 'none';
      el('autoSubViewSettings').style.display = target === 'settings' ? 'block' : 'none';

      if (target === 'logs') {
        try {
          const res = await apiRequest('/api/automations/logs');
          const logs = res.data || res || [];
          const tbody = el('automationLogsTableBody');
          if (tbody) {
            tbody.innerHTML = logs.map(l => `
              <tr>
                <td><small>${l.executed_at ? new Date(l.executed_at).toLocaleString() : '—'}</small></td>
                <td><strong>${escapeHTML(l.rule_name || 'Rule')}</strong></td>
                <td><span class="badge-type-appointment">${escapeHTML(l.event_type || '—')}</span></td>
                <td>${escapeHTML(l.entity_type)} #${escapeHTML(l.entity_id)}</td>
                <td><span class="status-pill ${l.status === 'success' ? 'active' : 'failed'}">${escapeHTML(l.status)}</span></td>
                <td><small style="color: #64748b;">${escapeHTML(typeof l.details === 'object' ? JSON.stringify(l.details) : String(l.details || ''))}</small></td>
              </tr>
            `).join('') || '<tr><td colspan="6" class="empty-state">No execution logs found.</td></tr>';
          }
        } catch (err) { console.warn('Failed to load logs:', err); }
      } else if (target === 'settings') {
        try {
          const settings = await apiRequest('/api/automations/settings');
          if (settings) {
            if (el('settingDiscountThreshold')) el('settingDiscountThreshold').value = settings.discount_approval_threshold || 15;
            if (el('settingHighDealThreshold')) el('settingHighDealThreshold').value = settings.high_deal_threshold || 1000000;
            if (el('settingQuoteValidityDays')) el('settingQuoteValidityDays').value = settings.quote_validity_days || 14;
            if (el('settingInactiveDealDays')) el('settingInactiveDealDays').value = settings.inactive_deal_days || 7;
          }
        } catch (err) { console.warn('Failed to load settings:', err); }
      }
    });
  });

  // 5. Governance Settings Form Submit
  const autoSettingsForm = el('automationSettingsForm');
  if (autoSettingsForm) {
    autoSettingsForm.addEventListener('submit', async e => {
      e.preventDefault();
      const formData = new FormData(autoSettingsForm);
      const data = Object.fromEntries(formData.entries());
      try {
        await apiRequest('/api/automations/settings', { method: 'POST', body: JSON.stringify(data) });
        showToast('Governance thresholds saved successfully!');
      } catch (err) {
        showToast(`Failed to save settings: ${err.message}`);
      }
    });
  }

  // 6. Manual Cron Trigger Button
  const runCronBtn = el('runCronManualBtn');
  if (runCronBtn) {
    runCronBtn.addEventListener('click', async () => {
      try {
        showToast('Executing daily automation jobs (expiry checks, renewal reminders, inactive deals)...');
        const res = await apiRequest('/api/automations/run-cron', { method: 'POST' });
        showToast('Automations executed successfully!');
        await loadCRMData();
        renderAll();
      } catch (err) {
        showToast(`Cron execution failed: ${err.message}`);
      }
    });
  }

  // 7. Automation Rule Form Submit
  const autoModalForm = el('automationModal');
  if (autoModalForm) {
    autoModalForm.addEventListener('submit', async e => {
      e.preventDefault();
      const name = el('autoRuleName').value.trim();
      const description = el('autoDescription')?.value.trim() || '';
      const event = el('autoEvent').value;
      const action_type = el('autoActionType').value;
      const field = el('autoCondField').value.trim();
      const op = el('autoCondOp').value;
      const val = el('autoCondVal').value.trim();
      const title = el('autoActionTitle')?.value.trim() || '';
      const target_role = el('autoActionRole')?.value || 'owner';
      const is_active = el('autoIsActive')?.checked ?? true;
      const ruleId = el('autoRuleId')?.value;

      const conditions = field ? { field, operator: op, value: isNaN(val) ? val : Number(val) } : {};
      const action_config = { title, target_role };

      const body = {
        name,
        description,
        event_type: event,
        event,
        conditions: JSON.stringify(conditions),
        action_type,
        action_json: JSON.stringify(action_config),
        action_config: JSON.stringify(action_config),
        is_active
      };

      try {
        if (ruleId) {
          await apiRequest(`/api/automations/${ruleId}`, { method: 'PUT', body: JSON.stringify(body) });
          showToast('Automation rule updated!');
        } else {
          await apiRequest('/api/automations', { method: 'POST', body: JSON.stringify(body) });
          showToast('Automation rule created!');
        }
        closeModal();
        await loadCRMData();
        renderAll();
      } catch (err) {
        showToast(`Error saving automation rule: ${err.message}`);
      }
    });
  }

  // 8. Dry Run Rule Test Button
  const dryRunBtn = el('autoDryRunBtn');
  if (dryRunBtn) {
    dryRunBtn.addEventListener('click', async () => {
      const event = el('autoEvent').value;
      const field = el('autoCondField').value.trim();
      const op = el('autoCondOp').value;
      const val = el('autoCondVal').value.trim();

      const conditions = field ? { field, operator: op, value: isNaN(val) ? val : Number(val) } : {};
      try {
        showToast('Running rule test simulation against recent data...');
        const res = await apiRequest('/api/automations/test', {
          method: 'POST',
          body: JSON.stringify({ event_type: event, conditions: JSON.stringify(conditions) })
        });
        showToast(`Test result: ${res.matched ? '✅ MATCHED!' : '❌ NO MATCH'} — ${res.message}`);
      } catch (err) {
        showToast(`Dry-run error: ${err.message}`);
      }
    });
  }
});

// 9. Delegated Click Handlers for Approvals, Automations, Notifications
document.addEventListener('click', async e => {
  // Decision on Approval
  const decideBtn = e.target.closest('.decide-approval-btn');
  if (decideBtn) {
    const id = decideBtn.dataset.appId;
    const decision = decideBtn.dataset.decision;
    try {
      showToast(`Submitting ${decision} decision...`);
      await apiRequest(`/api/approvals/${id}/decide`, {
        method: 'PUT',
        body: JSON.stringify({ decision, comments: `${decision} via Approval Center` })
      });
      showToast(`Approval request ${decision.toLowerCase()}!`);
      await loadCRMData();
      renderAll();
    } catch (err) {
      showToast(`Decision error: ${err.message}`);
    }
  }

  // Toggle Automation Active State
  const toggleAutoBtn = e.target.closest('.toggle-automation-btn');
  if (toggleAutoBtn) {
    const id = toggleAutoBtn.dataset.autoId;
    const rule = (state.automations || []).find(a => Number(a.id) === Number(id));
    if (rule) {
      try {
        await apiRequest(`/api/automations/${id}/toggle`, {
          method: 'PUT',
          body: JSON.stringify({ is_active: !rule.is_active })
        });
        showToast(`Rule ${!rule.is_active ? 'activated' : 'paused'}!`);
        await loadCRMData();
        renderAll();
      } catch (err) {
        showToast(`Toggle error: ${err.message}`);
      }
    }
  }

  // Mark single notification read
  const markReadBtn = e.target.closest('.mark-single-read-btn');
  if (markReadBtn) {
    const id = markReadBtn.dataset.notifId;
    try {
      await apiRequest(`/api/notifications/${id}/read`, { method: 'PUT' });
      await loadCRMData();
      renderAll();
    } catch (err) { console.warn('Failed to mark read:', err); }
  }

  // Click on topbar notification item
  const notifItem = e.target.closest('.notification-item');
  if (notifItem) {
    const id = notifItem.dataset.notifId;
    try {
      await apiRequest(`/api/notifications/${id}/read`, { method: 'PUT' });
      await loadCRMData();
      renderAll();
    } catch (err) { console.warn('Failed to mark read:', err); }
  }

  // Target view button on notification
  const notifTargetBtn = e.target.closest('.notif-target-btn');
  if (notifTargetBtn) {
    const view = notifTargetBtn.dataset.view;
    if (view && typeof openView === 'function') {
      openView(view);
    }
  }
});

// ─── iKnow AI COPILOT FRONTEND CONTROLLER ────────────────────────────

let iKnowContext = {
  page: 'dashboard',
  entityType: null,
  entityId: null,
  entityName: null
};

function updateIkNowContext(page, entityType = null, entityId = null, entityName = null) {
  iKnowContext.page = page || state.activeView || 'dashboard';
  iKnowContext.entityType = entityType;
  iKnowContext.entityId = entityId;
  iKnowContext.entityName = entityName;

  const pill = el('iKnowContextPill');
  if (pill) {
    if (entityType && entityName) {
      pill.textContent = `📍 ${entityType}: ${entityName}`;
    } else {
      const pageTitle = (page || 'dashboard').charAt(0).toUpperCase() + (page || 'dashboard').slice(1);
      pill.textContent = `📍 ${pageTitle} View`;
    }
  }
}

let iKnowSessionHistory = [];

async function sendIkNowMessage(promptText) {
  const text = (promptText || el('iKnowInputText')?.value || '').trim();
  if (!text) return;

  const streamEl = el('iKnowMessageStream');
  const welcomeCard = el('iKnowWelcomeCard');
  if (welcomeCard) welcomeCard.style.display = 'none';

  // 1. Render User Bubble
  if (streamEl) {
    const userRow = document.createElement('div');
    userRow.className = 'iknow-msg-row user-row';
    userRow.innerHTML = `<div class="iknow-msg-bubble">${escapeHTML(text)}</div>`;
    streamEl.appendChild(userRow);

    // Track user message in session history
    iKnowSessionHistory.push({ sender: 'user', text });

    // Clear input
    if (el('iKnowInputText')) el('iKnowInputText').value = '';

    // Scroll to bottom
    const msgContainer = el('iKnowMessages');
    if (msgContainer) msgContainer.scrollTop = msgContainer.scrollHeight;

    // 2. Render Typing Indicator
    const typingRow = document.createElement('div');
    typingRow.className = 'iknow-msg-row ai-row iknow-typing-row';
    typingRow.innerHTML = `
      <div class="iknow-avatar">IK</div>
      <div class="iknow-msg-bubble" style="color: #64748b; font-style: italic;">
        iKnow is analyzing CRM context... ⏳
      </div>
    `;
    streamEl.appendChild(typingRow);
    if (msgContainer) msgContainer.scrollTop = msgContainer.scrollHeight;

    try {
      // 3. API Request to /api/ai/chat with history
      const res = await apiRequest('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: text,
          current_page: iKnowContext.page,
          entity_type: iKnowContext.entityType,
          entity_id: iKnowContext.entityId,
          history: iKnowSessionHistory
        })
      });

      // Remove typing row
      typingRow.remove();

      if (res.reply) {
        iKnowSessionHistory.push({ sender: 'ai', text: res.reply });
      }

      // 4. Render AI Response Bubble
      const aiRow = document.createElement('div');
      aiRow.className = 'iknow-msg-row ai-row';

      let formattedHtml = '';
      if (res.reply) {
        let raw = res.reply
          .replace(/### (.*?)\n/g, '<h3>$1</h3>')
          .replace(/#### (.*?)\n/g, '<h4>$1</h4>')
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/`([^`]+)`/g, '<code>$1</code>')
          .replace(/- (.*?)\n/g, '<li>$1</li>');
        formattedHtml = raw.replace(/\n/g, '<br>');
      } else {
        formattedHtml = 'I processed your request.';
      }

      // Render Entity Card if present
      let cardHtml = '';
      if (res.customerCard) {
        cardHtml = `
          <div class="iknow-entity-card" style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:10px; margin-top:8px;">
            <div style="font-weight:700; color:#0f172a;">🏢 ${escapeHTML(res.customerCard.name)}</div>
            <div style="font-size:12px; color:#475569; margin:4px 0;">Status: <code>${escapeHTML(res.customerCard.status)}</code> | Open Deals: ${res.customerCard.openDeals}</div>
            <div style="font-size:12px; color:#ef4444; font-weight:700;">Outstanding: ${escapeHTML(res.customerCard.outstanding)}</div>
            <button type="button" class="button button-secondary button-sm" style="margin-top:6px; font-size:11px; padding:3px 8px;" data-target-view="customers">Open Customer Profile →</button>
          </div>
        `;
      } else if (res.dealCard) {
        cardHtml = `
          <div class="iknow-entity-card" style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:10px; margin-top:8px;">
            <div style="font-weight:700; color:#0f172a;">◫ ${escapeHTML(res.dealCard.title)}</div>
            <div style="font-size:12px; color:#475569; margin:4px 0;">Account: ${escapeHTML(res.dealCard.company)} | Value: <strong>${escapeHTML(res.dealCard.value)}</strong></div>
            <div style="font-size:12px; color:#475569;">Stage: <code>${escapeHTML(res.dealCard.stage)}</code> | Health: <strong>${escapeHTML(res.dealCard.health)}</strong></div>
            <button type="button" class="button button-secondary button-sm" style="margin-top:6px; font-size:11px; padding:3px 8px;" data-target-view="pipeline">Open Deal Pipeline →</button>
          </div>
        `;
      } else if (res.quotationCard) {
        cardHtml = `
          <div class="iknow-entity-card" style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:10px; margin-top:8px;">
            <div style="font-weight:700; color:#0f172a;">📋 ${escapeHTML(res.quotationCard.number)}</div>
            <div style="font-size:12px; color:#475569; margin:4px 0;">Client: ${escapeHTML(res.quotationCard.company)} | Total: <strong>${escapeHTML(res.quotationCard.total)}</strong></div>
            <div style="font-size:12px; color:#475569;">Status: <code>${escapeHTML(res.quotationCard.status)}</code></div>
            <button type="button" class="button button-secondary button-sm" style="margin-top:6px; font-size:11px; padding:3px 8px;" data-target-view="quotations">Open Quotation →</button>
          </div>
        `;
      } else if (res.invoiceCard) {
        cardHtml = `
          <div class="iknow-entity-card" style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:10px; margin-top:8px;">
            <div style="font-weight:700; color:#0f172a;">🧾 ${escapeHTML(res.invoiceCard.number)}</div>
            <div style="font-size:12px; color:#475569; margin:4px 0;">Billed To: ${escapeHTML(res.invoiceCard.company)} | Total: <strong>${escapeHTML(res.invoiceCard.total)}</strong></div>
            <div style="font-size:12px; color:#ef4444; font-weight:700;">Outstanding Balance: ${escapeHTML(res.invoiceCard.outstanding)}</div>
            <button type="button" class="button button-secondary button-sm" style="margin-top:6px; font-size:11px; padding:3px 8px;" data-target-view="invoices">Open Invoice →</button>
          </div>
        `;
      }

      // Render Action Buttons if present
      let actionsHtml = '';
      if (res.actions && Array.isArray(res.actions) && res.actions.length > 0) {
        actionsHtml = `<div class="iknow-actions-grid" style="margin-top:8px; display:flex; flex-direction:column; gap:6px;">` + res.actions.map(act => {
          if (act.action === 'request_confirmation') {
            return `
              <div class="iknow-confirmation-card" style="background:#fffbe6; border:1px solid #ffe58f; padding:8px; border-radius:6px; margin-top:4px;">
                <strong style="font-size:12px; color:#713f12;">⚠️ Confirmation Required: ${escapeHTML(act.label)}</strong>
                <span style="font-size: 11px; color: #713f12; display: block; margin-top: 2px;">Would you like iKnow to execute this CRM action?</span>
                <div class="iknow-confirm-buttons" style="display:flex; gap:6px; margin-top:6px;">
                  <button type="button" class="iknow-confirm-btn button button-primary button-sm" style="font-size:11px; padding:3px 8px;" data-tool="${act.tool}" data-payload='${JSON.stringify(act.payload || {})}'>Yes, Confirm Action</button>
                  <button type="button" class="iknow-cancel-btn button button-quiet button-sm" style="font-size:11px; padding:3px 8px;">Cancel</button>
                </div>
              </div>
            `;
          }
          if (act.action === 'trigger_prompt') {
            return `<button type="button" class="iknow-action-btn button button-secondary button-sm" style="font-size:11px; justify-content:space-between;" data-trigger-prompt="${escapeHTML(act.prompt)}"><span>${escapeHTML(act.label)}</span> →</button>`;
          }
          return `<button type="button" class="iknow-action-btn button button-secondary button-sm" style="font-size:11px; justify-content:space-between;" data-target-view="${act.targetView || 'dashboard'}"><span>${escapeHTML(act.label)}</span> →</button>`;
        }).join('') + `</div>`;
      }

      aiRow.innerHTML = `
        <div class="iknow-avatar">IK</div>
        <div class="iknow-msg-bubble">
          ${formattedHtml}
          ${cardHtml}
          ${actionsHtml}
        </div>
      `;

      streamEl.appendChild(aiRow);
      if (msgContainer) msgContainer.scrollTop = msgContainer.scrollHeight;

    } catch (err) {
      typingRow.remove();
      const errRow = document.createElement('div');
      errRow.className = 'iknow-msg-row ai-row';
      errRow.innerHTML = `
        <div class="iknow-avatar">🤖</div>
        <div class="iknow-msg-bubble" style="border-color: #fca5a5; background: #fef2f2; color: #991b1b;">
          ⚠️ Unable to connect to iKnow AI Assistant: ${escapeHTML(err.message)}
        </div>
      `;
      streamEl.appendChild(errRow);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Floating Button Toggle
  const floatBtn = el('iKnowFloatingBtn');
  const panel = el('iKnowChatPanel');
  if (floatBtn && panel) {
    floatBtn.addEventListener('click', () => {
      const isVisible = panel.style.display !== 'none';
      panel.style.display = isVisible ? 'none' : 'flex';
      if (!isVisible) {
        updateIkNowContext(state.activeView);
        if (el('iKnowInputText')) setTimeout(() => el('iKnowInputText').focus(), 100);
      }
    });
  }

  // Header Actions
  if (el('iKnowCloseBtn')) {
    el('iKnowCloseBtn').addEventListener('click', () => {
      if (panel) panel.style.display = 'none';
    });
  }
  if (el('iKnowMinimizeBtn')) {
    el('iKnowMinimizeBtn').addEventListener('click', () => {
      if (panel) panel.style.display = 'none';
    });
  }
  if (el('iKnowClearBtn')) {
    el('iKnowClearBtn').addEventListener('click', () => {
      if (el('iKnowMessageStream')) el('iKnowMessageStream').innerHTML = '';
      if (el('iKnowWelcomeCard')) el('iKnowWelcomeCard').style.display = 'block';
    });
  }

  // Keyboard shortcut (⌘ J or Ctrl + J)
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
      e.preventDefault();
      if (panel) {
        const isVisible = panel.style.display !== 'none';
        panel.style.display = isVisible ? 'none' : 'flex';
        if (!isVisible && el('iKnowInputText')) setTimeout(() => el('iKnowInputText').focus(), 100);
      }
    }
  });

  // Input Form Submit
  const inputForm = el('iKnowInputForm');
  if (inputForm) {
    inputForm.addEventListener('submit', e => {
      e.preventDefault();
      sendIkNowMessage();
    });
  }

  // Textarea Enter key submit (Shift+Enter for newline)
  const inputArea = el('iKnowInputText');
  if (inputArea) {
    inputArea.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendIkNowMessage();
      }
    });
  }
});

// Global Delegated Handlers for iKnow Dynamic Buttons
document.addEventListener('click', async e => {
  // Quick Action Pill
  const pill = e.target.closest('.iknow-pill');
  if (pill) {
    const prompt = pill.dataset.prompt;
    if (prompt) sendIkNowMessage(prompt);
  }

  // Target View Navigation
  const targetViewBtn = e.target.closest('[data-target-view]');
  if (targetViewBtn) {
    const view = targetViewBtn.dataset.targetView;
    if (view && typeof openView === 'function') {
      openView(view);
    }
  }

  // Trigger Prompt Button
  const triggerBtn = e.target.closest('[data-trigger-prompt]');
  if (triggerBtn) {
    const prompt = triggerBtn.dataset.triggerPrompt;
    if (prompt) sendIkNowMessage(prompt);
  }

  // Confirm Tool Action Button
  const confirmBtn = e.target.closest('.iknow-confirm-btn');
  if (confirmBtn) {
    const tool = confirmBtn.dataset.tool;
    let payload = {};
    try { payload = JSON.parse(confirmBtn.dataset.payload || '{}'); } catch(err) {}

    try {
      showToast(`Executing ${tool}...`);
      const res = await apiRequest('/api/ai/execute-action', {
        method: 'POST',
        body: JSON.stringify({ tool, payload, confirmation_granted: true })
      });
      showToast(res.message || 'Action executed successfully!');
      confirmBtn.closest('.iknow-confirmation-card').innerHTML = `
        <div style="color: #059669; font-weight: 700; font-size: 12px;">✅ Action Executed: ${escapeHTML(res.message)}</div>
      `;
      await loadCRMData();
      renderAll();
    } catch (err) {
      showToast(`Action execution failed: ${err.message}`);
    }
  }

  // Cancel Tool Action Button
  const cancelBtn = e.target.closest('.iknow-cancel-btn');
  if (cancelBtn) {
    const card = cancelBtn.closest('.iknow-confirmation-card');
    if (card) {
      card.innerHTML = `<div style="color: #64748b; font-size: 12px;">Action cancelled.</div>`;
    }
  }
});


