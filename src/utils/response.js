const codeEnum = require('@/data/enum/code')

/**
 * 封装统一响应格式
 * 所有接口返回格式保持一致
 */

const response = {
  /**
   * 成功响应
   * @param {Object} res - 响应对象
   * @param {any} data - 返回的数据
   * @param {string} msg - 提示信息
   * @param {number} code - 业务状态码
   */
  success(res, data = null, msg = '请求成功', code = codeEnum.success) {
    const httpStatus = 200
    const response = {
      code: code,
      data: data,
      msg: msg
    }
    return res.status(httpStatus).json(response)
  },

  /**
   * 失败响应
   * @param {Object} res - 响应对象
   * @param {string} msg - 错误信息
   * @param {number} httpStatus - HTTP 状态码
   * @param {number} code - 业务状态码
   */
  error(res, msg = '请求失败', httpStatus = 500, code = 500) {
    const response = {
      code: code,
      data: null,
      msg: msg
    }
    return res.status(httpStatus).json(response)
  }
}

module.exports = response
