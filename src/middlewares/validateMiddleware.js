const { fail } = require('@/utils/responseHandler')
const codeEnum = require('@/data/enum/code')

/**
 * 全局参数验证中间件
 * @param {*} schema Joi定义的参数验证规则
 * @returns 中间件函数
 */
const validateMiddleware = (schema) => {
  return (req, res, next) => {
    // 参数来源
    const sourceArr = ['body', 'params', 'query']
    // 存放验证通过后的参数
    const validated = {}

    for (const item of sourceArr) {
      if (!schema[item]) {
        // 判断当前参数是否定义了验证规则：如果当前参数来源没有定义Joi验证规则，就直接保留原始参数，不进行验证
        validated[item] = req[item] || {}
        continue
      }

      // 执行Joi参数验证
      const { error, value } = schema[item].validate(req[item] || {}, {
        abortEarly: false, // 表示不提前终止，尽可能收集所有参数错误(默认情况下，Joi遇到第一个错误就会停止验证)
        convert: true, // 允许Joi自动转换参数类型
        stripUnknown: false // 不自动删除未知字段
      })

      if (error) {
        // 验证失败
        const errorArr = error.details.map((val) => ({
          field: val.path.join('.'),
          message: val.message
        }))
        // 阻止当前中间件继续执行
        // return res.status(400).json({
        //   code: 400,
        //   message: '参数验证失败',
        //   errorArr
        // })
        return fail(res, '参数验证失败', 400, codeEnum.paramInvalid, errorArr)
      }
      // 验证通过，将Joi返回的value保存到validated中
      validated[item] = value
    }

    req.validated = validated
    next()
  }
}

module.exports = validateMiddleware
