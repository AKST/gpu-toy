import { createStyleSheetLink } from './common/dom-kit.js';

export class ActionsElement extends HTMLElement {
  #root = this.attachShadow({ mode: "open" });

  connectedCallback() {
    const cssLinks = [
      import.meta.resolve('./common/style-reset.css'),
      import.meta.resolve('./x-actions.css'),
    ].map(createStyleSheetLink)

    this.#root.addEventListener('click', event => {
      const iframe = document.querySelector('iframe');
      const button = event.target;
      const id = button.dataset.actionId;
      iframe.contentWindow.postMessage({ kind: 'action', id });
    });

    this.#root.replaceChildren(...cssLinks);
  }

  addButton(label, id) {
    const button = document.createElement('button');
    button.appendChild(document.createTextNode(label));
    button.dataset.actionId = id;
    this.#root.appendChild(button);
  }

  flush() {
    this.#root.childNodes.forEach(it => this.#root.removeChild(it));
  }
}

customElements.define("x-actions", ActionsElement);
