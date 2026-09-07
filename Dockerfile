FROM node:20-alpine

WORKDIR /app

# 依赖先装（利用层缓存）
COPY package*.json ./
RUN npm install --omit=dev

# 应用代码
COPY . .

RUN mkdir -p /app/data

EXPOSE 8080
CMD ["node", "src/server.js"]
