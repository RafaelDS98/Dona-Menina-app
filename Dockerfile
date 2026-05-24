FROM node:20-alpine

WORKDIR /app

# Copia tudo
COPY "Dona Menina v1.3/backend/package.json" "Dona Menina v1.3/backend/package-lock.json" ./backend/

RUN cd backend && npm install --production

COPY "Dona Menina v1.3/backend/" ./backend/

COPY "Dona Menina v1.3/data/" ./data/

EXPOSE 4000

WORKDIR /app/backend

CMD ["npm", "start"]
