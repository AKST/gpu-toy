
export function createStyleSheetLink(url) {
  const style = document.createElement('link');
  style.href = url;
  style.rel = 'stylesheet';
  return style;
}

export const t = text => document.createTextNode(text);

export function f(...children) {
  const fragment = document.createDocumentFragment();
  fragment.replaceChildren(...children);
  return fragment;
}

export function el(tag, attr = {}, children) {
  const element = document.createElement(tag);
  for (const [k, v] of Object.entries(attr)) {
    const vstr = typeof v === 'string' ? v : `${v}`;
    element.setAttribute(k, vstr);
  }
  if (children) {
    const normalisedChildren = children.map(child => (
      typeof child === 'string' ? t(child) : child
    ));
    element.replaceChildren(...normalisedChildren);
  }
  return element;
}
