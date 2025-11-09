/**
 * @param {URL} url
 */
export function loadApp({ searchParams }) {
  const app = searchParams.get('example');
  const iframe = document.querySelector('iframe');
  console.log(app);
  iframe.src = `./examples/${app}`;
}

globalThis.addEventListener('click', event => {
  const { target } = event;
  if (target instanceof HTMLAnchorElement) {
    event.preventDefault();
    const url = new URL(target.href);
    globalThis.history.pushState({}, '', url);
    loadApp(url);
  }
});

loadApp(new URL(globalThis.location.href));
