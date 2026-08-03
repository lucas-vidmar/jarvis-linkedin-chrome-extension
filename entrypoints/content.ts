import { defineContentScript } from 'wxt/utils/define-content-script';

export default defineContentScript({
  matches: ['https://www.linkedin.com/*'],
  main() {},
});
