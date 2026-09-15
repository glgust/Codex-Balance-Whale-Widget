const fs = require('node:fs');
const path = require('node:path');

function readSettings(directory) {
  try {
    const value = JSON.parse(fs.readFileSync(path.join(directory, 'desktop-settings.json'), 'utf8'));
    return {startWithCodex: value.startWithCodex === true};
  } catch { return {startWithCodex: false}; }
}

function writeSettings(directory, settings) {
  fs.mkdirSync(directory, {recursive: true});
  const target = path.join(directory, 'desktop-settings.json');
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify({startWithCodex: settings.startWithCodex === true}));
  fs.renameSync(temporary, target);
}

module.exports = {readSettings, writeSettings};
