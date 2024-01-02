FROM node:20

WORKDIR /usr/src/app

RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

RUN curl \
    -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /usr/bin/yt-dlp && \
    chmod a+rx /usr/bin/yt-dlp

COPY ["package.json", "package-lock.json", "./"]

RUN npm install --silent --no-audit --omit=dev --loglevel=error

RUN npm install --silent --no-audit --loglevel=error tsconfig-paths

COPY . .