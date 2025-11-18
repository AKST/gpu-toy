import { f, el, createStyleSheetLink } from './common/dom-kit.js';

function withSlot(slot) {
  const links = slot.querySelectorAll('a');
  return f(
    el('h3', {}, [slot.getAttribute('title')]),
    el('ul', {}, Array.from(links, link => el('li', {}, [link]))),
  );
}

const links = [
  import.meta.resolve('./common/style-reset.css'),
  import.meta.resolve('./x-navigation.css'),
];

export class NotebookNavElement extends HTMLElement {
  #root = this.attachShadow({ mode: "open" });

  connectedCallback() {
    this.#root.addEventListener('click', event => {
      const target = event.target.closest('a');
      if (target == null) return;

      event.preventDefault();
      const parsed = new URL(target.href);
      const detail = new URL(globalThis.location+'');
      detail.searchParams.set('example', parsed.searchParams.get('example'));

      this.dispatchEvent(new CustomEvent('load-example', {
        detail,
        bubbles: true,
      }));
    })

    this.#root.replaceChildren(
      ...links.map(createStyleSheetLink),
      el('h2', {}, ['Notebooks']),
      ...Array.from(this.querySelectorAll('slot[name=section]'), withSlot),
    );
  }

  setLayout(layout) {
    if (layout === 'narrow') {
      this.style.display = 'none';
    } else {
      this.style.display = 'block';
    }
  }
}

customElements.define('x-navigator', NotebookNavElement);
