const { rankPlayers } = require('./scoring');

// Roasts for the bottom frag (下等马)
const BOTTOM_FRAG_ROASTS = [
  '打成这样还好意思说自己会玩？建议回去打人机练练枪法',
  '你这枪法，建议改玩扫雷',
  '送的人头比外卖还准时',
  '你不是在打游戏，你是在给队友表演什么叫绝望',
  '这KDA，连人机都不忍心打你',
  '建议把鼠标换成方向盘，可能更适合你',
  '对面MVP想给你发感谢信',
  '你妈妈知道你打得这么烂吗？她会哭的',
  '哥们你是不是用脚玩的？不是，用脚都比你强',
  '求求你把游戏卸了吧，显卡都替你尴尬',
  '你这操作我奶奶看了都说卧槽',
  '你的技术配不上你的皮肤，退款吧兄弟',
  '你是来给队友坐牢的吗？无期徒刑那种',
  '这游戏白送你都亏了，浪费电',
  '你是传说中的活靶子？对面练枪专用？',
  '队友看你的眼神，就像看拉了屎没冲的室友',
  '你打的不是瓦，是我的血压',
  '你是对面的亲儿子吧？送得太感人了',
  '建议你把手剁了，至少不会拖累队友',
  '你这水平，打输了还会怪队友是吧？',
  '你妈生你的时候是不是把脑子忘在医院了？',
  '恭喜你成功让四个队友团结起来骂你',
  '你这KD比我的银行卡余额还惨',
  '你不是菜，你是整个菜市场',
];

// Praises for the top frag (上等马)
const TOP_FRAG_PRAISES = [
  '对面看到你的ID都想投降',
  '这波操作直接送对面回家吃饭',
  '你的枪法让对面怀疑人生',
  '卧槽你是开了还是天才？反正牛逼',
  '你这水平应该去打职业，别在这虐菜了',
  '你是队友的爸爸，对面的噩梦',
  '牛逼到我想给你生孩子',
  '对面看你的击杀回放估计在砸键盘',
  '你一个人carry四个爹，辛苦了',
  '你的队友不配跟你同一个段位',
  '你是来上班的吧？太职业了',
  '这把你是故意让着队友对吧？不然更夸张',
  '你是队友的亲妈妈，每局都在养家',
  '你这操作，敌人死的时候肯定在骂娘',
  '巨tm牛逼，没别的说的',
  '质感公司感谢你',
];

// Map names in Chinese
const MAP_NAMES = {
  'Ascent': '亚海悬城',
  'Bind': '绑点',
  'Haven': '避风港',
  'Split': '裂变峡谷',
  'Icebox': '冰箱',
  'Breeze': '微风',
  'Fracture': '裂痕',
  'Pearl': '珍珠',
  'Lotus': '莲花',
  'Sunset': '日落',
  'Abyss': '深渊',
};

// Funny/trendy Chinese agent names
const AGENT_NAMES = {
  'Jett': '风骚韩国女人',
  'Phoenix': '火男（韩只会打火男）',
  'Sage': '双C cup 奶妈',
  'Sova': '俄国大叔',
  'Viper': '猴一奥',
  'Cypher': '偷窥狂',
  'Brimstone': '硫磺队长',
  'Omen': '阴道人老龙',
  'Breach': '壮汉',
  'Raze': '炸逼',
  'Reyna': '吸血鬼小憨憨',
  'Killjoy': '德国工程师',
  'Skye': '澳洲狗妈',
  'Yoru': '日本混混',
  'Astra': '宇宙大脑',
  'KAY/O': '机器人',
  'Chamber': '商总',
  'Neon': '电耗子',
  'Fade': '土耳其恶女',
  'Harbor': '水男',
  'Gekko': '宠物男',
  'Deadlock': '捕兽夹',
  'Iso': '中国帅哥',
  'Clove': '苏格兰人',
  'Vyse': '机械女',
  'Tejo': '炮弹哥',
  'Waylay': '陷阱哥',
};

/**
 * Get a random item from array
 */
function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Get funny Chinese agent name
 */
function getAgentName(englishName) {
  return AGENT_NAMES[englishName] || englishName;
}

/**
 * Generate match summary in Chinese
 * @param {Object} match - Match data from API
 * @param {string} targetPlayer - Name of the player we're focusing on
 * @returns {string} Formatted summary
 */
function generateSummary(match, targetPlayer) {
  const metadata = match.metadata || {};
  const players = match.players?.all_players || [];
  const teams = match.teams || {};

  if (players.length === 0) {
    return '无法获取比赛数据';
  }

  // Find target player's team
  const target = players.find(p =>
    p.name.toLowerCase() === targetPlayer.toLowerCase()
  );
  const targetTeam = target?.team?.toLowerCase() || 'red';

  // Get team results
  const redTeam = teams.red || {};
  const blueTeam = teams.blue || {};
  const targetTeamData = targetTeam === 'red' ? redTeam : blueTeam;
  const enemyTeamData = targetTeam === 'red' ? blueTeam : redTeam;

  const won = targetTeamData.has_won;
  const teamScore = targetTeamData.rounds_won || 0;
  const enemyScore = enemyTeamData.rounds_won || 0;

  // Filter to target's team only
  const teamPlayers = players.filter(p => p.team?.toLowerCase() === targetTeam);
  const rankedPlayers = rankPlayers(teamPlayers);

  const mvp = rankedPlayers[0];
  const bottomFrag = rankedPlayers[rankedPlayers.length - 1];

  // Map name
  const mapName = MAP_NAMES[metadata.map] || metadata.map || '未知地图';

  // Build summary
  let summary = '';

  // Header
  summary += `【瓦罗兰特 赛后评分】${target?.name || targetPlayer}#${target?.tag || '???'}\n`;
  summary += `━━━━━━━━━━━━━━━━━━━━\n`;

  // Result
  summary += `📢 结果: ${won ? '✨ 胜利！' : '😞 失败...'}\n`;
  summary += `🗺️ 地图: ${mapName}\n`;
  summary += `📊 比分: ${teamScore} - ${enemyScore}\n`;
  summary += `━━━━━━━━━━━━━━━━━━━━\n`;

  // MVP and Bottom frag highlight
  summary += `🏆 上等马: ${mvp.name} (${getAgentName(mvp.agent)}) - 总分: ${mvp.scoreData.total.toFixed(1)}\n`;
  summary += `💩 下等马: ${bottomFrag.name} (${getAgentName(bottomFrag.agent)}) - 总分: ${bottomFrag.scoreData.total.toFixed(1)}\n`;
  summary += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Each player's stats
  for (const player of rankedPlayers) {
    const { breakdown } = player.scoreData;
    const isMvp = player.name === mvp.name;
    const isBottom = player.name === bottomFrag.name;

    const icon = isMvp ? '👑' : isBottom ? '💀' : '🎮';
    summary += `${icon} ${player.name} (${getAgentName(player.agent)})\n`;
    summary += `总得分: ${player.scoreData.total.toFixed(1)}\n`;
    summary += `⚔️ 击杀: ${breakdown.kills.count}, 得分 ${breakdown.kills.score}\n`;
    summary += `🎯 助攻: ${breakdown.assists.count}, 得分 ${breakdown.assists.score}\n`;
    summary += `💀 死亡: ${breakdown.deaths.count}, 扣分 ${breakdown.deaths.score}\n`;
    summary += `💥 伤害: ${breakdown.damage.amount}, 得分 ${breakdown.damage.score}\n`;
    summary += `🎯 爆头率: ${breakdown.headshots.percent}%, 得分 ${breakdown.headshots.score}\n`;
    summary += `\n`;
  }

  // Roast/Praise section
  summary += `━━━━━━━━━━━━━━━━━━━━\n`;
  summary += `💬 点评\n`;
  summary += `🏆 ${mvp.name}: ${randomItem(TOP_FRAG_PRAISES)}\n`;
  summary += `💩 ${bottomFrag.name}: ${randomItem(BOTTOM_FRAG_ROASTS)}\n`;

  return summary;
}

module.exports = {
  generateSummary,
  BOTTOM_FRAG_ROASTS,
  TOP_FRAG_PRAISES,
  AGENT_NAMES,
  getAgentName,
  MAP_NAMES,
  randomItem,
};
