const { Client, GatewayIntentBits } = require('discord.js');
const {
  joinVoiceChannel,
  getVoiceConnection,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
} = require('@discordjs/voice');
const config = require('./config');
const valorantApi = require('./services/valorantApi');
const dataStore = require('./services/dataStore');
const matchPoller = require('./services/matchPoller');
const { generateSummary } = require('./utils/summaryGenerator');
const { generateVoiceSummary } = require('./utils/voiceSummaryGenerator');
const { generateSpeech, cleanupAudioFile } = require('./services/tts');

// Valid Valorant regions
const VALID_REGIONS = ['na', 'eu', 'ap', 'kr', 'latam', 'br'];

// Create Discord client with required intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// Helper: Send summary to channel and optionally voice (queued)
async function sendMatchReport(channel, guild, match, playerName, voiceChannelId = null) {
  console.log(`[REPORT] Generating summary for ${playerName}...`);
  const { summary, selectedPraise, selectedRoast } = generateSummary(match, playerName);
  console.log(`[REPORT] Summary generated, length: ${summary.length}`);

  // Discord has a 2000 char limit, split if needed
  try {
    if (summary.length > 1900) {
      const parts = summary.match(/[\s\S]{1,1900}/g) || [];
      for (const part of parts) {
        await channel.send(part);
      }
    } else {
      await channel.send(summary);
    }
    console.log('[REPORT] Text summary sent to channel');
  } catch (sendError) {
    console.error('[REPORT] Failed to send text summary:', sendError);
  }

  // If we have a voice channel to report to, queue the voice report
  if (voiceChannelId) {
    console.log(`[REPORT] Voice channel provided: ${voiceChannelId}, generating voice summary...`);
    const voiceText = generateVoiceSummary(match, playerName, selectedPraise, selectedRoast);
    console.log(`[REPORT] Voice text generated: "${voiceText.substring(0, 50)}..."`);
    console.log(`[REPORT] Queueing voice report for channel ${voiceChannelId}`);
    queueVoiceReport(voiceText, guild, voiceChannelId);
  } else {
    console.log('[REPORT] No voice channel provided, skipping voice report');
  }
}

// Helper: Find voice channel for a specific player (by Discord user ID)
async function findVoiceChannelForPlayer(guild, discordUserId) {
  if (!discordUserId) {
    console.log(`[VOICE-FIND] No discordUserId provided, returning null`);
    return null;
  }

  try {
    // Fetch fresh channel data to avoid stale cache
    const channels = await guild.channels.fetch();
    const voiceChannels = [];

    for (const [, channel] of channels) {
      if (channel && channel.isVoiceBased() && channel.members) {
        voiceChannels.push({
          name: channel.name,
          id: channel.id,
          memberIds: Array.from(channel.members.keys()),
        });
        if (channel.members.has(discordUserId)) {
          console.log(`[VOICE-FIND] Found user ${discordUserId} in channel "${channel.name}" (${channel.id})`);
          return channel;
        }
      }
    }

    console.log(`[VOICE-FIND] User ${discordUserId} not found in any voice channel`);
    console.log(`[VOICE-FIND] Available voice channels: ${voiceChannels.map(c => `"${c.name}" (members: ${c.memberIds.join(', ') || 'none'})`).join(', ')}`);
  } catch (error) {
    console.error('[VOICE-FIND] Error fetching channels:', error);
  }
  return null;
}

// Voice report queue to prevent concurrent audio playback
const voiceReportQueue = [];
let isProcessingVoiceQueue = false;

async function processVoiceQueue() {
  if (isProcessingVoiceQueue) {
    console.log('[VOICE-QUEUE] Already processing queue, skipping');
    return;
  }

  if (voiceReportQueue.length === 0) {
    console.log('[VOICE-QUEUE] Queue is empty, nothing to process');
    return;
  }

  console.log(`[VOICE-QUEUE] Starting to process queue (${voiceReportQueue.length} items)`);
  isProcessingVoiceQueue = true;
  const connectedGuildIds = new Set();

  while (voiceReportQueue.length > 0) {
    const { voiceText, guild, voiceChannelId } = voiceReportQueue.shift();
    console.log(`[VOICE-QUEUE] Processing item: guild=${guild.id}, channel=${voiceChannelId}`);
    connectedGuildIds.add(guild.id);

    try {
      // Check if we need to switch voice channels
      let currentConnection = getVoiceConnection(guild.id);
      console.log(`[VOICE-QUEUE] Current connection: ${currentConnection ? `yes, in channel ${currentConnection.joinConfig.channelId}` : 'no'}`);

      if (currentConnection && currentConnection.joinConfig.channelId !== voiceChannelId) {
        console.log(`[VOICE-QUEUE] Switching voice channels from ${currentConnection.joinConfig.channelId} to ${voiceChannelId}`);
        currentConnection.destroy();
        currentConnection = null;
      }

      if (!currentConnection) {
        console.log(`[VOICE-QUEUE] Joining voice channel ${voiceChannelId}...`);
        try {
          currentConnection = joinVoiceChannel({
            channelId: voiceChannelId,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
          });
          console.log(`[VOICE-QUEUE] Successfully joined voice channel ${voiceChannelId}`);
        } catch (joinError) {
          console.error(`[VOICE-QUEUE] Failed to join voice channel ${voiceChannelId}:`, joinError);
          continue;
        }
      }

      console.log(`[VOICE-QUEUE] Generating speech...`);
      const audioPath = await generateSpeech(voiceText);
      console.log(`[VOICE-QUEUE] Audio generated: ${audioPath}`);

      const player = createAudioPlayer();
      const resource = createAudioResource(audioPath);

      console.log(`[VOICE-QUEUE] Subscribing player and starting playback...`);
      currentConnection.subscribe(player);
      player.play(resource);

      // Wait for playback to complete with timeout (30 seconds max)
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          console.warn('[VOICE-QUEUE] Voice playback timed out after 30s');
          cleanupAudioFile(audioPath);
          resolve();
        }, 30000);

        player.on(AudioPlayerStatus.Idle, () => {
          console.log('[VOICE-QUEUE] Playback completed (Idle state)');
          clearTimeout(timeout);
          cleanupAudioFile(audioPath);
          resolve();
        });

        player.on('error', (error) => {
          console.error('[VOICE-QUEUE] Audio player error:', error);
          clearTimeout(timeout);
          cleanupAudioFile(audioPath);
          resolve();
        });
      });

      console.log('[VOICE-QUEUE] Playback finished, small delay before next item...');
      await new Promise((resolve) => setTimeout(resolve, 500));

    } catch (ttsError) {
      console.error('[VOICE-QUEUE] TTS error in queue:', ttsError);
    }
  }

  // Disconnect from ALL guilds we connected to
  console.log(`[VOICE-QUEUE] Queue empty, disconnecting from ${connectedGuildIds.size} guild(s)`);
  for (const guildId of connectedGuildIds) {
    const connection = getVoiceConnection(guildId);
    if (connection) {
      connection.destroy();
      console.log(`[VOICE-QUEUE] Disconnected from voice in guild ${guildId}`);
    }
  }

  isProcessingVoiceQueue = false;
  console.log('[VOICE-QUEUE] Queue processing complete');
}

// Queue a voice report and process
function queueVoiceReport(voiceText, guild, voiceChannelId) {
  console.log(`[VOICE-QUEUE] Adding to queue: guild=${guild.id}, channel=${voiceChannelId}, text="${voiceText.substring(0, 30)}..."`);
  console.log(`[VOICE-QUEUE] Queue size before: ${voiceReportQueue.length}`);
  voiceReportQueue.push({ voiceText, guild, voiceChannelId });
  console.log(`[VOICE-QUEUE] Queue size after: ${voiceReportQueue.length}`);
  processVoiceQueue();
}

// Bot ready event
client.once('ready', () => {
  console.log(`Ready! Logged in as ${client.user.tag}`);

  // Start polling for new matches
  matchPoller.startPolling(async (player, match) => {
    console.log(`New match callback for ${player.name}#${player.tag} in guild ${player.guildId}`);

    // Get report channel for this player's guild
    const guildId = player.guildId;
    const channelId = await dataStore.getReportChannel(guildId);
    if (!channelId) {
      console.log(`No report channel configured for guild ${guildId}, skipping auto-report`);
      return;
    }

    try {
      const guild = await client.guilds.fetch(guildId);
      const channel = await guild.channels.fetch(channelId);

      if (!channel) {
        console.error('Report channel not found');
        return;
      }

      // Check if ANY of the players in the match are in a voice channel
      let voiceChannel = null;
      let voicePlayerName = null;

      const playersToCheck = player.allPlayersInMatch || [player];
      console.log(`Checking voice for players: ${playersToCheck.map(p => `${p.name} (${p.discordUserId})`).join(', ')}`);

      for (const p of playersToCheck) {
        const foundChannel = await findVoiceChannelForPlayer(guild, p.discordUserId);
        console.log(`  ${p.name} (${p.discordUserId}): ${foundChannel ? foundChannel.name : 'not in voice'}`);
        if (foundChannel && !voiceChannel) {
          voiceChannel = foundChannel;
          voicePlayerName = p.name;
        }
      }

      const voiceChannelId = voiceChannel ? voiceChannel.id : null;

      if (voiceChannelId) {
        console.log(`Will join voice channel: ${voiceChannel.name} (found via ${voicePlayerName})`);
      } else {
        console.log(`No players in voice, skipping voice report`);
      }

      await sendMatchReport(channel, guild, match, player.name, voiceChannelId);
    } catch (error) {
      console.error('Error sending auto match report:', error);
    }
  });
});

// Note: Removed auto-join on voiceStateUpdate - bot now only joins when there's a match to report

// Message handler
client.on('messageCreate', async (message) => {
  // Ignore bot messages
  if (message.author.bot) return;

  // Ignore DMs - commands only work in guilds
  if (!message.guild) return;

  // Test command - responds in Chinese
  if (message.content === '^test') {
    await message.reply('你好！这是一个测试消息。');
  }

  // Join voice channel command
  if (message.content === '^join') {
    const voiceChannel = message.member?.voice.channel;
    if (!voiceChannel) {
      await message.reply('你需要先加入一个语音频道！');
      return;
    }

    joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: message.guild.id,
      adapterCreator: message.guild.voiceAdapterCreator,
    });

    await message.reply(`已加入语音频道: ${voiceChannel.name}`);
  }

  // Leave voice channel command
  if (message.content === '^leave') {
    const connection = getVoiceConnection(message.guild.id);
    if (!connection) {
      await message.reply('我不在任何语音频道中！');
      return;
    }

    connection.destroy();
    await message.reply('已离开语音频道！');
  }

  // Bind player command: ^bind PlayerName#TAG region
  if (message.content.startsWith('^bind ')) {
    const args = message.content.slice('^bind '.length).trim();
    const hashIndex = args.indexOf('#');

    if (hashIndex === -1) {
      await message.reply('格式错误！请使用: `^bind 玩家名#TAG 地区`\n例如: `^bind TenZ#0505 na`');
      return;
    }

    const name = args.slice(0, hashIndex).trim();
    const rest = args.slice(hashIndex + 1).split(' ');
    const tag = rest[0].trim();
    const region = (rest[1] || 'na').toLowerCase();

    if (!name || !tag) {
      await message.reply('格式错误！玩家名和TAG不能为空。\n例如: `^bind TenZ#0505 na`');
      return;
    }

    if (!VALID_REGIONS.includes(region)) {
      await message.reply(`无效地区！可用地区: ${VALID_REGIONS.join(', ')}`);
      return;
    }

    // Verify player exists before binding
    await message.reply(`正在验证玩家 ${name}#${tag}...`);
    try {
      const matchData = await valorantApi.getMatches(region, name, tag);
      if (!matchData.data) {
        await message.reply(`未找到玩家 ${name}#${tag}，请检查玩家名、TAG和地区是否正确。`);
        return;
      }
    } catch (error) {
      await message.reply(`验证玩家失败: ${error.message}\n请检查玩家名、TAG和地区是否正确。`);
      return;
    }

    const added = await dataStore.addBoundPlayer(message.guild.id, name, tag, region, message.author.id);
    if (added) {
      await message.reply(`已绑定玩家: ${name}#${tag} (${region})\n机器人将自动追踪该玩家的比赛。`);
    } else {
      await message.reply(`玩家 ${name}#${tag} 已经被绑定了！`);
    }
  }

  // Unbind player command: ^unbind PlayerName#TAG
  if (message.content.startsWith('^unbind ')) {
    const args = message.content.slice('^unbind '.length).trim();
    const hashIndex = args.indexOf('#');

    if (hashIndex === -1) {
      await message.reply('格式错误！请使用: `^unbind 玩家名#TAG`\n例如: `^unbind TenZ#0505`');
      return;
    }

    const name = args.slice(0, hashIndex);
    const tag = args.slice(hashIndex + 1).trim();

    const removed = await dataStore.removeBoundPlayer(message.guild.id, name, tag);
    if (removed) {
      await message.reply(`已解绑玩家: ${name}#${tag}`);
    } else {
      await message.reply(`未找到绑定的玩家: ${name}#${tag}`);
    }
  }

  // Set report channel command: ^setchannel
  if (message.content === '^setchannel') {
    await dataStore.setReportChannel(message.guild.id, message.channel.id);
    await message.reply(`已设置当前频道为报告频道！所有自动比赛报告将发送到这里。`);
  }

  // List bindings command: ^listbinds
  if (message.content === '^listbinds') {
    const players = await dataStore.getBoundPlayers(message.guild.id);
    const channelId = await dataStore.getReportChannel(message.guild.id);

    let response = '**当前配置:**\n\n';

    if (players.length === 0) {
      response += '绑定玩家: 无\n';
    } else {
      response += '**绑定玩家:**\n';
      players.forEach((p, i) => {
        response += `${i + 1}. ${p.name}#${p.tag} (${p.region})\n`;
      });
    }

    response += '\n';
    if (channelId) {
      response += `**报告频道:** <#${channelId}>`;
    } else {
      response += '**报告频道:** 未设置 (使用 `^setchannel` 设置)';
    }

    await message.reply(response);
  }

  // Valorant match summary command
  // Format: ^val PlayerName#TAG region
  if (message.content.startsWith('^val ')) {
    const args = message.content.slice('^val '.length).trim();

    // Parse: "PlayerName#TAG region"
    const hashIndex = args.indexOf('#');
    if (hashIndex === -1) {
      await message.reply('格式错误！请使用: `^val 玩家名#TAG 地区`\n例如: `^val alcoholicboba#42069 na`');
      return;
    }

    const name = args.slice(0, hashIndex).trim();
    const rest = args.slice(hashIndex + 1).split(' ');
    const tag = rest[0].trim();
    const region = (rest[1] || 'na').toLowerCase();

    if (!name || !tag) {
      await message.reply('格式错误！玩家名和TAG不能为空。\n例如: `^val alcoholicboba#42069 na`');
      return;
    }

    if (!VALID_REGIONS.includes(region)) {
      await message.reply(`无效地区！可用地区: ${VALID_REGIONS.join(', ')}`);
      return;
    }

    await message.reply(`正在获取 ${name}#${tag} 的最近比赛数据...`);

    try {
      const matchData = await valorantApi.getMatches(region, name, tag);

      if (!matchData.data || matchData.data.length === 0) {
        await message.reply('未找到该玩家的比赛记录！');
        return;
      }

      // Get the most recent match
      const latestMatch = matchData.data[0];

      // Check if user is in a voice channel for voice report
      const userVoiceChannel = message.member?.voice.channel;
      const voiceChannelId = userVoiceChannel ? userVoiceChannel.id : null;

      await sendMatchReport(message.channel, message.guild, latestMatch, name, voiceChannelId);
    } catch (error) {
      console.error('Valorant API error:', error);
      await message.reply(`获取数据失败: ${error.message}`);
    }
  }
});

// Login to Discord
client.login(config.token);
