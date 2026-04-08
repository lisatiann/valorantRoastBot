const valorantApi = require('./valorantApi');
const dataStore = require('./dataStore');

const POLL_INTERVAL = 2 * 60 * 1000; // 2 minutes

let pollTimer = null;
let onNewMatchCallback = null;
const reportedMatches = new Set(); // Track matches already reported per guild (persists across polls)

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

  // Collect all matches found in this poll cycle
  // Key: guildId:matchId -> { match, players: [{name, discordUserId}] }
  const matchesToReport = new Map();

  for (const [, playerData] of uniquePlayers) {
    try {
      const matchData = await valorantApi.getMatches(playerData.region, playerData.name, playerData.tag);

      if (!matchData.data || matchData.data.length === 0) {
        continue;
      }

      // Find the latest competitive or unrated match (skip deathmatch, etc.)
      const ALLOWED_MODES = ['competitive', 'unrated'];
      let latestMatch = null;

      // Log all recent match modes for debugging
      console.log(`[MODE-CHECK] Recent matches for ${playerData.name}#${playerData.tag}:`);
      for (const match of matchData.data.slice(0, 5)) {
        const mode = match.metadata?.mode;
        console.log(`  - ${match.metadata?.matchid?.slice(0, 8)}... mode: "${mode}"`);
      }

      for (const match of matchData.data) {
        const mode = match.metadata?.mode?.toLowerCase();
        if (ALLOWED_MODES.includes(mode)) {
          latestMatch = match;
          console.log(`[MODE-CHECK] Selected match with mode: "${mode}"`);
          break;
        }
      }

      if (!latestMatch) {
        console.log(`[MODE-CHECK] No allowed mode matches found, skipping`);
        continue;
      }

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
          // Update this player's lastMatchId
          await dataStore.updateLastMatchId(guildId, playerData.name, playerData.tag, matchId);

          // Skip if already reported this match for this guild (in a previous poll)
          if (reportedMatches.has(guildMatchKey)) {
            console.log(`Match ${matchId} already reported for guild ${guildId}, skipping`);
            continue;
          }

          // Collect this match for reporting (group players in same match)
          if (!matchesToReport.has(guildMatchKey)) {
            matchesToReport.set(guildMatchKey, {
              match: latestMatch,
              matchId: matchId,
              guildId: guildId,
              players: [],
            });
          }
          matchesToReport.get(guildMatchKey).players.push({
            name: playerData.name,
            tag: playerData.tag,
            region: playerData.region,
            discordUserId: guildInfo.discordUserId,
          });
        }
      }
    } catch (error) {
      console.error(`Error checking matches for ${playerData.name}#${playerData.tag}:`, error.message);
    }

    // Delay between API calls to avoid rate limits
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  // Now report each unique match once per guild
  for (const [guildMatchKey, matchInfo] of matchesToReport) {
    // Mark as reported
    reportedMatches.add(guildMatchKey);

    // Pick the first player to report for (they're all in the same match)
    const primaryPlayer = matchInfo.players[0];

    console.log(`New match detected: ${matchInfo.matchId} in guild ${matchInfo.guildId}`);
    console.log(`  Players in this match: ${matchInfo.players.map(p => p.name).join(', ')}`);

    if (onNewMatchCallback) {
      onNewMatchCallback(
        {
          name: primaryPlayer.name,
          tag: primaryPlayer.tag,
          region: primaryPlayer.region,
          guildId: matchInfo.guildId,
          discordUserId: primaryPlayer.discordUserId,
          // Include all players in match for potential future use
          allPlayersInMatch: matchInfo.players,
        },
        matchInfo.match
      );
    }
  }

  // Clean up old reported matches (keep last 100 to prevent memory leak)
  if (reportedMatches.size > 100) {
    const toDelete = Array.from(reportedMatches).slice(0, reportedMatches.size - 100);
    toDelete.forEach(key => reportedMatches.delete(key));
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
