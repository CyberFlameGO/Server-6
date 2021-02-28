FROM node:12-slim

# Install libraries and programs
RUN true \
  && apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      # needed for building
      automake build-essential \
      # libvips image libraries
      libjpeg-dev libtiff-dev libpng-dev libgif-dev librsvg2-dev libpoppler-glib-dev zlib1g-dev fftw3-dev liblcms2-dev \
      libmagickwand-dev libpango1.0-dev  libexif-dev liborc-0.4-dev libwebp-dev \
      # needed to rebuild sharp against global libvips
      python \
      # custom allocator to preserve rss memory
      libjemalloc1 \
  && apt-get autoremove -y \
  && apt-get autoclean \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* \
  && true

# Download libvips
RUN mkdir -p lib/ && wget https://github.com/libvips/libvips/releases/download/v8.10.5/vips -O lib/vips
COPY ./lib/vips /tmp/

# Build libvips
RUN true\
  && cd /tmp \
  && tar zxvf vips \
  && cd /tmp/vips-8.10.5 \
  && ./configure --enable-debug=no $1 \
  && make -j4 \
  && make install \
  && ldconfig \
  && rm -rf /tmp/* /var/tmp/* \
  true

# Change memory allocator to avoid leaks
ENV LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.1

# Clone typings repo
RUN git clone https://github.com/SevenTV/Typings.git

RUN npm run build --build-from-source
