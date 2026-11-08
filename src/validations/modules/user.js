const Joi = require('joi')
const common = require('@/validations/common')

// 微信登录
const login = {
  body: Joi.object({
    code: common.requiredString(100)
  }).unknown(false)
}

// 修改用户资料
// const updateProfile = {
//   body: Joi.object({
//     nickname: common.requiredString(30),
//     avatar: common.optionalString(500)
//   }).min(1).unknown(false)
// }

module.exports = {
  login
  // updateProfile
}
