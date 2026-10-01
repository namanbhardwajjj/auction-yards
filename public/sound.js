/* ============================================================
   AUCTION YARDS — SOUND ENGINE
   Generated audio (no files, no copyright). Fully defensive:
   every call is guarded so audio can never break the app.
   ============================================================ */

(function () {
  "use strict";

  var ctx = null;
  var sfxOn = true;
  var musicOn = false;
  var musicTimer = null;
  var pad = null;

  /* ---------- core ---------- */

  function getCtx() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      if (!ctx) ctx = new AC();
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    } catch (e) {
      return null;
    }
  }

  function tone(freq, dur, type, vol, delay) {
    try {
      var c = getCtx();
      if (!c) return;

      var t = c.currentTime + (delay || 0);
      var o = c.createOscillator();
      var g = c.createGain();

      o.type = type || "sine";
      o.frequency.value = freq;

      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.1, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

      o.connect(g);
      g.connect(c.destination);
      o.start(t);
      o.stop(t + dur + 0.05);
    } catch (e) {
      /* audio must never break the app */
    }
  }

  /* ---------- music ---------- */

  var SCALE = [220, 261.63, 293.66, 329.63, 392, 440, 523.25];
  var PATTERN = [0, 2, 4, 5, 4, 2, 6, 4];

  function startMusic() {
    try {
      var c = getCtx();
      if (!c) return;

      if (!pad) {
        var g = c.createGain();
        g.gain.value = 0.028;

        var o1 = c.createOscillator();
        o1.type = "sine";
        o1.frequency.value = 110;

        var o2 = c.createOscillator();
        o2.type = "sine";
        o2.frequency.value = 164.8;

        var lfo = c.createOscillator();
        lfo.frequency.value = 0.08;

        var lfoGain = c.createGain();
        lfoGain.gain.value = 0.012;

        lfo.connect(lfoGain);
        lfoGain.connect(g.gain);
        o1.connect(g);
        o2.connect(g);
        g.connect(c.destination);

        o1.start();
        o2.start();
        lfo.start();

        pad = { o1: o1, o2: o2, lfo: lfo };
      }

      if (!musicTimer) {
        var step = 0;
        musicTimer = setInterval(function () {
          if (!musicOn) return;
          var note = SCALE[PATTERN[step % 8]];
          tone(note, 0.5, "sine", 0.035);
          if (step % 4 === 0) tone(note / 2, 0.8, "sine", 0.02);
          step++;
        }, 620);
      }
    } catch (e) {}
  }

  function stopMusic() {
    try {
      if (musicTimer) {
        clearInterval(musicTimer);
        musicTimer = null;
      }
      if (pad) {
        pad.o1.stop();
        pad.o2.stop();
        pad.lfo.stop();
        pad = null;
      }
    } catch (e) {}
  }

  /* ---------- public API ---------- */

  var api = {
    unlock: function () { getCtx(); },

    click: function () {
      if (sfxOn) {
        tone(620, 0.07, "triangle", 0.08);
        tone(930, 0.05, "sine", 0.05, 0.02);
      }
    },

    bid: function () {
      if (sfxOn) {
        tone(660, 0.08, "triangle", 0.12);
        tone(880, 0.1, "triangle", 0.12, 0.07);
      }
    },

    sold: function () {
      if (!sfxOn) return;
      tone(523, 0.12, "triangle", 0.14);
      tone(659, 0.12, "triangle", 0.14, 0.1);
      tone(784, 0.22, "triangle", 0.16, 0.2);
      tone(1046, 0.3, "sine", 0.12, 0.3);
    },

    unsold: function () {
      if (sfxOn) {
        tone(220, 0.18, "sawtooth", 0.07);
        tone(160, 0.25, "sawtooth", 0.06, 0.12);
      }
    },

    error: function () {
      if (sfxOn) tone(140, 0.15, "square", 0.06);
    },

    tick: function () {
      if (sfxOn) tone(1100, 0.04, "sine", 0.06);
    },

    next: function () {
      if (sfxOn) {
        tone(440, 0.08, "sine", 0.1);
        tone(587, 0.1, "sine", 0.1, 0.08);
      }
    },

    toggleSfx: function () {
      sfxOn = !sfxOn;
      return sfxOn;
    },

    toggleMusic: function () {
      musicOn = !musicOn;
      if (musicOn) startMusic();
      else stopMusic();
      return musicOn;
    },

    sfxOn: function () { return sfxOn; },
    musicOn: function () { return musicOn; },

    hammer: function () {
      if (!sfxOn) return;
      try {
        var c = getCtx();
        if (!c) return;
        var t = c.currentTime;
        var o = c.createOscillator();
        var g = c.createGain();
        o.type = "triangle";
        o.frequency.setValueAtTime(160, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
        g.gain.setValueAtTime(0.3, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        o.connect(g);
        g.connect(c.destination);
        o.start(t);
        o.stop(t + 0.26);

        tone(720, 0.03, "sine", 0.15, 0);
      } catch (e) {}
    },

    fanfare: function () {
      if (!sfxOn) return;
      tone(523.25, 0.14, "triangle", 0.18, 0);
      tone(659.25, 0.14, "triangle", 0.18, 0.12);
      tone(783.99, 0.18, "triangle", 0.2, 0.24);
      tone(1046.50, 0.45, "triangle", 0.25, 0.38);
    }
  };

  /* global click sound for every button / link / select */
  try {
    document.addEventListener("click", function (e) {
      if (e.target && e.target.closest && e.target.closest("button, a, select")) {
        api.click();
      }
    }, true);
  } catch (e) {}

  window.Sound = api;
})();