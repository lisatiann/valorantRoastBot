const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../../data/bindings.json');

const defaultData = {
  boundPlayers: [], // Array of { name, tag, region, discordUserId, lastMatchId }
  reportChannelId: null,
  guildId: null,
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

function addBoundPlayer(name, tag, region, discordUserId) {
  const data = loadData();
  const existing = data.boundPlayers.find(
    (p) => p.name.toLowerCase() === name.toLowerCase() && p.tag.toLowerCase() === tag.toLowerCase()
  );
  if (existing) {
    return false; // Already bound
  }
  data.boundPlayers.push({ name, tag, region, discordUserId, lastMatchId: null });
  saveData(data);
  return true;
}

function removeBoundPlayer(name, tag) {
  const data = loadData();
  const index = data.boundPlayers.findIndex(
    (p) => p.name.toLowerCase() === name.toLowerCase() && p.tag.toLowerCase() === tag.toLowerCase()
  );
  if (index === -1) {
    return false; // Not found
  }
  data.boundPlayers.splice(index, 1);
  saveData(data);
  return true;
}

function getBoundPlayers() {
  return loadData().boundPlayers;
}

function updateLastMatchId(name, tag, matchId) {
  const data = loadData();
  const player = data.boundPlayers.find(
    (p) => p.name.toLowerCase() === name.toLowerCase() && p.tag.toLowerCase() === tag.toLowerCase()
  );
  if (player) {
    player.lastMatchId = matchId;
    saveData(data);
  }
}

function setReportChannel(channelId, guildId) {
  const data = loadData();
  data.reportChannelId = channelId;
  data.guildId = guildId;
  saveData(data);
}

function getReportChannel() {
  const data = loadData();
  return { channelId: data.reportChannelId, guildId: data.guildId };
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
};
