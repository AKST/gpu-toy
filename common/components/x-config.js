import { el, createStyleSheetLink } from './common/dom-kit.js';

function createKnob(name, labelText, value) {
  const label = el('label', { htmlFor: name }, [labelText]);
  const input = el('input', { id: name, name, value });
  return [label, input];
}

export class ConfigSideBarElement extends HTMLElement {
  #root = this.attachShadow({ mode: "open" });

  connectedCallback() {
    const cssLinks = [
      import.meta.resolve('./common/style-reset.css'),
      import.meta.resolve('./x-config.css'),
    ].map(createStyleSheetLink)

    const form = el('form', {}, [
      el('fieldset', {}, [
        el('legend', {}, ['Knobs']),
        this.fields = el('div', { class: 'fields' }),
        el('input', { type: 'submit', value: 'Submit' }),
      ]),
    ]);

    this.#root.replaceChildren(...cssLinks, form);
    this.flush();

    form.addEventListener('submit', event => {
      event.preventDefault();
      const formData = new FormData(form);
      const detail = Object.fromEntries(formData.entries());
      this.dispatchEvent(new CustomEvent('cfg-update', { detail, bubbles: true, composed: true }));
    });
  }

  setKnobs(knobs) {
    this.#setFieldsetDisplay('block');
    for (const { name, label: labelText, init } of knobs) {
      const [label, input] = createKnob(name, labelText, init);
      this.fields.appendChild(label);
      this.fields.appendChild(input);
    }
  }

  flush() {
    this.fields.replaceChildren();
    this.#setFieldsetDisplay('none');
  }

  #setFieldsetDisplay(display) {
    this.#root.querySelector('fieldset').style = display;
  }
}

customElements.define("x-config", ConfigSideBarElement);
