const Joi = require('joi')
const common = require('@/validations/common/index')

// 新增菜品
const create = {
  body: Joi.object({
    name: common.requiredString(50),
    attachmentId: common.requiredNumber,
    categoryId: common.requiredNumber,
    introduction: common.optionalString(255),
    makeProcess: common.optionalString(2000),
    price: common.requiredMoney
  }).unknown(false)
}

module.exports = {
  create
}
