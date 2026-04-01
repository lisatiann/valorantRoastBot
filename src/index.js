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

// Bot ready event
client.once('ready', () => {
  console.log(`Ready! Logged in as ${client.user.tag}`);
});

// Message handler
client.on('messageCreate', async (message) => {
  // Ignore bot messages
  if (message.author.bot) return;

  // Test command - responds in Chinese
  if (message.content === '!test') {
    await message.reply('你好！这是一个测试消息。');
  }

  // Join voice channel command
  if (message.content === '!join') {
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
  if (message.content === '!leave') {
    const connection = getVoiceConnection(message.guild.id);
    if (!connection) {
      await message.reply('我不在任何语音频道中！');
      return;
    }

    connection.destroy();
    await message.reply('已离开语音频道！');
  }

  // Valorant match summary command
  // Format: !valorant PlayerName#TAG region
  if (message.content.startsWith('!valorant ')) {
    const args = message.content.slice('!valorant '.length).trim();

    // Parse: "PlayerName#TAG region"
    const hashIndex = args.indexOf('#');
    if (hashIndex === -1) {
      await message.reply('格式错误！请使用: `!valorant 玩家名#TAG 地区`\n例如: `!valorant TenZ#0505 na`');
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

    await message.reply(`正在获取 ${name}#${tag} 的最近比赛数据...`);

    try {
      const matchData = await valorantApi.getMatches(region, name, tag);

      if (!matchData.data || matchData.data.length === 0) {
        await message.reply('未找到该玩家的比赛记录！');
        return;
      }

      // Get the most recent match
      const latestMatch = matchData.data[0];
      const summary = generateSummary(latestMatch, name);

      // Discord has a 2000 char limit, split if needed
      if (summary.length > 1900) {
        const parts = summary.match(/[\s\S]{1,1900}/g) || [];
        for (const part of parts) {
          await message.channel.send(part);
        }
      } else {
        await message.channel.send(summary);
      }

      // If bot is in voice channel, also speak the summary
      const connection = getVoiceConnection(message.guild.id);
      if (connection) {
        try {
          const voiceText = generateVoiceSummary(latestMatch, name);
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
    } catch (error) {
      console.error('Valorant API error:', error);
      await message.reply(`获取数据失败: ${error.message}`);
    }
  }
});

// Login to Discord
client.login(config.token);
