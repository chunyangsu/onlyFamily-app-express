const pinoHttp = require('pino-http')
const { randomUUID } = require('crypto')
const logger = require('./index')

/**
 * http请求日志中间件
 */
const requestLoggerMiddleware = pinoHttp({
  logger,

  // 为每个请求生成唯一 ID
  genReqId: (req) => {
    return req.headers['x-request-id'] || randomUUID()
  },

  // 将 requestId 返回给客户端
  customProps: (req) => ({
    requestId: req.id
  }),

  // 请求开始时记录
  customLogLevel: (req, res, err) => {
    if (err || res.statusCode >= 500) {
      return 'error'
    }
    if (res.statusCode >= 400 && res.statusCode < 500) {
      return 'warn'
    }
    return 'info'
  },

  // 自定义请求日志字段
  customSuccessObject: (req, res, responseTime) => ({
    type: 'request',
    requestId: req.id,
    method: req.method,
    url: req.originalUrl,
    statusCode: res.statusCode,
    responseTime
  }),

  // 请求异常时记录的字段
  customErrorObject: (req, res, err) => ({
    type: 'request',
    requestId: req.id,
    method: req.method,
    url: req.originalUrl,
    statusCode: res.statusCode,
    err
  }),

  // 不记录健康检查请求（如果后续添加健康检查接口）
  autoLogging: {
    ignore: (req) => req.url === '/health'
  }
})

module.exports = requestLoggerMiddleware
