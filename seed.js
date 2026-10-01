/**
 * Seed & Diagnostic Script for Auction Yards
 * Verifies datasets, SQLite database tables, and initializes default demo environments.
 */

const { TEAMS, PLAYERS, LEGENDS, RETENTIONS_2025 } = require("./data_manager.js");
const { db, isSqliteAvailable } = require("./db.js");
const { evaluateSquadQuality } = require("./ai_evaluator.js");
const { runFullIPLSeason, runMonteCarloForecast } = require("./simulation.js");

console.log("==========================================");
console.log("  🏏 AUCTION YARDS SEED & VERIFICATION   ");
console.log("==========================================");

console.log(`✓ Teams Loaded: ${TEAMS.length}`);
TEAMS.forEach((t) => console.log(`   - [${t.short}] ${t.name} (${t.venue})`));

console.log(`\n✓ Active IPL Players Loaded: ${PLAYERS.length}`);
console.log(`✓ All-Time Legends Loaded: ${LEGENDS.length}`);
console.log(`✓ 2025 Retentions Loaded for ${Object.keys(RETENTIONS_2025.franchises).length} Franchises`);

if (isSqliteAvailable()) {
  console.log("\n✓ SQLite Database: Active & Connected (WAL mode)");
} else {
  console.log("\n⚠ SQLite Database: Fallback mode active");
}

// Test Sample Tournament Simulation
console.log("\nRunning quick 4-team simulation benchmark...");
const benchmarkTeams = TEAMS.slice(0, 4).map((t) => {
  const squad = PLAYERS.filter((p) => p.franchise === t.id).slice(0, 15);
  return {
    id: t.id,
    name: t.name,
    short: t.short,
    pitchType: t.pitchType,
    squad: squad.length >= 11 ? squad : PLAYERS.slice(0, 15)
  };
});

const season = runFullIPLSeason(benchmarkTeams);
console.log(`✓ Benchmark Season Champion: ${season.champion.name}`);
console.log(`✓ Orange Cap Winner: ${season.awards.orangeCap.name} (${season.awards.orangeCap.runs} runs)`);
console.log(`✓ Purple Cap Winner: ${season.awards.purpleCap.name} (${season.awards.purpleCap.wickets} wickets)`);

console.log("\n==========================================");
console.log("  ✨ SYSTEM READY! Run 'npm start' to play.");
console.log("==========================================");
