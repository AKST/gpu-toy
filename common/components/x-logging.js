export class LoggingElement extends HTMLElement {
  #root = this.attachShadow({ mode: "open" });

  connectedCallback() {
    const cssLink = document.createElement('link')
    cssLink.rel = 'stylesheet';
    cssLink.href = import.meta.resolve('./x-logging.css');

    const table = this.table = document.createElement('table');
    table.style.marginTop = '8px';
    table.appendChild(document.createElement('tr'));
    table.children[0].appendChild(document.createElement('th'));
    table.children[0].appendChild(document.createElement('th'));
    table.children[0].children[0].innerText = 'Time';
    table.children[0].children[1].innerText = 'Message';
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.appendChild(document.createTextNode('Logs'));
    summary.style.fontFamily = 'monospace';
    summary.style.fontWeight = '900';
    details.open = true;
    details.replaceChildren(summary, table);
    this.#root.replaceChildren(cssLink, details);
  }

  log(data) {
    const row = document.createElement('tr')
    row.appendChild(document.createElement('td'));
    row.appendChild(document.createElement('td'));
    row.children[0].innerText = new Date().toLocaleTimeString();
    row.children[1].innerText = data.map(e => JSON.stringify(e)).join(' ');
    this.table.insertBefore(row, this.table.children[1]);
  }

  flush() {
    this.table.replaceChildren(this.table.children[0]);
  }
}

customElements.define("x-logging", LoggingElement);
