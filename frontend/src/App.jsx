import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';

import Navbar from './components/Navbar.jsx';
import Home from './pages/Home.jsx';
import Upload from './pages/Upload.jsx';
import Watch from './pages/Watch.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <Navbar />

        <Routes>
          <Route element={<Home />} path="/" />
          <Route element={<Upload />} path="/upload" />
          <Route element={<Watch />} path="/watch/:id" />
          <Route
            element={
              <main className="page">
                <section className="panel">
                  <p className="state">Page not found.</p>
                  <Link className="button button-primary" to="/">
                    Go home
                  </Link>
                </section>
              </main>
            }
            path="*"
          />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
