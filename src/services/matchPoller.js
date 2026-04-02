const valorantApi = require('./valorantApi');
const dataStore = require('./dataStore');

const POLL_INTERVAL = 2 * 60 * 1000; // 2 minutes

let pollTimer = null;
let onNewMatchCallback = null;
const reportedMatches = new Set(); // Track matches already reported this poll cycle

async function checkPlayerForNewMatch(player) {
  try {
    const matchData = await valorantApi.getMatches(player.region, player.name, player.tag);

    if (!matchData.data || matchData.data.length === 0) {
      return null;
    }

    const latestMatch = matchData.data[0];
    const matchId = latestMatch.metadata.matchid;

    // First time checking this player - just store the match ID
    if (!player.lastMatchId) {
      dataStore.updateLastMatchId(player.guildId, player.name, player.tag, matchId);
      console.log(`Initialized lastMatchId for ${player.name}#${player.tag} in guild ${player.guildId}: ${matchId}`);
      return null;
    }

    // Check if this is a new match
    if (matchId !== player.lastMatchId) {
      dataStore.updateLastMatchId(player.guildId, player.name, player.tag, matchId);
      console.log(`New match detected for ${player.name}#${player.tag} in guild ${player.guildId}: ${matchId}`);
      return { player, match: latestMatch };
    }

    return null;
  } catch (error) {
    console.error(`Error checking matches for ${player.name}#${player.tag}:`, error.message);
    return null;
  }
}

async function pollAllPlayers() {
  const players = dataStore.getBoundPlayers();

  if (players.length === 0) {
    return;
  }

  console.log(`Polling ${players.length} bound player(s) for new matches...`);

  // Clear reported matches at start of each poll cycle
  reportedMatches.clear();

  for (const player of players) {
    const result = await checkPlayerForNewMatch(player);

    if (result && onNewMatchCallback) {
      const matchId = result.match.metadata.matchid;
      const guildMatchKey = `${result.player.guildId}:${matchId}`;

      // Only report if we haven't already reported this match FOR THIS GUILD
      // (same match should be reported to different guilds, but not twice to the same guild)
      if (!reportedMatches.has(guildMatchKey)) {
        reportedMatches.add(guildMatchKey);
        onNewMatchCallback(result.player, result.match);
      } else {
        console.log(`Skipping duplicate report for match ${matchId} in guild ${result.player.guildId} (already reported)`);
      }
    }

    // Delay between API calls to avoid rate limits
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

function startPolling(callback) {
  if (pollTimer) {
    console.log('Polling already running');
    return;
  }

  onNewMatchCallback = callback;

  // Initial poll
  pollAllPlayers();

  // Set up interval
  pollTimer = setInterval(pollAllPlayers, POLL_INTERVAL);
  console.log(`Match polling started (every ${POLL_INTERVAL / 1000}s)`);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    console.log('Match polling stopped');
  }
}

module.exports = {
  startPolling,
  stopPolling,
  checkPlayerForNewMatch,
};
