FROM node:22-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# Remove dev dependencies and source
RUN npm prune --omit=dev
RUN rm -rf src node_modules
RUN npm ci --only=production

EXPOSE 3000

CMD ["node", "dist/index.js"]
