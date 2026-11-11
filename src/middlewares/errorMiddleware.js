// 引入：封装的统一响应工具
const { fail } = require('@/utils/responseHandler')
const codeEnum = require('@/data/enum/code')
// const env = require('@/config/env')
const logger = require('@/logger/index')

/**
 * 全局错误处理中间件
 * 必须接收 4 个参数 (err, req, res, next)
 */
const errorMiddleware = (err, req, res, next) => {
  // 打印错误日志
  console.log('status')
  console.log(err.status)
  console.log('stack')
  console.log(err.stack)
  console.log('message')
  console.log(err.message)
  console.log('name')
  console.log(err.name)

  // 开发环境打印详细错误堆栈，方便排查问题
  // if (env.app.nodeEnv === 'development') {
  //   //   console.error(`[${statusCode}] ${message}`)
  //   //   console.error(err.stack)
  // }

  // 如果响应已经发送，交给 Express 默认错误处理机制
  if (res.headersSent) {
    return next(err)
  }

  // http错误状态码
  const httpStatus = err.statusCode || err.status || 500

  // 5xx：记录服务端异常及堆栈
  if (httpStatus >= 500) {
    logger.error(
      {
        type: 'error',
        requestId: req.id,
        method: req.method,
        url: req.originalUrl,
        httpStatus,
        userId: req.user?.id,
        err
      },
      '服务器内部错误'
    )
  }

  // 业务状态码
  const code = err.code || codeEnum.unknownError

  // 4xx：不在这里重复记录，由 requestLogger 记录请求状态
  const msg = httpStatus >= 500 ? '服务器内部错误' : err.message || '请求处理失败'

  // 返回失败响应
  fail(res, msg, httpStatus, code)
}

module.exports = errorMiddleware
