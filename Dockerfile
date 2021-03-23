FROM ghcr.io/seventv/server/system:latest


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

RUN npm install --build-from-source --also=dev
RUN echo "{}" >> config.json
RUN npm run build 

CMD npm run start-container
