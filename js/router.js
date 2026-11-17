// Minimal hash router.
export const routes = {};
export const route = (name, fn) => { routes[name] = fn; };
export function go(path) {
  if (location.hash === `#/${path}`) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = `#/${path}`;
}
export function parse() {
  const [path, q = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const [name, ...args] = path.split('/');
  return { name: name || 'today', arg: decodeURIComponent(args.join('/')), params: Object.fromEntries(new URLSearchParams(q)) };
}
