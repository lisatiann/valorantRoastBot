const axios = require('axios');
const config = require('../config');

const BASE_URL = 'https://api.henrikdev.xyz';

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Authorization': config.henrikApiKey,
  },
});

/**
 * Get recent matches for a player
 * @param {string} region - Region code (na, eu, ap, kr, latam, br)
 * @param {string} name - Player name
 * @param {string} tag - Player tag
 * @returns {Promise<Object>} Match data
 */
async function getMatches(region, name, tag) {
  try {
    const response = await api.get(`/valorant/v3/matches/${region}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`);
    return response.data;
  } catch (error) {
    if (error.response) {
      throw new Error(`API Error: ${error.response.status} - ${error.response.data?.message || 'Unknown error'}`);
    }
    throw error;
  }
}

/**
 * Get account info for a player
 * @param {string} name - Player name
 * @param {string} tag - Player tag
 * @returns {Promise<Object>} Account data
 */
async function getAccount(name, tag) {
  try {
    const response = await api.get(`/valorant/v1/account/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`);
    return response.data;
  } catch (error) {
    if (error.response) {
      throw new Error(`API Error: ${error.response.status} - ${error.response.data?.message || 'Unknown error'}`);
    }
    throw error;
  }
}

module.exports = {
  getMatches,
  getAccount,
};
