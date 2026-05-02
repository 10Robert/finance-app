process.chdir(__dirname)
const { spawn } = require('child_process')
const path = require('path')
const vite = path.join(__dirname, 'node_modules', 'vite', 'bin', 'vite.js')
const args = [vite]
if (process.env.PORT && !process.argv.slice(2).includes('--port')) {
  args.push('--port', process.env.PORT, '--strictPort')
}
args.push(...process.argv.slice(2))
const child = spawn(process.execPath, args, { stdio: 'inherit' })
child.on('exit', (code) => process.exit(code ?? 0))
