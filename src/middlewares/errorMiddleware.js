// 引入：封装的统一响应工具
const { fail } = require('@/utils/responseHandler')

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

  // 3. 开发环境打印详细错误堆栈，方便排查问题
  if (process.env.NODE_ENV === 'development') {
    //   console.error(`[${statusCode}] ${message}`)
    //   console.error(err.stack)
  }

  // 2. 处理自定义业务异常 (AppError)
  // if (err instanceof AppError) {
  //   return fail(res, err.code, err.message)
  // }

  // 处理特定类型的错误
  // if (err.name === 'ValidationError') {
  //   return error(res, err.message, 400, 400)
  // }

  // if (err.name === 'UnauthorizedError') {
  //   return error(res, err.message, 401, 401)
  // }

  // 错误状态码
  const httpStatus = err.status || 500
  // 错误信息
  const msg = err.message || '服务器内部错误'

  // 返回失败响应
  fail(res, msg, httpStatus)
}

module.exports = errorMiddleware
