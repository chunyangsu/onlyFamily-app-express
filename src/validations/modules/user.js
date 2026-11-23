const Joi = require('joi')
const common = require('@/validations/common')

// 微信登录
const login = {
  body: Joi.object({
    code: common.requiredString(100)
  }).unknown(false)
}

// 更新用户头像
const updateUserAvatar = {
  body: Joi.object({ avatarId: common.requiredNumber }).unknown(false)
}

// 更新用户昵称
const updateUserNickname = {
  body: Joi.object({ nickname: common.requiredString(50) }).unknown(false)
}

module.exports = {
  login,
  updateUserAvatar,
  updateUserNickname
}
