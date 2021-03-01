FROM node:12

WORKDIR /app
ADD tsconfig.json .
ADD tslint.json .
ADD package.json .
ADD package-lock.json .
ADD src ./src
ADD .env .


# Download libvips
RUN apt update && apt-get -y install build-essential pkg-config glib2.0-dev libexpat1-dev
RUN mkdir -p lib/ && wget https://github.com/libvips/libvips/releases/download/v8.10.5/vips-8.10.5.tar.gz -O lib/vips.tar.gz

# Unpack libvips
RUN cd lib/ && tar xf vips.tar.gz && rm vips.tar.gz
RUN mv lib/vips-8.10.5 lib/vips && cd lib/vips && ./configure

# Build libvips
RUN cd lib/vips make && make install && ldconfig

# Clone typings repo
RUN git clone https://github.com/SevenTV/Typings.git

RUN npm install --build-from-source --also=dev
RUN echo "{}" >> config.json
RUN npm run build 

CMD npm run start-container
