const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO_ROOT = path.join(__dirname, '..');
const SOURCE_DIR = path.join(REPO_ROOT, '..', 'streamforge_temp', 'streamforge', '.backup');
const START_DATE = new Date('2026-04-19T09:00:00');

const commits = [
  {
    day: 1,
    files: ['.gitignore', 'README.md', 'plan.md', '.env.example'],
    msg: 'chore: project initialization and architectural roadmap'
  },
  {
    day: 3,
    files: ['docker-compose.yml', 'nginx/nginx.conf', 'uploads/.gitkeep'],
    msg: 'chore: configure infrastructure with docker-compose and nginx'
  },
  {
    day: 5,
    files: [
      'backend/package.json', 
      'backend/Dockerfile', 
      'backend/src/config.js', 
      'backend/src/db.js'
    ],
    msg: 'feat(backend): initialize service and implement database schema'
  },
  {
    day: 8,
    files: [
      'backend/src/server.js', 
      'backend/src/utils/files.js'
    ],
    msg: 'feat(backend): set up express server and file utility helpers'
  },
  {
    day: 10,
    files: [
      'backend/src/minio.js', 
      'backend/src/queue.js'
    ],
    msg: 'feat(backend): integrate minio storage and bullmq processing'
  },
  {
    day: 12,
    files: ['backend/src/routes/videos.js'],
    msg: 'feat(backend): implement video metadata and upload url endpoints'
  },
  {
    day: 14,
    files: ['worker/package.json', 'worker/Dockerfile'],
    msg: 'feat(worker): initialize transcoding service environment'
  },
  {
    day: 16,
    files: ['worker/worker.js'],
    msg: 'feat(worker): implement ffmpeg processing and status updates'
  },
  {
    day: 18,
    files: [
      'frontend/package.json', 
      'frontend/Dockerfile', 
      'frontend/index.html', 
      'frontend/vite.config.js'
    ],
    msg: 'feat(frontend): initialize react frontend with vite'
  },
  {
    day: 20,
    files: [
      'frontend/src/main.jsx', 
      'frontend/src/App.jsx', 
      'frontend/src/styles.css'
    ],
    msg: 'feat(frontend): implement core app structure and global styling'
  },
  {
    day: 22,
    files: [
      'frontend/src/components/Navbar.jsx', 
      'frontend/src/lib/api.js'
    ],
    msg: 'feat(frontend): add navigation and api client configuration'
  },
  {
    day: 23,
    files: [
      'frontend/src/pages/Home.jsx', 
      'frontend/src/components/VideoCard.jsx'
    ],
    msg: 'feat(frontend): implement video library listing and card UI'
  },
  {
    day: 25,
    files: ['frontend/src/pages/Upload.jsx'],
    msg: 'feat(frontend): implement asynchronous video upload workflow'
  },
  {
    day: 27,
    files: [
      'frontend/src/pages/Watch.jsx', 
      'frontend/src/components/Player.jsx'
    ],
    msg: 'feat(frontend): implement watch page and adaptive video player'
  },
  {
    day: 28,
    files: [
      'frontend/src/components/QualitySelector.jsx', 
      'frontend/src/components/PlaybackModeSelector.jsx'
    ],
    msg: 'feat(frontend): add quality and playback mode controls'
  },
  {
    day: 29,
    files: ['frontend/src/lib/time.js'],
    msg: 'feat(frontend): implement time formatting and relative dates'
  }
];

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    fs.copyFileSync(src, dest);
  }
}

function runGit(command, env = {}) {
  console.log(`Running: ${command}`);
  try {
    execSync(command, {
      cwd: REPO_ROOT,
      env: { ...process.env, ...env },
      stdio: 'inherit'
    });
  } catch (e) {
    if (command.includes('git commit')) {
      console.log('Commit failed. Skipping.');
    } else {
      throw e;
    }
  }
}

async function main() {
  if (fs.existsSync(path.join(REPO_ROOT, '.git'))) {
    console.log('Removing existing .git directory...');
    fs.rmSync(path.join(REPO_ROOT, '.git'), { recursive: true, force: true });
  }
  runGit('git init');
  runGit('git config user.name "Ajaykumar Yadav"');
  runGit('git config user.email "ajaykumar9330c@gmail.com"');

  // 3. Process Commits
  for (const commit of commits) {
    let hasChanges = false;
    for (const file of commit.files) {
      const src = path.join(SOURCE_DIR, file);
      const dest = path.join(REPO_ROOT, file);
      if (fs.existsSync(src)) {
        console.log(`Day ${commit.day}: Copying ${file}`);
        copyRecursiveSync(src, dest);
        hasChanges = true;
      }
    }

    if (hasChanges) {
      const commitDate = new Date(START_DATE);
      commitDate.setDate(START_DATE.getDate() + (commit.day - 1));
      const dateStr = commitDate.toISOString();

      runGit('git add .');
      runGit(`git commit -m "${commit.msg}"`, {
        GIT_AUTHOR_DATE: dateStr,
        GIT_COMMITTER_DATE: dateStr
      });
    }
  }

  // 4. Final Cleanup check - Copy anything remaining in source that was missed
  console.log('Checking for remaining files in source...');
  function copyRemaining(dir) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const relativePath = path.relative(SOURCE_DIR, fullPath);
      const targetPath = path.join(REPO_ROOT, relativePath);
      
      if (item === '.git' || item === 'node_modules') continue;

      if (fs.statSync(fullPath).isDirectory()) {
        copyRemaining(fullPath);
      } else {
        if (!fs.existsSync(targetPath)) {
          console.log(`Copying missed file: ${relativePath}`);
          copyRecursiveSync(fullPath, targetPath);
        }
      }
    }
  }
  copyRemaining(SOURCE_DIR);
  
  // Final Commit
  runGit('git add .');
  
  const finalDate = new Date(START_DATE);
  finalDate.setDate(START_DATE.getDate() + 29);
  const finalDateStr = finalDate.toISOString();
  
  runGit('git commit -m "chore: final project synchronization and cleanup"', {
    GIT_AUTHOR_DATE: finalDateStr,
    GIT_COMMITTER_DATE: finalDateStr
  });

  console.log('History rewrite complete!');
}

main().catch(console.error);
