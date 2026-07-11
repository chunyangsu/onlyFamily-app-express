/**
 * 业务状态码
 */

const codeEnum = {
  success: 0, // 请求成功(默认值)
  unknownError: -1, // 未知系统错误
  paramInvalid: 10001, // 参数校验失败
}

module.exports = codeEnum
