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

// 注册模型关联关系(注意：这里必须在所有模型加载完成后再执行，否则可能会出现模型未定义的情况)
require('./relationship')
