import {
  Maximize2,
  Pause,
  Play,
  Rewind,
  SkipForward,
  Volume2,
  VolumeX
} from 'lucide-react';
import * as dashjs from 'dashjs';
import Hls from 'hls.js';
import { useEffect, useRef, useState } from 'react';
import { formatDuration } from '../lib/time.js';

import QualitySelector from './QualitySelector.jsx';

function formatLevelLabel(level) {
  if (!level) {
    return 'Auto';
  }

  const heightLabel = level.height ? `${level.height}p` : 'Source';
  const bitrateLabel = level.bitrate
    ? `${Math.round(level.bitrate / 1000)} kbps`
    : 'adaptive';

  return `${heightLabel} / ${bitrateLabel}`;
}

export default function Player({
  autoPlay = false,
  onQualityLevelChange,
  playbackMode,
  qualityLevel,
  src,
  video
}) {
  const containerRef = useRef(null);
  const dashRef = useRef(null);
  const hlsRef = useRef(null);
  const qualityLevelRef = useRef(qualityLevel);
  const videoRef = useRef(null);

  const [currentLevel, setCurrentLevel] = useState(-1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [levels, setLevels] = useState([]);

  const qualityChoices =
    levels.length > 1
      ? levels.map((level, index) => {
          if (index === 0) {
            return {
              label: 'Auto',
              value: -1
            };
          }

          return {
            label: `${index} - ${formatLevelLabel(level)}`,
            value: index - 1
          };
        })
      : [
          { label: 'Auto', value: -1 },
          { label: '1 - 360p', value: 0 },
          { label: '2 - 720p', value: 1 },
          { label: '3 - 1080p', value: 2 }
        ];

  useEffect(() => {
    qualityLevelRef.current = qualityLevel;
  }, [qualityLevel]);

  useEffect(() => {
    const videoElement = videoRef.current;

    if (!src || !videoElement) {
      return undefined;
    }

    setError('');
    setCurrentLevel(-1);
    setCurrentTime(0);
    setDuration(0);
    setIsMuted(videoElement.muted);
    setIsPlaying(false);
    setLevels([]);

    function handleTimeUpdate() {
      setCurrentTime(videoElement.currentTime);
      setDuration(videoElement.duration || 0);
    }

    function handlePlay() {
      setIsPlaying(true);
    }

    function handlePause() {
      setIsPlaying(false);
    }

    function handleVolumeChange() {
      setIsMuted(videoElement.muted);
    }

    function detachListeners() {
      videoElement.removeEventListener('timeupdate', handleTimeUpdate);
      videoElement.removeEventListener('durationchange', handleTimeUpdate);
      videoElement.removeEventListener('play', handlePlay);
      videoElement.removeEventListener('pause', handlePause);
      videoElement.removeEventListener('volumechange', handleVolumeChange);
    }

    videoElement.addEventListener('timeupdate', handleTimeUpdate);
    videoElement.addEventListener('durationchange', handleTimeUpdate);
    videoElement.addEventListener('play', handlePlay);
    videoElement.addEventListener('pause', handlePause);
    videoElement.addEventListener('volumechange', handleVolumeChange);

    if (playbackMode === 'dash' || playbackMode === 'av1') {
      const dashSupported =
        typeof dashjs.MediaPlayer.isSupported === 'function'
          ? dashjs.MediaPlayer.isSupported()
          : true;

      if (!dashSupported) {
        setError('This browser cannot play DASH or AV1 streams.');
        detachListeners();
        return undefined;
      }

      const player = dashjs.MediaPlayer().create();

      dashRef.current = player;

      const handleDashStreamInitialized = () => {
        const representations = player.getRepresentationsByType('video') ?? [];
        const nextLevels = [{ bitrate: 0, height: 0 }].concat(
          representations.map((representation) => ({
            bitrate: representation.bandwidth ?? 0,
            height: representation.height ?? 0
          }))
        );

        setLevels(nextLevels);

        if (qualityLevelRef.current === -1) {
          player.updateSettings({
            streaming: {
              abr: {
                autoSwitchBitrate: {
                  video: true
                }
              }
            }
          });
        } else {
          player.updateSettings({
            streaming: {
              abr: {
                autoSwitchBitrate: {
                  video: false
                }
              }
            }
          });

          player.setRepresentationForTypeByIndex('video', qualityLevelRef.current);
        }

        setCurrentLevel(qualityLevelRef.current);
      };

      const handleDashError = (event) => {
        setError(
          event?.error?.message ??
            event?.error ??
            event?.message ??
            'Playback failed.'
        );
      };

      player.on(dashjs.MediaPlayer.events.STREAM_INITIALIZED, handleDashStreamInitialized);
      player.on(dashjs.MediaPlayer.events.ERROR, handleDashError);

      player.initialize(videoElement, src, true);

      return () => {
        player.off(
          dashjs.MediaPlayer.events.STREAM_INITIALIZED,
          handleDashStreamInitialized
        );
        player.off(dashjs.MediaPlayer.events.ERROR, handleDashError);
        player.reset();

        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }

        detachListeners();
      };
    } else if (Hls.isSupported()) {
      const hls = new Hls({
        capLevelToPlayerSize: false,
        enableWorker: true
      });

      hlsRef.current = hls;

      hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        hls.loadSource(src);
      });

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        const nextLevels = [{ bitrate: 0, height: 0 }, ...hls.levels];
        setLevels(nextLevels);

        hls.autoLevelEnabled = qualityLevelRef.current === -1;
        hls.currentLevel = qualityLevelRef.current;
        hls.loadLevel = qualityLevelRef.current;
        hls.nextLevel = qualityLevelRef.current;
        hls.startLevel = qualityLevelRef.current;
        setCurrentLevel(qualityLevelRef.current);
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        setCurrentLevel(data?.level ?? -1);
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data?.fatal) {
          setError(data.details || 'Playback failed.');
        }
      });

      hls.attachMedia(videoElement);
    } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
      videoElement.src = src;
    } else {
      setError('This browser cannot play HLS streams.');
    }

    return () => {
      if (dashRef.current) {
        dashRef.current.reset();
        dashRef.current = null;
      }

      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      detachListeners();
    };
  }, [playbackMode, src]);

  useEffect(() => {
    if (playbackMode === 'dash' || playbackMode === 'av1') {
      const player = dashRef.current;

      if (player) {
        player.updateSettings({
          streaming: {
            abr: {
              autoSwitchBitrate: {
                video: qualityLevel === -1
              }
            }
          }
        });

        if (qualityLevel !== -1) {
          player.setRepresentationForTypeByIndex('video', qualityLevel);
        }
      }
    }

    const hls = hlsRef.current;

    if (!hls) {
      return undefined;
    }

    hls.currentLevel = qualityLevel;
    setCurrentLevel(qualityLevel);
  }, [qualityLevel]);

  function togglePlay() {
    const videoElement = videoRef.current;

    if (!videoElement) {
      return;
    }

    if (videoElement.paused) {
      void videoElement.play().catch(() => {
        setError('Play request was blocked by the browser.');
      });
      return;
    }

    videoElement.pause();
  }

  function toggleMute() {
    const videoElement = videoRef.current;

    if (!videoElement) {
      return;
    }

    videoElement.muted = !videoElement.muted;
    setIsMuted(videoElement.muted);
  }

  function toggleFullscreen() {
    const containerElement = containerRef.current;

    if (!containerElement) {
      return;
    }

    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }

    void containerElement.requestFullscreen?.();
  }

  function handleSeek(event) {
    const videoElement = videoRef.current;

    if (!videoElement) {
      return;
    }

    const nextTime = Number(event.target.value);
    videoElement.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  function handleQualityChange(nextQualityLevel) {
    const hls = hlsRef.current;
    const dash = dashRef.current;

    qualityLevelRef.current = nextQualityLevel;

    if (hls) {
      hls.autoLevelEnabled = nextQualityLevel === -1;
      hls.currentLevel = nextQualityLevel;
      hls.nextLevel = nextQualityLevel;
      hls.loadLevel = nextQualityLevel;
      hls.startLevel = nextQualityLevel;
    }

    if (dash) {
      dash.updateSettings({
        streaming: {
          abr: {
            autoSwitchBitrate: {
              video: nextQualityLevel === -1
            }
          }
        }
      });

      if (nextQualityLevel !== -1) {
        dash.setRepresentationForTypeByIndex('video', nextQualityLevel);
      }
    }

    if (onQualityLevelChange) {
      onQualityLevelChange(nextQualityLevel);
    }

    setCurrentLevel(nextQualityLevel);
  }

  const activeQualityLabel =
    currentLevel === -1
      ? 'Auto'
      : formatLevelLabel(levels[currentLevel + 1] ?? null);
  const playbackLabel =
    playbackMode === 'dash'
      ? 'Live DASH'
      : playbackMode === 'av1'
        ? 'Live AV1'
        : 'Live HLS';

  return (
    <div className="player-shell" ref={containerRef}>
      <div className="player-stage">
        <video
          ref={videoRef}
          className="player-video"
          playsInline
          preload="metadata"
        />

        <div className="player-badge player-badge--floating">
          {error ? 'Playback Error' : playbackLabel}
        </div>

        <div className="player-gradient" />

        {!isPlaying ? (
          <button
            aria-label="Play"
            className="player-center-button"
            onClick={togglePlay}
            type="button"
          >
            <Play size={28} strokeWidth={2.4} />
          </button>
        ) : null}

        <div className="player-controls">
          <div className="player-scrub">
            <input
              aria-label="Seek"
              className="player-range"
              max={duration || 0}
              min="0"
              onChange={handleSeek}
              step="0.01"
              type="range"
              value={currentTime}
            />
          </div>

          <div className="player-controls__row">
            <div className="player-controls__group">
              <button
                aria-label={isPlaying ? 'Pause' : 'Play'}
                className="control-button control-button--primary"
                onClick={togglePlay}
                type="button"
              >
                {isPlaying ? <Pause size={18} /> : <Play size={18} />}
              </button>

              <button
                aria-label={isMuted ? 'Unmute' : 'Mute'}
                className="control-button"
                onClick={toggleMute}
                type="button"
              >
                {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>

              <button
                aria-label="Back 10 seconds"
                className="control-button"
                onClick={() => {
                  const videoElement = videoRef.current;

                  if (!videoElement) {
                    return;
                  }

                  videoElement.currentTime = Math.max(0, videoElement.currentTime - 10);
                }}
                type="button"
              >
                <Rewind size={18} />
              </button>

              <button
                aria-label="Forward 10 seconds"
                className="control-button"
                onClick={() => {
                  const videoElement = videoRef.current;

                  if (!videoElement) {
                    return;
                  }

                  videoElement.currentTime = Math.min(
                    duration || videoElement.duration || 0,
                    videoElement.currentTime + 10
                  );
                }}
                type="button"
              >
                <SkipForward size={18} />
              </button>
            </div>

            <div className="player-controls__group player-controls__group--right">
              <QualitySelector
                activeLevel={currentLevel}
                levels={qualityChoices}
                onChange={handleQualityChange}
              />

              <div className="player-time">
                {formatDuration(currentTime)} / {formatDuration(duration)}
              </div>

              <button
                aria-label="Fullscreen"
                className="control-button"
                onClick={toggleFullscreen}
                type="button"
              >
                <Maximize2 size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="player-footnote">
        <span className="player-footnote__label">Quality</span>
        <strong>{activeQualityLabel}</strong>
      </div>

      {error ? <p className="player-error">{error}</p> : null}
    </div>
  );
}
