export class AttributionElement extends HTMLElement {
  #root = this.attachShadow({ mode: "open" });

  setAttribution(title, link) {
    this.flush();
    const p = document.createElement('p');
    const a = document.createElement('a');
    p.appendChild(document.createTextNode('Source: '));
    p.appendChild(a);
    a.appendChild(document.createTextNode(title));
    a.target = '_blank';
    a.href = link;

    this.#root.appendChild(p);
  }

  flush() {
    this.#root.childNodes.forEach(it => this.#root.removeChild(it));
  }
}

customElements.define("x-attribution", AttributionElement);
