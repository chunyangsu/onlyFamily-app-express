const autoLoadModules = require('@/utils/autoLoader')
const path = require('path')

const services = {}
const loadedServices = autoLoadModules(path.join(__dirname, 'modules'))

loadedServices.forEach(({ name, content }) => {
  services[name] = content
})

module.exports = services
