/**
 * @param {URL} url
 */
export function loadApp({ searchParams }) {
  const { attr, config, actions } = getChrome();
  const app = searchParams.get('example') ?? 'learn-001.html';
  const iframe = document.querySelector('iframe');
  attr.flush?.();
  config.flush?.();
  actions.flush?.();
  iframe.src = `./examples/${app}`;
}

function getChrome() {
  const attr = document.querySelector('#attribution');
  const config = document.querySelector('#config');
  const actions = document.querySelector('#actions');
  return { attr, config, actions };
}

globalThis.addEventListener('click', event => {
  const { target } = event;
  if (
      target instanceof HTMLAnchorElement &&
      target.hostname === location.hostname
  ) {
    event.preventDefault();
    const url = new URL(target.href);
    globalThis.history.pushState({}, '', url);
    loadApp(url);
  }
});

globalThis.addEventListener('cfg-update', event => {
  const iframe = document.querySelector('iframe');
  iframe.contentWindow.postMessage({
    kind: 'update-knobs',
    data: event.detail,
  });
});

globalThis.addEventListener('message', event => {
  const { attr, config, actions } = getChrome();
  const message = event.data;

  switch (message.kind) {
    case 'attribute':
      attr.setAttribution?.(message.title, message.link)
      break;

    case 'register-button':
      actions.addButton?.(message.label, message.id);
      break;

    case 'register-knobs':
      config.setKnobs?.(message.knobs);
      break;

    default:
      console.warn('unknown message', message);
      break;
  }
});

console.clear();
loadApp(new URL(globalThis.location.href));
