// In-memory storage (data will not persist across restarts)
// For persistent storage, upgrade to a Railway plan with Volumes or use an external database

let data = {
  guilds: {},
};

function ensureGuild(guildId) {
  if (!data.guilds[guildId]) {
    data.guilds[guildId] = {
      reportChannelId: null,
      boundPlayers: [],
    };
  }
  return data.guilds[guildId];
}

async function addBoundPlayer(guildId, name, tag, region, discordUserId) {
  const guild = ensureGuild(guildId);

  const existing = guild.boundPlayers.find(
    (p) => p.name.toLowerCase() === name.toLowerCase() && p.tag.toLowerCase() === tag.toLowerCase()
  );
  if (existing) {
    return false; // Already bound
  }
  guild.boundPlayers.push({ name, tag, region, discordUserId, lastMatchId: null });
  return true;
}

async function removeBoundPlayer(guildId, name, tag) {
  const guild = ensureGuild(guildId);

  const index = guild.boundPlayers.findIndex(
    (p) => p.name.toLowerCase() === name.toLowerCase() && p.tag.toLowerCase() === tag.toLowerCase()
  );
  if (index === -1) {
    return false; // Not found
  }
  guild.boundPlayers.splice(index, 1);
  return true;
}

async function getBoundPlayers(guildId) {
  if (guildId) {
    const guild = data.guilds[guildId];
    return guild ? guild.boundPlayers : [];
  }
  // Return all players across all guilds (for polling)
  const allPlayers = [];
  for (const [gId, guild] of Object.entries(data.guilds)) {
    for (const player of guild.boundPlayers) {
      allPlayers.push({ ...player, guildId: gId });
    }
  }
  return allPlayers;
}

async function updateLastMatchId(guildId, name, tag, matchId) {
  const guild = data.guilds[guildId];
  if (!guild) return;

  const player = guild.boundPlayers.find(
    (p) => p.name.toLowerCase() === name.toLowerCase() && p.tag.toLowerCase() === tag.toLowerCase()
  );
  if (player) {
    player.lastMatchId = matchId;
  }
}

async function setReportChannel(guildId, channelId) {
  const guild = ensureGuild(guildId);
  guild.reportChannelId = channelId;
}

async function getReportChannel(guildId) {
  const guild = data.guilds[guildId];
  return guild ? guild.reportChannelId : null;
}

async function getAllGuildsWithReportChannels() {
  const result = [];
  for (const [guildId, guild] of Object.entries(data.guilds)) {
    if (guild.reportChannelId) {
      result.push({ guildId, channelId: guild.reportChannelId });
    }
  }
  return result;
}

module.exports = {
  addBoundPlayer,
  removeBoundPlayer,
  getBoundPlayers,
  updateLastMatchId,
  setReportChannel,
  getReportChannel,
  getAllGuildsWithReportChannels,
};
