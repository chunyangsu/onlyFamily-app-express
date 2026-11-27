const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')
const invitationUtils = require('../src/utils/invitation')

const invitationCode = invitationUtils.generateInvitationCode()
const request = { userId: 1, invitationCode }
const now = 1800000000000

function fixture(options = {}) {
  let clock = now
  const calls = { queries: [], attachments: [] }
  const records = {
    user: { id: 1, status: 'normal' },
    inviter: { id: 3, status: 'normal' },
    invitation: { familyId: 2, inviterId: 3, codeHash: invitationUtils.hashInvitationCode(invitationCode), status: 'unused', expiresTime: String(now + 86400000) },
    family: { id: 2, name: '幸福一家', avatarId: 7, status: 'normal', deleteTime: 0 },
    inviterMember: { familyId: 2, userId: 3, nickname: '小明', role: 'member' },
    member: null
  }
  for (const [key, value] of Object.entries(options.records || {})) {
    records[key] = value === null ? null : { ...records[key], ...value }
  }
  const find = (name, record) => async (query) => {
    assert.equal(query.transaction, undefined)
    assert.equal(query.lock, undefined)
    calls.queries.push({ name, query })
    if (options.queryError === name) throw options.error
    const value = typeof record === 'function' ? record(query) : records[record]
    return value && Object.entries(query.where).every(([key, item]) => String(value[key]) === String(item)) ? value : null
  }
  const forbiddenWrite = () => assert.fail('预览不允许写入数据库或开启事务')
  const models = {
    userList: { findOne: find('user', (query) => Number(query.where.id) === 1 ? records.user : records.inviter) },
    familyInvitation: { findOne: find('invitation', 'invitation'), update: forbiddenWrite, create: forbiddenWrite },
    familyList: { findOne: find('family', 'family') },
    familyUserMap: {
      findOne: find('member', (query) => Number(query.where.userId) === 3 ? records.inviterMember : records.member),
      create: forbiddenWrite, update: forbiddenWrite
    },
    sequelize: { transaction: forbiddenWrite }
  }
  const imports = {
    '@/models': models,
    '@/utils/invitation': invitationUtils,
    '@/config/env': {},
    '@/services/common/avatarObject': {},
    '@/services/common/attachment': {
      async getAttachmentList(ids) {
        calls.attachments.push(Array.from(ids))
        if (options.attachmentError) throw options.attachmentError
        if (options.expireDuringSigning) clock += 86400000
        return options.attachments === undefined ? [{ url: 'signed-avatar', expiresTime: now + 43200000 }] : options.attachments
      }
    }
  }
  const module = { exports: {} }
  vm.runInNewContext(readFileSync(resolve(__dirname, '../src/services/modules/family.js'), 'utf8'), {
    module,
    Date: { now: () => clock },
    require(name) {
      if (!(name in imports)) throw new Error(`Unexpected import: ${name}`)
      return imports[name]
    }
  })
  return { service: module.exports, calls, records }
}

test('有效邀请返回家庭内昵称、家庭资料、独立的头像过期时间，不返回凭证和哈希', async () => {
  const { service, calls, records } = fixture()
  const result = await service.getInvitationDetail({ ...request, familyId: 99 })
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    inviterId: 3, inviterAvatarId: 0, inviterAvatarUrl: '', inviterNickname: '小明', familyId: 2, familyName: '幸福一家',
    familyAvatarId: 7, familyAvatarUrl: 'signed-avatar', familyAvatarExpiresTime: now + 43200000,
    status: 'unused', expiresTime: now + 86400000, isMember: false
  })
  assert.deepEqual(calls.attachments, [[7]])
  const query = calls.queries.find((call) => call.name === 'invitation').query
  assert.equal(query.where.codeHash, invitationUtils.hashInvitationCode(invitationCode))
  assert.equal(records.invitation.status, 'unused')
  assert.ok(!JSON.stringify(result).includes(invitationCode))
  assert.equal(result.codeHash, undefined)
})

test('已是成员或邀请人本人预览仍只读，不消费邀请，支持管理员和普通成员邀请', async () => {
  for (const role of ['admin', 'member']) {
    const { service, records } = fixture({ records: {
      inviterMember: { role }, member: { id: 8, familyId: 2, userId: 1 }
    } })
    assert.equal((await service.getInvitationDetail(request)).isMember, true)
    const own = await service.getInvitationDetail({ ...request, userId: 3 })
    assert.equal(own.isMember, true)
    assert.equal(records.invitation.status, 'unused')
  }
})

test('无头像、缺失附件或附件无链接时返回空地址', async () => {
  for (const options of [{ records: { family: { avatarId: 0 } } }, { attachments: [] }, { attachments: [{ url: '' }] }]) {
    const { service, calls } = fixture(options)
    const result = await service.getInvitationDetail(request)
    assert.equal(result.familyAvatarUrl, '')
    assert.equal(result.familyAvatarExpiresTime, options.records ? undefined : null)
    if (options.records) assert.equal(calls.attachments.length, 0)
  }
  const { service } = fixture({ records: { inviterMember: { nickname: '' } } })
  assert.equal((await service.getInvitationDetail(request)).inviterNickname, '')
})

test('邀请人头像使用家庭成员头像，并查询对应附件链接', async () => {
  const { service, calls } = fixture({ records: {
    inviter: { avatarId: 99 }, inviterMember: { userAvatarId: 8 }, family: { avatarId: 0 }
  } })
  const result = await service.getInvitationDetail(request)
  assert.equal(result.inviterAvatarId, 8)
  assert.equal(result.inviterAvatarUrl, 'signed-avatar')
  assert.deepEqual(calls.attachments, [[8]])
  const query = calls.queries.find((call) => call.name === 'member' && call.query.where.userId === 3).query
  assert.ok(query.attributes.includes('userAvatarId'))
})

test('邀请人无头像、附件缺失或链接为空时返回空头像地址', async () => {
  for (const userAvatarId of [undefined, null, 0, 8]) {
    for (const attachments of [[], [{ url: '' }]]) {
      const { service, calls } = fixture({
        records: { inviterMember: { userAvatarId }, family: { avatarId: 0 } }, attachments
      })
      const result = await service.getInvitationDetail(request)
      assert.equal(result.inviterAvatarId, userAvatarId || 0)
      assert.equal(result.inviterAvatarUrl, '')
      assert.deepEqual(calls.attachments, userAvatarId ? [[8]] : [])
    }
  }
})

test('非法用户 ID 或凭证在访问数据库前拒绝，包括直接传入哈希', async () => {
  for (const userId of [undefined, null, 0, -1, 1.5, true, [], {}, 'abc', 2147483648]) {
    const { service, calls } = fixture()
    await assert.rejects(service.getInvitationDetail({ ...request, userId }), (error) => error.status === 400)
    assert.equal(calls.queries.length, 0)
  }
  for (const code of [undefined, null, '', 'a'.repeat(42), 'a'.repeat(64), '+'.repeat(43)]) {
    const { service, calls } = fixture()
    await assert.rejects(service.getInvitationDetail({ ...request, invitationCode: code }), (error) => error.status === 400)
    assert.equal(calls.queries.length, 0)
  }
})

test('不存在、已使用、撤销、过期及未知状态的邀请均拒绝，过期时间不依赖状态任务', async () => {
  for (const [invitation, status] of [
    [null, 404], [{ codeHash: 'b'.repeat(64) }, 404],
    [{ status: 'used' }, 409], [{ status: 'revoked' }, 410], [{ status: 'expired' }, 410],
    [{ status: 'unknown' }, 410], [{ expiresTime: now }, 410], [{ expiresTime: now - 1 }, 410],
    [{ expiresTime: 0 }, 410], [{ expiresTime: 'bad' }, 410]
  ]) {
    const { service, calls } = fixture({ records: { invitation } })
    await assert.rejects(service.getInvitationDetail(request), (error) => error.status === status)
    assert.equal(calls.attachments.length, 0)
    assert.equal(calls.queries.some((call) => call.name === 'family'), false)
  }
})

test('用户、家庭或邀请人不可用、邀请人已退出或无邀请角色时拒绝展示', async () => {
  for (const records of [
    { user: null }, { user: { status: 'disabled' } },
    { family: null }, { family: { status: 'disabled' } }, { family: { deleteTime: 1 } },
    { inviter: null }, { inviter: { status: 'disabled' } },
    { inviterMember: null }, { inviterMember: { familyId: 99 } }, { inviterMember: { role: 'unknown' } }
  ]) {
    const { service, calls } = fixture({ records })
    await assert.rejects(service.getInvitationDetail(request), (error) => error.status === 403)
    assert.equal(calls.attachments.length, 0)
  }
})

test('数据库或签名异常向上传递，签名期间邀请过期也拒绝返回可用预览', async () => {
  const error = new Error('upstream failed')
  for (const queryError of ['user', 'invitation', 'family', 'member']) {
    const { service } = fixture({ queryError, error })
    await assert.rejects(service.getInvitationDetail(request), (result) => result === error)
  }
  const { service } = fixture({ attachmentError: error })
  await assert.rejects(service.getInvitationDetail(request), (result) => result === error)
  const expired = fixture({ expireDuringSigning: true })
  await assert.rejects(expired.service.getInvitationDetail(request), (result) => result.status === 410)
})
