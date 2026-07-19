// 注意：必须是整个项目的第一行代码！
require('module-alias/register')
// 引入express
const express = require('express')
// 创建实例
const app = express()
// 引入自动加载的路由入口文件
const routes = require('@/routes')
// 引入数据模型层的入口文件
const models = require('@/models')
// 引入全局错误处理中间件
const errorMiddleware = require('@/middlewares/errorMiddleware')

const port = process.env.PORT

// 解析客户端请求体中的json格式数据，并将它挂载到req.body上
app.use(express.json())
// 挂载所有路由，统一加上 /api 前缀
app.use('/api', routes)

// 全局错误处理(必须放在所有中间件和路由的最后)
app.use(errorMiddleware)

// 测试数据库连接
const startServer = async () => {
  try {
    // 验证连接
    await models.sequelize.authenticate()
    // console.log('数据库连接成功')

    // 开发阶段自动同步表结构（生产环境务必注释掉！）
    await models.sequelize.sync({ alter: true })
  } catch (err) {
    console.error(err.message)
  }

  // 数据库就绪后，再启动 HTTP 服务器
  app.listen(port, () => {
    console.log('http服务启动了！')
  })
}

// 调用启动函数
startServer()
