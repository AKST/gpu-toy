import { NotebookNavElement } from './common/components/x-navigation.js';

/**
 * @param {URL} url
 */
export function loadApp({ searchParams }) {
  const { attr, config, actions, logging } = getChrome();
  const app = searchParams.get('example') ?? 'learn-001.html';
  const iframe = document.querySelector('iframe');
  attr.flush?.();
  config.flush?.();
  actions.flush?.();
  logging.flush?.();
  iframe.src = `./examples/${app}.html`;
}

const mainResizeObserver = new ResizeObserver(entries => {
  for (const { target, contentRect } of entries) {
    const iframe = target.querySelector('iframe');
    const { width, height } = contentRect;
    iframe.width = width;
    iframe.height = height;
  }
});

function getChrome() {
  const attr = document.querySelector('#attribution');
  const config = document.querySelector('#config');
  const actions = document.querySelector('#actions');
  const logging = document.querySelector('#logging');
  return { attr, config, actions, logging };
}

globalThis.addEventListener('load-example', event => {
  globalThis.history.pushState({}, '', event.detail);
  loadApp(event.detail);
});

globalThis.addEventListener('securitypolicyviolation', event => {
  console.log('Violation:', event.violatedDirective);
console.log('Blocked URI:', event.blockedURI);
});

globalThis.addEventListener('cfg-update', event => {
  const iframe = document.querySelector('iframe');
  iframe.contentWindow.postMessage({
    kind: 'update-knobs',
    data: event.detail,
  });
});

globalThis.addEventListener('message', event => {
  const { attr, config, actions, logging } = getChrome();
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

    case 'push-log':
      logging.log(message.log);
      break;

    default:
      console.warn('unknown message', message);
      break;
  }
});

loadApp(new URL(globalThis.location+''));
mainResizeObserver.observe(document.querySelector('main'));
