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

// Helper: Send summary to channel and optionally voice
async function sendMatchReport(channel, guild, match, playerName) {
  const { summary, selectedPraise, selectedRoast } = generateSummary(match, playerName);

  // Discord has a 2000 char limit, split if needed
  if (summary.length > 1900) {
    const parts = summary.match(/[\s\S]{1,1900}/g) || [];
    for (const part of parts) {
      await channel.send(part);
    }
  } else {
    await channel.send(summary);
  }

  // If bot is in voice channel, also speak the summary
  const connection = getVoiceConnection(guild.id);
  if (connection) {
    try {
      const voiceText = generateVoiceSummary(match, playerName, selectedPraise, selectedRoast);
      console.log('Generating TTS for:', voiceText);

      const audioPath = await generateSpeech(voiceText);
      console.log('Audio generated:', audioPath);

      const player = createAudioPlayer();
      const resource = createAudioResource(audioPath);

      connection.subscribe(player);
      player.play(resource);

      player.on(AudioPlayerStatus.Idle, () => {
        cleanupAudioFile(audioPath);
        connection.destroy();
      });

      player.on('error', (error) => {
        console.error('Audio player error:', error);
        cleanupAudioFile(audioPath);
      });
    } catch (ttsError) {
      console.error('TTS error:', ttsError);
    }
  }
}

// Helper: Find voice channel with bound player
function findVoiceChannelWithBoundPlayer(guild) {
  const boundPlayers = dataStore.getBoundPlayers();
  const boundDiscordIds = boundPlayers.map((p) => p.discordUserId).filter(Boolean);

  for (const [, channel] of guild.channels.cache) {
    if (channel.isVoiceBased() && channel.members) {
      for (const [memberId] of channel.members) {
        if (boundDiscordIds.includes(memberId)) {
          return channel;
        }
      }
    }
  }
  return null;
}

// Bot ready event
client.once('ready', () => {
  console.log(`Ready! Logged in as ${client.user.tag}`);

  // Start polling for new matches
  matchPoller.startPolling(async (player, match) => {
    console.log(`New match callback for ${player.name}#${player.tag}`);

    const { channelId, guildId } = dataStore.getReportChannel();
    if (!channelId || !guildId) {
      console.log('No report channel configured, skipping auto-report');
      return;
    }

    try {
      const guild = await client.guilds.fetch(guildId);
      const channel = await guild.channels.fetch(channelId);

      if (!channel) {
        console.error('Report channel not found');
        return;
      }

      // Check if a bound player is in a voice channel, auto-join if so
      const voiceChannel = findVoiceChannelWithBoundPlayer(guild);
      if (voiceChannel) {
        const existingConnection = getVoiceConnection(guild.id);
        if (!existingConnection) {
          joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
          });
          console.log(`Auto-joined voice channel: ${voiceChannel.name}`);
        }
      }

      await sendMatchReport(channel, guild, match, player.name);
    } catch (error) {
      console.error('Error sending auto match report:', error);
    }
  });
});

// Voice state update - auto-join when bound player joins voice
client.on('voiceStateUpdate', (oldState, newState) => {
  // Player joined a voice channel
  if (!oldState.channel && newState.channel) {
    const boundPlayers = dataStore.getBoundPlayers();
    const isBoundPlayer = boundPlayers.some((p) => p.discordUserId === newState.id);

    if (isBoundPlayer) {
      const existingConnection = getVoiceConnection(newState.guild.id);
      if (!existingConnection) {
        joinVoiceChannel({
          channelId: newState.channel.id,
          guildId: newState.guild.id,
          adapterCreator: newState.guild.voiceAdapterCreator,
        });
        console.log(`Auto-joined voice channel for bound player: ${newState.channel.name}`);
      }
    }
  }
});

// Message handler
client.on('messageCreate', async (message) => {
  // Ignore bot messages
  if (message.author.bot) return;

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

    const name = args.slice(0, hashIndex);
    const rest = args.slice(hashIndex + 1).split(' ');
    const tag = rest[0];
    const region = (rest[1] || 'ap').toLowerCase();

    if (!VALID_REGIONS.includes(region)) {
      await message.reply(`无效地区！可用地区: ${VALID_REGIONS.join(', ')}`);
      return;
    }

    const added = dataStore.addBoundPlayer(name, tag, region, message.author.id);
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

    const removed = dataStore.removeBoundPlayer(name, tag);
    if (removed) {
      await message.reply(`已解绑玩家: ${name}#${tag}`);
    } else {
      await message.reply(`未找到绑定的玩家: ${name}#${tag}`);
    }
  }

  // Set report channel command: ^setchannel
  if (message.content === '^setchannel') {
    dataStore.setReportChannel(message.channel.id, message.guild.id);
    await message.reply(`已设置当前频道为报告频道！所有自动比赛报告将发送到这里。`);
  }

  // List bindings command: ^listbinds
  if (message.content === '^listbinds') {
    const players = dataStore.getBoundPlayers();
    const { channelId } = dataStore.getReportChannel();

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

    const name = args.slice(0, hashIndex);
    const rest = args.slice(hashIndex + 1).split(' ');
    const tag = rest[0];
    const region = (rest[1] || 'na').toLowerCase();

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
      await sendMatchReport(message.channel, message.guild, latestMatch, name);
    } catch (error) {
      console.error('Valorant API error:', error);
      await message.reply(`获取数据失败: ${error.message}`);
    }
  }
});

// Login to Discord
client.login(config.token);
