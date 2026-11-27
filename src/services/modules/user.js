const { userList, familyList, familyUserMap, attachmentList, sequelize } = require('@/models')
const { validateAvatarObject } = require('@/services/common/avatarObject')
const { getAttachmentList } = require('@/services/common/attachment')
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
    const resBody = {
      token: token,
      userInfo: {
        id: user.id,
        familyId: 0,
        nickname: '',
        avatarId: 0,
        avatarUrl: '',
        expiresTime: null,
        role: ''
      }
    }
    // 只有一个关联家庭时，自动使用该家庭下的成员资料
    // 只需区分 0、1、多个，最多查询两条即可
    const members = await familyUserMap.findAll({
      where: { userId: user.id },
      attributes: ['familyId', 'nickname', 'userAvatarId', 'role'],
      limit: 2,
      raw: true
    })
    if (members.length === 1) {
      const member = members[0]
      resBody.userInfo.familyId = member.familyId
      resBody.userInfo.nickname = member.nickname || ''
      resBody.userInfo.avatarId = member.userAvatarId || 0
      resBody.userInfo.role = member.role || ''
      if (resBody.userInfo.avatarId) {
        const [avatar] = await getAttachmentList([resBody.userInfo.avatarId])
        resBody.userInfo.avatarUrl = avatar?.url || ''
        resBody.userInfo.expiresTime = avatar?.url ? (avatar.expiresTime ?? null) : null
      }
    }
    return resBody
  },
  /**
   * 注册(创建)用户
   * @param openid
   * @param unionid
   */
  createUser: async (openid, unionid) => {
    const tempNickname =
      '用户_WJ' +
      Math.floor(Math.random() * 10000)
        .toString()
        .padStart(4, '0')
    const params = {
      openid,
      unionid: unionid || '',
      nickname: tempNickname
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
  },
  /**
   * 更新用户头像
   * data: userId、familyId、avatarId
   */
  updateUserAvatar: async (data) => {
    const { userId, familyId, avatarId } = data
    // 校验3个参数的数字类型
    const validId = (value) => ['string', 'number'].includes(typeof value) && /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) <= 2147483647
    if (!validId(userId) || !validId(familyId) || !validId(avatarId)) {
      const error = new Error('用户、家庭和头像 ID 必须为有效正整数')
      error.status = 400
      error.code = 10002
      throw error
    }
    const ids = { userId: Number(userId), familyId: Number(familyId), avatarId: Number(avatarId) }

    // 定义抛错函数
    const reject = (message, status = 403) => {
      const error = new Error(message)
      error.status = status
      throw error
    }
    // 集中检查数据库记录
    const loadContext = async (transaction) => {
      const options = transaction ? { transaction, lock: transaction.LOCK.UPDATE } : {}
      const user = await userList.findOne({ where: { id: ids.userId, status: 'normal' }, ...options })
      if (!user) reject('用户不存在或已停用')
      const family = await familyList.findOne({ where: { id: ids.familyId, status: 'normal', deleteTime: 0 }, ...options })
      if (!family) reject('家庭不存在或不可用')
      const member = await familyUserMap.findOne({ where: { userId: ids.userId, familyId: ids.familyId }, ...options })
      if (!member) reject('无权修改该家庭下的成员头像')
      const attachment = await attachmentList.findOne({
        where: { id: ids.avatarId, familyId: ids.familyId, createId: ids.userId, module: 'user', moduleType: 'avatar', status: 'normal' },
        ...options
      })
      if (!attachment) reject('头像附件不存在或无权使用')
      const keyPattern = new RegExp(`^family_${ids.familyId}/user/avatar/\\d{4}/(?:0[1-9]|1[0-2])/[a-f0-9-]{36}$`, 'i')
      if (typeof attachment.objectKey !== 'string' || !keyPattern.test(attachment.objectKey)) reject('头像附件路径不合法', 400)
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(attachment.mimeType)) reject('头像附件格式不支持', 400)
      return { member, attachment }
    }

    // OSS请求在事务外完成，避免网络耗时占用数据库行锁
    const { attachment } = await loadContext()
    const objectKey = attachment.objectKey
    const mimeType = attachment.mimeType
    // 检查文件存在、大小在 1 字节至 5 MB 之间，以及文件头格式与 MIME 是否一致。
    await validateAvatarObject(objectKey, mimeType)
    // 在事务外生成 URL，签名失败时不修改头像绑定。
    const [avatar] = await getAttachmentList([ids.avatarId])
    if (!avatar?.url) reject('获取头像访问地址失败', 500)
    // 开启事务
    return sequelize.transaction(async (transaction) => {
      // 持锁重新校验，避免验证文件期间成员关系或附件状态已改变
      const current = await loadContext(transaction)
      // 更新当前家庭成员的头像
      if (current.attachment.objectKey !== objectKey || current.attachment.mimeType !== mimeType) reject('附件信息已改变，请重试', 409)
      if (Number(current.member.userAvatarId) !== ids.avatarId) {
        await current.member.update({ userAvatarId: ids.avatarId }, { transaction })
      }
      // 托管事务提交成功后，才将头像 ID 和访问地址返回给前端
      const resBody = {
        avatarId: ids.avatarId,
        avatarUrl: avatar.url,
        expiresTime: avatar.expiresTime ?? null
      }
      return resBody
    })
  },
  /**
   * 更新用户昵称
   * data: userId、familyId、nickname
   */
  updateUserNickname: async (data) => {
    const { userId, familyId, nickname } = data
    // if (![userId, familyId].every((id) => ['string', 'number'].includes(typeof id) && /^[1-9]\d*$/.test(String(id)) && Number.isSafeInteger(Number(id)))) {
    //   const error = new Error('用户和家庭 ID 必须为有效正整数')
    //   error.status = 400
    //   throw error
    // }
    const member = await familyUserMap.findOne({ where: { userId: Number(userId), familyId: Number(familyId) } })
    if (!member) {
      const error = new Error('无权修改该家庭下的成员昵称')
      error.status = 403
      throw error
    }
    await member.update({ nickname })
    const resBody = {
      nickname: member.nickname
    }
    return resBody
  }
}

module.exports = userService
