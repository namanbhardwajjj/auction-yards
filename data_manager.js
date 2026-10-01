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
const PLAYER_IMAGES = loadJSON("player_images.json", {});

function getFranchiseTheme(f) {
  const themes = {
    csk: { primary: "#FDB913", secondary: "#005DA0", text: "#002B49" },
    mi: { primary: "#004BA0", secondary: "#D1AB3E", text: "#FFFFFF" },
    rcb: { primary: "#D71920", secondary: "#1C1C1C", text: "#FFFFFF" },
    kkr: { primary: "#3A225D", secondary: "#F2C94C", text: "#FFFFFF" },
    dc: { primary: "#17479E", secondary: "#D71920", text: "#FFFFFF" },
    srh: { primary: "#F26522", secondary: "#1C1C1C", text: "#FFFFFF" },
    rr: { primary: "#EA1A85", secondary: "#004BA0", text: "#FFFFFF" },
    pbks: { primary: "#DD1F2D", secondary: "#D1AB3E", text: "#FFFFFF" },
    lsg: { primary: "#0057B8", secondary: "#FF7700", text: "#FFFFFF" },
    gt: { primary: "#1B2133", secondary: "#B3995D", text: "#FFFFFF" }
  };
  return themes[String(f).toLowerCase()] || { primary: "#0E1730", secondary: "#00F0FF", text: "#FFFFFF" };
}

function getInitials(name) {
  const parts = String(name || "").trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function generateJerseyAvatar(name, role, franchise) {
  const theme = getFranchiseTheme(franchise);
  const initials = getInitials(name);
  const roleIcons = {
    batter: "🏏",
    bowler: "⚡",
    all_rounder: "🎯",
    wicketkeeper_batter: "🧤"
  };
  const icon = roleIcons[role] || "🏏";
  const roleName = String(role || "BATTER").replace(/_/g, " ").toUpperCase();

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 350" width="100%" height="100%">
    <defs>
      <linearGradient id="bg_${initials}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${theme.primary}" stop-opacity="0.85" />
        <stop offset="100%" stop-color="#050814" stop-opacity="0.98" />
      </linearGradient>
      <linearGradient id="accent_${initials}" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${theme.secondary}" />
        <stop offset="100%" stop-color="${theme.primary}" />
      </linearGradient>
    </defs>
    <rect width="300" height="350" fill="url(#bg_${initials})" />
    <circle cx="150" cy="140" r="105" fill="rgba(255,255,255,0.03)" />
    
    <!-- Cricket Jersey Silhouette -->
    <path d="M95 95 L55 135 L85 158 L105 132 L105 235 L195 235 L195 132 L215 158 L245 135 L205 95 L170 110 C160 115 140 115 130 110 Z" 
          fill="url(#accent_${initials})" stroke="rgba(255,255,255,0.3)" stroke-width="2.5" stroke-linejoin="round" />
    
    <!-- Collar & Stripe Accents -->
    <path d="M130 110 Q150 130 170 110" fill="none" stroke="#FFFFFF" stroke-width="3.5" stroke-linecap="round" />
    <path d="M105 132 L195 132" stroke="rgba(255,255,255,0.25)" stroke-width="1.5" stroke-dasharray="3,3" />
    
    <!-- Player Initials -->
    <text x="150" y="190" font-family="'Cinzel Decorative', 'Montserrat', Arial, sans-serif" font-size="34" font-weight="900" fill="#FFFFFF" text-anchor="middle" letter-spacing="2">
      ${initials}
    </text>

    <!-- Role Badge Pill -->
    <rect x="40" y="260" width="220" height="38" rx="19" fill="rgba(5,10,24,0.9)" stroke="${theme.secondary}" stroke-width="1.5" />
    <text x="150" y="284" font-family="'JetBrains Mono', 'Fira Code', monospace" font-size="11" font-weight="700" fill="#00F0FF" text-anchor="middle" letter-spacing="1">
      ${icon} ${roleName}
    </text>
  </svg>`;

  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

// Authentic IPL & International Career Stats for Marquee Stars
const REAL_CAREER_STATS = {
  "virat-kohli": { matches: 252, runs: 8004, highestScore: "113*", strikeRate: 131.97, average: 38.67, centuries: 8, fifties: 55, wickets: 4, economy: 8.80, bestBowling: "2/25" },
  "rohit-sharma": { matches: 257, runs: 6628, highestScore: "109*", strikeRate: 131.14, average: 29.72, centuries: 2, fifties: 43, wickets: 15, economy: 8.02, bestBowling: "4/6" },
  "ms-dhoni": { matches: 264, runs: 5243, highestScore: "84*", strikeRate: 137.54, average: 39.13, centuries: 0, fifties: 24, wickets: 0, economy: 0, bestBowling: "—" },
  "jasprit-bumrah": { matches: 133, runs: 69, highestScore: "16", strikeRate: 67.6, average: 9.8, centuries: 0, fifties: 0, wickets: 165, economy: 7.30, averageBowl: 22.51, bestBowling: "5/10" },
  "rishabh-pant": { matches: 111, runs: 3284, highestScore: "128*", strikeRate: 148.93, average: 35.31, centuries: 1, fifties: 18, wickets: 0, economy: 0, bestBowling: "—" },
  "shreyas-iyer": { matches: 116, runs: 3127, highestScore: "96", strikeRate: 127.48, average: 32.24, centuries: 0, fifties: 21, wickets: 0, economy: 0, bestBowling: "—" },
  "heinrich-klaasen": { matches: 35, runs: 993, highestScore: "104", strikeRate: 168.31, average: 36.78, centuries: 1, fifties: 6, wickets: 0, economy: 0, bestBowling: "—" },
  "suryakumar-yadav": { matches: 150, runs: 3594, highestScore: "103*", strikeRate: 145.33, average: 32.09, centuries: 2, fifties: 24, wickets: 0, economy: 0, bestBowling: "—" },
  "pat-cummins": { matches: 58, runs: 515, highestScore: "56*", strikeRate: 148.20, average: 18.39, centuries: 0, fifties: 3, wickets: 63, economy: 8.78, averageBowl: 30.15, bestBowling: "4/34" },
  "rashid-khan": { matches: 121, runs: 565, highestScore: "79*", strikeRate: 152.70, average: 13.78, centuries: 0, fifties: 1, wickets: 149, economy: 6.82, averageBowl: 21.82, bestBowling: "4/24" },
  "abhishek-sharma": { matches: 63, runs: 1377, highestScore: "75*", strikeRate: 155.24, average: 25.50, centuries: 0, fifties: 7, wickets: 9, economy: 8.85, bestBowling: "2/4" },
  "travis-head": { matches: 25, runs: 772, highestScore: "102", strikeRate: 178.70, average: 38.60, centuries: 1, fifties: 5, wickets: 3, economy: 8.80, bestBowling: "2/35" },
  "sunil-narine": { matches: 177, runs: 1534, highestScore: "109", strikeRate: 165.84, average: 17.04, centuries: 1, fifties: 7, wickets: 180, economy: 6.73, averageBowl: 25.39, bestBowling: "5/19" },
  "andre-russell": { matches: 127, runs: 2484, highestScore: "88*", strikeRate: 174.93, average: 29.22, centuries: 0, fifties: 11, wickets: 115, economy: 9.35, averageBowl: 23.00, bestBowling: "5/15" },
  "rinku-singh": { matches: 46, runs: 893, highestScore: "67*", strikeRate: 143.34, average: 30.79, centuries: 0, fifties: 4, wickets: 0, economy: 0, bestBowling: "—" },
  "yuzvendra-chahal": { matches: 160, runs: 43, highestScore: "8*", strikeRate: 46.2, average: 4.7, centuries: 0, fifties: 0, wickets: 205, economy: 7.84, averageBowl: 22.45, bestBowling: "5/40" },
  "kuldeep-yadav": { matches: 84, runs: 154, highestScore: "35*", strikeRate: 85.0, average: 11.0, centuries: 0, fifties: 0, wickets: 87, economy: 8.01, averageBowl: 26.68, bestBowling: "4/14" },
  "arshdeep-singh": { matches: 65, runs: 32, highestScore: "10*", strikeRate: 64.0, average: 5.3, centuries: 0, fifties: 0, wickets: 76, economy: 8.74, averageBowl: 27.00, bestBowling: "5/32" },
  "yashasvi-jaiswal": { matches: 53, runs: 1607, highestScore: "124", strikeRate: 150.61, average: 32.14, centuries: 2, fifties: 9, wickets: 0, economy: 0, bestBowling: "—" },
  "shubman-gill": { matches: 103, runs: 3216, highestScore: "129", strikeRate: 135.70, average: 37.84, centuries: 4, fifties: 20, wickets: 0, economy: 0, bestBowling: "—" },
  "jos-buttler": { matches: 107, runs: 3582, highestScore: "124", strikeRate: 147.53, average: 38.11, centuries: 7, fifties: 19, wickets: 0, economy: 0, bestBowling: "—" },
  "hardik-pandya": { matches: 137, runs: 2525, highestScore: "91", strikeRate: 145.87, average: 28.69, centuries: 0, fifties: 10, wickets: 64, economy: 8.95, averageBowl: 33.26, bestBowling: "3/17" },
  "nicholas-pooran": { matches: 76, runs: 1769, highestScore: "77", strikeRate: 162.29, average: 32.76, centuries: 0, fifties: 9, wickets: 0, economy: 0, bestBowling: "—" },
  "kl-rahul": { matches: 132, runs: 4683, highestScore: "132*", strikeRate: 134.61, average: 45.47, centuries: 4, fifties: 37, wickets: 0, economy: 0, bestBowling: "—" },
  "mohammed-shami": { matches: 110, runs: 79, highestScore: "21", strikeRate: 85.8, average: 7.9, centuries: 0, fifties: 0, wickets: 127, economy: 8.44, averageBowl: 26.87, bestBowling: "4/11" },
  "mohammed-siraj": { matches: 93, runs: 108, highestScore: "14*", strikeRate: 81.2, average: 8.3, centuries: 0, fifties: 0, wickets: 93, economy: 8.65, averageBowl: 30.34, bestBowling: "4/21" },
  "trent-boult": { matches: 104, runs: 48, highestScore: "8*", strikeRate: 75.0, average: 6.0, centuries: 0, fifties: 0, wickets: 121, economy: 8.29, averageBowl: 26.51, bestBowling: "4/18" },
  "sanju-samson": { matches: 168, runs: 4419, highestScore: "119", strikeRate: 138.96, average: 30.69, centuries: 3, fifties: 25, wickets: 0, economy: 0, bestBowling: "—" },
  "ruturaj-gaikwad": { matches: 66, runs: 2380, highestScore: "108*", strikeRate: 136.86, average: 41.75, centuries: 2, fifties: 18, wickets: 0, economy: 0, bestBowling: "—" },
  "axar-patel": { matches: 150, runs: 1653, highestScore: "66", strikeRate: 130.88, average: 21.47, centuries: 0, fifties: 4, wickets: 123, economy: 7.24, averageBowl: 30.45, bestBowling: "4/21" },
  "ravindra-jadeja": { matches: 240, runs: 2959, highestScore: "62*", strikeRate: 129.72, average: 27.40, centuries: 0, fifties: 3, wickets: 160, economy: 7.64, averageBowl: 30.04, bestBowling: "5/16" },
  "josh-hazlewood": { matches: 27, runs: 18, highestScore: "11*", strikeRate: 85.7, average: 9.0, centuries: 0, fifties: 0, wickets: 35, economy: 8.06, averageBowl: 23.23, bestBowling: "4/25" },
  "bhuvneshwar-kumar": { matches: 176, runs: 306, highestScore: "24*", strikeRate: 98.4, average: 8.7, centuries: 0, fifties: 0, wickets: 181, economy: 7.56, averageBowl: 27.23, bestBowling: "5/19" },
  "kagiso-rabada": { matches: 80, runs: 198, highestScore: "44", strikeRate: 104.2, average: 11.6, centuries: 0, fifties: 0, wickets: 117, economy: 8.42, averageBowl: 21.61, bestBowling: "4/21" },
  "sam-curran": { matches: 59, runs: 883, highestScore: "63", strikeRate: 139.50, average: 24.53, centuries: 0, fifties: 4, wickets: 58, economy: 9.49, averageBowl: 33.17, bestBowling: "4/11" },
  "varun-chakravarthy": { matches: 71, runs: 28, highestScore: "9*", strikeRate: 63.6, average: 4.6, centuries: 0, fifties: 0, wickets: 83, economy: 7.56, averageBowl: 25.10, bestBowling: "5/20" },
  "harshal-patel": { matches: 105, runs: 240, highestScore: "36*", strikeRate: 125.0, average: 10.9, centuries: 0, fifties: 0, wickets: 135, economy: 8.76, averageBowl: 23.04, bestBowling: "5/27" },
  "t-natarajan": { matches: 61, runs: 12, highestScore: "4*", strikeRate: 54.5, average: 4.0, centuries: 0, fifties: 0, wickets: 67, economy: 8.83, averageBowl: 29.87, bestBowling: "4/19" },
  "venkatesh-iyer": { matches: 50, runs: 1326, highestScore: "104", strikeRate: 137.12, average: 31.57, centuries: 1, fifties: 11, wickets: 3, economy: 9.15, bestBowling: "2/29" },
  "shivam-dube": { matches: 65, runs: 1502, highestScore: "95*", strikeRate: 159.28, average: 31.29, centuries: 0, fifties: 9, wickets: 5, economy: 9.75, bestBowling: "2/15" },
  "riyan-parag": { matches: 69, runs: 1173, highestScore: "84*", strikeRate: 135.29, average: 23.94, centuries: 0, fifties: 6, wickets: 4, economy: 8.70, bestBowling: "2/29" },
  "rajat-patidar": { matches: 27, runs: 799, highestScore: "112*", strikeRate: 158.85, average: 34.74, centuries: 1, fifties: 7, wickets: 0, economy: 0, bestBowling: "—" },
  "dhruv-jurel": { matches: 28, runs: 347, highestScore: "56*", strikeRate: 151.53, average: 24.79, centuries: 0, fifties: 2, wickets: 0, economy: 0, bestBowling: "—" },
  "sai-sudharsan": { matches: 28, runs: 1034, highestScore: "103", strikeRate: 139.17, average: 47.00, centuries: 1, fifties: 6, wickets: 0, economy: 0, bestBowling: "—" },
  "jitesh-sharma": { matches: 40, runs: 730, highestScore: "49*", strikeRate: 151.14, average: 22.81, centuries: 0, fifties: 0, wickets: 0, economy: 0, bestBowling: "—" },
  "tristan-stubbs": { matches: 18, runs: 405, highestScore: "71*", strikeRate: 177.63, average: 45.00, centuries: 0, fifties: 3, wickets: 3, economy: 8.40, bestBowling: "2/11" },
  "mayank-yadav": { matches: 4, runs: 0, highestScore: "0*", strikeRate: 0, average: 0, centuries: 0, fifties: 0, wickets: 7, economy: 6.99, averageBowl: 12.14, bestBowling: "3/14" }
};

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
        set: p[10] || "Set 3 • Capped Players"
      };
    } else {
      obj = { ...p };
    }

    // Assign real portrait or SVG jersey avatar
    obj.imageUrl = PLAYER_IMAGES[obj.id] || generateJerseyAvatar(obj.name, obj.role, obj.franchise);

    obj.subRole = inferSubRole(obj);
    obj.fact = STAR_FACTS[obj.id] ||
      (obj.role === "bowler"
        ? `Specialist ${obj.subRole.replace(/_/g, " ")} with high-pressure dot-ball capabilities.`
        : (obj.role === "all_rounder"
          ? `Key balance-providing ${obj.subRole.replace(/_/g, " ")} for dynamic match situations.`
          : `Frontline ${obj.subRole.replace(/_/g, " ")} capable of game-defining innings.`));

    // Authentic stats or realistic synthesis
    if (REAL_CAREER_STATS[obj.id]) {
      obj.stats = { ...REAL_CAREER_STATS[obj.id] };
    } else if (!obj.stats) {
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
        economy: isBowl ? Number((7.2 + (100 - obj.bowling) * 0.05).toFixed(2)) : (isAll ? 8.2 : 0),
        highestScore: isBat ? `${Math.round(65 + (obj.batting - 70) * 0.8)}*` : "32",
        bestBowling: isBowl ? `4/${Math.round(20 + (100 - obj.bowling) * 0.2)}` : "—"
      };
    }

    return obj;
  });
}

const RAW_PLAYERS = loadJSON("players.json", []);
const PLAYERS = normalizePlayers(RAW_PLAYERS);

// Update Legends with real images if available
LEGENDS.forEach((l) => {
  l.imageUrl = PLAYER_IMAGES[l.id] || generateJerseyAvatar(l.name, l.role, l.franchise);
});

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
              imageUrl: PLAYER_IMAGES[rp.id] || generateJerseyAvatar(rp.name, rp.role, teamId),
              fact: STAR_FACTS[rp.id] || "Official 2025 Retained Core player.",
              stats: REAL_CAREER_STATS[rp.id] || { matches: 50, runs: 1200, strikeRate: 135, wickets: 30, economy: 8.0 }
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
