const userService = require('@/services/modules/user')
// 引入：封装的异步处理工具
const asyncHandler = require('@/utils/asyncHandler')
// 引入：封装的统一响应工具
const { success, fail } = require('@/utils/responseHandler')
const codeEnum = require('@/data/enum/code')

const userController = {
  /**
   * 登录
   */
  login: asyncHandler(async (req, res) => {
    const { mobile, password } = req.body
    // 必填校验
    if (!mobile || !password) {
      return fail(res, '手机号和密码为必填项', 400, codeEnum.paramInvalid)
    }

    // 手机号正则校验 (中国大陆手机号)
    const mobileReg = /^1[3-9]\d{9}$/
    if (!mobileReg.test(mobile)) {
      return fail(res, '手机号格式不正确', 400, codeEnum.mobileFormatError)
    }

    // 调用service中的方法
    const loginResult = await userService.login({ mobile, password })
    // 返回成功响应
    success(res, loginResult, '登录成功')
  }),
  /**
   * 获取用户列表
   */
  getUserList: asyncHandler(async (req, res) => {
    const userList = await userService.getUserList()
    success(res, userList)
  }),

  /**
   * 新增用户
   */
  createUser: asyncHandler(async (req, res) => {
    const { name, mobile, password, email } = req.body
    // 校验必传参数
    // if (!mobile || !password) {
    //   return error(res, '手机号和密码为必填项')
    // }

    // 调用service中的方法
    const newUser = await userService.createUser({
      name,
      mobile,
      password,
      email
    })
    success(res, newUser)
  })
}

module.exports = userController
