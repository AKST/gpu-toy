import { f, el, createStyleSheetLink } from './common/dom-kit.js';

function withSlot(slot) {
  const links = slot.querySelectorAll('a');
  return f(
    el('h3', {}, [slot.getAttribute('title')]),
    el('ul', {}, Array.from(links, link => el('li', {}, [link]))),
  );
}

export class NotebookNavElement extends HTMLElement {
  #root = this.attachShadow({ mode: "open" });

  connectedCallback() {
    this.#root.addEventListener('click', event => {
      event.preventDefault();
      this.dispatchEvent(new CustomEvent('load-example', {
        detail: event.target.href,
        bubbles: true,
      }));
    });

    const slots = this.querySelectorAll('slot[name=section]');
    const title = document.createElement('h2');
    const styles = [
      import.meta.resolve('./common/style-reset.css'),
      import.meta.resolve('./x-navigation.css'),
    ].map(createStyleSheetLink);

    title.innerText = 'Notebooks';
    this.#root.replaceChildren(...styles, title, ...Array.from(slots, withSlot));
  }
}

customElements.define('x-navigator', NotebookNavElement);
