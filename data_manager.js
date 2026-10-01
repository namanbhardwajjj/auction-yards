/**
 * Data Manager for Auction Yards
 * Manages player catalogs, cricket legends, team configurations,
 * official 2025 retentions, and player facts/statistics.
 */

const path = require("path");
const fs = require("fs");
const { inferSubRole } = require("./ai_evaluator.js");

function loadJSON(file, fallback) {
  try {
    const raw = fs.readFileSync(path.join(__dirname, "data", file), "utf8");
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
}

const TEAMS = loadJSON("teams.json", []);
const LEGENDS = loadJSON("legends.json", []);
const RETENTIONS_2025 = loadJSON("retentions_2025.json", { rules: {}, franchises: {} });

// Real Facts Dictionary for Top IPL Stars
const STAR_FACTS = {
  "virat-kohli": "All-time highest run scorer in IPL history (8,000+ runs); Orange Cap in 2016 (973 runs) and 2024 (741 runs).",
  "rohit-sharma": "5-time IPL champion captain; hit a century and took a hat-trick in IPL; one of only 4 batters with 6500+ runs.",
  "jasprit-bumrah": "Premier fast bowler with an all-time IPL economy under 7.4; Purple Cap holder; legendary yorker master.",
  "ms-dhoni": "5-time champion captain; 250+ matches; greatest finisher in death overs with 200+ sixes.",
  "rishabh-pant": "Highest score by an Indian in IPL (128*); highest bid in IPL auction history (₹27 Cr to LSG).",
  "shreyas-iyer": "Led Kolkata Knight Riders to the 2024 IPL trophy; second-highest auction bid in history (₹26.75 Cr).",
  "heinrich-klaasen": "Most destructive T20 batter against spin in world cricket; strike rate > 175 in death overs.",
  "suryakumar-yadav": "World #1 T20 batter with 360-degree boundary hitting; boasts career strike rate over 145.",
  "pat-cummins": "World Cup winning captain; led SRH to 2024 IPL final; smashed joint-second fastest fifty in IPL (14 balls).",
  "rashid-khan": "Wizard leg-spinner with 150+ wickets; hat-trick taker; deadly lower-order finisher (160+ SR).",
  "abhishek-sharma": "Fastest 50 by an SRH batter (16 balls); blazed 42 sixes in IPL 2024 at a mind-boggling 204 strike rate.",
  "travis-head": "Centurion in IPL 2024; part of the most destructive opening partnership in T20 history with Abhishek.",
  "sunil-narine": "MVP of IPL 2024; 3-time IPL champion; legendary mystery spinner who also opens and strikes at 180+.",
  "andre-russell": "All-time highest IPL career strike rate (174.9); 2-time MVP; devastating death-overs match winner.",
  "rinku-singh": "Smashed 5 consecutive sixes in the final over off Yash Dayal to pull off the greatest heist in IPL history.",
  "yuzvendra-chahal": "All-time leading wicket-taker in IPL history (200+ wickets); master of enticing flight and leg-spin.",
  "kuldeep-yadav": "Premier left-arm wrist spinner; only Indian with multiple international hat-tricks; economy under 7.5 in 2024.",
  "arshdeep-singh": "T20 World Cup leading wicket-taker; specialist death-overs left-arm pacer with pinpoint yorkers.",
  "yashasvi-jaiswal": "Fastest fifty in IPL history (13 balls vs KKR); scored 625 runs in 2023 at 21 years old.",
  "shubman-gill": "Orange Cap winner in 2023 with 890 runs (3 centuries in a single season); captain of Gujarat Titans.",
  "jos-buttler": "Orange Cap in 2022 with 863 runs and 4 centuries; 7 career IPL hundreds.",
  "hardik-pandya": "Led Gujarat Titans to title in their debut season (2022); elite pace-bowling all-rounder.",
  "nicholas-pooran": "Devastating middle-overs left-hander with 160+ strike rate; struck 62 off 19 balls vs RCB.",
  "kl-rahul": "Averaged 50+ across 5 consecutive IPL seasons; fastest 50 in 2018 (14 balls); 4 career hundreds.",
  "mohammed-shami": "Purple Cap winner in 2023 with 28 wickets; best seam position and new-ball movement in the world.",
  "mohammed-siraj": "Broke records with consecutive maiden overs in IPL; lethal powerplay outswing specialist.",
  "trent-boult": "King of the first over; has taken more first-over wickets (28+) than any bowler in IPL history.",
  "sanju-samson": "Centurion on captaincy debut; stylish stroke-maker with over 4,000 IPL runs.",
  "ruturaj-gaikwad": "Orange Cap winner in 2021 with 635 runs; appointed CSK captain in 2024."
};

function normalizePlayers(raw) {
  if (!Array.isArray(raw)) return [];

  return raw.map(function (p) {
    let obj;
    if (Array.isArray(p)) {
      obj = {
        id: p[0],
        name: p[1],
        franchise: p[2],
        role: p[3],
        overseas: !!p[4],
        basePrice: p[5],
        rating: p[6],
        batting: p[7],
        bowling: p[8],
        fielding: p[9],
        imageUrl: `/img/players/${p[0]}.png`,
        set: p[10] || "Set 3 • Capped Players"
      };
    } else {
      obj = { ...p };
    }

    obj.subRole = inferSubRole(obj);
    obj.fact = STAR_FACTS[obj.id] ||
      (obj.role === "bowler"
        ? `Specialist ${obj.subRole.replace(/_/g, " ")} with high-pressure dot-ball capabilities.`
        : (obj.role === "all_rounder"
          ? `Key balance-providing ${obj.subRole.replace(/_/g, " ")} for dynamic match situations.`
          : `Frontline ${obj.subRole.replace(/_/g, " ")} capable of game-defining innings.`));

    // Stats synthesis if missing
    if (!obj.stats) {
      const isBat = obj.role === "batter" || obj.role === "wicketkeeper_batter";
      const isBowl = obj.role === "bowler";
      const isAll = obj.role === "all_rounder";
      const m = Math.round(20 + (obj.rating - 60) * 3);

      obj.stats = {
        matches: m,
        runs: isBat ? Math.round(m * 28) : (isAll ? Math.round(m * 18) : Math.round(m * 4)),
        strikeRate: isBat ? Math.round(128 + (obj.batting - 70) * 0.9) : (isAll ? Math.round(135 + (obj.batting - 70) * 0.8) : 95),
        average: isBat ? Number((26 + (obj.batting - 70) * 0.4).toFixed(1)) : (isAll ? 22.5 : 8.0),
        wickets: isBowl ? Math.round(m * 1.15) : (isAll ? Math.round(m * 0.7) : 0),
        economy: isBowl ? Number((7.2 + (100 - obj.bowling) * 0.05).toFixed(2)) : (isAll ? 8.2 : 0)
      };
    }

    return obj;
  });
}

const RAW_PLAYERS = loadJSON("players.json", []);
const PLAYERS = normalizePlayers(RAW_PLAYERS);

const PLAYERS_BY_ID = {};
PLAYERS.forEach((p) => {
  PLAYERS_BY_ID[p.id] = p;
});

LEGENDS.forEach((p) => {
  PLAYERS_BY_ID[p.id] = p;
});

/**
 * Get active player pool and initial squads/purses for an auction mode
 */
function setupAuctionForMode(mode = "ZERO", participatingTeams = []) {
  const normMode = String(mode).toUpperCase();

  // Mode 1: LEGENDS
  if (normMode === "LEGENDS") {
    return {
      playerQueue: LEGENDS.map((p) => p.id),
      initialSquads: {},
      initialBudgets: {},
      rtmCards: {},
      modeName: "Legends All-Time Auction"
    };
  }

  // Mode 2: REAL RETENTION 2025
  if (normMode === "RETENTION_2025") {
    const retainedIds = new Set();
    const initialSquads = {};
    const initialBudgets = {};
    const rtmCards = {};

    participatingTeams.forEach((teamId) => {
      const franchiseData = RETENTIONS_2025.franchises[teamId];
      if (franchiseData) {
        initialBudgets[teamId] = franchiseData.remainingPurse;
        rtmCards[teamId] = franchiseData.rtmCards;
        initialSquads[teamId] = franchiseData.retainedPlayers.map((rp) => {
          retainedIds.add(rp.id);
          // Ensure player exists in master registry
          if (!PLAYERS_BY_ID[rp.id]) {
            PLAYERS_BY_ID[rp.id] = {
              id: rp.id,
              name: rp.name,
              franchise: teamId,
              role: rp.role,
              overseas: !!rp.overseas,
              basePrice: rp.price,
              rating: 88,
              batting: 85,
              bowling: 80,
              fielding: 80,
              fact: STAR_FACTS[rp.id] || "Official 2025 Retained Core player.",
              stats: { matches: 50, runs: 1200, strikeRate: 135, wickets: 30, economy: 8.0 }
            };
          }
          return { playerId: rp.id, price: rp.price };
        });
      } else {
        initialBudgets[teamId] = 1200000000; // 120 Cr default
        initialSquads[teamId] = [];
        rtmCards[teamId] = 2;
      }
    });

    // Auction queue contains remaining players NOT retained
    const playerQueue = PLAYERS.filter((p) => !retainedIds.has(p.id)).map((p) => p.id);

    return {
      playerQueue,
      initialSquads,
      initialBudgets,
      rtmCards,
      modeName: "2025 Official Retentions Auction"
    };
  }

  // Mode 3: START FROM ZERO (Default)
  return {
    playerQueue: PLAYERS.map((p) => p.id),
    initialSquads: {},
    initialBudgets: {},
    rtmCards: {},
    modeName: "Start From Zero (Mega Auction)"
  };
}

module.exports = {
  TEAMS,
  LEGENDS,
  RETENTIONS_2025,
  PLAYERS,
  PLAYERS_BY_ID,
  setupAuctionForMode,
  STAR_FACTS
};
