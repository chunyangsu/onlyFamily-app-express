// 注意：必须是整个项目的第一行代码！
require('module-alias/register')
// 引入环境变量配置(必须在加载 app 之前执行)
const env = require('@/config/env')
// 引入express
const express = require('express')
// 引入自动加载的路由入口文件
const routes = require('@/routes')
// 引入数据模型层的入口文件
const models = require('@/models')
// 引入全局错误处理中间件
const errorMiddleware = require('@/middlewares/errorMiddleware')
// HTTP请求日志中间件
const requestLoggerMiddleware = require('@/logger/requestLoggerMiddleware')

const port = env.app.port

// 创建实例
const app = express()

// 请求日志中间件(尽可能靠前注册)
app.use(requestLoggerMiddleware)
// 解析客户端请求体中的json格式数据，并将它挂载到req.body上
app.use(express.json())
// 挂载所有路由，统一加上 /api 前缀
app.use('/api', routes)

// 全局错误处理(必须放在所有中间件和路由的最后)
app.use(errorMiddleware)
// 这是express的代理信任配置
app.set('trust proxy', 1)

// 测试数据库连接
const startServer = async () => {
  try {
    // 验证连接
    await models.sequelize.authenticate()
    // console.log('数据库连接成功')

    // 开发环境：自动同步表结构
    if (env.app.nodeEnv === 'development') {
      // alter: true 尝试调整已有表结构，使其匹配 Model；不要直接用于生产
      await models.sequelize.sync({ alter: true })
    }
    // 生产环境：创建缺失的数据表
    // if (env.app.nodeEnv === 'production') {
    //   // 创建不存在的数据表，不主动删除已有表
    //   await models.sequelize.sync()
    // }
  } catch (err) {
    console.error(err.message)
  }

  // 数据库就绪后，再启动 HTTP 服务器
  app.listen(port, '127.0.0.1', () => {
    console.log('http服务启动了！')
  })
}

// 调用启动函数
startServer()
