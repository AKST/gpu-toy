import { NotebookNavElement } from './common/components/x-navigation.js';

/**
 * @param {URL} url
 */
export function loadApp({ searchParams }) {
  const { header, config, logging } = getChrome();
  const app = searchParams.get('example') ?? 'learn-001.html';
  const iframe = document.querySelector('iframe');
  header.attr?.flush?.();
  header.actions?.flush?.();
  config.flush?.();
  logging.flush?.();
  iframe.src = `./examples/${app}.html`;
}

export function bootstrapPage({ searchParams }) {
  /**
   * @param {URL} url
   */
  const { nav } = getChrome();
  if (searchParams.has('presentation')) {
    nav.style.opacity = '0';
  }
}

const mainResizeObserver = new ResizeObserver(entries => {
  for (const { target, contentRect } of entries) {
    const iframe = target.querySelector('iframe');
    const { width, height } = contentRect;
    iframe.width = width;
    iframe.height = height;
  }
});

let layout;
{
  const [{ width: initWidth }] = document.body.getClientRects();
  layout = initWidth >= 800 ? 'wide' : 'narrow';
}

const bodyResizeObserver = new ResizeObserver(entries => {
  const { config, nav } = getChrome();
  for (const { contentRect } of entries) {
    const { width } = contentRect;
    const nextLayout = width >= 800 ? 'wide' : 'narrow';

    if (layout !== nextLayout) {
      config.setLayout(nextLayout);
      nav.setLayout(nextLayout);
    }

    layout = nextLayout;
  }
});

function getChrome() {
  const nav = document.querySelector('#navigation');
  const header = document.querySelector('#header');
  const config = document.querySelector('#config');
  const logging = document.querySelector('#logging');
  return { header, config, logging, nav };
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
  const { header, config, logging } = getChrome();
  const message = event.data;

  switch (message.kind) {
    case 'attribute':
      header.attr.setAttribution?.(message.title, message.link)
      break;

    case 'register-button':
      header.actions.addButton?.(message.label, message.id);
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

const pageUrl = new URL(globalThis.location+'');

loadApp(pageUrl);
bootstrapPage(pageUrl);
mainResizeObserver.observe(document.querySelector('main'));
bodyResizeObserver.observe(document.body);
