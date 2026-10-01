/**
 * Auction Yards Server v2.0
 * World-Class Real-Time Multi-Sport & IPL Auction Simulator
 * Features:
 * - Real-Time WebSockets (Socket.io) with Zero-Latency Push
 * - 3 Auction Modes: Start From Zero (Mega), 2025 Real Retentions, Legends Auction
 * - AI Squad Quality & Balance Evaluator (Non-star-obsessed realistic cricket analytics)
 * - Full IPL Tournament Season Simulation Engine (League, NRR, Playoffs, Caps, Monte Carlo)
 * - Intelligent AI Auction Bots for CPU-controlled franchises (2 to 10 teams)
 * - Multi-Sport Extensibility (Cricket IPL, Football EPL, Basketball NBA)
 * - SQLite + JSON Fallback Persistent Storage
 */

const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { Server } = require("socket.io");

const {
  TEAMS,
  LEGENDS,
  RETENTIONS_2025,
  PLAYERS,
  PLAYERS_BY_ID,
  setupAuctionForMode,
  STAR_FACTS
} = require("./data_manager.js");

const { evaluateSquadQuality, selectOptimalPlayingXI } = require("./ai_evaluator.js");
const { runFullIPLSeason, runMonteCarloForecast, simulateMatch } = require("./simulation.js");
const { shouldBotBid, calculateBotValuation } = require("./ai_bots.js");
const { SUPPORTED_SPORTS } = require("./sports_engine.js");
const { db, isSqliteAvailable } = require("./db.js");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public"), {
  maxAge: "1d",
  etag: true
}));

/* ============================================================
   FILE & DATABASE PERSISTENCE HELPERS
   ============================================================ */

function loadJSON(file, fallback) {
  try {
    const raw = fs.readFileSync(path.join(__dirname, "data", file), "utf8");
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
}

function saveJSON(file, data) {
  try {
    fs.writeFileSync(
      path.join(__dirname, "data", file),
      JSON.stringify(data, null, 2)
    );
  } catch (error) {
    console.error("Could not save " + file, error.message);
  }
}

const CONFIG = loadJSON("config.json", {});

function loadUsers() {
  const users = loadJSON("users.json", []);
  return Array.isArray(users) ? users : [];
}

function saveUsers(users) {
  saveJSON("users.json", users);
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

function verifyPassword(password, user) {
  try {
    const attempt = Buffer.from(hashPassword(password, user.salt), "hex");
    const stored = Buffer.from(user.passHash, "hex");
    if (attempt.length !== stored.length) return false;
    return crypto.timingSafeEqual(attempt, stored);
  } catch (e) {
    return false;
  }
}

function publicUser(u) {
  return { id: u.id, name: u.name };
}

function decodeGoogleJwt(token) {
  try {
    const parts = String(token).split(".");
    if (parts.length !== 3) return null;
    const payload = Buffer.from(
      parts[1].replace(/-/g, "+").replace(/_/g, "/"),
      "base64"
    ).toString("utf8");
    return JSON.parse(payload);
  } catch (e) {
    return null;
  }
}

/* ============================================================
   AUCTION CONSTANTS & FORMATTERS
   ============================================================ */

const CRORE = 10000000;
const LAKH = 100000;
const RTM_WINDOW_SECONDS = 15;
const NEXT_DELAY_MS = 4000;
const SQUAD_MAX = 25;
const OVERSEAS_MAX = 8;

function money(n) {
  const v = Number(n || 0);
  if (v >= CRORE) {
    const cr = (v / CRORE).toFixed(2).replace(/\.?0+$/, "");
    return "₹" + cr + " Cr";
  }
  if (v >= LAKH) {
    const l = (v / LAKH).toFixed(1).replace(/\.0$/, "");
    return "₹" + l + " L";
  }
  return "₹" + v;
}

function bidIncrement(current) {
  if (current < CRORE) return 10 * LAKH;
  if (current < 5 * CRORE) return 20 * LAKH;
  return 50 * LAKH;
}

function modeDisplayName(mode) {
  if (mode === "LEGENDS") return "Legends All-Time Auction";
  if (mode === "RETENTION_2025" || mode === "RTM" || mode === "MINI") return "2025 Official Retentions Auction";
  return "Start From Zero (Mega Auction)";
}

/* ============================================================
   ROOM STATE & TICK LOOP
   ============================================================ */

let rooms = loadJSON("rooms.json", []);
if (!Array.isArray(rooms)) rooms = [];

let roomsDirty = false;
let isSavingRooms = false;

function markRoomsDirty() {
  roomsDirty = true;
}

function persistRooms() {
  markRoomsDirty();
}

function flushRoomsAsync() {
  if (!roomsDirty || isSavingRooms) return;
  roomsDirty = false;
  isSavingRooms = true;
  const jsonStr = JSON.stringify(rooms);
  fs.writeFile(path.join(__dirname, "data", "rooms.json"), jsonStr, "utf8", (err) => {
    isSavingRooms = false;
    if (err) console.error("Could not save rooms.json:", err.message);
  });
}

setInterval(flushRoomsAsync, 4000);

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateRoomCode() {
  let code = "";
  let unique = false;
  while (!unique) {
    code = "";
    for (let i = 0; i < 6; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    unique = !rooms.some((r) => r.code === code);
  }
  return code;
}

function findRoomByCode(code) {
  const target = String(code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return rooms.find((r) => r.code === target) || null;
}

function findRoom(roomId) {
  const room = rooms.find((r) => r.id === roomId);
  if (!room) {
    const err = new Error("Room not found.");
    err.status = 404;
    throw err;
  }
  return room;
}

function authUser(req) {
  const id = String(req.headers["x-user-id"] || "");
  const name = String(req.headers["x-username"] || "");
  if (!id || !name) {
    const err = new Error("Not logged in. Please login again.");
    err.status = 401;
    throw err;
  }
  return { id, name };
}

function wrap(handler) {
  return (req, res) => {
    try {
      handler(req, res);
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message });
    }
  };
}

function teamLabel(room, teamId) {
  const t = TEAMS.find((x) => x.id === teamId);
  if (t) return t.name;
  const c = (room.customTeams || []).find((x) => x.id === teamId);
  if (c) return c.name;
  return teamId;
}

function addEvent(room, text) {
  if (!room.auction) return;
  room.auction.events.unshift({ at: Date.now(), text });
  if (room.auction.events.length > 50) {
    room.auction.events.pop();
  }
}

function broadcastRoom(roomId) {
  try {
    const room = rooms.find((r) => r.id === roomId);
    if (room) {
      io.to(roomId).emit("room_state", decorate(room));
    }
  } catch (e) {
    console.error("Broadcast error:", e.message);
  }
}

/* ============================================================
   AUCTION SETTLEMENT & ENGINE
   ============================================================ */

function settleSale(room, teamId, playerId, price) {
  const a = room.auction;
  a.budgets[teamId] = Math.max(0, (a.budgets[teamId] || 0) - price);
  if (!a.squads[teamId]) a.squads[teamId] = [];
  a.squads[teamId].push({ playerId, price });
}

function finalizeRtm(room, used, auto) {
  const a = room.auction;
  const pr = a.pendingRtm;
  if (!pr) return;

  const player = PLAYERS_BY_ID[pr.playerId];
  const playerName = player ? player.name : "Player";

  if (used) {
    const squad = a.squads[pr.franchiseTeamId] || [];
    const overseasCount = squad.filter((e) => {
      const p = PLAYERS_BY_ID[e.playerId];
      return p && p.overseas;
    }).length;

    const canAfford = (a.budgets[pr.franchiseTeamId] || 0) >= pr.price;
    const squadOk = squad.length < SQUAD_MAX;
    const overseasOk = !player || !player.overseas || overseasCount < OVERSEAS_MAX;
    const cardsOk = (a.rtmCards[pr.franchiseTeamId] || 0) > 0;

    if (canAfford && squadOk && overseasOk && cardsOk) {
      a.budgets[pr.franchiseTeamId] -= pr.price;
      squad.push({ playerId: pr.playerId, price: pr.price });
      a.rtmCards[pr.franchiseTeamId] -= 1;

      addEvent(
        room,
        teamLabel(room, pr.franchiseTeamId) +
          " activates RTM! 🃏 Brought back " + playerName +
          " for " + money(pr.price)
      );
    } else {
      settleSale(room, pr.winnerTeamId, pr.playerId, pr.price);
      addEvent(
        room,
        playerName + " SOLD to " + teamLabel(room, pr.winnerTeamId) +
          " for " + money(pr.price)
      );
    }
  } else {
    settleSale(room, pr.winnerTeamId, pr.playerId, pr.price);
    addEvent(
      room,
      playerName + " SOLD to " + teamLabel(room, pr.winnerTeamId) +
        " for " + money(pr.price)
    );
  }

  a.pendingRtm = null;
  a.phase = "BETWEEN_LOTS";
  a.autoNextAt = Date.now() + NEXT_DELAY_MS;
  a.doneCount += 1;
  broadcastRoom(room.id);
}

function presentLot(room) {
  const a = room.auction;
  a.currentIndex += 1;

  if (a.currentIndex >= a.playerQueue.length) {
    room.status = "COMPLETED";
    a.phase = "DONE";
    addEvent(room, "🎉 Auction Completed! All player lots concluded.");
    broadcastRoom(room.id);
    return;
  }

  const player = PLAYERS_BY_ID[a.playerQueue[a.currentIndex]];
  const timerSeconds = (room.settings || {}).timerSeconds || 10;

  a.phase = "BIDDING";
  a.currentBid = 0;
  a.leaderTeamId = null;
  a.expiresAt = Date.now() + timerSeconds * 1000;
  a.lastBotCheck = Date.now();

  addEvent(
    room,
    "⚡ " + (player ? player.name : "Player") +
      " is up for auction! Base price " +
      money(player ? player.basePrice : 0)
  );

  broadcastRoom(room.id);
}

/**
 * Main Room Tick (Runs every 1000ms)
 * Handles countdown expiration, auto-advancing, and AI bot bidding!
 */
function tick(room) {
  if (room.status !== "LIVE" || !room.auction) return;
  const a = room.auction;

  // Handle RTM Expiration
  if (a.phase === "RTM_PENDING" && a.pendingRtm && Date.now() >= a.pendingRtm.expiresAt) {
    finalizeRtm(room, false, true);
    return;
  }

  // Handle Between Lots Auto Advance
  if (a.phase === "BETWEEN_LOTS" && a.autoNextAt && Date.now() >= a.autoNextAt) {
    a.autoNextAt = 0;
    presentLot(room);
    return;
  }

  if (a.phase !== "BIDDING") return;

  // AI Bots bidding check (If bots enabled)
  if (room.botsEnabled && Date.now() < a.expiresAt) {
    const timeSinceCheck = Date.now() - (a.lastBotCheck || 0);
    // Give natural cadence for bot bids (every 1.5 - 3s)
    if (timeSinceCheck > 1800) {
      a.lastBotCheck = Date.now();
      const botClaims = room.claims.filter((c) => c.isBot);

      // Shuffle bot order for competitive fairness
      const shuffledBots = [...botClaims].sort(() => Math.random() - 0.5);

      for (const bot of shuffledBots) {
        if (bot.teamId === a.leaderTeamId) continue;

        const player = PLAYERS_BY_ID[a.playerQueue[a.currentIndex]];
        if (!player) break;

        const minBid = a.currentBid === 0
          ? player.basePrice
          : a.currentBid + bidIncrement(a.currentBid);

        const currentSquad = (a.squads[bot.teamId] || []).map((e) => PLAYERS_BY_ID[e.playerId] || {});
        const budget = a.budgets[bot.teamId] || 0;

        const wantsToBid = shouldBotBid(
          bot.teamId,
          { auction: { ...a, currentPlayer: player }, teams: TEAMS },
          a.currentBid,
          minBid
        );

        if (wantsToBid) {
          a.currentBid = minBid;
          a.leaderTeamId = bot.teamId;
          const timerSeconds = (room.settings || {}).timerSeconds || 10;
          a.expiresAt = Date.now() + timerSeconds * 1000;

          addEvent(
            room,
            "🤖 " + teamLabel(room, bot.teamId) + " bids " + money(minBid) + " for " + player.name
          );

          broadcastRoom(room.id);
          break; // One bot bids per tick cadence
        }
      }
    }
  }

  // Timer expiration check
  if (Date.now() < a.expiresAt) return;

  const playerId = a.playerQueue[a.currentIndex];
  const player = PLAYERS_BY_ID[playerId];
  const playerName = player ? player.name : "Player";

  if (a.leaderTeamId) {
    // Check RTM availability in RETENTION / RTM mode
    const isRtmMode = room.mode === "RETENTION_2025" || room.mode === "RTM";
    if (isRtmMode && player && player.franchise) {
      const originalClaim = room.claims.find((c) => c.teamId === player.franchise);

      if (
        originalClaim &&
        originalClaim.teamId !== a.leaderTeamId &&
        (a.rtmCards[originalClaim.teamId] || 0) > 0
      ) {
        // If the original franchise is a bot, decide RTM automatically!
        if (originalClaim.isBot) {
          const botSquad = (a.squads[originalClaim.teamId] || []).map((e) => PLAYERS_BY_ID[e.playerId] || {});
          const botBudget = a.budgets[originalClaim.teamId] || 0;
          const botVal = calculateBotValuation(originalClaim.teamId, player, botSquad, botBudget);

          if (botVal >= a.currentBid && botBudget >= a.currentBid) {
            a.budgets[originalClaim.teamId] -= a.currentBid;
            if (!a.squads[originalClaim.teamId]) a.squads[originalClaim.teamId] = [];
            a.squads[originalClaim.teamId].push({ playerId, price: a.currentBid });
            a.rtmCards[originalClaim.teamId] -= 1;

            addEvent(
              room,
              "🤖 " + teamLabel(room, originalClaim.teamId) +
                " exercises RTM! 🃏 Retains " + playerName + " for " + money(a.currentBid)
            );
            a.phase = "BETWEEN_LOTS";
            a.autoNextAt = Date.now() + NEXT_DELAY_MS;
            a.doneCount += 1;
            broadcastRoom(room.id);
            return;
          }
        } else {
          // Open RTM window for human player
          a.phase = "RTM_PENDING";
          a.pendingRtm = {
            playerId: playerId,
            price: a.currentBid,
            winnerTeamId: a.leaderTeamId,
            franchiseTeamId: originalClaim.teamId,
            expiresAt: Date.now() + RTM_WINDOW_SECONDS * 1000
          };

          addEvent(
            room,
            playerName + " SOLD to " + teamLabel(room, a.leaderTeamId) +
              " for " + money(a.currentBid) +
              " — RTM card window active for " + teamLabel(room, originalClaim.teamId) + "!"
          );
          broadcastRoom(room.id);
          return;
        }
      }
    }

    settleSale(room, a.leaderTeamId, playerId, a.currentBid);
    addEvent(
      room,
      "🔨 SOLD! " + playerName + " joins " + teamLabel(room, a.leaderTeamId) +
        " for " + money(a.currentBid)
    );
  } else {
    addEvent(room, "❌ " + playerName + " goes UNSOLD");
  }

  a.phase = "BETWEEN_LOTS";
  a.autoNextAt = Date.now() + NEXT_DELAY_MS;
  a.doneCount += 1;
  broadcastRoom(room.id);
}

setInterval(function () {
  rooms.forEach(tick);
}, 1000);

/* ============================================================
   DECORATE HELPER FOR CLIENTS
   ============================================================ */

function decorate(room) {
  const a = room.auction;
  if (!a) return room;

  a.currentPlayer = a.currentIndex >= 0 ? PLAYERS_BY_ID[a.playerQueue[a.currentIndex]] || null : null;

  if (a.pendingRtm) {
    a.pendingRtm.player = PLAYERS_BY_ID[a.pendingRtm.playerId] || null;
  }

  a.squadDetails = {};
  Object.keys(a.squads).forEach((teamId) => {
    a.squadDetails[teamId] = (a.squads[teamId] || []).map((entry) => {
      const p = PLAYERS_BY_ID[entry.playerId] || {};
      return {
        playerId: entry.playerId,
        name: p.name || entry.playerId,
        role: p.role || "",
        subRole: p.subRole || "",
        overseas: !!p.overseas,
        rating: p.rating || 75,
        batting: p.batting || 50,
        bowling: p.bowling || 50,
        fact: p.fact || "",
        stats: p.stats || null,
        price: entry.price
      };
    });
  });

  return room;
}

/* ============================================================
   SOCKET.IO EVENTS
   ============================================================ */

io.on("connection", (socket) => {
  socket.on("join_room", ({ roomId, user }) => {
    socket.join(roomId);
    try {
      const room = findRoom(roomId);
      socket.emit("room_state", decorate(room));
    } catch (e) {
      socket.emit("error_msg", e.message);
    }
  });

  socket.on("live_bid", ({ roomId, userId, amount }) => {
    try {
      const room = findRoom(roomId);
      tick(room);

      if (room.status !== "LIVE" || !room.auction) throw new Error("Auction is not live.");
      const a = room.auction;
      if (a.phase !== "BIDDING") throw new Error("Bidding closed for this player.");
      if (Date.now() >= a.expiresAt) { tick(room); throw new Error("Timer expired."); }

      const claim = room.claims.find((c) => c.userId === userId);
      if (!claim) throw new Error("You do not own a team in this room.");
      if (a.leaderTeamId === claim.teamId) throw new Error("You are already the highest bidder.");

      const bidAmount = Math.floor(Number(amount));
      const player = PLAYERS_BY_ID[a.playerQueue[a.currentIndex]];
      if (!player) throw new Error("No active player.");

      const minBid = a.currentBid === 0 ? player.basePrice : a.currentBid + bidIncrement(a.currentBid);
      if (bidAmount < minBid) throw new Error("Minimum bid is " + money(minBid) + ".");

      const budget = a.budgets[claim.teamId] || 0;
      if (bidAmount > budget) throw new Error("Not enough budget. Remaining: " + money(budget) + ".");

      const squad = a.squads[claim.teamId] || [];
      if (squad.length >= SQUAD_MAX) throw new Error("Squad is full.");

      if (player.overseas) {
        const overseasCount = squad.filter((entry) => {
          const p = PLAYERS_BY_ID[entry.playerId];
          return p && p.overseas;
        }).length;
        if (overseasCount >= OVERSEAS_MAX) throw new Error("Overseas limit reached (8 max).");
      }

      a.currentBid = bidAmount;
      a.leaderTeamId = claim.teamId;
      a.expiresAt = Date.now() + (room.settings.timerSeconds || 10) * 1000;

      addEvent(room, teamLabel(room, claim.teamId) + " bids " + money(bidAmount) + " for " + player.name);
      broadcastRoom(room.id);
    } catch (e) {
      socket.emit("bid_error", e.message);
    }
  });

  socket.on("chat_message", ({ roomId, user, text }) => {
    io.to(roomId).emit("chat_broadcast", {
      user: user.name || "User",
      text: String(text).slice(0, 140),
      time: Date.now()
    });
  });
});

/* ============================================================
   REST AUTH ROUTES
   ============================================================ */

app.get("/api/config", (req, res) => {
  res.json({ googleClientId: CONFIG.googleClientId || "" });
});

app.post(
  "/api/register",
  wrap((req, res) => {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");

    if (username.length < 2 || username.length > 20) {
      throw new Error("Username must be between 2 and 20 characters.");
    }
    if (password.length < 6) {
      throw new Error("Password must be at least 6 characters.");
    }

    const users = loadUsers();
    const exists = users.some((u) => u.name.toLowerCase() === username.toLowerCase());
    if (exists) throw new Error("Username is already taken.");

    const salt = crypto.randomBytes(16).toString("hex");
    const user = {
      id: "u_" + crypto.randomBytes(8).toString("hex"),
      name: username,
      salt: salt,
      passHash: hashPassword(password, salt),
      provider: "password",
      createdAt: Date.now()
    };

    users.push(user);
    saveUsers(users);
    res.json({ ok: true, user: publicUser(user) });
  })
);

app.post(
  "/api/login",
  wrap((req, res) => {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");

    const users = loadUsers();
    const user = users.find((u) => u.name.toLowerCase() === username.toLowerCase());

    if (!user || !user.passHash || !verifyPassword(password, user)) {
      throw new Error("Invalid username or password.");
    }

    res.json({ ok: true, user: publicUser(user) });
  })
);

app.post(
  "/api/login/google",
  wrap((req, res) => {
    const credential = String(req.body.credential || "");
    if (!CONFIG.googleClientId) {
      throw new Error("Google login is not configured on this server.");
    }

    const payload = decodeGoogleJwt(credential);
    if (!payload || payload.aud !== CONFIG.googleClientId) {
      throw new Error("Google login failed. Bad token.");
    }

    const googleId = String(payload.sub || "");
    const name = String(payload.name || payload.email || "").trim();
    const users = loadUsers();
    let user = users.find((u) => u.googleId === googleId);

    if (!user) {
      let finalName = name.slice(0, 20);
      let suffix = 1;
      while (users.some((u) => u.name.toLowerCase() === finalName.toLowerCase())) {
        finalName = (name.slice(0, 16) + suffix).slice(0, 20);
        suffix++;
      }
      user = {
        id: "u_" + crypto.randomBytes(8).toString("hex"),
        name: finalName,
        googleId: googleId,
        provider: "google",
        createdAt: Date.now()
      };
      users.push(user);
      saveUsers(users);
    }

    res.json({ ok: true, user: publicUser(user) });
  })
);

/* ============================================================
   DATA CATALOG & SPORTS ROUTES
   ============================================================ */

app.get("/api/teams", (req, res) => res.json(TEAMS));
app.get("/api/players", (req, res) => res.json(PLAYERS));
app.get("/api/legends", (req, res) => res.json(LEGENDS));
app.get("/api/retentions", (req, res) => res.json(RETENTIONS_2025));
app.get("/api/sports", (req, res) => res.json(SUPPORTED_SPORTS));

/* ============================================================
   ROOM MANAGEMENT ROUTES
   ============================================================ */

app.get("/api/rooms", (req, res) => {
  rooms.forEach(tick);
  res.json(rooms);
});

app.post(
  "/api/rooms",
  wrap((req, res) => {
    const user = authUser(req);
    const name = String(req.body.name || "").trim();
    const teamCount = Number(req.body.teamCount) || 10;
    const allowCustomTeams = req.body.allowCustomTeams === true;
    const botsEnabled = req.body.botsEnabled !== false; // Default true

    // Valid modes: ZERO, RETENTION_2025, LEGENDS
    let mode = String(req.body.mode || "ZERO").toUpperCase();
    if (mode === "FULL") mode = "ZERO";
    if (mode === "RTM" || mode === "MINI") mode = "RETENTION_2025";
    if (!["ZERO", "RETENTION_2025", "LEGENDS"].includes(mode)) {
      mode = "ZERO";
    }

    if (name.length < 2 || name.length > 40) {
      throw new Error("Room name must be between 2 and 40 characters.");
    }
    if (teamCount < 2 || teamCount > 10) {
      throw new Error("Team count must be between 2 and 10.");
    }

    const room = {
      id: "room_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      code: generateRoomCode(),
      name,
      status: "SETUP",
      teamCount,
      mode,
      createdBy: user.name,
      createdById: user.id,
      allowCustomTeams,
      botsEnabled,
      claims: [],
      customTeams: [],
      settings: {
        budgetCrores: 120,
        timerSeconds: 10
      }
    };

    rooms.unshift(room);
    persistRooms();
    res.json(room);
  })
);

app.get(
  "/api/rooms/by-code/:code",
  wrap((req, res) => {
    const room = findRoomByCode(req.params.code);
    if (!room) {
      const err = new Error("No room found with that code.");
      err.status = 404;
      throw err;
    }
    tick(room);
    res.json(decorate(room));
  })
);

app.get(
  "/api/rooms/:id",
  wrap((req, res) => {
    const room = findRoom(req.params.id);
    tick(room);
    res.json(decorate(room));
  })
);

app.post(
  "/api/rooms/:id/claim",
  wrap((req, res) => {
    const user = authUser(req);
    const room = findRoom(req.params.id);

    if (room.status !== "SETUP") throw new Error("Room already started.");
    if (room.claims.some((c) => c.userId === user.id)) {
      throw new Error("You already have a team. Leave it first.");
    }

    const teamId = String(req.body.teamId || "");
    if (!TEAMS.some((t) => t.id === teamId)) throw new Error("Unknown team.");
    if (room.claims.some((c) => c.teamId === teamId)) throw new Error("Team already claimed.");

    const humanClaimed = room.claims.filter((c) => !c.custom).length;
    if (humanClaimed >= room.teamCount) {
      throw new Error("This room is limited to " + room.teamCount + " teams.");
    }

    room.claims.push({
      teamId,
      userId: user.id,
      username: user.name,
      custom: false,
      isBot: false
    });

    persistRooms();
    broadcastRoom(room.id);
    res.json(decorate(room));
  })
);

app.post(
  "/api/rooms/:id/unclaim",
  wrap((req, res) => {
    const user = authUser(req);
    const room = findRoom(req.params.id);
    if (room.status !== "SETUP") throw new Error("Room already started.");
    room.claims = room.claims.filter((c) => c.userId !== user.id);
    persistRooms();
    broadcastRoom(room.id);
    res.json(decorate(room));
  })
);

app.post(
  "/api/rooms/:id/settings",
  wrap((req, res) => {
    const user = authUser(req);
    const room = findRoom(req.params.id);

    if (room.createdById !== user.id) throw new Error("Only the host can modify room settings.");

    const budgetCrores = Math.floor(Number(req.body.budgetCrores));
    const timerSeconds = Math.floor(Number(req.body.timerSeconds));

    if (Number.isFinite(budgetCrores) && budgetCrores >= 50 && budgetCrores <= 200) {
      room.settings.budgetCrores = budgetCrores;
    }
    if (Number.isFinite(timerSeconds) && timerSeconds >= 5 && timerSeconds <= 30) {
      room.settings.timerSeconds = timerSeconds;
    }
    if (req.body.botsEnabled !== undefined) {
      room.botsEnabled = !!req.body.botsEnabled;
    }

    persistRooms();
    broadcastRoom(room.id);
    res.json(decorate(room));
  })
);

/* ============================================================
   START AUCTION WITH MULTI-MODE & AI BOTS
   ============================================================ */

app.post(
  "/api/rooms/:id/start",
  wrap((req, res) => {
    const user = authUser(req);
    const room = findRoom(req.params.id);

    if (room.createdById !== user.id) throw new Error("Only the host can start the auction.");
    if (room.status !== "SETUP") throw new Error("Auction has already been started.");
    if (room.claims.length === 0) throw new Error("At least one player must claim a team.");

    // Fill unfilled slots with AI Bots up to room.teamCount
    if (room.botsEnabled && room.claims.length < room.teamCount) {
      const claimedTeamIds = new Set(room.claims.map((c) => c.teamId));
      const availableFranchises = TEAMS.filter((t) => !claimedTeamIds.has(t.id));

      for (const botTeam of availableFranchises) {
        if (room.claims.length >= room.teamCount) break;
        room.claims.push({
          teamId: botTeam.id,
          userId: "bot_" + botTeam.id,
          username: botTeam.short + " Bot 🤖",
          custom: false,
          isBot: true
        });
      }
    }

    if (room.claims.length < 2) {
      throw new Error("At least 2 teams (human or AI bots) are required to start.");
    }

    const participatingTeamIds = room.claims.map((c) => c.teamId);
    const setup = setupAuctionForMode(room.mode, participatingTeamIds);

    const baseBudget = (room.settings.budgetCrores || 120) * CRORE;

    room.auction = {
      playerQueue: setup.playerQueue,
      currentIndex: -1,
      doneCount: 0,
      phase: "BETWEEN_LOTS",
      currentBid: 0,
      leaderTeamId: null,
      expiresAt: 0,
      autoNextAt: 0,
      budgets: {},
      squads: {},
      rtmCards: {},
      pendingRtm: null,
      events: []
    };

    // Initialize squads & budgets based on mode
    room.claims.forEach((c) => {
      room.auction.budgets[c.teamId] = setup.initialBudgets[c.teamId] !== undefined
        ? setup.initialBudgets[c.teamId]
        : baseBudget;
      room.auction.squads[c.teamId] = setup.initialSquads[c.teamId]
        ? [...setup.initialSquads[c.teamId]]
        : [];
      room.auction.rtmCards[c.teamId] = setup.rtmCards[c.teamId] !== undefined
        ? setup.rtmCards[c.teamId]
        : (room.mode === "RETENTION_2025" ? 2 : 0);
    });

    room.status = "LIVE";

    addEvent(
      room,
      `🏁 ${modeDisplayName(room.mode)} LIVE! ${room.claims.length} Franchises competing. Timer: ${room.settings.timerSeconds}s.`
    );

    presentLot(room);
    persistRooms();
    broadcastRoom(room.id);
    res.json(decorate(room));
  })
);

app.post(
  "/api/rooms/:id/bid",
  wrap((req, res) => {
    const user = authUser(req);
    const room = findRoom(req.params.id);

    tick(room);
    if (room.status !== "LIVE" || !room.auction) throw new Error("Auction is not live.");

    const a = room.auction;
    if (a.phase !== "BIDDING") throw new Error("Bidding closed for this lot.");
    if (Date.now() >= a.expiresAt) { tick(room); throw new Error("Timer expired."); }

    const claim = room.claims.find((c) => c.userId === user.id);
    if (!claim) throw new Error("You do not own a team in this room.");
    if (a.leaderTeamId === claim.teamId) throw new Error("You are already highest bidder.");

    const amount = Math.floor(Number(req.body.amount));
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid bid amount.");

    const player = PLAYERS_BY_ID[a.playerQueue[a.currentIndex]];
    if (!player) throw new Error("No active player.");

    const minBid = a.currentBid === 0 ? player.basePrice : a.currentBid + bidIncrement(a.currentBid);
    if (amount < minBid) throw new Error("Minimum bid is " + money(minBid) + ".");

    const budget = a.budgets[claim.teamId] || 0;
    if (amount > budget) throw new Error("Not enough budget. Remaining: " + money(budget) + ".");

    const squad = a.squads[claim.teamId] || [];
    if (squad.length >= SQUAD_MAX) throw new Error("Squad size limit reached (25).");

    if (player.overseas) {
      const overseasCount = squad.filter((entry) => {
        const p = PLAYERS_BY_ID[entry.playerId];
        return p && p.overseas;
      }).length;
      if (overseasCount >= OVERSEAS_MAX) throw new Error("Overseas limit reached (8 max).");
    }

    a.currentBid = amount;
    a.leaderTeamId = claim.teamId;
    a.expiresAt = Date.now() + (room.settings.timerSeconds || 10) * 1000;

    addEvent(room, teamLabel(room, claim.teamId) + " bids " + money(amount) + " for " + player.name);

    persistRooms();
    broadcastRoom(room.id);
    res.json(decorate(room));
  })
);

app.post(
  "/api/rooms/:id/next-lot",
  wrap((req, res) => {
    const user = authUser(req);
    const room = findRoom(req.params.id);

    if (room.createdById !== user.id) throw new Error("Only the host can control auction tempo.");
    if (room.status === "COMPLETED") throw new Error("Auction is already completed.");
    if (!room.auction) throw new Error("Auction has not started.");

    if (room.auction.phase === "RTM_PENDING") {
      throw new Error("Wait for RTM decision.");
    }

    tick(room);
    if (room.auction.phase === "BIDDING") {
      room.auction.expiresAt = 0;
      tick(room);
    }

    room.auction.autoNextAt = 0;
    presentLot(room);
    persistRooms();
    broadcastRoom(room.id);
    res.json(decorate(room));
  })
);

app.post(
  "/api/rooms/:id/rtm/use",
  wrap((req, res) => {
    const user = authUser(req);
    const room = findRoom(req.params.id);
    const a = room.auction;

    if (!a || a.phase !== "RTM_PENDING" || !a.pendingRtm) {
      throw new Error("No RTM decision pending.");
    }

    const claim = room.claims.find(
      (c) => c.userId === user.id && c.teamId === a.pendingRtm.franchiseTeamId
    );

    if (!claim) throw new Error("Only the original franchise owner can exercise RTM.");

    finalizeRtm(room, true, false);
    persistRooms();
    res.json(decorate(room));
  })
);

app.post(
  "/api/rooms/:id/rtm/skip",
  wrap((req, res) => {
    const user = authUser(req);
    const room = findRoom(req.params.id);
    const a = room.auction;

    if (!a || a.phase !== "RTM_PENDING" || !a.pendingRtm) {
      throw new Error("No RTM decision pending.");
    }

    const claim = room.claims.find(
      (c) => c.userId === user.id && c.teamId === a.pendingRtm.franchiseTeamId
    );

    if (!claim) throw new Error("Only the original franchise owner can pass on RTM.");

    finalizeRtm(room, false, false);
    persistRooms();
    res.json(decorate(room));
  })
);

/* ============================================================
   AI ANALYTICS & TOURNAMENT SIMULATION ENDPOINTS
   ============================================================ */

/**
 * GET /api/rooms/:id/ai-eval
 * Evaluates the quality, balance, and strengths/weaknesses of all squads in the room
 */
app.get(
  "/api/rooms/:id/ai-eval",
  wrap((req, res) => {
    const room = findRoom(req.params.id);
    if (!room.auction) throw new Error("Auction has not started.");

    const evaluations = {};

    room.claims.forEach((c) => {
      const squadEntries = room.auction.squads[c.teamId] || [];
      const squadPlayers = squadEntries.map((e) => PLAYERS_BY_ID[e.playerId]).filter(Boolean);
      const teamMeta = TEAMS.find((t) => t.id === c.teamId) || { name: c.username, id: c.teamId };

      evaluations[c.teamId] = {
        teamId: c.teamId,
        teamName: teamMeta.name,
        short: teamMeta.short || c.teamId.toUpperCase(),
        color: teamMeta.color || "#3b82f6",
        logo: teamMeta.logo || "",
        squadSize: squadPlayers.length,
        evaluation: evaluateSquadQuality(squadPlayers, teamMeta)
      };
    });

    res.json({
      roomId: room.id,
      evaluations
    });
  })
);

/**
 * POST /api/rooms/:id/simulate-tournament
 * Runs a complete IPL Season across the 2 to 10 teams assembled in the auction!
 */
app.post(
  "/api/rooms/:id/simulate-tournament",
  wrap((req, res) => {
    const room = findRoom(req.params.id);
    if (!room.auction) throw new Error("Auction must be started to simulate tournament.");

    const teamsForSim = room.claims.map((c) => {
      const squadEntries = room.auction.squads[c.teamId] || [];
      const squadPlayers = squadEntries.map((e) => PLAYERS_BY_ID[e.playerId]).filter(Boolean);
      const teamMeta = TEAMS.find((t) => t.id === c.teamId) || {
        id: c.teamId,
        name: c.username,
        short: c.teamId.slice(0, 3).toUpperCase(),
        pitchType: "true_bounce_large",
        color: "#3b82f6",
        logo: ""
      };

      return {
        id: c.teamId,
        name: teamMeta.name,
        short: teamMeta.short || c.teamId.slice(0, 3).toUpperCase(),
        color: teamMeta.color || "#3b82f6",
        logo: teamMeta.logo || "",
        pitchType: teamMeta.pitchType || "true_bounce_large",
        squad: squadPlayers
      };
    });

    if (teamsForSim.length < 2) {
      throw new Error("Tournament requires at least 2 teams.");
    }

    const season = runFullIPLSeason(teamsForSim);
    const monteCarloForecast = runMonteCarloForecast(teamsForSim, 60);

    const result = {
      roomId: room.id,
      roomName: room.name,
      mode: room.mode,
      standings: season.standings,
      leagueMatches: season.leagueMatches,
      playoffs: season.playoffs,
      champion: season.champion,
      runnerUp: season.runnerUp,
      awards: season.awards,
      forecast: monteCarloForecast
    };

    // Store in DB if available
    if (db) {
      try {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO tournament_results (id, roomId, championId, championName, orangeCap, purpleCap, mvp, dataJson, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
          "tourn_" + Date.now(),
          room.id,
          season.champion.id,
          season.champion.name,
          season.awards.orangeCap.name,
          season.awards.purpleCap.name,
          season.awards.mvp.name,
          JSON.stringify(result),
          Date.now()
        );
      } catch (err) {
        console.warn("Could not save tournament to SQLite:", err.message);
      }
    }

    res.json(result);
  })
);

const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log(`⚡ Auction Yards v2.0 running on http://localhost:${PORT}`);
  console.log(`🏏 Loaded ${PLAYERS.length} Players, ${LEGENDS.length} Legends, ${TEAMS.length} Original Teams`);
});