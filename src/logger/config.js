/**
 * 日志环境配置
 */

const isProduction = process.env.NODE_ENV === 'production'

/**
 * 日志级别
 *
 * 开发环境：debug
 * 生产环境：info
 *
 * 可通过 LOG_LEVEL 环境变量覆盖
 */
const logLevel = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug')

/**
 * 敏感字段脱敏配置
 *
 * 匹配到的字段将统一替换为 [REDACTED]
 */
const redactPaths = [
  // 密码
  'password',
  '*.password',
  'req.body.password',

  // Token
  'token',
  '*.token',
  'accessToken',
  '*.accessToken',
  'refreshToken',
  '*.refreshToken',

  // 请求认证信息
  'authorization',
  'req.headers.authorization',
  'req.headers.cookie',
  'cookie',

  // 密钥
  'secret',
  '*.secret',
  'accessKeySecret',
  '*.accessKeySecret',
  'securityToken',
  '*.securityToken'
]

module.exports = {
  isProduction,
  logLevel,
  redactPaths
}
