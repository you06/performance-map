const fs = require('fs')

const dir = 'dist'

main()

function main() {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, 0744);
    }

    const template = fs.readFileSync('./index.template.html', 'utf8')
    const svgs = fs.readdirSync('./build')
    const contents = svgs
        .filter(svg => svg.endsWith('.svg'))
        .map(svg => {
            const endOffset = 4
            return svg.slice(0, svg.length - endOffset)
        })
        .map(svg => {
            const svgContent = fs.readFileSync(`./build/${svg}.svg`, 'utf8')
            const content = `<div class="svg-container" id="${svg}">\n\t${svgContent.split('\n').slice(2)}\n</div>`
            return content
        })
    const output = template.replace('{{svgs}}', contents.join('\n\n'))
    fs.writeFileSync(`./${dir}/index.html`, output)
}
