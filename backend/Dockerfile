# Shared image for the API, both Kafka consumers, and the cron job — they
# differ only in which command they run (see docker-compose.yml), not in
# what's built here. Don't build separate images per process.
FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Production mode: logger.js skips the pino-pretty transport in this mode
# (see utils/logger.js), which matters because pino-pretty is a
# devDependency and isn't installed by `npm ci --omit=dev` above — running
# without NODE_ENV=production here would crash trying to load it.
ENV NODE_ENV=production

EXPOSE 3001

CMD ["npm", "start"]
