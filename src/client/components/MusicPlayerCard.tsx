import React, { useEffect, useRef } from 'react';

import Hls from 'hls.js';

import { useDiscordAuth } from '../hooks/useDiscordAuth';
import { useDiscordSDK } from '../hooks/useDiscordSdk';

import type { TClientVideo } from '../../shared/types/video';
import PlayButton from './PlayButton';
import AudioSlider from './AudioSlider';
import TimeDisplay from './TimeDisplay';
import VolumeControls from './VolumeSlider';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import { faPlay, faPause, faStepBackward, faStepForward, faCopy, faShuffle, faRepeat } from '@fortawesome/free-solid-svg-icons';
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
  });

  return (
    <div className='flex flex-row items-center justify-center'>
      <div className='shadow'>
        <VolumeSlider />
      </div>
    <div className="card bg-base-200 w-[400px] h-[600px] shadow-xl">
      <figure className="px-10 pt-10 w-full">
       <img src={video.thumbnail} alt={video.title} className="rounded-xl" />
      </figure>
      <div className="card-body">
        <div>
          <h2 className="card-title font-bold -my-1">{video.title}</h2>
          <h4>{video.uploader}</h4>
        </div>
        <div className="card-actions w-full">
          <audio ref={audioRef} controls={false}></audio>
          <div className='flex w-full justify-start space-x-1 flex-col '>
            <div>
              <input type="range" min="0" max="100" value="50" className="range range-xs" />
              <div className="flex justify-between">
                <label>0:00</label>
                <label>3:00</label>
              </div>
            </div>
              <div className='flex justify-center items-center space-x-4 w-full'>
              <button className='btn btn-circle btn-ghost'>
                <FontAwesomeIcon icon={faShuffle} />
              </button>
              <button className='btn btn-circle btn-ghost'>
                <FontAwesomeIcon icon={faStepBackward} />
              </button>
              <button className='btn btn-circle btn-ghost btn-lg bg-base-300'>
                <FontAwesomeIcon icon={faPlay} />
              </button>
              <button className='btn btn-circle btn-ghost'>
                <FontAwesomeIcon icon={faStepForward} />  
              </button>              
              <button className='btn btn-circle btn-ghost'>
                <FontAwesomeIcon icon={faRepeat} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}
