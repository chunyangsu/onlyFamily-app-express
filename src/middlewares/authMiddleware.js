const { verifyToken } = require('@/utils/jwt')
const { fail } = require('@/utils/responseHandler')
const codeEnum = require('@/data/enum/code')

/**
 * 全局鉴权中间件
 * 验证 JWT Token
 */
const authMiddleware = (req, res, next) => {
  // 1. 从请求头中提取 Token (格式: Bearer <token>)
  const authorization = req.headers.authorization

  if (!authorization || !authorization.startsWith('Bearer ')) {
    return fail(res, '未授权登录', 401, codeEnum.unauthorized)
  }

  // 2. 提取纯 Token 字符串
  const token = authorization.slice(7).trim()

  if (!token) {
    return fail(res, '登录凭证无效', 401, codeEnum.unauthorized)
  }

  try {
    // 验证 Token 并解析 Payload对象
    const payload = verifyToken(token)
    console.log(payload)
    if (!payload.sub) {
      return fail(res, '登录凭证无效', 401, codeEnum.unauthorized)
    }
    // 注入当前登录用户id
    req.user = {
      id: payload.sub
    }
    // 验证通过，放行
    next()
  } catch (error) {
    // Token 过期或签名错误
    console.log(error)
    return fail(res, '身份凭证无效或已过期', 401, codeEnum.unauthorized)
  }
}

module.exports = authMiddleware
