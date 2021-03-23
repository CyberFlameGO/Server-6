FROM node:12-slim

# Build FFMPEG
RUN apt-get update -qq && apt-get -y install \
      autoconf \
      automake \
      build-essential \
      cmake \
      git-core \
	  libwebp-dev \
      libfreetype6-dev \
      libsdl2-dev \
      libtool \
      libva-dev \
      libvdpau-dev \
      libxcb1-dev \
      libxcb-shm0-dev \
      libxcb-xfixes0-dev \
      pkg-config \
      texinfo \
      wget \
      zlib1g-dev \
      nasm \
      yasm
RUN mkdir -p ~/ffmpeg_sources ~/bin && cd ~/ffmpeg_sources && \
    wget -O ffmpeg-4.2.2.tar.bz2 https://ffmpeg.org/releases/ffmpeg-4.2.2.tar.bz2 && \
    tar xjvf ffmpeg-4.2.2.tar.bz2 && \
    cd ffmpeg-4.2.2 && \
    PATH="$HOME/bin:$PATH" PKG_CONFIG_PATH="$HOME/ffmpeg_build/lib/pkgconfig" ./configure \
      --prefix="$HOME/ffmpeg_build" \
      --pkg-config-flags="--static" \
      --extra-cflags="-I$HOME/ffmpeg_build/include" \
      --extra-ldflags="-L$HOME/ffmpeg_build/lib" \
      --extra-libs="-lpthread -lm" \
      --bindir="$HOME/bin" \
	  --enable-libwebp \
      --enable-gpl \
      --enable-nonfree && \
    PATH="$HOME/bin:$PATH" make -j8 && \
    make install -j8 && \
    hash -r
RUN mv ~/bin/ffmpeg /usr/local/bin && mv ~/bin/ffprobe /usr/local/bin && mv ~/bin/ffplay /usr/local/bin

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
