FROM node:12-slim

# Download libvips
RUN apt update && apt-get -y install git wget build-essential pkg-config glib2.0-dev checkinstall libexpat1-dev libgif-dev libpng-dev
RUN mkdir -p lib/ && wget https://github.com/libvips/libvips/releases/download/v8.10.5/vips-8.10.5.tar.gz -O lib/vips.tar.gz

# Unpack libvips
RUN cd lib/ && tar xf vips.tar.gz && rm vips.tar.gz
RUN mv lib/vips-8.10.5 lib/vips && cd lib/vips && ./configure

# Build libvips
RUN cd lib/vips make && make install && ldconfig

RUN echo Libraries installed successfully
