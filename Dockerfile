FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig*.json ./
COPY src ./src
RUN npm run build

ENV NODE_ENV=production

CMD ["npm", "run", "start:prod"]
