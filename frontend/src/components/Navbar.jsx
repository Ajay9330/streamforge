import { Link } from 'react-router-dom';

export default function Navbar() {
  return (
    <header className="navbar">
      <div>
        <div className="eyebrow">StreamForge</div>
        <h1>Local video streaming pipeline</h1>
      </div>

      <nav className="nav-links">
        <Link className="nav-link" to="/">
          Library
        </Link>
        <Link className="nav-link nav-link-primary" to="/upload">
          Upload
        </Link>
      </nav>
    </header>
  );
}
