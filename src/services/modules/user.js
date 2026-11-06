const { userList } = require('@/models')
// const codeEnum = require('@/data/enum/code')
const { generateToken } = require('@/utils/jwt')
const { getWechatSession } = require('@/services/common/wechat')

const userService = {
  /**
   * 用户登录
   * 不存在则自动注册
   * @param {Object} code
   */
  login: async (code) => {
    // 1. 获取微信用户身份信息
    const wechatUserInfo = await getWechatSession(code)
    const { openid, unionid } = wechatUserInfo

    // 2. 根据 openid 查询用户是否存在
    let user = await userList.findOne({
      where: {
        openid
      },
      paranoid: false
    })

    // 3. todo：已软删除的用户不允许直接恢复或登录
    // if (user && user.deletedAt) {
    //   const error = new Error('该用户账号已注销')
    //   error.code = 'USER_DELETED'
    //   throw error
    // }

    if (!user) {
      // 4. 用户不存在，自动注册创建
      user = await userService.createUser(openid, unionid)
    } else {
      // 5. 用户已存在：如果表中之前没有unionid，这次获取到了，更新填充
      if (user.unionid === '' && unionid !== '') {
        await user.update({ unionid })
      }
    }

    // 6. todo：检查用户状态
    // if (user.status !== 'normal') {
    //   const error = new Error('账号已被禁用')
    //   error.code = 'USER_DISABLED'
    //   throw error
    // }

    // 7. 生成 JWT
    const token = generateToken(user.id)

    // 8. 生成返回数据：token和用户信息
    const resInfo = {
      token: token,
      userInfo: {
        id: user.id,
        mobile: user.mobile,
        name: user.name,
        nickname: user.nickname
      }
    }
    return resInfo
  },
  /**
   * 注册(创建)用户
   * @param openid
   * @param unionid
   */
  createUser: async (openid, unionid) => {
    const params = {
      openid,
      unionid: unionid || ''
    }
    const newData = await userList.create(params)
    return newData
  },
  /**
   * 获取用户列表
   */
  getUserList: async () => {
    // 等价于 SELECT * FROM user_list
    const list = await userList.findAll()
    return list
  }
}

module.exports = userService
