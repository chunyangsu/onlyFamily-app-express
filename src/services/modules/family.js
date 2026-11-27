const { userList, familyList, familyUserMap, familyInvitation, attachmentList, sequelize } = require('@/models')
const { validateAvatarObject } = require('@/services/common/avatarObject')
const { getAttachmentList } = require('@/services/common/attachment')
const { generateInvitationCode, hashInvitationCode } = require('@/utils/invitation')
const env = require('@/config/env')

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
   * @param {Object} data：userId、name、introduction
   */
  createFamily: async (data) => {
    const { userId, name, introduction } = data
    const masterParams = {
      createId: userId,
      name: name,
      introduction: introduction
    }
    const newFamily = await familyList.create(masterParams)

    // 同步加入新创建的家庭
    const member = await familyUserMap.findOne({
      where: { familyId: newFamily.id, userId: userId }
    })
    if (member) {
      const error = new Error('已加入该家庭，请勿重复加入')
      error.status = 409
      throw error
    }
    const params = {
      familyId: newFamily.id,
      userId: userId,
      role: 'admin'
    }
    await familyUserMap.create(params)
    // 返回客户端的数据
    const tempBody = {
      id: newFamily.id // 家庭id
    }
    return tempBody
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
    const memberNum = await familyUserMap.count({ where: { familyId: data.id } })
    const resBody = {
      id: data.id,
      name: data.name,
      introduction: data.introduction,
      avatarId: data.avatarId,
      avatarUrl: '',
      expiresTime: null,
      memberNum,
      createId: data.createId,
      createTime: data.createTime
    }
    if (data.avatarId > 0) {
      const [avatar] = await getAttachmentList([data.avatarId])
      resBody.avatarUrl = avatar?.url || ''
      resBody.expiresTime = avatar?.url ? (avatar.expiresTime ?? null) : null
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
      expiresTime: avatarMap.get(String(member.userAvatarId))?.url ? (avatarMap.get(String(member.userAvatarId)).expiresTime ?? null) : null
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
        expiresTime: avatar.expiresTime ?? null
      }
      return resBody
    })
  },
  /**
   * 创建邀请码
   * @param {Object} data userId、familyId
   * 实现内容：
    校验用户、家庭及成员关系
    管理员和普通成员均可创建
    默认有效期 24 小时
    支持 FAMILY_INVITATION_TTL 配置
    事务中创建邀请记录
    数据库只保存 codeHash
    仅返回一次原始 invitationCode
   */
  createInvitationCode: async (data) => {
    const { userId, familyId } = data || {}
    const reject = (message, status = 403) => {
      const error = new Error(message)
      error.status = status
      throw error
    }
    const validId = (value) => ['string', 'number'].includes(typeof value) && /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) <= 2147483647
    if (![userId, familyId].every(validId)) reject('用户和家庭 ID 必须为有效正整数', 400)
    const ids = { userId: Number(userId), familyId: Number(familyId) }
    const ttl = env.familyInvitation.ttl
    if (!Number.isSafeInteger(ttl) || ttl <= 0 || !Number.isSafeInteger(Date.now() + ttl * 1000)) {
      reject('FAMILY_INVITATION_TTL 必须为有效的正整数秒数', 500)
    }

    return sequelize.transaction(async (transaction) => {
      const options = { transaction, lock: transaction.LOCK.UPDATE }
      const user = await userList.findOne({ where: { id: ids.userId, status: 'normal' }, ...options })
      // 校验当前用户和家庭
      if (!user) reject('用户不存在或已停用')
      const family = await familyList.findOne({ where: { id: ids.familyId, status: 'normal', deleteTime: 0 }, ...options })
      if (!family) reject('家庭不存在或不可用')
      const member = await familyUserMap.findOne({ where: { familyId: ids.familyId, userId: ids.userId }, ...options })
      if (!member || !['admin', 'member'].includes(member.role)) reject('无权邀请用户加入该家庭')

      const invitationCode = generateInvitationCode()
      // 过期时间
      const expiresTime = Date.now() + ttl * 1000
      // 参数
      const params = {
        familyId: ids.familyId,
        inviterId: ids.userId,
        codeHash: hashInvitationCode(invitationCode),
        status: 'unused',
        expiresTime
      }
      const invitation = await familyInvitation.create(params, { transaction })
      // 托管事务提交成功后才返回；原始凭证不存储，不返回哈希或完整模型
      return { invitationId: invitation.id, invitationCode, expiresTime }
    })
  },
  /**
   * 获取邀请信息 / 加入前预览
   * @param {Object} data userId、invitationCode
   * 实现内容：
   * 校验当前用户和原始邀请凭证，通过 SHA-256 哈希查询邀请
   * 拒绝不存在、已使用、已撤销、已过期及未知状态的邀请
   * 同时检查 expiresTime，不依赖定时任务更新 expired 状态
   * 校验家庭可用、邀请人正常且仍为本家庭管理员或普通成员
   * 返回家庭展示资料、家庭内邀请人昵称和当前用户是否已加入
   * 邀请到期时间为 expiresTime，头像链接到期时间为 familyAvatarExpiresTime
   * 只读预览，不创建成员、不消费或更新邀请；真正加入时必须重新校验
   * @returns {Promise<Object>} 仅返回展示字段，不返回凭证、哈希或其他成员资料
   */
  getInvitationDetail: async (data) => {
    const { userId, invitationCode } = data || {}
    const reject = (message, status = 403) => {
      const error = new Error(message)
      error.status = status
      throw error
    }
    const validId = (value) => ['string', 'number'].includes(typeof value) && /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) <= 2147483647
    if (!validId(userId)) reject('用户 ID 必须为有效正整数', 400)
    // 工具方法同时校验 43 位 base64url 格式，不接受数据库中的哈希作为凭证。
    const codeHash = hashInvitationCode(invitationCode)
    const currentUserId = Number(userId)
    const user = await userList.findOne({
      where: { id: currentUserId, status: 'normal' },
      attributes: ['id']
    })
    if (!user) reject('用户不存在或已停用')

    const invitation = await familyInvitation.findOne({
      where: { codeHash },
      attributes: ['familyId', 'inviterId', 'status', 'expiresTime']
    })
    if (!invitation) reject('邀请不存在或无效', 404)
    if (invitation.status === 'used') reject('邀请已被使用', 409)
    if (invitation.status === 'revoked') reject('邀请已撤销', 410)
    if (!['unused', 'expired'].includes(invitation.status)) reject('邀请状态无效', 410)
    const expiresTime = Number(invitation.expiresTime)
    if (invitation.status === 'expired' || !Number.isSafeInteger(expiresTime) || expiresTime <= Date.now()) {
      reject('邀请已过期', 410)
    }

    // 目标家庭只取自邀请记录，不依赖客户端当前家庭或额外指定的 familyId。
    const family = await familyList.findOne({
      where: { id: invitation.familyId, status: 'normal', deleteTime: 0 },
      attributes: ['id', 'name', 'avatarId']
    })
    if (!family) reject('家庭不存在或不可用')
    const inviter = await userList.findOne({
      where: { id: invitation.inviterId, status: 'normal' },
      attributes: ['id']
    })
    if (!inviter) reject('邀请人不存在或已停用')
    const inviterMember = await familyUserMap.findOne({
      where: { familyId: invitation.familyId, userId: invitation.inviterId },
      attributes: ['nickname', 'role', 'userAvatarId']
    })
    if (!inviterMember || !['admin', 'member'].includes(inviterMember.role)) reject('邀请人已无邀请权限')
    const member = await familyUserMap.findOne({
      where: { familyId: invitation.familyId, userId: currentUserId },
      attributes: ['id']
    })

    const resBody = {
      inviterId: invitation.inviterId, // 邀请人用户id
      inviterAvatarId: inviterMember.userAvatarId || 0, // 邀请用户头像id
      inviterAvatarUrl: '', // 邀请用户头像url
      inviterNickname: inviterMember.nickname || '', // 邀请人在该家庭中的昵称
      familyId: family.id, // 家庭id
      familyName: family.name, // 家庭名称
      familyAvatarId: family.avatarId || 0, // 家庭头像id
      familyAvatarUrl: '', // 家庭头像url地址
      status: invitation.status, // 邀请码状态
      expiresTime, // 邀请码过期时间
      isMember: Boolean(member) // 已加入时前端可展示“进入家庭”，不重复加入
    }
    if (Number(inviterMember.userAvatarId) > 0) {
      const [avatar] = await getAttachmentList([inviterMember.userAvatarId])
      resBody.inviterAvatarUrl = avatar?.url || ''
    }
    if (Number(family.avatarId) > 0) {
      const [avatar] = await getAttachmentList([family.avatarId])
      resBody.familyAvatarUrl = avatar?.url || ''
      resBody.familyAvatarExpiresTime = avatar?.url ? (avatar.expiresTime ?? null) : null
    }
    // 头像签名可能耗时，返回前再次检查时间；期间发生的撤销等变化仍由加入接口最终确认。
    if (expiresTime <= Date.now()) reject('邀请已过期', 410)
    return resBody
  },
  /**
   * 加入家庭(使用邀请码)
   * @param {Object} data userId、invitationCode
   * 实现内容：
   * 校验 JWT 用户 ID 和原始凭证，目标家庭只从邀请记录读取
   * 事务中锁定用户、邀请、家庭及成员关系，重新校验用户、家庭和邀请人资格
   * 未使用邀请同时校验状态和过期时间，创建 member 后标记 used，记录加入人及时间
   * 已是成员不修改角色、不消费未使用邀请；本人已消费且仍为成员时幂等返回
   * 本人退出后不能复用旧邀请；别人已消费的邀请、撤销或过期邀请均拒绝
   * 成员联合唯一索引兜底；死锁、锁等待超时及成员唯一冲突最多重试整个事务两次
   * 任一步数据库操作失败均回滚，提交成功后才返回，不在持锁期间请求 OSS
   * 头像签名为提交后的尽力读取，失败返回空地址，避免已加入却报告加入失败
   * @returns {Promise<Object>} 家庭资料、成员数量 memberNum、实际角色及 alreadyMember；expiresTime 为头像链接到期时间
   */
  joinFamily: async (data) => {
    const { userId, invitationCode } = data || {}
    const reject = (message, status = 403) => {
      const error = new Error(message)
      error.status = status
      throw error
    }
    const validId = (value) => ['string', 'number'].includes(typeof value) && /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) <= 2147483647
    if (!validId(userId)) reject('用户 ID 必须为有效正整数', 400)
    const currentUserId = Number(userId)
    const codeHash = hashInvitationCode(invitationCode)

    const accept = async (transaction) => {
      const options = { transaction, lock: transaction.LOCK.UPDATE }
      // 同一个用户的加入请求串行执行，减少不同邀请码同时加入导致的成员唯一冲突。
      const user = await userList.findOne({ where: { id: currentUserId, status: 'normal' }, attributes: ['id'], ...options })
      if (!user) reject('用户不存在或已停用')
      const invitation = await familyInvitation.findOne({ where: { codeHash }, ...options })
      if (!invitation) reject('邀请不存在或无效', 404)
      if (invitation.status === 'used' && Number(invitation.joinerId) !== currentUserId) reject('邀请已被使用', 409)
      if (invitation.status === 'revoked') reject('邀请已撤销', 410)
      if (!['unused', 'used', 'expired'].includes(invitation.status)) reject('邀请状态无效', 410)

      const checkExpiration = () => {
        const expiresTime = Number(invitation.expiresTime)
        if (invitation.status === 'expired' || !Number.isSafeInteger(expiresTime) || expiresTime <= Date.now()) reject('邀请已过期', 410)
      }
      // 已由本人消费的邀请只用于重放成功结果，不再要求邀请仍在有效期内。
      if (invitation.status !== 'used') checkExpiration()
      const family = await familyList.findOne({
        where: { id: invitation.familyId, status: 'normal', deleteTime: 0 },
        attributes: ['id', 'name', 'avatarId'],
        ...options
      })
      if (!family) reject('家庭不存在或不可用')
      const member = await familyUserMap.findOne({
        where: { familyId: invitation.familyId, userId: currentUserId },
        ...options
      })

      let role = member?.role || 'member'
      if (invitation.status === 'used') {
        // 不重新创建已退出的成员；历史成功重试不再依赖邀请人当前资格。
        if (!member) reject('邀请已被使用，请获取新的邀请', 409)
      } else {
        const inviter = await userList.findOne({
          where: { id: invitation.inviterId, status: 'normal' },
          attributes: ['id'],
          ...options
        })
        if (!inviter) reject('邀请人不存在或已停用')
        const inviterMember = await familyUserMap.findOne({
          where: { familyId: invitation.familyId, userId: invitation.inviterId },
          ...options
        })
        if (!inviterMember || !['admin', 'member'].includes(inviterMember.role)) reject('邀请人已无邀请权限')
        // 等待家庭/成员行锁期间也可能到期，必须在写入前重新检查。
        checkExpiration()
        if (!member) {
          role = 'member' // 不接受客户端指定角色，也不继承邀请人的角色。
          const tempNickname =
            '用户_WJ' +
            Math.floor(Math.random() * 10000)
              .toString()
              .padStart(4, '0')
          const joinParams = {
            familyId: invitation.familyId,
            userId: currentUserId,
            nickname: tempNickname,
            userAvatarId: 0,
            role
          }
          await familyUserMap.create(joinParams, { transaction })
          checkExpiration()
          await invitation.update({ status: 'used', joinerId: currentUserId, joinTime: Date.now() }, { transaction })
        }
      }
      const memberNum = await familyUserMap.count({ where: { familyId: family.id }, transaction })
      return {
        id: family.id,
        name: family.name,
        avatarId: family.avatarId || 0,
        avatarUrl: '',
        expiresTime: null,
        memberNum,
        role,
        alreadyMember: Boolean(member)
      }
    }

    let result
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        result = await sequelize.transaction(accept)
        break
      } catch (error) {
        const databaseCode = error.original?.code || error.parent?.code
        const memberConflict =
          error.name === 'SequelizeUniqueConstraintError' &&
          (['familyId', 'userId'].some((field) => Object.hasOwn(error.fields || {}, field)) || /uk_family_user_map_family_user/.test(error.original?.sqlMessage || error.parent?.sqlMessage || ''))
        // 托管事务已回滚后再重试，不能在失败事务中继续查询或消费邀请。
        if (attempt === 2 || (!memberConflict && !['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(databaseCode))) throw error
      }
    }

    if (Number(result.avatarId) > 0) {
      try {
        const [avatar] = await getAttachmentList([result.avatarId])
        result.avatarUrl = avatar?.url || ''
        result.expiresTime = avatar?.url ? (avatar.expiresTime ?? null) : null
      } catch {
        // 成员关系和邀请消费已提交；前端可通过家庭详情接口重新获取头像地址
      }
    }
    return result
  }
}

module.exports = familyService
