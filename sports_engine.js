/**
 * Multi-Sport Extensibility Engine
 * Provides an abstract foundation allowing the auction simulator and simulation engine
 * to effortlessly scale across global sports:
 * - Cricket (IPL / World Cup)
 * - Football / Soccer (Premier League / Champions League)
 * - Basketball (NBA / EuroLeague)
 * - Kabaddi (Pro Kabaddi League)
 */

class SportEngine {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.code = config.code;
    this.icon = config.icon;
    this.squadLimits = config.squadLimits;
    this.currencySymbol = config.currencySymbol;
    this.defaultPurse = config.defaultPurse;
    this.roles = config.roles;
  }

  evaluateSquad(squad) {
    throw new Error("evaluateSquad() must be implemented by subclass");
  }

  simulateMatch(teamA, teamB, venue) {
    throw new Error("simulateMatch() must be implemented by subclass");
  }
}

/**
 * Football (Premier League / UCL) Engine Specification
 */
class FootballEngine extends SportEngine {
  constructor() {
    super({
      id: "football_epl",
      name: "Premier League / UCL Football",
      code: "EPL",
      icon: "⚽",
      currencySymbol: "£",
      defaultPurse: 150000000, // £150M
      squadLimits: { min: 18, max: 25, foreignPlayerCap: 17, playingSize: 11 },
      roles: ["goalkeeper", "defender", "midfielder", "forward"]
    });
  }

  evaluateSquad(squad) {
    const gk = squad.filter((p) => p.role === "goalkeeper");
    const def = squad.filter((p) => p.role === "defender");
    const mid = squad.filter((p) => p.role === "midfielder");
    const fwd = squad.filter((p) => p.role === "forward");

    const attackRating = fwd.length > 0 ? fwd.reduce((a, b) => a + (b.rating || 75), 0) / fwd.length : 40;
    const midRating = mid.length > 0 ? mid.reduce((a, b) => a + (b.rating || 75), 0) / mid.length : 40;
    const defRating = def.length > 0 ? def.reduce((a, b) => a + (b.rating || 75), 0) / def.length : 40;
    const gkRating = gk.length > 0 ? gk[0].rating || 75 : 35;

    const overall = Math.round(attackRating * 0.3 + midRating * 0.3 + defRating * 0.25 + gkRating * 0.15);

    return {
      overallRating: overall,
      attackRating: Math.round(attackRating),
      midfieldControl: Math.round(midRating),
      defensiveRigidity: Math.round(defRating),
      goalkeeping: Math.round(gkRating),
      strengths: overall >= 82 ? ["Balanced modern pressing system", "High xG creation"] : ["Building squad cohesion"],
      weaknesses: gk.length === 0 ? ["No recognized #1 Goalkeeper"] : []
    };
  }

  simulateMatch(teamA, teamB) {
    const evalA = this.evaluateSquad(teamA.squad);
    const evalB = this.evaluateSquad(teamB.squad);

    const xGA = Math.max(0.2, (evalA.attackRating - evalB.defensiveRigidity) * 0.05 + 1.4);
    const xGB = Math.max(0.2, (evalB.attackRating - evalA.defensiveRigidity) * 0.05 + 1.2);

    const goalsA = Math.round(Math.max(0, xGA + (Math.random() - 0.5) * 1.5));
    const goalsB = Math.round(Math.max(0, xGB + (Math.random() - 0.5) * 1.5));

    return {
      teamA: teamA.name,
      teamB: teamB.name,
      score: `${goalsA} - ${goalsB}`,
      winner: goalsA > goalsB ? teamA.name : (goalsB > goalsA ? teamB.name : "Draw"),
      xG: `${xGA.toFixed(2)} vs ${xGB.toFixed(2)}`
    };
  }
}

/**
 * Basketball (NBA) Engine Specification
 */
class BasketballEngine extends SportEngine {
  constructor() {
    super({
      id: "basketball_nba",
      name: "NBA Franchise Basketball",
      code: "NBA",
      icon: "🏀",
      currencySymbol: "$",
      defaultPurse: 140000000, // $140M salary cap
      squadLimits: { min: 12, max: 15, foreignPlayerCap: 15, playingSize: 5 },
      roles: ["point_guard", "shooting_guard", "small_forward", "power_forward", "center"]
    });
  }

  evaluateSquad(squad) {
    const avg = squad.length > 0 ? squad.reduce((a, b) => a + (b.rating || 75), 0) / squad.length : 50;
    return {
      overallRating: Math.round(avg),
      offensiveRating: Math.round(avg * 1.02),
      defensiveRating: Math.round(avg * 0.98),
      paceAndSpace: Math.round(avg * 1.0),
      strengths: ["Perimeter shooting threat"],
      weaknesses: []
    };
  }

  simulateMatch(teamA, teamB) {
    const evalA = this.evaluateSquad(teamA.squad);
    const evalB = this.evaluateSquad(teamB.squad);

    const scoreA = Math.round(105 + (evalA.overallRating - evalB.overallRating) * 0.7 + (Math.random() - 0.5) * 15);
    const scoreB = Math.round(102 + (evalB.overallRating - evalA.overallRating) * 0.7 + (Math.random() - 0.5) * 15);

    return {
      teamA: teamA.name,
      teamB: teamB.name,
      score: `${scoreA} - ${scoreB}`,
      winner: scoreA >= scoreB ? teamA.name : teamB.name
    };
  }
}

const SUPPORTED_SPORTS = {
  cricket_ipl: {
    id: "cricket_ipl",
    name: "TATA IPL Cricket",
    code: "IPL",
    icon: "🏏",
    status: "ACTIVE"
  },
  football_epl: {
    id: "football_epl",
    name: "Premier League Football",
    code: "EPL",
    icon: "⚽",
    status: "READY",
    engine: new FootballEngine()
  },
  basketball_nba: {
    id: "basketball_nba",
    name: "NBA Basketball",
    code: "NBA",
    icon: "🏀",
    status: "READY",
    engine: new BasketballEngine()
  }
};

module.exports = {
  SportEngine,
  FootballEngine,
  BasketballEngine,
  SUPPORTED_SPORTS
};
