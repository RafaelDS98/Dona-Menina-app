FROM node:20-alpine

WORKDIR /app

COPY backend/package.json ./backend/
COPY backend/package-lock.json ./backend/

RUN cd backend && npm install --production

COPY backend/ ./backend/
COPY data/ ./data/

EXPOSE 4000

WORKDIR /app/backend

CMD ["npm", "start"]
