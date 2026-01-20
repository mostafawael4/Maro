FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

# Copying source code
COPY . .

EXPOSE 4000

CMD ["npm", "start"]
