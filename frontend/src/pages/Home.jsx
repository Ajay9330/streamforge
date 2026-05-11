import { useEffect, useState } from 'react';

import api from '../lib/api.js';
import VideoCard from '../components/VideoCard.jsx';

export default function Home() {
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [videos, setVideos] = useState([]);

  useEffect(() => {
    let isMounted = true;

    async function loadVideos() {
      try {
        const response = await api.get('/api/videos');

        if (!isMounted) {
          return;
        }

        setVideos(response.data.items);
      } catch (requestError) {
        if (isMounted) {
          setError(requestError.message);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadVideos();

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleDelete(videoId) {
    const confirmed = window.confirm(
      'Delete this video and remove its storage assets?'
    );

    if (!confirmed) {
      return;
    }

    try {
      await api.delete(`/api/videos/${videoId}`);
      setVideos((currentVideos) =>
        currentVideos.filter((video) => video.id !== videoId)
      );
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <main className="page">
      <section className="hero">
        <div>
          <div className="eyebrow">Library</div>
          <h2>Uploaded videos</h2>
          <p>
            Browse completed uploads and open the player once transcoding
            finishes.
          </p>
        </div>
      </section>

      {isLoading ? <p className="state">Loading videos...</p> : null}

      {error ? <p className="state state-error">{error}</p> : null}

      {!isLoading && !error && videos.length === 0 ? (
        <p className="state">No videos yet. Upload the first one.</p>
      ) : null}

      <section className="grid">
        {videos.map((video) => (
          <VideoCard key={video.id} onDelete={handleDelete} video={video} />
        ))}
      </section>
    </main>
  );
}
