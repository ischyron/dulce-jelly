FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json .
COPY .eslintrc.cjs .
COPY src ./src
COPY config ./config
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY config ./config
ENTRYPOINT ["node", "dist/index.js", "run"]
