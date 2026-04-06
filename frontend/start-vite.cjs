process.chdir(__dirname)
const path = require('path')
const vite = path.join(__dirname, 'node_modules', 'vite', 'bin', 'vite.js')
require(vite)
