# build the static site
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# no install scripts, a package can't run code on the build machine
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

# serve it with nginx, runs as a non-root user on port 8080
FROM nginxinc/nginx-unprivileged:stable-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
# fail the build on a broken nginx config instead of in production
RUN nginx -t
EXPOSE 8080