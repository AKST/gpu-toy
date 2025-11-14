import { el, createStyleSheetLink } from './common/dom-kit.js';

export class AttributionElement extends HTMLElement {
  #root = this.attachShadow({ mode: "open" });

  setAttribution(title, link) {
    this.flush();
    this.#root.replaceChildren(
      createStyleSheetLink(import.meta.resolve('./common/style-reset.css')),
      el('p', {}, [
        'Source: ',
        el('a', { target: '_blank', href: link }, [title]),
      ]),
    );
  }

  flush() {
    this.#root.childNodes.forEach(it => this.#root.removeChild(it));
  }
}

customElements.define("x-attribution", AttributionElement);
