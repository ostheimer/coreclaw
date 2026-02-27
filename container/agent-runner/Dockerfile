FROM node:22-alpine AS base

WORKDIR /app

# Install only production dependencies
COPY package.json ./
RUN npm install --omit=dev --ignore-scripts

FROM node:22-alpine AS runner

# Non-root user for security
RUN addgroup -g 1001 -S agentgroup && \
    adduser -u 1001 -S agentuser -G agentgroup

WORKDIR /app

COPY --from=base /app/node_modules ./node_modules
COPY container/agent-runner/agent.ts ./agent.ts
COPY src/types.ts ./src/types.ts
COPY tsconfig.json ./

# Compile TypeScript
RUN npm install --save-dev typescript tsx && \
    npx tsc --noEmit || true

USER agentuser

ENTRYPOINT ["node", "--import", "tsx/esm", "agent.ts"]
