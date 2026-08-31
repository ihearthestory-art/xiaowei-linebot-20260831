# 部署映像：Node 24（node:sqlite 免旗標可用），資料放 /app/data。
# 平台若有 volume，掛到 /app/data 才能保住 SQLite；沒掛就是每次部署重置。
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund
COPY src ./src
COPY assets ./assets
RUN mkdir -p /app/data
ENV DATA_DIR=/app/data
EXPOSE 3000
# --no-warnings 用來壓掉 node:sqlite 的 ExperimentalWarning
CMD ["node", "--no-warnings", "src/server.js"]
