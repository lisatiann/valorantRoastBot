const { createClient } = require('redis');

// Redis client - will be initialized on first use
let redisClient = null;
let isConnected = false;
let connectionAttempted = false;
let errorLogged = false;

// In-memory cache for when Redis is unavailable (development fallback)
let memoryCache = {
  guilds: {},
};

async function getClient() {
  // Already connected
  if (redisClient && isConnected) {
    return redisClient;
  }

  // Already tried and failed - use memory fallback silently
  if (connectionAttempted && !isConnected) {
    return null;
  }

  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    if (!errorLogged) {
      console.log('REDIS_URL not set, using in-memory storage (data will not persist across restarts)');
      errorLogged = true;
    }
    return null;
  }

  connectionAttempted = true;

  try {
    redisClient = createClient({ url: redisUrl });

    // Only log errors once
    redisClient.on('error', (err) => {
      if (!errorLogged) {
        console.warn('Redis unavailable, using in-memory fallback:', err.code || err.message);
        errorLogged = true;
      }
      isConnected = false;
    });

    redisClient.on('connect', () => {
      console.log('Connected to Redis');
      isConnected = true;
    });

    await redisClient.connect();
    return redisClient;
  } catch (error) {
    if (!errorLogged) {
      console.warn('Redis unavailable, using in-memory fallback:', error.code || error.message);
      errorLogged = true;
    }
    return null;
  }
}

async function loadData() {
  const client = await getClient();

  if (!client) {
    return { ...memoryCache };
  }

  try {
    const data = await client.get('valorant_bot_data');
    if (data) {
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Failed to load data from Redis:', error.message);
    return { ...memoryCache };
  }

  return { guilds: {} };
}

async function saveData(data) {
  const client = await getClient();

  if (!client) {
    // Fallback to memory
    memoryCache = { ...data };
    return;
  }

  try {
    await client.set('valorant_bot_data', JSON.stringify(data));
  } catch (error) {
    console.error('Failed to save data to Redis:', error.message);
    // Also save to memory as backup
    memoryCache = { ...data };
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

async function addBoundPlayer(guildId, name, tag, region, discordUserId) {
  const data = await loadData();
  const guild = ensureGuild(data, guildId);

  const existing = guild.boundPlayers.find(
    (p) => p.name.toLowerCase() === name.toLowerCase() && p.tag.toLowerCase() === tag.toLowerCase()
  );
  if (existing) {
    return false; // Already bound
  }
  guild.boundPlayers.push({ name, tag, region, discordUserId, lastMatchId: null });
  await saveData(data);
  return true;
}

async function removeBoundPlayer(guildId, name, tag) {
  const data = await loadData();
  const guild = ensureGuild(data, guildId);

  const index = guild.boundPlayers.findIndex(
    (p) => p.name.toLowerCase() === name.toLowerCase() && p.tag.toLowerCase() === tag.toLowerCase()
  );
  if (index === -1) {
    return false; // Not found
  }
  guild.boundPlayers.splice(index, 1);
  await saveData(data);
  return true;
}

async function getBoundPlayers(guildId) {
  const data = await loadData();
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
  const data = await loadData();
  const guild = data.guilds[guildId];
  if (!guild) return;

  const player = guild.boundPlayers.find(
    (p) => p.name.toLowerCase() === name.toLowerCase() && p.tag.toLowerCase() === tag.toLowerCase()
  );
  if (player) {
    player.lastMatchId = matchId;
    await saveData(data);
  }
}

async function setReportChannel(guildId, channelId) {
  const data = await loadData();
  const guild = ensureGuild(data, guildId);
  guild.reportChannelId = channelId;
  await saveData(data);
}

async function getReportChannel(guildId) {
  const data = await loadData();
  const guild = data.guilds[guildId];
  return guild ? guild.reportChannelId : null;
}

async function getAllGuildsWithReportChannels() {
  const data = await loadData();
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
  getClient,
};
