export class LoggingElement extends HTMLElement {
  #root = this.attachShadow({ mode: "open" });

  connectedCallback() {
    const cssLink = document.createElement('link')
    cssLink.rel = 'stylesheet';
    cssLink.href = import.meta.resolve('./x-logging.css');

    const table = this.table = document.createElement('table');
    table.appendChild(document.createElement('tr'));
    table.children[0].appendChild(document.createElement('th'));
    table.children[0].appendChild(document.createElement('th'));
    table.children[0].children[0].innerText = 'Time';
    table.children[0].children[1].innerText = 'Message';
    this.#root.replaceChildren(cssLink, table);
  }

  log(data) {
    const row = document.createElement('tr')
    row.appendChild(document.createElement('td'));
    row.appendChild(document.createElement('td'));
    row.children[0].innerText = new Date().toLocaleTimeString();
    row.children[1].innerText = JSON.stringify(data);
    this.table.appendChild(row);
  }

  flush() {
    this.table.replaceChildren(this.table.children[0]);
  }
}

customElements.define("x-logging", LoggingElement);
