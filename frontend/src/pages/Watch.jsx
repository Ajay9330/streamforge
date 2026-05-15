import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Trash2 } from 'lucide-react';

import Player from '../components/Player.jsx';
import PlaybackModeSelector from '../components/PlaybackModeSelector.jsx';
import api from '../lib/api.js';

export default function Watch() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [error, setError] = useState('');
  const [qualityLevel, setQualityLevel] = useState(-1);
  const [playbackMode, setPlaybackMode] = useState('hls');
  const [video, setVideo] = useState(null);

  function getPlaybackModeHelper(mode) {
    if (playbackMode === mode) {
      return 'Active';
    }

    if (mode === 'dash') {
      return video?.dashPlaybackUrl ? 'Switch' : 'Unavailable';
    }

    if (mode === 'av1') {
      return video?.av1PlaybackUrl ? 'Switch' : 'Unavailable';
    }

    return 'Switch';
  }

  const playbackModes = [
    {
      helper: getPlaybackModeHelper('hls'),
      label: 'HLS',
      value: 'hls'
    },
    {
      disabled: !video?.dashPlaybackUrl,
      helper: getPlaybackModeHelper('dash'),
      label: 'DASH',
      value: 'dash'
    },
    {
      disabled: !video?.av1PlaybackUrl,
      helper: getPlaybackModeHelper('av1'),
      label: 'AV1',
      value: 'av1'
    }
  ];

  useEffect(() => {
    let isMounted = true;
    let intervalId = null;

    setError('');
    setPlaybackMode('hls');
    setQualityLevel(-1);
    setVideo(null);

    async function loadVideo() {
      try {
        const response = await api.get(`/api/videos/${id}`);

        if (!isMounted) {
          return;
        }

        setVideo(response.data);

        if (response.data.status !== 'processing' && intervalId) {
          window.clearInterval(intervalId);
          intervalId = null;
        }
      } catch (requestError) {
        if (isMounted) {
          setError(requestError.message);
        }
      }
    }

    loadVideo();
    intervalId = window.setInterval(loadVideo, 5000);

    return () => {
      isMounted = false;

      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, [id]);

  useEffect(() => {
    if (!video) {
      return;
    }

    if (playbackMode === 'dash' && !video.dashPlaybackUrl) {
      setPlaybackMode('hls');
      return;
    }

    if (playbackMode === 'av1' && !video.av1PlaybackUrl) {
      setPlaybackMode('hls');
    }
  }, [playbackMode, video]);

  async function handleDelete() {
    const confirmed = window.confirm(
      'Delete this video and remove its storage assets?'
    );

    if (!confirmed) {
      return;
    }

    try {
      await api.delete(`/api/videos/${id}`);
      navigate('/');
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  function handlePlaybackModeChange(nextPlaybackMode) {
    if (nextPlaybackMode === 'dash' && !video?.dashPlaybackUrl) {
      return;
    }

    if (nextPlaybackMode === 'av1' && !video?.av1PlaybackUrl) {
      return;
    }

    setPlaybackMode(nextPlaybackMode);
  }

  const playbackSrc =
    playbackMode === 'dash'
      ? video?.dashPlaybackUrl
      : playbackMode === 'av1'
        ? video?.av1PlaybackUrl
        : video?.playbackUrl;

  return (
    <main className="watch-page">
      <section className="watch-hero">
        <div className="watch-hero__copy">
          <div className="eyebrow">StreamForge</div>
          <h2>{video?.title ?? 'Loading video...'}</h2>
          <p>
            {video?.status === 'completed'
              ? 'Multi-bitrate HLS, DASH, and AV1 streams are ready for playback.'
              : 'The worker is still generating the streaming ladders.'}
          </p>
        </div>

        <div className="watch-hero__chips">
          <span className="pill pill-accent">{video?.status ?? 'loading'}</span>
          <span className="pill">HLS</span>
          <span className="pill">FFmpeg</span>
          {video ? (
            <button className="pill pill-action" onClick={handleDelete} type="button">
              <Trash2 size={14} />
              Delete
            </button>
          ) : null}
        </div>
      </section>

      {error ? <p className="state state-error">{error}</p> : null}

      {video && video.status === 'completed' ? (
        <section className="watch-layout">
          <div className="watch-main">
            <div className="player-panel">
              <Player
                onQualityLevelChange={setQualityLevel}
                playbackMode={playbackMode}
                qualityLevel={qualityLevel}
                src={playbackSrc}
              />
            </div>

            <section className="detail-grid">
              <article className="detail-card">
                <div className="detail-card__label">Playback</div>
                <h3>Cinematic playback</h3>
                <p>
                  Adaptive playback, manual quality switching, and a restrained
                  control surface tuned for a premium streaming feel.
                </p>
              </article>

              <article className="detail-card">
                <div className="detail-card__label">Source</div>
                <h3>Origin delivery</h3>
                <p>{video.rawObjectKey}</p>
              </article>
            </section>
          </div>

          <aside className="watch-rail">
            <article className="rail-card">
              <div className="detail-card__label">Stream info</div>
              <h3>Video details</h3>

              <div className="rail-list">
                <div className="rail-item">
                  <span>Status</span>
                  <strong>{video.status}</strong>
                </div>
                <div className="rail-item">
                  <span>Playback URL</span>
                  <strong>{video.playbackUrl}</strong>
                </div>
                <div className="rail-item">
                  <span>DASH URL</span>
                  <strong>{video.dashPlaybackUrl ?? 'Not available yet'}</strong>
                </div>
                <div className="rail-item">
                  <span>AV1 URL</span>
                  <strong>{video.av1PlaybackUrl ?? 'Not available yet'}</strong>
                </div>
                <div className="rail-item">
                  <span>Updated</span>
                  <strong>{new Date(video.updatedAt).toLocaleString()}</strong>
                </div>
              </div>
            </article>

            <article className="rail-card">
              <div className="detail-card__label">Formats</div>
              <h3>Playback modes</h3>
              <p>
                HLS, DASH, and AV1 are available when the worker generates all
                manifests successfully.
              </p>

              <PlaybackModeSelector
                activeMode={playbackMode}
                modes={playbackModes}
                onChange={handlePlaybackModeChange}
              />
            </article>
          </aside>
        </section>
      ) : (
        <section className="panel placeholder">
          <p className="state">Waiting for the worker to finish transcoding.</p>
        </section>
      )}
    </main>
  );
}
