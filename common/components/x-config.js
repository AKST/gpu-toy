const createTextNode = document.createTextNode.bind(document);

function createKnob(name, labelText, value) {
  const label = document.createElement('label');
  const input = document.createElement('input');
  input.id = name;
  input.name = name;
  input.value = value;
  label.htmlFor = name;
  label.appendChild(createTextNode(labelText));
  return [label, input];
}

export class ConfigSideBarElement extends HTMLElement {
  #root = this.attachShadow({ mode: "open" });

  connectedCallback() {
    const cssLink = document.createElement('link')
    cssLink.rel = 'stylesheet';
    cssLink.href = import.meta.resolve('./x-config.css');

    const form = this.form = document.createElement('form');
    const fieldSet = this.fieldset = document.createElement('fieldset')
    const fields = this.fields = document.createElement('div');
    fields.className = 'fields';

    const submit = document.createElement('input');
    submit.type = 'submit';
    submit.value = 'Submit';

    const legend = document.createElement('legend');
    legend.appendChild(createTextNode('Knobs'));
    fieldSet.appendChild(legend);
    fieldSet.appendChild(fields);
    fieldSet.appendChild(submit);
    form.appendChild(fieldSet);


    this.#root.replaceChildren(cssLink, form);
    this.flush();

    form.addEventListener('submit', event => {
      event.preventDefault();
      const formData = new FormData(form);
      const detail = Object.fromEntries(formData.entries());
      this.dispatchEvent(new CustomEvent('cfg-update', { detail, bubbles: true, composed: true }));
    });
  }

  setKnobs(knobs) {
    this.fieldset.style.display = 'block';
    for (const { name, label: labelText, init } of knobs) {
      const [label, input] = createKnob(name, labelText, init);
      this.fields.appendChild(label);
      this.fields.appendChild(input);
    }
  }

  flush() {
    this.fields.replaceChildren();
    this.fieldset.style.display = 'none';
  }
}

customElements.define("x-config", ConfigSideBarElement);
