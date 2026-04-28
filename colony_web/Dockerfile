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

FROM nginx:1.27-alpine
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/dist/colony_web /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
RUN chown -R app:app /usr/share/nginx/html /var/cache/nginx /var/run /etc/nginx
USER app
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
