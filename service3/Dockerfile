FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm install

# COPY prisma ./prisma/

COPY . .

RUN npx prisma generate

COPY prisma-check.sh .
RUN chmod +x prisma-check.sh

RUN npm run build

EXPOSE 3003

CMD ["./prisma-check.sh"]

# CMD ["node", "dist/main"]
