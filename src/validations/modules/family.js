const Joi = require('joi')
const common = require('@/validations/common')

// 更新家庭头像
const updateFamilyAvatar = {
  body: Joi.object({ avatarId: common.requiredNumber.max(2147483647) }).unknown(false)
}

// 32字节随机凭证采用无填充 base64url 编码，长度为 43；不是数据库中的 64 位哈希。
const invitationCode = Joi.string().length(43).pattern(/^[A-Za-z0-9_-]{43}$/).required()

// 创建邀请码：家庭来自请求头，不允许 body 指定用户、角色或有效期。
const createInvitationCode = {
  headers: Joi.object({
    'family-id': common.requiredNumber.max(2147483647)
  }).unknown(true),
  body: Joi.object({}).unknown(false)
}

// 查询邀请和加入家庭只需要原始凭证，不依赖当前家庭请求头。
const getInvitationDetail = {
  body: Joi.object({ invitationCode }).unknown(false)
}

const joinFamily = {
  body: Joi.object({ invitationCode }).unknown(false)
}

module.exports = { updateFamilyAvatar, createInvitationCode, getInvitationDetail, joinFamily }
