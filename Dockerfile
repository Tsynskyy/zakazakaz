# Build
FROM node:22-alpine AS build

WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY openapi/ ./openapi/
COPY src/ ./src/
RUN npm run build

# Production
FROM node:22-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY openapi/ ./openapi/

EXPOSE 3220
CMD ["node", "dist/index.js"]
