export class ActionsElement extends HTMLElement {
  #root;

  constructor(){
    super();
    this.#root = this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this.#root.addEventListener('click', event => {
      const iframe = document.querySelector('iframe');
      const button = event.target;
      const id = button.dataset.actionId;
      iframe.contentWindow.postMessage({ kind: 'action', id });
    });
  }

  addButton(label, id) {
    this.flush();
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
