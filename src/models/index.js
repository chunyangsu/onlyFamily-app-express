// src/models/index.js
const autoLoadModules = require('@/utils/autoLoader')
const path = require('path')
const sequelize = require('@/config/database')

const models = {}
const loadedModels = autoLoadModules(path.join(__dirname, 'modules'))

// 将加载的模块挂载到 models 对象上，例如: models.userList
loadedModels.forEach(({ name, content }) => {
  models[name] = content
})

// 顺便把 sequelize 实例也导出，方便其他地方使用
models.sequelize = sequelize

module.exports = models
