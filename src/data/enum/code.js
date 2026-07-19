/**
 * 业务状态码
 */

const codeEnum = {
  success: 0, // 请求成功(默认值)
  unknownError: -1, // 未知系统错误
  unauthorized: 10001, // 未授权登录
  paramInvalid: 10002, // 参数校验失败

  // ================= 用户模块 (10100 段) =================
  userNotFound: 10101,
  passwordError: 10102,
  mobileExists: 10103,
  emailExists: 10104,
  accountDisabled: 10105,
  mobileFormatError: 10106, // 手机号格式不正确
  loginFailed: 10107 // 手机号或密码错误
}

module.exports = codeEnum
