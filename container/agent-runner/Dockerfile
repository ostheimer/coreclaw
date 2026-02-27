FROM node:22-alpine AS base

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --ignore-scripts

FROM node:22-alpine AS runner

RUN addgroup -g 1001 -S agentgroup && \
    adduser -u 1001 -S agentuser -G agentgroup

WORKDIR /app

COPY --from=base /app/node_modules ./node_modules
COPY agent.ts ./agent.ts

RUN npm install --save-dev tsx && \
    mkdir -p /workspace/ipc/input /workspace/ipc/output && \
    chown -R agentuser:agentgroup /workspace

USER agentuser

# Agent reads ContainerInput from stdin, writes output with sentinel markers to stdout
ENTRYPOINT ["npx", "tsx", "agent.ts"]
