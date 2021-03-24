FROM ghcr.io/seventv/server/system:latest

# Add files from app to container
WORKDIR /app
ADD tsconfig.json .
ADD tslint.json .
ADD package.json .
ADD package-lock.json .
ADD src ./src
ADD worker_bootstrap.js .
ADD .env .

# Clone typings repo
RUN git clone https://github.com/SevenTV/Typings.git

# Install packages
RUN npm install --also=dev

# Build app
RUN echo "{}" >> config.json
RUN npm run build 

# Command
CMD npm run start-container
