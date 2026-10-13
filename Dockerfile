# Production Dockerfile for KOT Music (Node.js + Python 3 + yt-dlp)
FROM node:20-slim

# Install system dependencies: Python3, pip, ffmpeg, curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    ffmpeg \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install latest yt-dlp
RUN pip3 install --no-cache-dir --break-system-packages yt-dlp || pip3 install --no-cache-dir yt-dlp

# Set app directory
WORKDIR /app

# Install npm packages
COPY package*.json ./
RUN npm install --omit=dev

# Copy app code
COPY . .

# Environment configuration
ENV NODE_ENV=production
ENV PORT=3000
ENV PYTHON_CMD=python3

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "server.js"]
