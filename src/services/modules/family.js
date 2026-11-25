const { userList, familyList, familyUserMap, attachmentList, sequelize } = require('@/models')
const { validateAvatarObject } = require('@/services/common/avatarObject')
const { getAttachmentList } = require('@/services/common/attachment')

const familyService = {
  /**
   * 获取家庭列表
   */
  // getDishList: async () => {
  //   const list = await familyList.findAll()
  //   return list
  // },
  /**
   * 创建家庭
   * @param {Object} data 参数
   */
  createFamily: async (data) => {
    const masterParams = {
      name: data.name,
      introduction: data.introduction
    }
    const masterResult = await familyList.create(masterParams)

    // 同步加入家庭
    const joinParams = {
      familyId: masterResult.id,
      userId: data.userId,
      role: 1 // 创建家庭的用户默认是管理员
    }
    await familyService.joinFamily(joinParams)

    // 返回客户端的数据
    const tempBody = {
      id: masterResult.id // 家庭id
    }
    return tempBody
  },
  /**
   * 加入家庭
   * @param {Object} data 参数
   */
  joinFamily: async (data) => {
    const params = {
      familyId: data.familyId,
      userId: data.userId,
      role: data.role || 2 // 默认普通成员
    }
    const newData = await familyUserMap.create(params)
    return newData
  },
  /**
   * 获取家庭详情
   * id：前端传入的家庭id
   * @returns {Promise<Object|null>} 不存在时返回 null
   */
  getFamilyDetail: async (id) => {
    const familyInfo = await familyList.findByPk(id, {
      attributes: ['id', 'name', 'introduction', 'avatarId', 'createId', 'createTime']
    })
    if (!familyInfo) {
      return null
    }

    const data = familyInfo.toJSON()
    const resBody = {
      id: data.id,
      name: data.name,
      introduction: data.introduction,
      avatarId: data.avatarId,
      avatarUrl: '',
      urlExpiresAt: null,
      createId: data.createId,
      createTime: data.createTime
    }
    if (data.avatarId > 0) {
      const [avatar] = await getAttachmentList([data.avatarId])
      resBody.avatarUrl = avatar?.url || ''
      resBody.urlExpiresAt = avatar?.url ? (avatar.urlExpiresAt ?? null) : null
    }
    return resBody
  },
  /**
   * 获取家庭成员列表
   * id：前端传入的家庭id
   * @returns
   */
  getFamilyMemberList: async (id) => {
    const members = await familyUserMap.findAll({
      where: { familyId: id },
      attributes: ['userId', 'nickname', 'userAvatarId'],
      raw: true
    })
    const avatarIds = [
      ...new Set(
        members
          .map((member) => member.userAvatarId)
          .filter((avatarId) => Number(avatarId) > 0)
          .map(String)
      )
    ]
    const attachments = avatarIds.length ? await getAttachmentList(avatarIds) : []
    const avatarMap = new Map(attachments.map((attachment) => [String(attachment.id), attachment]))

    return members.map((member) => ({
      id: member.userId,
      nickname: member.nickname,
      avatarId: member.userAvatarId || 0,
      avatarUrl: avatarMap.get(String(member.userAvatarId))?.url || '',
      urlExpiresAt: avatarMap.get(String(member.userAvatarId))?.url ? (avatarMap.get(String(member.userAvatarId)).urlExpiresAt ?? null) : null
    }))
  },
  /**
   * 更新家庭头像
   * data: userId、familyId、avatarId
   */
  updateFamilyAvatar: async (data) => {
    const { userId, familyId, avatarId } = data
    const reject = (message, status = 403) => {
      const error = new Error(message)
      error.status = status
      throw error
    }
    const validId = (value) => ['string', 'number'].includes(typeof value) && /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) <= 2147483647
    if (![userId, familyId, avatarId].every(validId)) reject('用户、家庭和头像 ID 必须为有效正整数', 400)
    const ids = { userId: Number(userId), familyId: Number(familyId), avatarId: Number(avatarId) }

    const loadContext = async (transaction) => {
      const options = transaction ? { transaction, lock: transaction.LOCK.UPDATE } : {}
      const user = await userList.findOne({ where: { id: ids.userId, status: 'normal' }, ...options })
      if (!user) reject('用户不存在或已停用')
      const family = await familyList.findOne({ where: { id: ids.familyId, status: 'normal', deleteTime: 0 }, ...options })
      if (!family) reject('家庭不存在或不可用')
      const member = await familyUserMap.findOne({ where: { userId: ids.userId, familyId: ids.familyId }, ...options })
      if (!member) reject('无权修改该家庭头像')
      const attachment = await attachmentList.findOne({
        where: { id: ids.avatarId, familyId: ids.familyId, createId: ids.userId, module: 'family', moduleType: 'avatar', status: 'normal' },
        ...options
      })
      if (!attachment) reject('家庭头像附件不存在或无权使用')
      const keyPattern = new RegExp('^family_' + ids.familyId + '/family/avatar/\\d{4}/(?:0[1-9]|1[0-2])/[a-f0-9-]{36}$', 'i')
      if (typeof attachment.objectKey !== 'string' || !keyPattern.test(attachment.objectKey)) reject('头像附件路径不合法', 400)
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(attachment.mimeType)) reject('头像附件格式不支持', 400)
      return { family, attachment }
    }

    // 文件校验和 URL 签名在事务外执行，失败时不修改家庭头像
    const { attachment } = await loadContext()
    const { objectKey, mimeType } = attachment
    await validateAvatarObject(objectKey, mimeType)
    const [avatar] = await getAttachmentList([ids.avatarId])
    if (!avatar?.url) reject('获取家庭头像访问地址失败', 500)

    return sequelize.transaction(async (transaction) => {
      // 持锁重新确认成员关系和附件状态，避免 OSS 请求期间数据已改变。
      const current = await loadContext(transaction)
      if (current.attachment.objectKey !== objectKey || current.attachment.mimeType !== mimeType) reject('附件信息已改变，请重试', 409)
      if (Number(current.family.avatarId) !== ids.avatarId) {
        await current.family.update({ avatarId: ids.avatarId }, { transaction })
      }
      const resBody = {
        avatarId: ids.avatarId,
        avatarUrl: avatar.url,
        urlExpiresAt: avatar.urlExpiresAt ?? null
      }
      return resBody
    })
  }
}

module.exports = familyService
