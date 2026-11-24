const Joi = require('joi')
const common = require('@/validations/common')

// 更新家庭头像
const updateFamilyAvatar = {
  body: Joi.object({ avatarId: common.requiredNumber.max(2147483647) }).unknown(false)
}

module.exports = { updateFamilyAvatar }
