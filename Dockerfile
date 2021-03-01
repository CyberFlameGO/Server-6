FROM registry.digitalocean.com/xiantis/7tv-app:server-sys

WORKDIR /app
ADD tsconfig.json .
ADD tslint.json .
ADD package.json .
ADD package-lock.json .
ADD src ./src
ADD .env .

# Clone typings repo
RUN git clone https://github.com/SevenTV/Typings.git

RUN npm install --build-from-source --also=dev
RUN echo "{}" >> config.json
RUN npm run build 

CMD npm run start-container
