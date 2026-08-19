const fs = require('fs')
const path = require('path')

const rootDir = path.join(__dirname, '..')
const dirsToSearch = ['app', 'components']

function walkAndReplace(dir) {
  if (!fs.existsSync(dir)) return
  const files = fs.readdirSync(dir)
  for (const file of files) {
    const fullPath = path.join(dir, file)
    const stat = fs.statSync(fullPath)
    if (stat.isDirectory()) {
      walkAndReplace(fullPath)
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8')
      let newContent = content.replace(/\bsm:/g, '@md:')
      if (content !== newContent) {
        fs.writeFileSync(fullPath, newContent, 'utf8')
        console.log('Updated:', fullPath)
      }
    }
  }
}

dirsToSearch.forEach(d => walkAndReplace(path.join(rootDir, d)))
