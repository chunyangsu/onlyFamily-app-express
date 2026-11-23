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
    const { code } = req.body
    // 必填校验
    if (!code || code.trim() === '') {
      return fail(res, '微信登录凭证不能为空', 400, codeEnum.paramInvalid)
    }

    // 调用service中的方法
    const response = await userService.login(code)
    // 返回成功响应
    success(res, response, '登录成功')
  }),
  /**
   * 获取用户列表
   */
  getUserList: asyncHandler(async (req, res) => {
    const response = await userService.getUserList()
    success(res, response)
  }),
  /**
   * 新增用户
   */
  // createUser: asyncHandler(async (req, res) => {
  //   const { name, mobile, password, email } = req.body
  //   // 校验必传参数
  //   // if (!mobile || !password) {
  //   //   return error(res, '手机号和密码为必填项')
  //   // }

  //   // 调用service中的方法
  //   const newUser = await userService.createUser({
  //     name,
  //     mobile,
  //     password,
  //     email
  //   })
  //   success(res, newUser)
  // })

  /**
   * 更新用户头像
   */
  updateUserAvatar: asyncHandler(async (req, res) => {
    const userId = req.user.id
    const familyId = req.headers['family-id']
    const { avatarId } = req.validated.body

    // 调用service中的方法
    const params = {
      userId,
      familyId,
      avatarId
    }
    const response = await userService.updateUserAvatar(params)
    success(res, response, '头像绑定成功')
  }),
  /**
   * 更新用户昵称
   */
  updateUserNickname: asyncHandler(async (req, res) => {
    const userId = req.user.id
    const familyId = req.headers['family-id']
    const { nickname } = req.validated.body

    // 调用service中的方法
    const params = {
      userId,
      familyId,
      nickname
    }
    const response = await userService.updateUserNickname(params)
    success(res, response)
  })
}

module.exports = userController
