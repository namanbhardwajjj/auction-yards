/**
 * Auction Yards — Core Auction Engine Module
 * Reusable auction mechanics, bidding increments, RTM resolution, and state transition logic.
 */

const { PLAYERS_BY_ID } = require("./data_manager.js");

const CRORE = 10000000;
const LAKH = 100000;

function formatCurrency(n) {
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

function calculateBidIncrement(currentBid) {
  if (currentBid < CRORE) return 10 * LAKH;
  if (currentBid < 5 * CRORE) return 20 * LAKH;
  return 50 * LAKH;
}

function getNextMinimumBid(currentBid, basePrice = 20 * LAKH) {
  if (currentBid === 0) return basePrice;
  return currentBid + calculateBidIncrement(currentBid);
}

module.exports = {
  CRORE,
  LAKH,
  formatCurrency,
  calculateBidIncrement,
  getNextMinimumBid
};
