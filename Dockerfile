# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
ENV VITE_API_URL=/api
RUN npm run build

# Stage 2: Backend + frontend (Alpine 3.18 has openssl1.1-compat; 3.19+ removed it)
FROM node:20-alpine3.18

RUN apk add --no-cache openssl1.1-compat

# Timezone
RUN apk --update add tzdata && \
    cp /usr/share/zoneinfo/Asia/Bangkok /etc/localtime && \
    echo "Asia/Bangkok" > /etc/timezone && \
    apk del tzdata

WORKDIR /home/node/app

# Copy backend
COPY backend/ ./
COPY process.yml ./

# Copy built frontend to www
COPY --from=frontend-builder /app/frontend/dist ./www

# Install deps and PM2
RUN npm ci --omit=dev && \
    npm install -g pm2

EXPOSE 3001

# Run DB migrations then start app
CMD ["sh", "-c", "node src/migrations/run.js up && pm2-runtime process.yml"]