FROM node:22-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY src/ src/
COPY tsconfig.json ./
RUN npx tsup src/index.ts --format esm --target node18

FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist/ dist/
COPY data/ data/
COPY bin/ bin/
ENV MCP_TRANSPORT=http
EXPOSE 3000
CMD ["node", "dist/index.js"]
