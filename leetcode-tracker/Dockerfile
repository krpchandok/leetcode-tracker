# Multi-stage: build the static assets with Node, then serve them with
# nginx — the final image ships no Node/npm at all.
FROM node:20-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Vite bakes VITE_* values into the built JS at build time, not read at
# container runtime — this must be reachable from the *browser*, not from
# inside the compose network, so it's the backend's published host port,
# not the backend's service name (the browser can't resolve compose's
# internal DNS). Override with --build-arg if the backend is published on
# a different host port.
ARG VITE_API_URL=http://localhost:3001/api
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
