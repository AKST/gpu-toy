import { el, createStyleSheetLink } from './common/dom-kit.js';

function createKnob(name, labelText, value) {
  const valueFmt = value.toLocaleString('fullwide', {
      useGrouping: false,
      maximumFractionDigits: 20
  });
  const label = el('label', { htmlFor: name }, [labelText]);
  const input = el('input', { id: name, name, value: valueFmt, 'data-type': 'number' });
  return [label, input];
}

function * createConfigRowItems(configRows) {
  for (const config of configRows) {
    switch (config.kind) {
      case 'number': {
        const { name, label: labelText, init } = config;
        const [label, input] = createKnob(name, labelText, init);
        yield * [label, input];
        break;
      }
      case 'boolean': {
        const { name, label: labelText, init } = config;
        yield el('label', {}, [labelText]);
        yield el('label', {}, [el('input', {
          type: 'radio',
          name,
          value: 'true',
          checked: init === true,
          'data-type': 'boolean'
        }), 'Yes']);
        yield el('label', {}, [el('input', {
          type: 'radio',
          name,
          value: 'false',
          checked: init === false,
          'data-type': 'boolean'
        }), 'No']);
        break;
      }
      case 'title': {
        yield el('label', { style: 'font-weight: bold' }, [config.title]);
        break;
      }
      default:
        console.warn('unknown config row item', config);
        break;
    }
  }
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
        el('input', { type: 'submit', value: 'Apply Update' }),
      ]),
    ]);

    this.#root.replaceChildren(...cssLinks, form);
    this.flush();

    form.addEventListener('submit', event => {
      event.preventDefault();
      const formData = new FormData(form);
      const detail = Object.fromEntries(formData.entries());
      for (const k of Object.keys(detail)) {
        const input = form.querySelector(`[name="${k}"]`);
        const type = input?.dataset?.type;
        if (type === 'boolean') {
          detail[k] = detail[k] === 'true';
        } else if (type === 'number') {
          detail[k] = parseFloat(detail[k]);
        }
      }
      this.dispatchEvent(new CustomEvent('cfg-update', { detail, bubbles: true, composed: true }));
    });
  }

  setKnobs(rows) {
    this.#setFieldsetDisplay('block');
    this.fields.replaceChildren(...createConfigRowItems(rows));
  }

  flush() {
    this.fields.replaceChildren();
    this.#setFieldsetDisplay('none');
  }

  #setFieldsetDisplay(display) {
    const fieldset = this.#root.querySelector('fieldset');
    fieldset.style.display = display;
  }
}

customElements.define("x-config", ConfigSideBarElement);
