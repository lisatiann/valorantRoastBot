const { exec } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const util = require('util');

const execPromise = util.promisify(exec);

// Path to edge-tts CLI - use env var for production, fallback for local dev
const EDGE_TTS_PATH = process.env.EDGE_TTS_PATH || '/Users/lisaespresso/Library/Python/3.14/bin/edge-tts';

// Chinese voice options
const VOICES = {
  male: 'zh-CN-YunjianNeural',
  female: 'zh-CN-XiaoxiaoNeural',
};

/**
 * Generate speech audio from Chinese text using Edge TTS CLI
 * @param {string} text - Chinese text to speak
 * @param {string} voiceType - 'male' or 'female' (default: male)
 * @returns {Promise<string>} Path to generated audio file
 */
async function generateSpeech(text, voiceType = 'male') {
  const voice = VOICES[voiceType] || VOICES.male;
  const tempFile = path.join(os.tmpdir(), `tts_${Date.now()}.mp3`);

  // Escape quotes in text for shell
  const escapedText = text.replace(/"/g, '\\"');

  const command = `"${EDGE_TTS_PATH}" --voice "${voice}" --rate=+20% --text "${escapedText}" --write-media "${tempFile}"`;

  try {
    await execPromise(command);
    return tempFile;
  } catch (error) {
    console.error('Edge TTS error:', error);
    throw error;
  }
}

/**
 * Clean up temporary audio file
 * @param {string} filePath - Path to file to delete
 */
function cleanupAudioFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error('Failed to cleanup audio file:', error);
  }
}

module.exports = {
  generateSpeech,
  cleanupAudioFile,
  VOICES,
};
