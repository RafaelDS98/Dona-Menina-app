FROM node:20-alpine

WORKDIR /app/backend

COPY backend/package.json backend/package-lock.json* ./

RUN npm install --production

COPY backend/ ./

EXPOSE 4000

CMD ["npm", "start"]
