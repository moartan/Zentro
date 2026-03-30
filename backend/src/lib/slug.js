export function slugify(value) {
  return `${value}`
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function randomSlugSuffix(length = 6) {
  return Math.random().toString(36).slice(2, 2 + length);
}

