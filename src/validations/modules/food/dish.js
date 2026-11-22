const Joi = require('joi')
const common = require('@/validations/common/index')

// 获取菜品列表
const getList = {
  query: Joi.object({
    name: common.optionalString(50),
    ...common.pagination,
    pageSize: common.pagination.pageSize.default(4)
  }).unknown(true)
}

// 新增菜品
const create = {
  body: Joi.object({
    name: common.requiredString(50),
    mainImageId: common.requiredNumber,
    categoryId: common.requiredNumber,
    introduction: common.optionalString(255),
    makeProcess: common.optionalString(2000),
    price: common.requiredMoney
  }).unknown(false)
}

module.exports = {
  getList,
  create
}
