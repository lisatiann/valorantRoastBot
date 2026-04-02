const valorantApi = require('./valorantApi');
const dataStore = require('./dataStore');

const POLL_INTERVAL = 2 * 60 * 1000; // 2 minutes

let pollTimer = null;
let onNewMatchCallback = null;
const reportedMatches = new Set(); // Track matches already reported this poll cycle

async function pollAllPlayers() {
  const allPlayers = await dataStore.getBoundPlayers();

  if (allPlayers.length === 0) {
    return;
  }

  // Deduplicate players by name+tag+region (same player might be bound in multiple guilds)
  // Group by unique player key, store all guildIds for each
  const uniquePlayers = new Map(); // key: "name#tag:region" -> { player, guildIds: [] }

  for (const player of allPlayers) {
    const key = `${player.name.toLowerCase()}#${player.tag.toLowerCase()}:${player.region}`;
    if (!uniquePlayers.has(key)) {
      uniquePlayers.set(key, {
        name: player.name,
        tag: player.tag,
        region: player.region,
        guildIds: [],
        // Track lastMatchId per guild (they might differ if bound at different times)
        guildData: {},
      });
    }
    const entry = uniquePlayers.get(key);
    entry.guildIds.push(player.guildId);
    entry.guildData[player.guildId] = {
      discordUserId: player.discordUserId,
      lastMatchId: player.lastMatchId,
    };
  }

  console.log(`Polling ${uniquePlayers.size} unique player(s) across ${allPlayers.length} binding(s)...`);

  // Clear reported matches at start of each poll cycle
  reportedMatches.clear();

  for (const [, playerData] of uniquePlayers) {
    try {
      const matchData = await valorantApi.getMatches(playerData.region, playerData.name, playerData.tag);

      if (!matchData.data || matchData.data.length === 0) {
        continue;
      }

      const latestMatch = matchData.data[0];
      const matchId = latestMatch.metadata.matchid;

      // Check each guild this player is bound in
      for (const guildId of playerData.guildIds) {
        const guildInfo = playerData.guildData[guildId];
        const guildMatchKey = `${guildId}:${matchId}`;

        // First time checking this player in this guild - just store the match ID
        if (!guildInfo.lastMatchId) {
          await dataStore.updateLastMatchId(guildId, playerData.name, playerData.tag, matchId);
          console.log(`Initialized lastMatchId for ${playerData.name}#${playerData.tag} in guild ${guildId}: ${matchId}`);
          continue;
        }

        // Check if this is a new match for this guild
        if (matchId !== guildInfo.lastMatchId) {
          // Skip if already reported this match for this guild
          if (reportedMatches.has(guildMatchKey)) {
            continue;
          }

          await dataStore.updateLastMatchId(guildId, playerData.name, playerData.tag, matchId);
          reportedMatches.add(guildMatchKey);

          console.log(`New match detected for ${playerData.name}#${playerData.tag} in guild ${guildId}: ${matchId}`);

          if (onNewMatchCallback) {
            onNewMatchCallback(
              {
                name: playerData.name,
                tag: playerData.tag,
                region: playerData.region,
                guildId: guildId,
                discordUserId: guildInfo.discordUserId,
              },
              latestMatch
            );
          }
        }
      }
    } catch (error) {
      console.error(`Error checking matches for ${playerData.name}#${playerData.tag}:`, error.message);
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
};
