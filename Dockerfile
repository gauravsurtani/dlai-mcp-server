FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY dist/ dist/
COPY data/ data/
COPY bin/ bin/
ENV MCP_TRANSPORT=http
EXPOSE 3000
CMD ["node", "dist/index.js"]
