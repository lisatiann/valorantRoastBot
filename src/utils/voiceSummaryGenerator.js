const { rankPlayers } = require('./scoring');
const {
  AGENT_NAMES,
  getAgentName,
  MAP_NAMES,
  TOP_FRAG_PRAISES,
  BOTTOM_FRAG_ROASTS,
  randomItem,
} = require('./summaryGenerator');

/**
 * Generate a short voice summary for TTS
 * @param {Object} match - Match data from API
 * @param {string} targetPlayer - Name of the player we're focusing on
 * @returns {string} Short Chinese summary for voice
 */
function generateVoiceSummary(match, targetPlayer) {
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

  // Build short voice summary
  let voice = '';

  // Opening - result announcement
  const playerName = target?.name || targetPlayer;
  if (won) {
    voice += `${playerName}的瓦罗兰特对局刚刚结束，大胜而归！${teamScore}比${enemyScore}，在${mapName}取得胜利。`;
  } else {
    voice += `${playerName}的瓦罗兰特对局刚刚结束，被打的屁滚尿流。${teamScore}比${enemyScore}惜败于${mapName}。`;
  }

  // MVP highlight
  const mvpKills = mvp.stats?.kills || 0;
  const mvpAgent = getAgentName(mvp.agent);
  voice += `本局上等马是${mvp.name}，用${mvpAgent}拿下${mvpKills}个人头。${randomItem(TOP_FRAG_PRAISES)}。`;

  // Bottom frag roast
  const bottomKills = bottomFrag.stats?.kills || 0;
  const bottomDeaths = bottomFrag.stats?.deaths || 0;
  const bottomAgent = getAgentName(bottomFrag.agent);
  voice += `下等马是${bottomFrag.name}，用${bottomAgent}只拿了${bottomKills}个人头，死了${bottomDeaths}次。${randomItem(BOTTOM_FRAG_ROASTS)}`;

  return voice;
}

module.exports = {
  generateVoiceSummary,
};
