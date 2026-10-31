/* SPDX-License-Identifier: Apache-2.0 */
/**
 * @file Inlines styles.css, engine.js and app.js into index.template.html,
 * producing one self-contained page. Usage: node build.js [outFile]
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const out = process.argv[2] || path.join(__dirname, 'dist', 'buckets-prototype.html');

// Function replacers so `$&` and friends in the sources are never interpreted.
const html = read('index.template.html')
  .replace('/*STYLES*/', () => read('styles.css'))
  .replace('/*ENGINE*/', () => read('engine.js'))
  .replace('/*APP*/', () => read('app.js'));

if (/<\/script/i.test(read('engine.js') + read('app.js'))) throw new Error('A script contains </script>, which would break inlining.');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`Wrote ${out} (${(html.length / 1024).toFixed(1)} KB)`);
