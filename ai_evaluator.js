/**
 * AI Squad Quality & Balance Evaluator
 * Realistic cricket analytics model that evaluates T20 squad strength
 * based on role balance, phase competency (PP/Middle/Death),
 * domestic/overseas constraints, and tactical depth — avoiding star-player bias.
 */

function clamp(val, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(val)));
}

/**
 * Determine sub-role from player metadata
 */
function inferSubRole(player) {
  if (player.subRole) return player.subRole;

  const role = player.role || "";
  const batting = player.batting || 50;
  const bowling = player.bowling || 50;

  if (role === "wicketkeeper_batter") {
    return batting >= 88 ? "destructive_opener" : "death_finisher";
  }
  if (role === "all_rounder") {
    return bowling >= 80 ? "pace_all_rounder" : "spin_all_rounder";
  }
  if (role === "bowler") {
    if (player.bowling >= 92 && player.rating >= 92) return "death_specialist";
    if (player.name.match(/Chahal|Kuldeep|Bishnoi|Rashid|Varun|Ashwin|Narine/i)) return "mystery_spinner";
    return bowling >= 85 ? "express_pacer" : "swing_bowler";
  }
  // Batter
  if (batting >= 90) return "powerplay_aggressor";
  return "strokeplay_anchor";
}

/**
 * Evaluates a single player's specific phase impact ratings
 */
function getPlayerPhaseRatings(p) {
  const sub = inferSubRole(p);
  const bat = p.batting || 50;
  const bowl = p.bowling || 50;

  let ppBat = bat * 0.9;
  let midBat = bat * 0.9;
  let deathBat = bat * 0.8;

  let ppBowl = bowl * 0.8;
  let midBowl = bowl * 0.8;
  let deathBowl = bowl * 0.7;

  if (sub === "destructive_opener" || sub === "powerplay_aggressor") {
    ppBat = bat * 1.08;
    deathBat = bat * 0.75;
  } else if (sub === "death_finisher") {
    deathBat = bat * 1.15;
    ppBat = bat * 0.7;
  } else if (sub === "strokeplay_anchor") {
    midBat = bat * 1.05;
    deathBat = bat * 0.82;
  }

  if (sub === "death_specialist") {
    deathBowl = bowl * 1.18;
    ppBowl = bowl * 0.95;
  } else if (sub === "swing_bowler") {
    ppBowl = bowl * 1.15;
    deathBowl = bowl * 0.75;
  } else if (sub === "mystery_spinner" || sub === "wrist_spinner") {
    midBowl = bowl * 1.15;
    deathBowl = bowl * 0.88;
  } else if (sub === "express_pacer") {
    ppBowl = bowl * 1.05;
    deathBowl = bowl * 1.05;
  }

  return {
    ppBat: clamp(ppBat),
    midBat: clamp(midBat),
    deathBat: clamp(deathBat),
    ppBowl: clamp(ppBowl),
    midBowl: clamp(midBowl),
    deathBowl: clamp(deathBowl)
  };
}

/**
 * Select the optimal Playing XI from a squad respecting:
 * - Max 4 Overseas players
 * - Min 1 Wicketkeeper
 * - Min 5 Bowling options (frontline bowlers / bowling all-rounders)
 * - Optimal balance between top order, middle order, finishers, pacers, and spinners
 */
function selectOptimalPlayingXI(squadPlayers) {
  if (!squadPlayers || squadPlayers.length === 0) {
    return { xi: [], bench: [], isLegal: false, reason: "Squad is empty" };
  }

  // Score each player for general XI utility
  const scored = squadPlayers.map((p) => {
    const isWk = p.role === "wicketkeeper_batter";
    const isBowl = p.role === "bowler";
    const isAll = p.role === "all_rounder";
    const isBat = p.role === "batter";
    const ov = !!p.overseas;
    const baseScore = p.rating || 75;

    return {
      player: p,
      score: baseScore,
      isWk,
      isBowl,
      isAll,
      isBat,
      overseas: ov,
      bowlingVal: (p.bowling || 0) + (isAll ? 15 : 0)
    };
  });

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  // We want to pick 11 players with max 4 overseas, >=1 keeper, >=5 bowling options
  let selected = [];
  let overseasCount = 0;
  let keeperCount = 0;
  let bowlerCount = 0;

  // 1. Mandatory: Pick highest rated keeper first
  const keepers = scored.filter((x) => x.isWk);
  if (keepers.length > 0) {
    const bestKeeper = keepers[0];
    selected.push(bestKeeper);
    if (bestKeeper.overseas) overseasCount++;
    keeperCount++;
  }

  // 2. Mandatory: Ensure at least 4 top-class bowling options
  const bowlers = scored.filter((x) => (x.isBowl || x.isAll) && !selected.includes(x));
  for (const b of bowlers) {
    if (bowlerCount >= 4) break;
    if (b.overseas && overseasCount >= 4) continue;
    selected.push(b);
    if (b.overseas) overseasCount++;
    bowlerCount++;
  }

  // 3. Fill remaining slots with best available players under the overseas cap
  const remainingPool = scored.filter((x) => !selected.includes(x));
  for (const item of remainingPool) {
    if (selected.length >= 11) break;
    if (item.overseas && overseasCount >= 4) continue;
    selected.push(item);
    if (item.overseas) overseasCount++;
    if (item.isBowl || item.isAll) bowlerCount++;
  }

  // 4. If still under 11 (e.g. squad < 11), add whoever is left
  if (selected.length < 11) {
    const leftover = scored.filter((x) => !selected.includes(x));
    for (const item of leftover) {
      if (selected.length >= 11) break;
      selected.push(item);
    }
  }

  // Construct structured Playing XI batting order
  const xiPlayers = selected.map((s) => s.player);
  const benchPlayers = squadPlayers.filter((p) => !xiPlayers.some((x) => x.id === p.id));

  // Sort XI into realistic batting order:
  // Top 1-3: Openers & Anchor
  // 4-5: Middle order
  // 6-7: Finishers / All-rounders
  // 8-11: Bowlers
  xiPlayers.sort((a, b) => {
    const batA = a.batting || 50;
    const batB = b.batting || 50;
    return batB - batA;
  });

  const legalOverseas = xiPlayers.filter((p) => p.overseas).length <= 4;
  const hasKeeper = xiPlayers.some((p) => p.role === "wicketkeeper_batter");
  const totalBowlers = xiPlayers.filter((p) => p.role === "bowler" || p.role === "all_rounder").length;
  const isLegal = xiPlayers.length === 11 && legalOverseas && hasKeeper && totalBowlers >= 5;

  let reason = "Valid Playing XI";
  if (xiPlayers.length < 11) reason = `Squad has only ${xiPlayers.length}/11 required players`;
  else if (!legalOverseas) reason = "Exceeded 4 overseas limit in Playing XI";
  else if (!hasKeeper) reason = "Missing a specialist wicketkeeper";
  else if (totalBowlers < 5) reason = "Less than 5 bowling options (minimum 20 overs needed)";

  return {
    xi: xiPlayers,
    bench: benchPlayers,
    isLegal,
    reason,
    stats: {
      overseasCount: xiPlayers.filter((p) => p.overseas).length,
      keeperCount: xiPlayers.filter((p) => p.role === "wicketkeeper_batter").length,
      bowlerCount: totalBowlers
    }
  };
}

/**
 * Evaluate the overall quality of a squad without star-obsession.
 * Evaluates:
 * 1. Batting Firepower (Top order + Boundary potency)
 * 2. Batting Stability & Depth (Middle order anchor + lower-order batting till #8)
 * 3. Powerplay Bowling (Economy & early wickets in overs 1-6)
 * 4. Death Bowling (Yorkers & boundary prevention in overs 16-20)
 * 5. Spin Variety (Finger + Wrist spin effectiveness)
 * 6. Synergy & Role Balance (Penalties for role duplication, lack of keeper, lack of bowlers)
 * 7. Overall AI Rating (0-100)
 */
function evaluateSquadQuality(squadPlayers, teamMetadata = {}) {
  if (!squadPlayers || squadPlayers.length === 0) {
    return {
      overallRating: 30,
      battingFirepower: 30,
      battingDepth: 30,
      powerplayBowling: 30,
      deathBowling: 30,
      spinDepartment: 30,
      synergyIndex: 30,
      strengths: ["Clean slate"],
      weaknesses: ["Squad not assembled yet"],
      scoutRecommendation: "Start bidding to assemble core Playing XI.",
      playingXI: { xi: [], bench: [], isLegal: false, reason: "Empty squad" }
    };
  }

  const { xi, bench, isLegal, reason, stats: xiStats } = selectOptimalPlayingXI(squadPlayers);

  // We evaluate the XI primarily, with bench strength providing depth bonuses
  const phaseEvals = xi.map(getPlayerPhaseRatings);

  // 1. Batting Firepower (Top 3 + Finishers)
  const top3 = xi.slice(0, 3);
  const finishers = xi.slice(4, 7);

  const top3Power = top3.length > 0
    ? top3.reduce((acc, p) => acc + (p.batting || 50), 0) / top3.length
    : 40;

  const finisherPower = finishers.length > 0
    ? finishers.reduce((acc, p) => {
        const pr = getPlayerPhaseRatings(p);
        return acc + pr.deathBat;
      }, 0) / finishers.length
    : 45;

  const battingFirepower = clamp(top3Power * 0.55 + finisherPower * 0.45);

  // 2. Batting Stability & Depth
  // Check batting capability of #7 and #8
  const bat7 = xi[6] ? (xi[6].batting || 40) : 30;
  const bat8 = xi[7] ? (xi[7].batting || 30) : 20;
  const anchorPlayer = xi.find((p) => inferSubRole(p) === "strokeplay_anchor");
  const anchorBonus = anchorPlayer ? 8 : 0;
  const depthBonus = (bat7 >= 70 ? 8 : 0) + (bat8 >= 60 ? 6 : 0);

  const middleOrderAvg = xi.slice(2, 6).reduce((acc, p) => acc + (p.batting || 50), 0) / Math.max(1, xi.slice(2, 6).length);
  const battingDepth = clamp(middleOrderAvg * 0.7 + depthBonus + anchorBonus);

  // 3. Powerplay Bowling (Overs 1-6)
  const ppBowlers = xi.filter((p) => p.bowling >= 75 || p.role === "bowler");
  const topPPBowlers = [...ppBowlers]
    .map(getPlayerPhaseRatings)
    .sort((a, b) => b.ppBowl - a.ppBowl)
    .slice(0, 2);

  const ppBowlingScore = topPPBowlers.length >= 2
    ? (topPPBowlers[0].ppBowl * 0.55 + topPPBowlers[1].ppBowl * 0.45)
    : (topPPBowlers[0] ? topPPBowlers[0].ppBowl * 0.6 : 40);

  const powerplayBowling = clamp(ppBowlingScore);

  // 4. Death Bowling (Overs 16-20) — Critical modern T20 differentiator!
  const deathBowlers = xi.filter((p) => p.bowling >= 75 || p.role === "bowler");
  const topDeathBowlers = [...deathBowlers]
    .map(getPlayerPhaseRatings)
    .sort((a, b) => b.deathBowl - a.deathBowl)
    .slice(0, 2);

  let deathBowlingScore = 40;
  if (topDeathBowlers.length >= 2) {
    deathBowlingScore = topDeathBowlers[0].deathBowl * 0.55 + topDeathBowlers[1].deathBowl * 0.45;
  } else if (topDeathBowlers.length === 1) {
    deathBowlingScore = topDeathBowlers[0].deathBowl * 0.65;
  }

  // Elite death specialist bonus (Bumrah, Malinga, Arshdeep, Pathirana)
  const hasEliteDeathBowler = xi.some((p) =>
    p.name.match(/Bumrah|Malinga|Pathirana|Arshdeep|Natarajan|Bravo|Boult/i) ||
    inferSubRole(p) === "death_specialist"
  );
  if (hasEliteDeathBowler) deathBowlingScore += 7;

  const deathBowling = clamp(deathBowlingScore);

  // 5. Spin Department
  const spinners = xi.filter((p) =>
    p.role === "bowler" &&
    (inferSubRole(p) === "mystery_spinner" || inferSubRole(p) === "wrist_spinner" || inferSubRole(p) === "finger_spinner") ||
    (p.role === "all_rounder" && inferSubRole(p) === "spin_all_rounder")
  );

  let spinScore = 42;
  if (spinners.length >= 2) {
    spinScore = 86;
  } else if (spinners.length === 1) {
    spinScore = 72 + (spinners[0].bowling >= 90 ? 12 : 0);
  } else {
    spinScore = 38; // Heavy penalty if 0 spinners
  }
  const spinDepartment = clamp(spinScore);

  // 6. Synergy, Balance & Penalties
  let synergy = 85;

  // Penalties
  if (!isLegal) synergy -= 18;
  if (xiStats.keeperCount === 0) synergy -= 15;
  if (xiStats.bowlerCount < 5) synergy -= (5 - xiStats.bowlerCount) * 8;
  if (xiStats.overseasCount > 4) synergy -= 20;

  // Star redundancy check: 4+ players who are all top order batters
  const openersCount = xi.filter((p) => inferSubRole(p) === "powerplay_aggressor" || inferSubRole(p) === "destructive_opener").length;
  if (openersCount > 3) {
    synergy -= (openersCount - 3) * 6; // Role overlap penalty
  }

  // Bench depth bonus: Quality backup players in squad
  const benchQuality = bench.slice(0, 4).reduce((acc, p) => acc + (p.rating || 60), 0) / Math.max(1, Math.min(4, bench.length));
  if (bench.length >= 4 && benchQuality >= 78) {
    synergy += 6;
  }

  const synergyIndex = clamp(synergy);

  // Overall Weighted AI Rating (realistic composite)
  // modern T20 formula: 22% Firepower, 18% Stability, 20% Death Bowl, 18% PP Bowl, 10% Spin, 12% Synergy
  const weighted =
    battingFirepower * 0.22 +
    battingDepth * 0.18 +
    deathBowling * 0.20 +
    powerplayBowling * 0.18 +
    spinDepartment * 0.10 +
    synergyIndex * 0.12;

  const overallRating = clamp(weighted);

  // Qualitative Insights & Scout Critique
  const strengths = [];
  const weaknesses = [];

  if (battingFirepower >= 88) strengths.push("Explosive Top-Order & Power-hitting");
  if (deathBowling >= 88) strengths.push("Lethal Death Bowling Attack (Sub-8 Econ potential)");
  if (powerplayBowling >= 86) strengths.push("Potent New-Ball Swing & Early Wicket Threat");
  if (spinDepartment >= 85) strengths.push("Chamber of Spin: Capable of middle-overs choke");
  if (battingDepth >= 84) strengths.push("Deep Batting Tail (Capable hitting till #8)");
  if (synergyIndex >= 88) strengths.push("Harmonious Squad Synergy & Balanced Role Distribution");

  if (deathBowling < 72) weaknesses.push("Vulnerable Death Bowling (High risk of leaking 65+ runs in overs 16-20)");
  if (spinDepartment < 60) weaknesses.push("Weak Spin Department (Risk of being dismantled on slow/turning pitches)");
  if (xiStats.bowlerCount < 5) weaknesses.push("Incomplete Bowling Attack: Less than 5 recognized bowling options");
  if (xiStats.keeperCount === 0) weaknesses.push("No specialist Wicketkeeper found in Playing XI");
  if (openersCount > 3) weaknesses.push("Top-Order Clutter: Multiple marquee openers forced to bat out of position");
  if (battingDepth < 65) weaknesses.push("Fragile Tail: Batting collapses quickly if top order is breached");

  if (strengths.length === 0) strengths.push("Work in progress squad with flexible budget options");
  if (weaknesses.length === 0) weaknesses.push("No glaring structural vulnerabilities identified");

  let scoutRecommendation = "Squad is well balanced for both flat and spinning pitches.";
  if (weaknesses.length > 0) {
    scoutRecommendation = `Priority Auction Target: ${weaknesses[0]}.`;
  }

  return {
    overallRating,
    battingFirepower,
    battingDepth,
    powerplayBowling,
    deathBowling,
    spinDepartment,
    synergyIndex,
    strengths,
    weaknesses,
    scoutRecommendation,
    playingXI: {
      xi,
      bench,
      isLegal,
      reason,
      stats: xiStats
    }
  };
}

module.exports = {
  inferSubRole,
  getPlayerPhaseRatings,
  selectOptimalPlayingXI,
  evaluateSquadQuality
};
