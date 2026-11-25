FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_SMS_PROVIDER
ARG VITE_GOOGLE_ENABLED=false
ARG VITE_BANK_TRANSFER_ENABLED=true
ARG VITE_GOOGLE_MAPS_API_KEY
RUN npm run build

FROM nginx:1.30.8-alpine@sha256:8eb2b5540eae779603cc3db84b3986a15ecb5308b54303146eee9837c137b51a
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
