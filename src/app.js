// 注意：必须是整个项目的第一行代码！
require('module-alias/register')
// 引入express
const express = require('express')
// 创建实例
const app = express()
// 引入自动加载的路由入口文件
const routes = require('@/routes')

const port = 3000

// 挂载所有路由，统一加上 /api 前缀
app.use('/api', routes)

// 启动服务器
app.listen(port, () => {
  // http://localhost:3000
  console.log('http服务启动了！')
})
