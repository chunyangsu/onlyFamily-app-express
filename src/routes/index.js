// 路由的入口文件
const express = require('express')
const fs = require('fs')
const path = require('path')
const autoLoadModules = require('@/utils/autoLoader')

const router = express.Router()
const loadedRoutes = autoLoadModules(path.join(__dirname, 'modules'))

// 自动挂载路由，例如: user.js -> /user
loadedRoutes.forEach(({ name, content }) => {
  router.use(`/${name}`, content)
})

module.exports = router
