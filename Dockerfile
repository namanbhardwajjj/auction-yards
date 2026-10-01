FROM node:20-slim

WORKDIR /app

# Install build essentials for native better-sqlite3 compilation
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 4000
ENV NODE_ENV=production
ENV PORT=4000

CMD ["npm", "start"]
