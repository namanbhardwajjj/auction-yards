/**
 * AI Auction Bots Engine
 * Powers CPU-controlled IPL franchises with distinct bidding personalities,
 * squad-need heuristics, budget pacing, and overseas limits.
 */

const { inferSubRole } = require("./ai_evaluator.js");

const CRORE = 10000000;
const LAKH = 100000;

function calculateBotValuation(teamId, player, currentSquad, remainingBudget, personality = "balanced") {
  const rating = player.rating || 75;
  const basePrice = player.basePrice || 20 * LAKH;
  const overseas = !!player.overseas;
  const role = player.role || "batter";
  const subRole = inferSubRole(player);

  const squadSize = currentSquad.length;
  const slotsRemaining = 18 - squadSize;
  const safeReserve = Math.max(0, slotsRemaining * 30 * LAKH);
  const maxSpendable = Math.max(0, remainingBudget - safeReserve);

  // Overseas check
  const overseasCount = currentSquad.filter((p) => p.overseas).length;
  if (overseas && overseasCount >= 8) return 0; // Overseas cap reached

  // Count existing roles
  const keepers = currentSquad.filter((p) => p.role === "wicketkeeper_batter").length;
  const bowlers = currentSquad.filter((p) => p.role === "bowler").length;
  const allRounders = currentSquad.filter((p) => p.role === "all_rounder").length;
  const batters = currentSquad.filter((p) => p.role === "batter").length;

  let needMultiplier = 1.0;

  if (role === "wicketkeeper_batter") {
    if (keepers === 0) needMultiplier *= 1.4;
    else if (keepers >= 2) needMultiplier *= 0.6;
  }

  if (role === "bowler" || role === "all_rounder") {
    if ((bowlers + allRounders) < 5) needMultiplier *= 1.35;
  }

  if (subRole === "death_specialist") {
    needMultiplier *= 1.3;
  }

  // Personality adjustments
  if (teamId === "csk") {
    if (subRole.includes("spin") || role === "all_rounder") needMultiplier *= 1.25;
    if (player.rating >= 90) needMultiplier *= 1.1;
  } else if (teamId === "mi") {
    if (subRole === "express_pacer" || subRole === "death_specialist") needMultiplier *= 1.35;
    if (subRole === "destructive_opener") needMultiplier *= 1.2;
  } else if (teamId === "rcb") {
    if (role === "batter" || subRole === "destructive_opener") needMultiplier *= 1.3;
  } else if (teamId === "kkr") {
    if (subRole.includes("spinner") || subRole === "death_finisher") needMultiplier *= 1.3;
  } else if (teamId === "srh") {
    if (subRole === "powerplay_aggressor" || subRole === "destructive_opener") needMultiplier *= 1.3;
  } else if (teamId === "pbks") {
    // If PBKS has a huge purse, they bid aggressively on marquee icons
    if (remainingBudget > 60 * CRORE && player.rating >= 90) needMultiplier *= 1.4;
  }

  // Value formula
  // Rating 95+ can fetch up to 18-24 Cr; Rating 85 ~ 8-12 Cr; Rating 75 ~ 2-4 Cr
  const baseValue = basePrice + Math.pow(Math.max(0, rating - 68), 2.2) * 55000;
  const adjustedValue = baseValue * needMultiplier;

  // Hard ceiling based on remaining purse
  return Math.min(adjustedValue, maxSpendable * 0.45);
}

/**
 * Determines whether a bot team should bid on the current lot
 */
function shouldBotBid(botTeamId, room, currentBid, minBid) {
  const auction = room.auction;
  if (!auction || auction.phase !== "BIDDING") return false;
  if (auction.leaderTeamId === botTeamId) return false; // Already leader

  const player = auction.currentPlayer;
  if (!player) return false;

  const squad = auction.squads[botTeamId] || [];
  const budget = auction.budgets[botTeamId] || 0;

  if (minBid > budget) return false;

  const teamMeta = (room.teams || []).find((t) => t.id === botTeamId) || {};
  const valuation = calculateBotValuation(botTeamId, player, squad, budget, teamMeta.personality);

  if (minBid <= valuation) {
    // Add small stochastic reluctance if bid is getting close to valuation
    const ratio = minBid / valuation;
    const probability = 1.0 - (ratio * 0.4);
    return Math.random() < probability;
  }

  return false;
}

module.exports = {
  calculateBotValuation,
  shouldBotBid
};
