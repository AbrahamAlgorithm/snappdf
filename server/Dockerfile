# the report sender. no packages to install, so nothing third-party ends up in it
FROM node:22-alpine
WORKDIR /app
COPY index.mjs report.mjs ./
USER node
ENV NODE_ENV=production
CMD ["node", "index.mjs"]
