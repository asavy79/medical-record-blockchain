FROM node:20-alpine

WORKDIR /app

COPY app/package.json app/package-lock.json ./
RUN npm ci

COPY app/ .

EXPOSE 5173

CMD ["npx", "vite", "--host", "0.0.0.0"]
