/**
 * SpeakAware — Main Application Logic
 * Manages meeting sessions, alerts, stats, and navigation.
 */

(function () {
  'use strict';

  // ---- State ----
  const state = {
    isInMeeting: false,
    meetingStartTime: null,
    speakingStartTime: null,
    totalSpeakingMs: 0,
    totalSilentMs: 0,
    alertCount: 0,
    currentSpeakingStreak: 0, // seconds of continuous speaking
    lastAlertTime: 0,
    sessions: JSON.parse(localStorage.getItem('speakaware_sessions') || '[]'),
    settings: Object.assign({
      thresholdTime: 15,
      cooldownTime: 10,
      sensitivity: 5,
      vibrate: true,
      speakingGoal: 25
    }, JSON.parse(localStorage.getItem('speakaware_settings') || '{}'))
  };

  // ---- DOM Elements ----
  const $ = (sel) => document.querySelector(sel);
  const dom = {
    alertOverlay: $('#alert-overlay'),
    screenHome: $('#screen-home'),
    screenSettings: $('#screen-settings'),
    screenSummary: $('#screen-summary'),
    settingsBtn: $('#settings-btn'),
    settingsBack: $('#settings-back'),
    summaryBack: $('#summary-back'),
    summaryContent: $('#summary-content'),
    btnStart: $('#btn-start'),
    btnStop: $('#btn-stop'),
    liveStats: $('#live-stats'),
    statSpeaking: $('#stat-speaking'),
    statSilent: $('#stat-silent'),
    statAlerts: $('#stat-alerts'),
    statusRing: $('#status-ring'),
    statusIcon: $('#status-icon'),
    statusLabel: $('#status-label'),
    timerDisplay: $('#timer-display'),
    ringProgress: $('#ring-progress'),
    historyList: $('#history-list'),
    thresholdTime: $('#threshold-time'),
    thresholdValue: $('#threshold-value'),
    cooldownTime: $('#cooldown-time'),
    cooldownValue: $('#cooldown-value'),
    sensitivity: $('#sensitivity'),
    sensitivityValue: $('#sensitivity-value'),
    vibrateToggle: $('#vibrate-toggle'),
    speakingGoal: $('#speaking-goal'),
    goalValue: $('#goal-value')
  };

  // ---- Audio Detector ----
  const detector = new AudioDetector();
  let meetingTimer = null;
  let statsInterval = null;

  // ---- Navigation ----
  function showScreen(screen) {
    [dom.screenHome, dom.screenSettings, dom.screenSummary].forEach(s =>
      s.classList.remove('active')
    );
    screen.classList.add('active');
  }

  dom.settingsBtn.addEventListener('click', () => showScreen(dom.screenSettings));
  dom.settingsBack.addEventListener('click', () => showScreen(dom.screenHome));
  dom.summaryBack.addEventListener('click', () => showScreen(dom.screenHome));

  // ---- Settings ----
  function loadSettings() {
    const s = state.settings;
    dom.thresholdTime.value = s.thresholdTime;
    dom.thresholdValue.textContent = s.thresholdTime + 's';
    dom.cooldownTime.value = s.cooldownTime;
    dom.cooldownValue.textContent = s.cooldownTime + 's';
    dom.sensitivity.value = s.sensitivity;
    dom.sensitivityValue.textContent = s.sensitivity;
    dom.vibrateToggle.checked = s.vibrate;
    dom.speakingGoal.value = s.speakingGoal;
    dom.goalValue.textContent = s.speakingGoal + '%';
  }

  function saveSettings() {
    localStorage.setItem('speakaware_settings', JSON.stringify(state.settings));
  }

  dom.thresholdTime.addEventListener('input', (e) => {
    state.settings.thresholdTime = parseInt(e.target.value);
    dom.thresholdValue.textContent = e.target.value + 's';
    saveSettings();
  });

  dom.cooldownTime.addEventListener('input', (e) => {
    state.settings.cooldownTime = parseInt(e.target.value);
    dom.cooldownValue.textContent = e.target.value + 's';
    saveSettings();
  });

  dom.sensitivity.addEventListener('input', (e) => {
    state.settings.sensitivity = parseInt(e.target.value);
    dom.sensitivityValue.textContent = e.target.value;
    detector.setSensitivity(parseInt(e.target.value));
    saveSettings();
  });

  dom.vibrateToggle.addEventListener('change', (e) => {
    state.settings.vibrate = e.target.checked;
    saveSettings();
  });

  dom.speakingGoal.addEventListener('input', (e) => {
    state.settings.speakingGoal = parseInt(e.target.value);
    dom.goalValue.textContent = e.target.value + '%';
    saveSettings();
  });

  // ---- Meeting Controls ----
  dom.btnStart.addEventListener('click', startMeeting);
  dom.btnStop.addEventListener('click', stopMeeting);

  async function startMeeting() {
    detector.setSensitivity(state.settings.sensitivity);

    const success = await detector.start();
    if (!success) {
      alert('Microphone access is required. Please allow microphone access and try again.');
      return;
    }

    state.isInMeeting = true;
    state.meetingStartTime = Date.now();
    state.totalSpeakingMs = 0;
    state.totalSilentMs = 0;
    state.alertCount = 0;
    state.currentSpeakingStreak = 0;
    state.speakingStartTime = null;
    state.lastAlertTime = 0;

    // UI updates
    dom.btnStart.classList.add('hidden');
    dom.btnStop.classList.remove('hidden');
    dom.liveStats.classList.remove('hidden');
    dom.statusRing.classList.add('active');
    dom.statusIcon.innerHTML = '&#128266;'; // speaker icon
    dom.statusLabel.textContent = 'Listening';

    // Start timer display
    meetingTimer = setInterval(updateTimer, 1000);
    statsInterval = setInterval(updateStats, 500);

    // Audio callbacks
    detector.onSpeakingStart = onSpeakingStart;
    detector.onSpeakingStop = onSpeakingStop;
    detector.onVolumeChange = onVolumeChange;

    // Keep screen awake (if supported)
    requestWakeLock();
  }

  function stopMeeting() {
    if (!state.isInMeeting) return;

    // Finalize speaking time if still speaking
    if (state.speakingStartTime) {
      state.totalSpeakingMs += Date.now() - state.speakingStartTime;
      state.speakingStartTime = null;
    }

    state.isInMeeting = false;
    detector.stop();
    clearInterval(meetingTimer);
    clearInterval(statsInterval);
    hideAlert();

    // UI reset
    dom.btnStart.classList.remove('hidden');
    dom.btnStop.classList.add('hidden');
    dom.liveStats.classList.add('hidden');
    dom.statusRing.classList.remove('active', 'speaking');
    dom.statusIcon.innerHTML = '&#127908;';
    dom.statusLabel.textContent = 'Ready';
    dom.timerDisplay.textContent = '00:00';
    dom.ringProgress.classList.remove('warning', 'danger');
    dom.ringProgress.style.strokeDashoffset = 565.48;

    // Save session
    const session = {
      id: Date.now(),
      date: new Date().toISOString(),
      durationMs: Date.now() - state.meetingStartTime,
      speakingMs: state.totalSpeakingMs,
      alertCount: state.alertCount,
      speakingGoal: state.settings.speakingGoal
    };

    state.sessions.unshift(session);
    if (state.sessions.length > 50) state.sessions.pop();
    localStorage.setItem('speakaware_sessions', JSON.stringify(state.sessions));

    renderHistory();
    showSummary(session);

    releaseWakeLock();
  }

  // ---- Speaking Detection Handlers ----
  function onSpeakingStart() {
    state.speakingStartTime = Date.now();
    state.currentSpeakingStreak = 0;
    dom.statusRing.classList.add('speaking');
    dom.statusIcon.innerHTML = '&#128483;'; // speaking head
    dom.statusLabel.textContent = 'Speaking';
  }

  function onSpeakingStop() {
    if (state.speakingStartTime) {
      state.totalSpeakingMs += Date.now() - state.speakingStartTime;
      state.speakingStartTime = null;
    }
    state.currentSpeakingStreak = 0;
    dom.statusRing.classList.remove('speaking');
    dom.statusIcon.innerHTML = '&#128266;';
    dom.statusLabel.textContent = 'Listening';
    hideAlert();
  }

  function onVolumeChange(volume) {
    // Update the speaking streak if currently speaking
    if (detector.isSpeaking && state.speakingStartTime) {
      state.currentSpeakingStreak = (Date.now() - state.speakingStartTime) / 1000;

      // Check if we should trigger an alert
      if (state.currentSpeakingStreak >= state.settings.thresholdTime) {
        const now = Date.now();
        const timeSinceLastAlert = (now - state.lastAlertTime) / 1000;
        if (timeSinceLastAlert >= state.settings.cooldownTime || state.lastAlertTime === 0) {
          triggerAlert();
          state.lastAlertTime = now;
        }
      }
    }
  }

  // ---- Alert System ----
  function triggerAlert() {
    state.alertCount++;
    dom.statAlerts.textContent = state.alertCount;

    // Show red overlay
    dom.alertOverlay.classList.remove('hidden');
    dom.alertOverlay.classList.add('visible');

    // Vibrate if enabled
    if (state.settings.vibrate && navigator.vibrate) {
      navigator.vibrate([200, 100, 200, 100, 400]);
    }

    // Auto-hide after 3 seconds (user might still be talking, but alert serves its purpose)
    setTimeout(() => {
      hideAlert();
    }, 3000);
  }

  function hideAlert() {
    dom.alertOverlay.classList.add('hidden');
    dom.alertOverlay.classList.remove('visible');
  }

  // ---- Timer & Stats ----
  function updateTimer() {
    if (!state.meetingStartTime) return;
    const elapsed = Math.floor((Date.now() - state.meetingStartTime) / 1000);
    const min = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const sec = String(elapsed % 60).padStart(2, '0');
    dom.timerDisplay.textContent = `${min}:${sec}`;
  }

  function updateStats() {
    if (!state.isInMeeting) return;

    const elapsed = Date.now() - state.meetingStartTime;
    let currentSpeaking = state.totalSpeakingMs;
    if (state.speakingStartTime) {
      currentSpeaking += Date.now() - state.speakingStartTime;
    }

    const speakingPct = elapsed > 0 ? Math.round((currentSpeaking / elapsed) * 100) : 0;
    const silentPct = 100 - speakingPct;

    dom.statSpeaking.textContent = speakingPct + '%';
    dom.statSilent.textContent = silentPct + '%';
    dom.statAlerts.textContent = state.alertCount;

    // Update ring progress based on speaking percentage vs goal
    const ratio = Math.min(speakingPct / 100, 1);
    const circumference = 565.48;
    dom.ringProgress.style.strokeDashoffset = circumference * (1 - ratio);

    // Color the ring based on how close to goal
    const goal = state.settings.speakingGoal;
    dom.ringProgress.classList.remove('warning', 'danger');
    if (speakingPct > goal * 1.5) {
      dom.ringProgress.classList.add('danger');
    } else if (speakingPct > goal) {
      dom.ringProgress.classList.add('warning');
    }
  }

  // ---- Session Summary ----
  function showSummary(session) {
    const durationMin = Math.round(session.durationMs / 60000);
    const speakingPct = session.durationMs > 0
      ? Math.round((session.speakingMs / session.durationMs) * 100)
      : 0;
    const goal = session.speakingGoal;

    let gradeClass, gradeText;
    if (speakingPct <= goal) {
      gradeClass = 'good';
      gradeText = 'Great job! You stayed within your goal.';
    } else if (speakingPct <= goal * 1.5) {
      gradeClass = 'okay';
      gradeText = 'Not bad, but there\'s room to improve.';
    } else {
      gradeClass = 'high';
      gradeText = 'You spoke a lot. Try pausing more next time.';
    }

    const tips = getTips(speakingPct, session.alertCount, goal);

    dom.summaryContent.innerHTML = `
      <div class="summary-hero">
        <div class="summary-percent ${gradeClass}">${speakingPct}%</div>
        <div class="summary-subtitle">of the meeting spent speaking</div>
        <div class="summary-grade">${gradeText}</div>
      </div>
      <div class="summary-stats">
        <div class="summary-stat">
          <div class="stat-value">${durationMin || '<1'}m</div>
          <div class="stat-label">Duration</div>
        </div>
        <div class="summary-stat">
          <div class="stat-value">${formatMs(session.speakingMs)}</div>
          <div class="stat-label">Speaking Time</div>
        </div>
        <div class="summary-stat">
          <div class="stat-value">${session.alertCount}</div>
          <div class="stat-label">Alerts</div>
        </div>
        <div class="summary-stat">
          <div class="stat-value">${goal}%</div>
          <div class="stat-label">Your Goal</div>
        </div>
      </div>
      <div class="summary-tips">
        <h3>Tips for Next Time</h3>
        <ul>
          ${tips.map(t => `<li>${t}</li>`).join('')}
        </ul>
      </div>
    `;

    showScreen(dom.screenSummary);
  }

  function getTips(speakingPct, alertCount, goal) {
    const tips = [];
    if (speakingPct > goal) {
      tips.push('Try the "one thought, then pause" rule — share one idea, then wait for a response.');
      tips.push('Before speaking, ask yourself: "Does this add new information?"');
    }
    if (alertCount > 3) {
      tips.push('You received several alerts. Consider lowering the threshold to catch yourself sooner.');
      tips.push('Try writing your thoughts down instead of saying them all immediately.');
    }
    if (speakingPct <= goal) {
      tips.push('You met your goal! Consider challenging yourself with a lower target next time.');
    }
    if (alertCount === 0 && speakingPct <= goal) {
      tips.push('Perfect session with no alerts. Keep up the great work!');
    }
    tips.push('Practice the 3-second rule: after someone finishes speaking, count to 3 before responding.');
    return tips;
  }

  // ---- History ----
  function renderHistory() {
    if (state.sessions.length === 0) {
      dom.historyList.innerHTML = '<p class="empty-state">No sessions yet. Start your first meeting!</p>';
      return;
    }

    dom.historyList.innerHTML = state.sessions.slice(0, 10).map(session => {
      const date = new Date(session.date);
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      const durationMin = Math.round(session.durationMs / 60000);
      const speakingPct = session.durationMs > 0
        ? Math.round((session.speakingMs / session.durationMs) * 100)
        : 0;
      const goal = session.speakingGoal || 25;
      let colorClass = 'good';
      if (speakingPct > goal * 1.5) colorClass = 'high';
      else if (speakingPct > goal) colorClass = 'okay';

      return `
        <div class="history-item" data-id="${session.id}">
          <div class="history-item-left">
            <div class="history-date">${dateStr} at ${timeStr}</div>
            <div class="history-duration">${durationMin || '<1'}min &middot; ${session.alertCount} alert${session.alertCount !== 1 ? 's' : ''}</div>
          </div>
          <div class="history-speaking ${colorClass}">${speakingPct}%</div>
        </div>
      `;
    }).join('');

    // Click to view session summary
    dom.historyList.querySelectorAll('.history-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = parseInt(item.dataset.id);
        const session = state.sessions.find(s => s.id === id);
        if (session) showSummary(session);
      });
    });
  }

  // ---- Helpers ----
  function formatMs(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }

  // ---- Wake Lock (keep screen on) ----
  let wakeLock = null;

  async function requestWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
      } catch (err) {
        // Wake lock request failed — not critical
      }
    }
  }

  function releaseWakeLock() {
    if (wakeLock) {
      wakeLock.release();
      wakeLock = null;
    }
  }

  // Re-acquire wake lock when page becomes visible again
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.isInMeeting) {
      requestWakeLock();
    }
  });

  // ---- Service Worker Registration ----
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // ---- Init ----
  loadSettings();
  renderHistory();
})();
