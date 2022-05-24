const fs = require('fs')
const child_process = require('child_process')

const dir = './svg'

main()

function main() {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, 0744);
    }
    const drawios = fs.readdirSync('./src')
    drawios
        .filter(name => name.endsWith('.drawio'))
        .map(name => {
            const endOffset = 7
            return name.slice(0, name.length - endOffset)
        })
        .map(name => {
            child_process.execSync(`draw.io -xf svg -o ${dir}/${name}.svg ./src/${name}.drawio`)
        })
}
