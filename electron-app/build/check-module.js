const mod = require('png-to-ico');
console.log('type:', typeof mod);
console.log('keys:', Object.keys(mod).join(', '));
if (typeof mod === 'function') {
  console.log('  (it is a function)');
} else if (typeof mod === 'object' && mod.default) {
  console.log('  default export type:', typeof mod.default);
}
