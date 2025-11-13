/**
 * @param {URL} url
 */
export function loadApp({ searchParams }) {
  const app = searchParams.get('example') ?? 'learn-001.html';
  const attr = document.querySelector('#attribution');
  const iframe = document.querySelector('iframe');
  attr.flush?.();
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

globalThis.addEventListener('message', event => {
  const message = event.data;
  const attr = document.querySelector('#attribution');
  const actions = document.querySelector('#actions');

  switch (message.kind) {
    case 'attribute':
      attr.setAttribution(message.title, message.link)
      break;

    case 'register-button':
      actions.addButton(message.label, message.id);
      break;

    default:
      break;
  }
});

console.clear();
loadApp(new URL(globalThis.location.href));
