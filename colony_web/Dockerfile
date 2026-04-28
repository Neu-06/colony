FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
ARG WEB_BACKEND_BASE_URL=http://localhost:8080
ARG WEB_AI_BASE_URL=http://localhost:8000
ARG WEB_WS_BASE_URL=ws://localhost:8080
ARG WEB_FRONTEND_ORIGIN=http://localhost:4200
RUN sed -i "s|backendBaseUrl: '.*'|backendBaseUrl: '${WEB_BACKEND_BASE_URL}'|" src/environments/environment.ts \
 && sed -i "s|aiBaseUrl: '.*'|aiBaseUrl: '${WEB_AI_BASE_URL}'|" src/environments/environment.ts \
 && sed -i "s|websocketBaseUrl: '.*'|websocketBaseUrl: '${WEB_WS_BASE_URL}'|" src/environments/environment.ts \
 && sed -i "s|frontendOrigin: '.*'|frontendOrigin: '${WEB_FRONTEND_ORIGIN}'|" src/environments/environment.ts
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine
USER 0
RUN rm -rf /usr/share/nginx/html/*
COPY --from=build /app/dist/colony_web /tmp/dist
RUN if [ -d /tmp/dist/browser ]; then cp -R /tmp/dist/browser/* /usr/share/nginx/html/; else cp -R /tmp/dist/* /usr/share/nginx/html/; fi
COPY nginx.conf /etc/nginx/conf.d/default.conf
RUN chown -R 101:101 /usr/share/nginx/html /etc/nginx/conf.d/default.conf
USER 101
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
