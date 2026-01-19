FROM node:20-alpine
RUN apk add --no-cache openssl fontconfig ttf-dejavu

WORKDIR /app

COPY package.json package-lock.json* ./
COPY worker/package.json worker/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci

COPY . .

RUN npx prisma generate

CMD ["npm", "--prefix", "worker", "run", "dev"]
