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
// 引入redis
const { connectRedis, disconnectRedis } = require('@/config/redis')

const port = env.app.port

// 创建express实例
const app = express()

// HTTP请求日志中间件(尽可能靠前注册)
app.use(requestLoggerMiddleware)
// 解析客户端请求体中的json格式数据，并将它挂载到req.body上
app.use(express.json())
// 挂载所有路由，统一加上 /api 前缀
app.use('/api', routes)

// 全局错误处理(必须放在所有中间件和路由的最后)
app.use(errorMiddleware)
// 这是express的代理信任配置
app.set('trust proxy', 1)

// HTTP Server 实例
let server = null

// 防止重复执行关闭逻辑
let isShuttingDown = false

/**
 * 关闭基础设施连接
 */
const closeResources = async () => {
  // 关闭 Redis
  try {
    await disconnectRedis()
    console.log('[Redis] Disconnected')
  } catch (error) {
    console.error('[Redis] Disconnect failed:', error)
  }
  // 关闭 MySQL
  try {
    await models.sequelize.close()
    console.log('[MySQL] Disconnected')
  } catch (error) {
    console.error('[MySQL] Disconnect failed:', error)
  }
}

/**
 * 优雅关闭服务
 */
const shutdown = async (signal) => {
  if (isShuttingDown) {
    return
  }

  isShuttingDown = true

  console.log(`[Server] Received ${signal}, shutting down...`)

  try {
    // 1. 关闭 HTTP 服务，停止接收新请求
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
          } else {
            resolve()
          }
        })
      })

      console.log('[Server] HTTP server closed')
    }

    // 2. 关闭 Redis 和 MySQL
    await closeResources()

    console.log('[Server] Shutdown completed')

    process.exitCode = 0
  } catch (error) {
    console.error('[Server] Shutdown failed:', error)

    await closeResources()

    process.exitCode = 1
  }
}

// 监听进程退出信号
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

/**
 * 启动服务
 */
const startServer = async () => {
  try {
    // 1. 初始化 Redis
    await connectRedis()

    console.log('[Redis] Connection established')

    // 2. 验证 MySQL 连接
    await models.sequelize.authenticate()

    console.log('[MySQL] Connection established')

    // 3. 数据库就绪后，启动 HTTP 服务
    server = app.listen(port, '127.0.0.1', () => {
      console.log(`[Server] HTTP service running on port ${port}`)
    })

    // 4. 监听 HTTP 服务异常
    server.on('error', (error) => {
      console.error('[Server] HTTP server error:', error)
      shutdown('HTTP_SERVER_ERROR')
    })
  } catch (error) {
    console.error('[Server] Initialization failed:', error)

    // 初始化失败，关闭已经建立的连接
    await closeResources()

    process.exitCode = 1
  }
}

// 调用启动服务
startServer()
