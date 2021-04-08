FROM node:14

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/relay/package.json ./packages/relay/package.json
COPY packages/wrappers/package.json ./packages/wrappers/package.json

RUN npm install --global npm@7
RUN npm install --only=production
# If you are building your code for production
# RUN npm ci --only=production

EXPOSE 3000

# Bundle app source
COPY packages/relay/src ./packages/relay/src
COPY packages/wrappers/src ./packages/wrappers/src
COPY packages/contracts/abi ./packages/contracts/abi

CMD [ "npm", "start", "--workspace=san-rewards-relay" ]
