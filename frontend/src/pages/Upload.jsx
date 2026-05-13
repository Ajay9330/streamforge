import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import api from '../lib/api.js';

export default function Upload() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();

    if (!title.trim()) {
      setError('Title is required.');
      return;
    }

    if (!file) {
      setError('Choose a video file first.');
      return;
    }

    setError('');
    setIsUploading(true);

    try {
      const uploadResponse = await api.post('/api/videos/upload-url', {
        fileName: file.name
      });

      const { objectKey, uploadUrl } = uploadResponse.data;
      const putResponse = await fetch(uploadUrl, {
        body: file,
        headers: {
          'Content-Type': file.type || 'application/octet-stream'
        },
        method: 'PUT'
      });

      if (!putResponse.ok) {
        throw new Error('Direct upload failed.');
      }

      const completeResponse = await api.post('/api/videos/complete', {
        objectKey,
        title: title.trim()
      });

      navigate(`/watch/${completeResponse.data.id}`);
    } catch (requestError) {
      setError(requestError.message);
      setIsUploading(false);
    }
  }

  return (
    <main className="page">
      <section className="hero">
        <div>
          <div className="eyebrow">Upload</div>
          <h2>Send a new video</h2>
          <p>
            The browser uploads the raw file directly to MinIO, then the
            backend queues the transcode job.
          </p>
        </div>
      </section>

      <form className="panel form" onSubmit={handleSubmit}>
        <label className="field">
          <span>Title</span>
          <input
            onChange={(event) => setTitle(event.target.value)}
            placeholder="My video title"
            value={title}
          />
        </label>

        <label className="field">
          <span>Video file</span>
          <input
            accept="video/*"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            type="file"
          />
        </label>

        {error ? <p className="state state-error">{error}</p> : null}

        <button className="button button-primary" disabled={isUploading}>
          {isUploading ? 'Uploading...' : 'Upload video'}
        </button>
      </form>
    </main>
  );
}
