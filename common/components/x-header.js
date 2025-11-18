import { f, el, createStyleSheetLink } from './common/dom-kit.js';

const links = [
  import.meta.resolve('./common/style-reset.css'),
  import.meta.resolve('./x-header.css'),
];

export class NotebookHeaderElement extends HTMLElement {
  #root = this.attachShadow({ mode: "open" });

  attr = null;
  actions = null;

  connectedCallback() {
    this.#root.replaceChildren(
      ...links.map(createStyleSheetLink),
      el('h1', {}, ['WebGPU Notebook']),
      el('div', { class: 'header-end' }, [
        this.attr = el('x-attribution', { id: 'attribution' }, []),
        this.actions = el('x-actions', { id: 'actions' }, []),
      ]),
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

customElements.define('x-header', NotebookHeaderElement, { extends: "header" });
