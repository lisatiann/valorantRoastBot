const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../../data/bindings.json');

const defaultData = {
  guilds: {}, // guildId -> { reportChannelId, boundPlayers: [...] }
};

function ensureDataDir() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadData() {
  ensureDataDir();
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      return { ...defaultData, ...JSON.parse(raw) };
    }
  } catch (error) {
    console.error('Failed to load data:', error);
  }
  return { ...defaultData };
}

function saveData(data) {
  ensureDataDir();
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Failed to save data:', error);
  }
}

function ensureGuild(data, guildId) {
  if (!data.guilds[guildId]) {
    data.guilds[guildId] = {
      reportChannelId: null,
      boundPlayers: [],
    };
  }
  return data.guilds[guildId];
}

function addBoundPlayer(guildId, name, tag, region, discordUserId) {
  const data = loadData();
  const guild = ensureGuild(data, guildId);

  const existing = guild.boundPlayers.find(
    (p) => p.name.toLowerCase() === name.toLowerCase() && p.tag.toLowerCase() === tag.toLowerCase()
  );
  if (existing) {
    return false; // Already bound
  }
  guild.boundPlayers.push({ name, tag, region, discordUserId, lastMatchId: null });
  saveData(data);
  return true;
}

function removeBoundPlayer(guildId, name, tag) {
  const data = loadData();
  const guild = ensureGuild(data, guildId);

  const index = guild.boundPlayers.findIndex(
    (p) => p.name.toLowerCase() === name.toLowerCase() && p.tag.toLowerCase() === tag.toLowerCase()
  );
  if (index === -1) {
    return false; // Not found
  }
  guild.boundPlayers.splice(index, 1);
  saveData(data);
  return true;
}

function getBoundPlayers(guildId) {
  const data = loadData();
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

function updateLastMatchId(name, tag, matchId) {
  const data = loadData();
  // Search across all guilds
  for (const guild of Object.values(data.guilds)) {
    const player = guild.boundPlayers.find(
      (p) => p.name.toLowerCase() === name.toLowerCase() && p.tag.toLowerCase() === tag.toLowerCase()
    );
    if (player) {
      player.lastMatchId = matchId;
      saveData(data);
      return;
    }
  }
}

function setReportChannel(guildId, channelId) {
  const data = loadData();
  const guild = ensureGuild(data, guildId);
  guild.reportChannelId = channelId;
  saveData(data);
}

function getReportChannel(guildId) {
  const data = loadData();
  const guild = data.guilds[guildId];
  return guild ? guild.reportChannelId : null;
}

function getAllGuildsWithReportChannels() {
  const data = loadData();
  const result = [];
  for (const [guildId, guild] of Object.entries(data.guilds)) {
    if (guild.reportChannelId) {
      result.push({ guildId, channelId: guild.reportChannelId });
    }
  }
  return result;
}

module.exports = {
  loadData,
  saveData,
  addBoundPlayer,
  removeBoundPlayer,
  getBoundPlayers,
  updateLastMatchId,
  setReportChannel,
  getReportChannel,
  getAllGuildsWithReportChannels,
};
