import { Link } from 'react-router-dom';
import { Trash2, Clock } from 'lucide-react';
import { formatDuration, formatRelativeTime } from '../lib/time.js';

export default function VideoCard({ onDelete, video }) {
  return (
    <article className="video-card">
      <div className="video-card__top">
        <div>
          <div className="video-card__label">Status</div>
          <div className={`status status-${video.status}`}>{video.status}</div>
        </div>

        <div className="video-card__meta">
          {video.duration ? (
            <span className="video-card__duration">
              <Clock size={12} />
              {formatDuration(video.duration)}
            </span>
          ) : null}
          <span>{formatRelativeTime(video.createdAt)}</span>
        </div>
      </div>

      <h2>{video.title}</h2>
      <p>{video.playbackUrl}</p>

      <div className="video-card__actions">
        <Link className="button button-secondary" to={`/watch/${video.id}`}>
          Open player
        </Link>

        <button
          className="button button-danger"
          onClick={() => onDelete(video.id)}
          type="button"
        >
          <Trash2 size={16} />
          Delete
        </button>
      </div>
    </article>
  );
}
