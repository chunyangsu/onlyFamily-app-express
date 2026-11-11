/**
 * 日志类型
 */
const LOG_TYPE = Object.freeze({
  REQUEST: 'request', // http请求
  ERROR: 'error', // 错误
  BUSINESS: 'business', // 业务
  SECURITY: 'security', // 安全
  SYSTEM: 'system' // 系统
})

/**
 * 业务模块
 */
const LOG_MODULE = Object.freeze({
  USER: 'user',
  FAMILY: 'family',
  DISH: 'dish',
  // ORDER: 'order',
  // BILL: 'bill',
  POST: 'post',
  DATABASE: 'database',
  OSS: 'oss'
})

module.exports = {
  LOG_TYPE,
  LOG_MODULE
}
