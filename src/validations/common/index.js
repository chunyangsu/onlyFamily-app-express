const Joi = require('joi')

// 必传数字类型(正整数)
const requiredNumber = Joi.number().integer().positive().required()

// 可选数字类型(正整数)
const optionalNumber = Joi.number().integer().positive().optional()

// 必传字符串
const requiredString = (max = 100) => {
  return Joi.string().trim().min(1).max(max).required()
}

// 可选字符串
const optionalString = (max = 500) => {
  return Joi.string().trim().max(max).allow('').optional()
}

// 分页参数
const pagination = {
  page: Joi.number().integer().min(1).default(1),

  pageSize: Joi.number().integer().min(1).max(100).default(10)
}

// 手机号
// const phone = Joi.string()
//   .pattern(/^1[3-9]\d{9}$/)
//   .required()
//   .messages({
//     'string.pattern.base': '手机号格式不正确'
//   })

/**
 * 必传金额
 * 规则：非负、最多两位小数
 */
const requiredMoney = Joi.number()
  .min(0)
  .custom((value, helpers) => {
    if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-8) {
      return helpers.error('number.precision')
    }

    return value
  })
  .messages({
    'number.base': '金额必须为数字',
    'number.min': '金额不能小于 0',
    'number.precision': '金额最多保留两位小数'
  })
  .required()

// 日期
// const date = Joi.date().iso().required()

// 可选备注
// const remark = Joi.string()
//   .trim()
//   .max(500)
//   .allow('')
//   .optional()

module.exports = {
  requiredNumber,
  optionalNumber,
  optionalString,
  requiredString,
  pagination,
  requiredMoney
  // date
  // remark
}
