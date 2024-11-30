import React, { useEffect, useRef } from 'react';

import {
  faCopy,
  faPause,
  faPlay,
  faRepeat,
  faShuffle,
  faStepBackward,
  faStepForward
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Hls from 'hls.js';

import { useDiscordAuth } from '../hooks/useDiscordAuth';
import { useDiscordSDK } from '../hooks/useDiscordSdk';

import type { TClientVideo } from '../../shared/types/video';
import AudioSlider from './AudioSlider';
import PlayButton from './PlayButton';
import TimeDisplay from './TimeDisplay';
import VolumeControls from './VolumeSlider';
import VolumeSlider from './VolumeSlider';

interface MusicPlayerCardProps {
  video: TClientVideo;
}

export default function MusicPlayerCard({ video }: MusicPlayerCardProps) {
  const audioRef = useRef<HTMLAudioElement>(null);

  const discordSDK = useDiscordSDK();
  const discordAuth = useDiscordAuth();

  const [isPlaying, setIsPlaying] = React.useState(false);

  useEffect(() => {
    const audio = audioRef.current!;

    if (!Hls.isSupported()) {
      console.error('HLS is not supported');
      return;
    }

    const hls = new Hls();

    hls.config.xhrSetup = function (xhr) {
      xhr.setRequestHeader('X-User-Id', discordAuth.user.id);
      xhr.setRequestHeader('X-Access-Token', discordAuth.access_token);
    };

    hls.loadSource(`/api/jukebox/${discordSDK.instanceId}/audio/${video.videoId}/.m3u8`);
    hls.attachMedia(audio);

    return () => {
      hls.destroy();
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center space-y-4">
      <div className="card h-full bg-base-200">
        <figure className="px-10 pt-10 w-full">
          <img src={video.thumbnail} alt={video.title} className="rounded-box" />
        </figure>
        <div className="card-body px-10">
          <div>
            <h2 className="card-title font-bold truncate">{video.title}</h2>
            <h4 className="text-sm truncate">{video.uploader}</h4>
          </div>
          <div className="card-actions w-full">
            <audio ref={audioRef} controls={false}></audio>
            <div className="flex w-full justify-start space-x-1 flex-col ">
              <div>
                <input type="range" min="0" max="100" value="50" className="range range-sm" />
                <div className="flex justify-between select-none">
                  <label>0:00</label>
                  <label>
                    {video.duration >= 3600 && (
                      <>
                        <span>
                          {Math.floor(video.duration / 3600)
                            .toString()
                            .padStart(2, '0')}
                        </span>
                        <span>:</span>
                      </>
                    )}
                    <span>
                      {Math.floor((video.duration % 3600) / 60)
                        .toString()
                        .padStart(2, '0')}
                    </span>
                    <span>:</span>
                    <span>
                      {Math.floor(video.duration % 60)
                        .toString()
                        .padStart(2, '0')}
                    </span>
                  </label>
                </div>
              </div>
              <div className="flex justify-center items-center space-x-4 w-full">
                <button className="btn btn-circle btn-ghost">
                  <FontAwesomeIcon icon={faShuffle} size="lg" />
                </button>
                <button className="btn btn-circle btn-ghost">
                  <FontAwesomeIcon icon={faStepBackward} size="lg" />
                </button>
                <button className="btn btn-circle btn-ghost btn-lg bg-base-300">
                  <FontAwesomeIcon icon={faPlay} size="xl" />
                </button>
                <button className="btn btn-circle btn-ghost">
                  <FontAwesomeIcon icon={faStepForward} size="lg" />
                </button>
                <button className="btn btn-circle btn-ghost">
                  <FontAwesomeIcon icon={faRepeat} size="lg" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <VolumeSlider />
    </div>
  );
}
