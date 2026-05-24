# Arquivo principal - aponta pro Dockerfile.backend
FROM node:20-alpine

WORKDIR /app/backend

COPY backend/package.json backend/package-lock.json ./

RUN npm install --production

COPY backend/ ./

COPY data/ ../data/

EXPOSE 4000

CMD ["npm", "start"]
