export function isSafeApiPath(path: string) {
  return path.startsWith('/') && !path.startsWith('//') && !path.includes('..') && (path.startsWith('/owner/') || path === '/auth/me');
}
