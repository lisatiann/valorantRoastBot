require('dotenv').config();

const config = {
  token: process.env.DISCORD_TOKEN,
  henrikApiKey: process.env.HENRIK_API_KEY,
};

// Validate required environment variables
if (!config.token) {
  console.error('Error: DISCORD_TOKEN is required in .env file');
  process.exit(1);
}

module.exports = config;
