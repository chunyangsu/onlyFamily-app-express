const userService = require('@/services/modules/user')
// 引入：封装的异步处理工具
const asyncHandler = require('@/utils/asyncHandler')
// 引入：封装的统一响应工具
const response = require('@/utils/response')

const userController = {
  /**
   * 获取用户列表
   */
  getUserList: asyncHandler(async (req, res) => {
    const userList = await userService.getUserList()
    response.success(res, userList)
  }),

  /**
   * 创建用户
   */
  createUser: asyncHandler(async (req, res) => {
    const { name, mobile, password, email } = req.body
    // 校验必传参数
    // if (!mobile || !password) {
    //   return response.error(res, '手机号和密码为必填项')
    // }

    // 调用service中的方法
    const newUser = await userService.createUser({
      name,
      mobile,
      password,
      email,
    })
    response.success(res, newUser)
  }),
}

module.exports = userController
