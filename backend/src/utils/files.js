export function sanitizeFileName(fileName) {
  const baseName = fileName.replace(/\\/g, '/').split('/').pop() || 'video';

  return baseName
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}
