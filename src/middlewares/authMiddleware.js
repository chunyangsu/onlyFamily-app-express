const jwt = require('jsonwebtoken')
const { success, fail } = require('@/utils/responseHandler')
const codeEnum = require('@/data/enum/code')

/**
 * 全局鉴权中间件
 * 验证 JWT Token
 */
const errorMiddleware = (req, res, next) => {
  // 1. 从请求头中提取 Token (格式: Bearer <token>)
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return fail(res, '未提供有效的身份凭证', 401, codeEnum.unauthorized)
  }

  // 2. 提取纯 Token 字符串
  const token = authHeader.split(' ')[1]

  try {
    // 3. 验证 Token 并解析 Payload
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    // 4. 将用户信息挂载到 req 对象上，方便后续 Controller 使用
    req.user = decoded
    next() // 验证通过，放行
  } catch (error) {
    // Token 过期或签名错误
    return fail(res, '身份凭证无效或已过期', 401, codeEnum.unauthorized)
  }
}

module.exports = errorMiddleware
