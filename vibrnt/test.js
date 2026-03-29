const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;
let html = fs.readFileSync(__dirname + '/dist/index.html', 'utf-8');
html = html.replace("refreshAll();", ""); // PREVENT CRASH
const dom = new JSDOM(html, { runScripts: "dangerously" });
setTimeout(() => {
  dom.window.fetchJSON('/api/trends').then(res => console.log('fetchJSON res:', JSON.stringify(res)));
}, 500);
