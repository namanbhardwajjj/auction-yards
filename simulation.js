/**
 * IPL Tournament Simulation Engine
 * Runs realistic full-season IPL tournaments for 2 to 10 teams.
 * Simulates league matches, accurate points table with NRR,
 * dynamic pitch conditions, ball/phase variance, IPL Playoffs (Q1, Eliminator, Q2, Final),
 * Cap awards (Orange Cap, Purple Cap, MVP), and Monte Carlo championship forecasting.
 */

const { evaluateSquadQuality, selectOptimalPlayingXI, inferSubRole } = require("./ai_evaluator.js");

function randomGaussian(mean = 0, stdev = 1) {
  let u = 1 - Math.random();
  let v = Math.random();
  let z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return z * stdev + mean;
}

/**
 * Standard IPL Pitch profiles
 */
const PITCH_PROFILES = {
  spin_friendly: { name: "MA Chidambaram Stadium (Chepauk)", basePar: 168, spinWeight: 1.25, paceWeight: 0.85, deathVariance: 10 },
  batting_paradise: { name: "M. Chinnaswamy Stadium, Bengaluru", basePar: 208, spinWeight: 0.85, paceWeight: 0.95, deathVariance: 22 },
  bouncy_chasing: { name: "Wankhede Stadium, Mumbai", basePar: 194, spinWeight: 0.90, paceWeight: 1.15, chaseBonus: 6, deathVariance: 18 },
  highway_high_scoring: { name: "Rajiv Gandhi Stadium, Hyderabad", basePar: 205, spinWeight: 0.95, paceWeight: 1.05, deathVariance: 20 },
  slow_twopaced: { name: "Ekana Stadium, Lucknow", basePar: 158, spinWeight: 1.30, paceWeight: 0.80, deathVariance: 8 },
  true_bounce_large: { name: "Narendra Modi Stadium, Ahmedabad", basePar: 185, spinWeight: 1.05, paceWeight: 1.05, deathVariance: 14 },
  balanced_bounce: { name: "Eden Gardens, Kolkata", basePar: 192, spinWeight: 1.10, paceWeight: 1.05, deathVariance: 16 },
  flat_track: { name: "Arun Jaitley Stadium, Delhi", basePar: 198, spinWeight: 0.95, paceWeight: 1.0, deathVariance: 18 },
  pace_seam: { name: "Mullanpur Stadium, Punjab", basePar: 178, spinWeight: 0.80, paceWeight: 1.20, deathVariance: 12 },
  large_boundaries: { name: "Sawai Mansingh Stadium, Jaipur", basePar: 174, spinWeight: 1.10, paceWeight: 1.0, deathVariance: 12 }
};

/**
 * Simulates a single 20-over T20 match between Team A and Team B
 */
function simulateMatch(teamA, teamB, venueType = "true_bounce_large") {
  const pitch = PITCH_PROFILES[venueType] || PITCH_PROFILES.true_bounce_large;

  const evalA = teamA.eval || evaluateSquadQuality(teamA.squad);
  const evalB = teamB.eval || evaluateSquadQuality(teamB.squad);

  const xiA = evalA.playingXI.xi.length >= 11 ? evalA.playingXI.xi : teamA.squad;
  const xiB = evalB.playingXI.xi.length >= 11 ? evalB.playingXI.xi : teamB.squad;

  // Toss
  const tossWinner = Math.random() > 0.5 ? teamA : teamB;
  const tossLoser = tossWinner === teamA ? teamB : teamA;
  const decision = Math.random() > 0.35 ? "bowl" : "bat";

  const battingFirst = decision === "bat" ? tossWinner : tossLoser;
  const battingSecond = battingFirst === teamA ? teamB : teamA;

  const firstEval = battingFirst === teamA ? evalA : evalB;
  const secondEval = battingSecond === teamA ? evalA : evalB;

  const firstXI = battingFirst === teamA ? xiA : xiB;
  const secondXI = battingSecond === teamA ? xiA : xiB;

  // Simulate 1st Innings
  const inn1 = simulateInnings({
    battingTeam: battingFirst,
    bowlingTeam: battingSecond,
    batEval: firstEval,
    bowlEval: secondEval,
    batXI: firstXI,
    bowlXI: secondXI,
    pitch,
    isSecondInnings: false
  });

  // Simulate 2nd Innings (Chasing inn1.total + 1)
  const inn2 = simulateInnings({
    battingTeam: battingSecond,
    bowlingTeam: battingFirst,
    batEval: secondEval,
    bowlEval: firstEval,
    batXI: secondXI,
    bowlXI: firstXI,
    pitch,
    isSecondInnings: true,
    target: inn1.total + 1
  });

  let winner, loser, margin;

  if (inn2.total > inn1.total) {
    winner = battingSecond;
    loser = battingFirst;
    const wicketsLeft = 10 - inn2.wickets;
    margin = `${wicketsLeft} wicket${wicketsLeft > 1 ? "s" : ""}`;
  } else if (inn1.total > inn2.total) {
    winner = battingFirst;
    loser = battingSecond;
    const runDiff = inn1.total - inn2.total;
    margin = `${runDiff} run${runDiff > 1 ? "s" : ""}`;
  } else {
    // Super over tie-breaker
    const superWinner = Math.random() > 0.5 ? battingFirst : battingSecond;
    winner = superWinner;
    loser = superWinner === battingFirst ? battingSecond : battingFirst;
    margin = "Super Over Thriller!";
  }

  // Select Player of the Match
  const winnerInn = winner === battingFirst ? inn1 : inn2;
  const bestBat = winnerInn.topBatter;
  const bestBowl = winner === battingFirst ? inn2.topBowler : inn1.topBowler;

  let potm = bestBat.runs >= 50 ? bestBat.name : (bestBowl && bestBowl.wickets >= 3 ? bestBowl.name : bestBat.name);

  return {
    teamA: { id: teamA.id, name: teamA.name, short: teamA.short || teamA.name },
    teamB: { id: teamB.id, name: teamB.name, short: teamB.short || teamB.name },
    venue: pitch.name,
    toss: `${tossWinner.name} won the toss and elected to ${decision} first`,
    winner: { id: winner.id, name: winner.name, short: winner.short || winner.name },
    loser: { id: loser.id, name: loser.name, short: loser.short || loser.name },
    margin,
    innings1: {
      teamId: battingFirst.id,
      teamName: battingFirst.name,
      total: inn1.total,
      wickets: inn1.wickets,
      overs: inn1.overs,
      topBatter: inn1.topBatter,
      topBowler: inn1.topBowler,
      phases: inn1.phases
    },
    innings2: {
      teamId: battingSecond.id,
      teamName: battingSecond.name,
      total: inn2.total,
      wickets: inn2.wickets,
      overs: inn2.overs,
      topBatter: inn2.topBatter,
      topBowler: inn2.topBowler,
      phases: inn2.phases
    },
    potm
  };
}

/**
 * Phase-by-phase T20 Innings simulation
 */
function simulateInnings({ battingTeam, bowlingTeam, batEval, bowlEval, batXI, bowlXI, pitch, isSecondInnings, target = 999 }) {
  let runs = 0;
  let wickets = 0;
  let overs = 0;

  // Phase 1: Powerplay (Overs 1-6)
  const ppBatRating = batEval.battingFirepower;
  const ppBowlRating = (bowlEval.powerplayBowling * pitch.paceWeight);
  const ppDiff = (ppBatRating - ppBowlRating);
  const ppRuns = Math.round(Math.max(32, Math.min(85, 48 + (ppDiff * 0.45) + randomGaussian(0, 6))));
  const ppWickets = Math.max(0, Math.min(3, Math.round(1.1 - (ppDiff * 0.02) + randomGaussian(0, 0.7))));

  runs += ppRuns;
  wickets += ppWickets;
  overs = 6;

  let targetReached = isSecondInnings && runs >= target;

  // Phase 2: Middle Overs (Overs 7-15, 9 overs)
  let midRuns = 0;
  let midWickets = 0;
  if (!targetReached) {
    const midBatRating = batEval.battingDepth;
    const midBowlRating = (bowlEval.spinDepartment * pitch.spinWeight);
    const midDiff = (midBatRating - midBowlRating);
    midRuns = Math.round(Math.max(45, Math.min(115, 68 + (midDiff * 0.48) + randomGaussian(0, 8))));
    midWickets = Math.max(0, Math.min(5, Math.round(2.0 - (midDiff * 0.025) + randomGaussian(0, 0.9))));

    runs += midRuns;
    wickets += midWickets;
    overs = 15;
    targetReached = isSecondInnings && runs >= target;
  }

  // Phase 3: Death Overs (Overs 16-20, 5 overs)
  let deathRuns = 0;
  let deathWickets = 0;
  if (!targetReached && wickets < 10) {
    const deathBatRating = batEval.battingFirepower;
    const deathBowlRating = bowlEval.deathBowling;
    const deathDiff = (deathBatRating - deathBowlRating);
    deathRuns = Math.round(Math.max(25, Math.min(95, 52 + (deathDiff * 0.55) + randomGaussian(0, pitch.deathVariance * 0.4))));
    deathWickets = Math.max(0, Math.min(10 - wickets, Math.round(2.2 - (deathDiff * 0.02) + randomGaussian(0, 1.1))));

    runs += deathRuns;
    wickets += deathWickets;
    overs = 20;
    targetReached = isSecondInnings && runs >= target;
  }

  wickets = Math.min(10, wickets);

  if (isSecondInnings && runs >= target) {
    // Exact over calculation when chasing down target
    const ballsRemaining = Math.max(0, Math.round(Math.random() * 10));
    const ballsBowled = Math.max(70, 120 - ballsRemaining);
    overs = Number((Math.floor(ballsBowled / 6) + (ballsBowled % 6) / 10).toFixed(1));
    runs = target;
  }

  // Distribute individual scores realistically
  const batters = batXI.filter((p) => p.role === "batter" || p.role === "wicketkeeper_batter" || p.role === "all_rounder");
  const starBatter = batters[0] || batXI[0] || { name: "Top Batter", rating: 85 };
  const starShare = 0.35 + Math.random() * 0.25;
  const starRuns = Math.min(runs, Math.round(runs * starShare));
  const starBalls = Math.max(15, Math.round(starRuns * (0.65 + Math.random() * 0.25)));

  // Top bowler
  const bowlers = bowlXI.filter((p) => p.role === "bowler" || p.role === "all_rounder");
  const starBowler = bowlers[0] || bowlXI[0] || { name: "Spearhead Bowler", rating: 85 };
  const bowlerWickets = Math.min(wickets, Math.max(1, Math.round(wickets * (0.4 + Math.random() * 0.3))));
  const bowlerRuns = Math.round(20 + Math.random() * 18);

  return {
    total: runs,
    wickets,
    overs,
    topBatter: {
      name: starBatter.name,
      runs: starRuns,
      balls: starBalls,
      fours: Math.round(starRuns * 0.08),
      sixes: Math.round(starRuns * 0.04)
    },
    topBowler: {
      name: starBowler.name,
      wickets: bowlerWickets,
      runsConceded: bowlerRuns,
      overs: 4
    },
    phases: {
      powerplay: `${ppRuns}/${ppWickets}`,
      middle: `${midRuns}/${midWickets}`,
      death: `${deathRuns}/${deathWickets}`
    }
  };
}

/**
 * Runs a complete IPL Tournament for 2 to 10 teams!
 */
function runFullIPLSeason(teams) {
  if (!teams || teams.length < 2) {
    throw new Error("Tournament requires at least 2 teams.");
  }

  // Pre-calculate AI squad evaluations
  teams.forEach((t) => {
    t.eval = evaluateSquadQuality(t.squad, t);
  });

  const matches = [];
  const pointsTable = {};

  teams.forEach((t) => {
    pointsTable[t.id] = {
      id: t.id,
      name: t.name,
      short: t.short || t.name.slice(0, 3).toUpperCase(),
      logo: t.logo || "",
      color: t.color || "#3b82f6",
      aiRating: t.eval.overallRating,
      played: 0,
      won: 0,
      lost: 0,
      tied: 0,
      points: 0,
      runsFor: 0,
      oversFor: 0,
      runsAgainst: 0,
      oversAgainst: 0,
      nrr: "0.000"
    };
  });

  // Schedule round robin matches
  // For 2 teams: 3-5 match series
  // For 3-5 teams: double round-robin
  // For 6-10 teams: single round-robin + select rivalries
  const fixtures = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      fixtures.push({ home: teams[i], away: teams[j] });
      if (teams.length <= 5) {
        fixtures.push({ home: teams[j], away: teams[i] });
      }
    }
  }

  // If 2 teams, add a 3rd match rubber
  if (teams.length === 2) {
    fixtures.push({ home: teams[0], away: teams[1] });
  }

  // Track player stats for Orange & Purple caps
  const playerStats = {};

  function recordPlayerStat(name, teamId, runs = 0, wickets = 0, runsConceded = 0) {
    if (!playerStats[name]) {
      playerStats[name] = { name, teamId, runs: 0, wickets: 0, runsConceded: 0, innings: 0, matches: 0 };
    }
    playerStats[name].runs += runs;
    playerStats[name].wickets += wickets;
    playerStats[name].runsConceded += runsConceded;
    playerStats[name].matches += 1;
  }

  // Execute League Matches
  fixtures.forEach((fix, index) => {
    const venue = fix.home.pitchType || "true_bounce_large";
    const res = simulateMatch(fix.home, fix.away, venue);
    res.matchNumber = index + 1;
    res.stage = "League Match " + (index + 1);
    matches.push(res);

    // Update Points Table
    const tA = pointsTable[res.teamA.id];
    const tB = pointsTable[res.teamB.id];

    tA.played++;
    tB.played++;

    tA.runsFor += res.innings1.total;
    tA.oversFor += res.innings1.overs;
    tA.runsAgainst += res.innings2.total;
    tA.oversAgainst += res.innings2.overs;

    tB.runsFor += res.innings2.total;
    tB.oversFor += res.innings2.overs;
    tB.runsAgainst += res.innings1.total;
    tB.oversAgainst += res.innings1.overs;

    if (res.winner.id === tA.id) {
      tA.won++;
      tA.points += 2;
      tB.lost++;
    } else {
      tB.won++;
      tB.points += 2;
      tA.lost++;
    }

    // Caps recording
    recordPlayerStat(res.innings1.topBatter.name, res.innings1.teamId, res.innings1.topBatter.runs, 0, 0);
    recordPlayerStat(res.innings2.topBatter.name, res.innings2.teamId, res.innings2.topBatter.runs, 0, 0);
    recordPlayerStat(res.innings1.topBowler.name, res.innings2.teamId, 0, res.innings1.topBowler.wickets, res.innings1.topBowler.runsConceded);
    recordPlayerStat(res.innings2.topBowler.name, res.innings1.teamId, 0, res.innings2.topBowler.wickets, res.innings2.topBowler.runsConceded);
  });

  // Calculate NRR
  Object.values(pointsTable).forEach((t) => {
    const runRateFor = t.oversFor > 0 ? t.runsFor / t.oversFor : 0;
    const runRateAgainst = t.oversAgainst > 0 ? t.runsAgainst / t.oversAgainst : 0;
    const diff = runRateFor - runRateAgainst;
    t.nrr = (diff >= 0 ? "+" : "") + diff.toFixed(3);
    t.nrrVal = diff;
  });

  // Sort Points Table
  const standings = Object.values(pointsTable).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return b.nrrVal - a.nrrVal;
  });

  // Execute IPL Playoffs
  const playoffMatches = [];
  let champion = null;
  let runnerUp = null;

  if (standings.length >= 4) {
    const t1 = teams.find((t) => t.id === standings[0].id);
    const t2 = teams.find((t) => t.id === standings[1].id);
    const t3 = teams.find((t) => t.id === standings[2].id);
    const t4 = teams.find((t) => t.id === standings[3].id);

    // Qualifier 1 (1 vs 2)
    const q1 = simulateMatch(t1, t2, "bouncy_chasing");
    q1.stage = "Qualifier 1";
    playoffMatches.push(q1);

    const q1Winner = q1.winner.id === t1.id ? t1 : t2;
    const q1Loser = q1.winner.id === t1.id ? t2 : t1;

    // Eliminator (3 vs 4)
    const elim = simulateMatch(t3, t4, "spin_friendly");
    elim.stage = "Eliminator";
    playoffMatches.push(elim);

    const elimWinner = elim.winner.id === t3.id ? t3 : t4;

    // Qualifier 2 (Q1 Loser vs Eliminator Winner)
    const q2 = simulateMatch(q1Loser, elimWinner, "balanced_bounce");
    q2.stage = "Qualifier 2";
    playoffMatches.push(q2);

    const q2Winner = q2.winner.id === q1Loser.id ? q1Loser : elimWinner;

    // Grand Final (Q1 Winner vs Q2 Winner)
    const finalMatch = simulateMatch(q1Winner, q2Winner, "true_bounce_large");
    finalMatch.stage = "TATA IPL Grand Final";
    playoffMatches.push(finalMatch);

    champion = finalMatch.winner;
    runnerUp = finalMatch.loser;
  } else if (standings.length === 3) {
    const t1 = teams.find((t) => t.id === standings[0].id);
    const t2 = teams.find((t) => t.id === standings[1].id);
    const t3 = teams.find((t) => t.id === standings[2].id);

    const semi = simulateMatch(t2, t3, "balanced_bounce");
    semi.stage = "Semi Final";
    playoffMatches.push(semi);

    const semiWinner = semi.winner.id === t2.id ? t2 : t3;
    const finalMatch = simulateMatch(t1, semiWinner, "true_bounce_large");
    finalMatch.stage = "Grand Final";
    playoffMatches.push(finalMatch);

    champion = finalMatch.winner;
    runnerUp = finalMatch.loser;
  } else {
    // 2 teams
    const leader = standings[0];
    const second = standings[1];
    champion = leader;
    runnerUp = second;
  }

  // Calculate Tournament Cap Winners
  const allPlayers = Object.values(playerStats);
  allPlayers.sort((a, b) => b.runs - a.runs);
  const orangeCap = allPlayers[0] || { name: "N/A", runs: 0, teamId: "" };

  allPlayers.sort((a, b) => b.wickets - a.wickets);
  const purpleCap = allPlayers[0] || { name: "N/A", wickets: 0, teamId: "" };

  // MVP
  allPlayers.sort((a, b) => (b.runs + b.wickets * 25) - (a.runs + a.wickets * 25));
  const mvp = allPlayers[0] || { name: "N/A", runs: 0, wickets: 0 };

  return {
    standings,
    leagueMatches: matches,
    playoffs: playoffMatches,
    champion,
    runnerUp,
    awards: {
      orangeCap,
      purpleCap,
      mvp
    }
  };
}

/**
 * Monte Carlo Championship Simulator
 * Runs N full seasons to compute statistical championship & playoff odds
 */
function runMonteCarloForecast(teams, iterations = 150) {
  if (!teams || teams.length < 2) return {};

  const titles = {};
  const playoffAppearances = {};
  teams.forEach((t) => {
    titles[t.id] = 0;
    playoffAppearances[t.id] = 0;
  });

  for (let i = 0; i < iterations; i++) {
    const season = runFullIPLSeason(teams);
    if (season.champion && titles[season.champion.id] !== undefined) {
      titles[season.champion.id]++;
    }
    const top4 = season.standings.slice(0, Math.min(4, teams.length));
    top4.forEach((st) => {
      if (playoffAppearances[st.id] !== undefined) {
        playoffAppearances[st.id]++;
      }
    });
  }

  const forecast = {};
  teams.forEach((t) => {
    const titlePct = Number(((titles[t.id] / iterations) * 100).toFixed(1));
    const playoffPct = Number(((playoffAppearances[t.id] / iterations) * 100).toFixed(1));
    forecast[t.id] = {
      teamId: t.id,
      teamName: t.name,
      titleProbability: titlePct,
      playoffProbability: playoffPct
    };
  });

  return forecast;
}

module.exports = {
  simulateMatch,
  runFullIPLSeason,
  runMonteCarloForecast,
  PITCH_PROFILES
};
