# syntax=docker/dockerfile:1

# --- Build Stage ---
FROM node:22-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- Production Stage ---
FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
# Create tokens directory
RUN mkdir -p /app/tokens && chown -R node:node /app/tokens
USER node
EXPOSE 3003
CMD ["node", "dist/index.js"]
