// 路由的入口文件
const express = require('express')
const fs = require('fs')
const path = require('path')

const router = express.Router()

// 获取当前 modules 目录的绝对路径
const modulesDir = path.join(__dirname, 'modules')

// 遍历 modules 目录并自动挂载路由到index.js中
fs.readdirSync(modulesDir).forEach((fileName) => {
  if (!fileName.endsWith('.js')) return

  const baseName = fileName.replace('.js', '')
  const routeModule = require(path.join(modulesDir, fileName))
  router.use(`/${baseName}`, routeModule)
})

module.exports = router
