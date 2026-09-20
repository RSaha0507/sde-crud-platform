FROM node:22-bookworm-slim

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY server.js ./
COPY .env.example ./

ENV NODE_ENV=production
ENV PORT=4000
ENV DB_FILE=/data/data.db
ENV MODELS_DIR=/data/models-json
EXPOSE 4000

VOLUME ["/data"]
USER node
CMD ["node", "server.js"]
