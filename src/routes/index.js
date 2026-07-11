// 路由的入口文件
const express = require('express')
const path = require('path')
const autoLoadModules = require('@/utils/autoLoader')

const router = express.Router()

// 递归扫描 routes 目录下的所有文件(除了index.js入口文件)
const loadedRoutes = autoLoadModules(path.join(__dirname))

loadedRoutes.forEach(({ name, content }) => {
  // 过滤掉index.js
  if (name === 'index') return
  // 直接使用文件名作为路由路径（过滤中间的目录层级）
  router.use(`/${name}`, content)
})

module.exports = router
