const autoLoadModules = require('@/utils/autoLoader')
const path = require('path')

const controllers = {}
const loadedControllers = autoLoadModules(path.join(__dirname, 'modules'))

loadedControllers.forEach(({ name, content }) => {
  controllers[name] = content
})

module.exports = controllers
