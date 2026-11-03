const jwt = require('jsonwebtoken')
const env = require('@/config/env')

/**
 * 生成 JWT Token
 * @param {Object} payload - 需要加密的用户信息 (如 { id, name, mobile })
 * @returns {String} 生成的 Token 字符串
 */
const generateToken = (payload) => {
  const token = jwt.sign(payload, env.jwt.secret, { expiresIn: env.jwt.expiresIn })
  return token
}

/**
 * 校验并解析 JWT Token
 * @param {String} token - 待校验的 Token 字符串
 * @returns {Object} 解析出的 Payload 对象
 * @throws {Error} 如果 Token 无效或过期，抛出异常
 */
const verifyToken = (token) => {
  const payloadInfo = jwt.verify(token, env.jwt.secret)
  return payloadInfo
}

module.exports = { generateToken, verifyToken }
