(function () {
  "use strict";

  var DEFAULT_CFG = { focus: 25, short: 5, long: 15, cycle: 4 };
  var MODE_LABEL = { focus: "专注中", short: "短休中", long: "长休中" };

  var prefs = loadPrefs();
  var cfg = sanitizeCfg(prefs.cfg);

  function sanitizeCfg(c) {
    c = c || {};
    function n(k, min, max, def) {
      var v = parseInt(c[k], 10);
      if (isNaN(v)) return def;
      return Math.min(max, Math.max(min, v));
    }
    return {
      focus: n("focus", 1, 180, DEFAULT_CFG.focus),
      short: n("short", 1, 120, DEFAULT_CFG.short),
      long: n("long", 1, 180, DEFAULT_CFG.long),
      cycle: n("cycle", 2, 12, DEFAULT_CFG.cycle)
    };
  }

  function durSec(mode) { return cfg[mode] * 60; }

  var state = {
    mode: "focus",
    left: durSec("focus"),
    running: false,
    done: 0,          // 累计完成的专注轮数
    pos: 0            // 本组第几个（0..cfg.cycle-1）
  };

  var els = {
    modes: document.getElementById("modes"),
    time: document.getElementById("time"),
    note: document.getElementById("state-note"),
    mascot: document.getElementById("mascot"),
    primary: document.getElementById("btn-primary"),
    reset: document.getElementById("btn-reset"),
    ring: document.getElementById("ring-progress"),
    count: document.getElementById("tomato-count"),
    dots: document.getElementById("dots"),
    cycle: document.getElementById("cycle-note"),
    sound: document.getElementById("opt-sound"),
    notify: document.getElementById("opt-notify"),
    btnSettings: document.getElementById("btn-settings"),
    settingsPanel: document.getElementById("settings-panel"),
    setFocus: document.getElementById("set-focus"),
    setShort: document.getElementById("set-short"),
    setLong: document.getElementById("set-long"),
    setCycle: document.getElementById("set-cycle"),
    btnRestore: document.getElementById("btn-restore")
  };

  var CIRC = 2 * Math.PI * 124;
  els.ring.style.strokeDasharray = CIRC;

  var ticker = null;
  var endAt = 0;
  var flashTimer = null;

  els.sound.checked = prefs.sound;
  els.notify.checked = prefs.notify;

  function loadPrefs() {
    try {
      var raw = JSON.parse(localStorage.getItem("mo-mo-tomato") || "{}");
      return {
        sound: raw.sound !== false,
        notify: !!raw.notify,
        cfg: sanitizeCfg(raw.cfg)
      };
    } catch (e) { return { sound: true, notify: false, cfg: sanitizeCfg(null) }; }
  }

  function savePrefs() {
    try {
      localStorage.setItem("mo-mo-tomato", JSON.stringify({
        sound: els.sound.checked,
        notify: els.notify.checked,
        cfg: cfg
      }));
    } catch (e) { /* ignore */ }
  }

  function fmt(sec) {
    var m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }

  function setMode(mode, opts) {
    opts = opts || {};
    state.mode = mode;
    state.left = durSec(mode);
    state.running = !!opts.auto;
    clearTicker();
    if (state.running) startTicker();
    render();
  }

  function clearTicker() {
    if (ticker) { clearInterval(ticker); ticker = null; }
    endAt = 0;
    if (flashTimer) { clearTimeout(flashTimer); flashTimer = null; }
  }

  function startTicker() {
    if (ticker) return;
    endAt = Date.now() + state.left * 1000;
    ticker = setInterval(tick, 250);
  }

  function tick() {
    var rem = Math.ceil((endAt - Date.now()) / 1000);
    if (rem <= 0) {
      state.left = 0;
      complete();
    } else if (rem !== state.left) {
      state.left = rem;
      render();
    }
  }

  function complete() {
    clearTicker();
    state.running = false;

    var finishedFocus = state.mode === "focus";

    chime();
    renderFlash();

    setTimeout(function () {
      if (finishedFocus) {
        state.done += 1;
        state.pos = state.done % cfg.cycle;          // 0 时表示刚走完一整组
        var nextMode = state.pos === 0 ? "long" : "short";
        setMode(nextMode, { auto: true });
        notify("休息一下啦", nextMode === "long" ? "长休 " + cfg.long + " 分钟，慢慢来🌿" : "短休 " + cfg.short + " 分钟，喝口水🍵");
      } else {
        setMode("focus", { auto: true });
        notify("开始专注", "新一轮 " + cfg.focus + " 分钟，冲鸭🍅");
      }
    }, 900);
  }

  function renderFlash() {
    els.mascot.className = "mascot state-done";
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(function () { els.mascot.className = "mascot state-" + state.mode; }, 900);
  }

  function chime() {
    if (!els.sound.checked) return;
    try {
      var ctx = audioCtx();
      var seq = state.mode === "focus" ? [660, 880] : [523, 659];
      seq.forEach(function (freq, i) {
        var o = ctx.createOscillator();
        var g = ctx.createGain();
        o.type = "sine";
        o.frequency.value = freq;
        var t0 = ctx.currentTime + i * 0.18;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
        o.connect(g); g.connect(ctx.destination);
        o.start(t0); o.stop(t0 + 0.4);
      });
    } catch (e) { /* audio blocked */ }
  }

  var _ctx = null;
  function audioCtx() {
    if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (_ctx.state === "suspended") _ctx.resume();
    return _ctx;
  }

  function notify(title, body) {
    if (!els.notify.checked) return;
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
      try { new Notification(title, { body: body, icon: undefined }); } catch (e) {}
    }
  }

  function render() {
    els.time.textContent = fmt(state.left);
    document.title = fmt(state.left) + " · 摸摸番茄";

    var frac = state.left / durSec(state.mode);
    els.ring.style.strokeDashoffset = CIRC * (1 - frac);

    // mode tabs
    var tabs = els.modes.querySelectorAll(".mode");
    tabs.forEach(function (b) {
      b.classList.toggle("active", b.dataset.mode === state.mode);
    });

    // time note
    if (state.running) {
      els.note.textContent = MODE_LABEL[state.mode] + " · 加油";
    } else {
      els.note.textContent = state.left === durSec(state.mode)
        ? (state.mode === "focus" ? "准备好就点开始吧" : "歇够了就回来呀")
        : "已暂停，随时继续";
    }

    // mascot
    var face = state.running ? state.mode : "idle";
    if (state.mode !== "focus") face = "break";
    els.mascot.className = "mascot state-" + face;

    // primary button
    els.primary.textContent = state.running ? "⏸ 暂停一下" : "▶ 开始专注";
    els.primary.setAttribute("aria-pressed", String(state.running));

    // stats
    els.count.textContent = "🍅 攒了 " + state.done + " 个";
    var filled = state.mode === "long" ? cfg.cycle : state.pos;
    els.dots.innerHTML = "";
    for (var i = 0; i < cfg.cycle; i++) {
      var d = document.createElement("span");
      d.className = "dot" + (i < filled ? " on" : "");
      els.dots.appendChild(d);
    }
    els.cycle.textContent = state.mode === "long"
      ? "完成一组！该长休啦🌿"
      : "本组第 " + (state.pos + 1) + " 个专注" + (state.pos === cfg.cycle - 1 ? "（这个专注完就长休🌿）" : "");
  }

  function toggleRun() {
    if (state.running) {
      state.running = false;
      if (endAt) state.left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      clearTicker();
    } else {
      state.running = true;
      try { audioCtx(); } catch (e) {} // 预激活，让提示音能用
      if (state.left <= 0) state.left = durSec(state.mode);
      startTicker();
    }
    render();
  }

  function resetTimer() {
    state.running = false;
    state.left = durSec(state.mode);
    clearTicker();
    render();
  }

  // events
  els.primary.addEventListener("click", toggleRun);
  els.reset.addEventListener("click", resetTimer);

  els.modes.addEventListener("click", function (e) {
    var btn = e.target.closest(".mode");
    if (!btn) return;
    setMode(btn.dataset.mode);
  });

  document.addEventListener("keydown", function (e) {
    if (e.code === "Space" && !e.repeat) {
      var tag = document.activeElement && document.activeElement.tagName;
      if (tag === "INPUT" || tag === "BUTTON") return; // 交给原生控件
      e.preventDefault();
      toggleRun();
    }
  });

  els.sound.addEventListener("change", savePrefs);
  els.notify.addEventListener("change", function () {
    if (els.notify.checked) askNotifyPermission();
    savePrefs();
  });

  // settings panel
  els.btnSettings.addEventListener("click", function () {
    var show = els.settingsPanel.hidden;
    els.settingsPanel.hidden = !show;
    els.btnSettings.setAttribute("aria-expanded", String(show));
  });

  function fillSettings() {
    els.setFocus.value = cfg.focus;
    els.setShort.value = cfg.short;
    els.setLong.value = cfg.long;
    els.setCycle.value = cfg.cycle;
  }

  function applySettings() {
    cfg = sanitizeCfg({
      focus: els.setFocus.value,
      short: els.setShort.value,
      long: els.setLong.value,
      cycle: els.setCycle.value
    });
    fillSettings();
    savePrefs();
    state.running = false;
    clearTicker();
    state.left = durSec(state.mode);
    render();
  }

  ["setFocus", "setShort", "setLong", "setCycle"].forEach(function (k) {
    els[k].addEventListener("change", applySettings);
  });

  els.btnRestore.addEventListener("click", function () {
    cfg = Object.assign({}, DEFAULT_CFG);
    fillSettings();
    applySettings();
  });

  fillSettings();

  function askNotifyPermission() {
    if (!("Notification" in window)) { els.notify.checked = false; return; }
    if (Notification.permission === "granted") return;
    if (Notification.permission === "denied") {
      els.notify.checked = false;
      return;
    }
    Notification.requestPermission().then(function (perm) {
      if (perm !== "granted") els.notify.checked = false;
      savePrefs();
    });
  }

  // welcome 时若浏览器已授权通知，打开开关不弹窗
  if ("Notification" in window && Notification.permission === "granted") {
    els.notify.checked = prefs.notify;
  }

  render();
})();
