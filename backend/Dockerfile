FROM node:20-alpine AS base

# wget is needed for the Docker health check
RUN apk add --no-cache python3 make g++ wget

WORKDIR /app

COPY package*.json ./
RUN npm install --only=production

COPY src ./src

RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup && \
    mkdir -p /app/data && \
    chown -R appuser:appgroup /app

USER appuser

EXPOSE 3001

CMD ["node", "src/index.js"]
