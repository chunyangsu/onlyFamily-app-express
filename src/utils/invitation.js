const { randomBytes, createHash } = require('node:crypto')

/**
 * 生成32字节随机邀请凭证，base64url 无填充编码后为 43 位。
 * 原始凭证仅返回客户端，不写入数据库或日志。
 */
const generateInvitationCode = () => randomBytes(32).toString('base64url')

/**
 * 计算原始凭证的 SHA-256 哈希，供存储及后续查询使用
 */
const hashInvitationCode = (invitationCode) => {
  if (typeof invitationCode !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(invitationCode)) {
    const error = new Error('邀请凭证格式不正确')
    error.status = 400
    throw error
  }
  return createHash('sha256').update(invitationCode).digest('hex')
}

module.exports = { generateInvitationCode, hashInvitationCode }
