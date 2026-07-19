const jwt = require('jsonwebtoken')

/**
 * 生成 JWT Token
 * @param {Object} payload - 需要加密的用户信息 (如 { id, name, mobile })
 * @returns {String} 生成的 Token 字符串
 */
const generateToken = (payload) => {
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN })
  return token
}

/**
 * 校验并解析 JWT Token
 * @param {String} token - 待校验的 Token 字符串
 * @returns {Object} 解析出的 Payload 对象
 * @throws {Error} 如果 Token 无效或过期，抛出异常
 */
const verifyToken = (token) => {
  const payloadInfo = jwt.verify(token, process.env.JWT_SECRET)
  return payloadInfo
}

module.exports = { generateToken, verifyToken }
