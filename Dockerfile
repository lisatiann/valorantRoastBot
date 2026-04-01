FROM node:20-slim

# Install dependencies for audio processing and edge-tts
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install edge-tts
RUN pip3 install edge-tts --break-system-packages

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node dependencies
RUN npm ci --only=production

# Copy app source
COPY . .

# Create data directory for persistence
RUN mkdir -p /app/data

# Start the bot
CMD ["node", "src/index.js"]
