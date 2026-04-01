/**
 * Scoring algorithm for Valorant match performance
 *
 * Points breakdown:
 * - Kill: +50
 * - Assist: +25
 * - Death: -20
 * - Damage per 100: +10
 * - Headshot % bonus: up to +200 (at 50%+ HS rate)
 * - First blood: +75
 * - Plant: +30
 * - Defuse: +40
 */

const POINTS = {
  KILL: 50,
  ASSIST: 25,
  DEATH: -20,
  DAMAGE_PER_100: 10,
  MAX_HEADSHOT_BONUS: 200,
  FIRST_BLOOD: 75,
  PLANT: 30,
  DEFUSE: 40,
};

/**
 * Calculate headshot percentage bonus
 * @param {number} headshots
 * @param {number} bodyshots
 * @param {number} legshots
 * @returns {number} Bonus points (0-200)
 */
function calculateHeadshotBonus(headshots, bodyshots, legshots) {
  const totalShots = headshots + bodyshots + legshots;
  if (totalShots === 0) return 0;

  const hsPercent = headshots / totalShots;
  // Scale: 0% = 0 points, 50%+ = 200 points
  return Math.min(Math.round(hsPercent * 400), POINTS.MAX_HEADSHOT_BONUS);
}

/**
 * Calculate total score for a player
 * @param {Object} playerStats - Player stats from match
 * @returns {Object} Score breakdown
 */
function calculatePlayerScore(playerStats) {
  const stats = playerStats.stats || {};
  const kills = stats.kills || 0;
  const deaths = stats.deaths || 0;
  const assists = stats.assists || 0;
  const damage = playerStats.damage_made || 0; // damage_made is at root level, not in stats
  const headshots = stats.headshots || 0;
  const bodyshots = stats.bodyshots || 0;
  const legshots = stats.legshots || 0;

  // Calculate component scores
  const killScore = kills * POINTS.KILL;
  const assistScore = assists * POINTS.ASSIST;
  const deathPenalty = deaths * POINTS.DEATH;
  const damageScore = Math.round((damage / 100) * POINTS.DAMAGE_PER_100);
  const headshotBonus = calculateHeadshotBonus(headshots, bodyshots, legshots);

  // Calculate HS percentage for display
  const totalShots = headshots + bodyshots + legshots;
  const hsPercent = totalShots > 0 ? Math.round((headshots / totalShots) * 100) : 0;

  const totalScore = killScore + assistScore + deathPenalty + damageScore + headshotBonus;

  return {
    total: totalScore,
    breakdown: {
      kills: { count: kills, score: killScore },
      assists: { count: assists, score: assistScore },
      deaths: { count: deaths, score: deathPenalty },
      damage: { amount: damage, score: damageScore },
      headshots: { percent: hsPercent, score: headshotBonus },
    },
  };
}

/**
 * Process all players in a match and rank them
 * @param {Array} players - Array of player objects from match
 * @returns {Array} Sorted array of players with scores (highest first)
 */
function rankPlayers(players) {
  const scoredPlayers = players.map(player => {
    const scoreData = calculatePlayerScore(player);
    return {
      name: player.name,
      tag: player.tag,
      team: player.team,
      agent: player.character,
      currenttier_patched: player.currenttier_patched,
      stats: player.stats,
      scoreData,
    };
  });

  // Sort by total score (descending)
  scoredPlayers.sort((a, b) => b.scoreData.total - a.scoreData.total);

  return scoredPlayers;
}

module.exports = {
  calculatePlayerScore,
  rankPlayers,
  POINTS,
};
