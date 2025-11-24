/**
 * @param {string} appId
 * @returns {string}
 */
export function redirect(appId) {
  switch (appId) {
    case 'learn-003': return 'compute/econ2102/index';
    default: return appId;
  }
}

/**
 * @param {boolean} redirect
 * @returns {URL}
 */
export function getPageURL(redirectApp) {
  const pageUrl = new URL(globalThis.location+'');
  if (redirectApp) {
    pageUrl.searchParams.set(
      'example',
      redirect(pageUrl.searchParams.get('example') ?? 'learn-001'),
    );
  }
  return pageUrl;
}


