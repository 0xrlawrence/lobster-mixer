FROM node:22-alpine

WORKDIR /app

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --production

# Copy application files
COPY . .

# Expose health check port
EXPOSE 3000

# Run orchestrator
CMD ["node", "orchestrator-batch.js"]
