const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')
const invitationUtils = require('../src/utils/invitation')

const now = 1800000000000
const code = invitationUtils.generateInvitationCode()
const otherCode = invitationUtils.generateInvitationCode()
const request = { userId: 1, invitationCode: code }
const clone = (value) => JSON.parse(JSON.stringify(value))

function fixture(options = {}) {
  let clock = now
  const calls = { queries: [], creates: [], updates: [], events: [], signatures: [], transactions: 0 }
  const state = {
    users: [{ id: 1, status: 'normal' }, { id: 3, status: 'normal' }, { id: 4, status: 'normal' }],
    families: [{ id: 2, name: '我的家庭', avatarId: 7, status: 'normal', deleteTime: 0 }],
    members: [{ id: 1, familyId: 2, userId: 3, role: 'admin', nickname: '邀请人' }],
    invitations: [
      { id: 1, familyId: 2, inviterId: 3, codeHash: invitationUtils.hashInvitationCode(code), status: 'unused', expiresTime: String(now + 86400000), joinerId: 0, joinTime: 0 },
      { id: 2, familyId: 2, inviterId: 3, codeHash: invitationUtils.hashInvitationCode(otherCode), status: 'unused', expiresTime: now + 86400000, joinerId: 0, joinTime: 0 }
    ]
  }
  options.prepare?.(state)
  let queue = Promise.resolve()
  let active
  // 模拟事务隔离、回滚及竞争后的重新读取；不连接真实 MySQL。
  const sequelize = {
    async transaction(fn) {
      const previous = queue
      let release
      queue = new Promise((resolve) => { release = resolve })
      await previous
      calls.transactions++
      calls.events.push('begin')
      const snapshot = clone(state)
      const transaction = { LOCK: { UPDATE: 'UPDATE' } }
      active = transaction
      try {
        if (options.transactionError && calls.transactions <= (options.failAttempts || 1)) throw options.transactionError
        const result = await fn(transaction)
        if (options.commitError) throw options.commitError
        calls.events.push('commit')
        return result
      } catch (error) {
        Object.assign(state, snapshot)
        calls.events.push('rollback')
        options.afterRollback?.(state, calls)
        throw error
      } finally {
        active = null
        release()
      }
    }
  }
  const checkTransaction = (config, locked = false) => {
    assert.ok(active)
    assert.equal(config.transaction, active)
    if (locked) assert.equal(config.lock, 'UPDATE')
  }
  const matches = (record, where) => Object.entries(where).every(([key, value]) => String(record[key]) === String(value))
  function findOne(table) {
    return async (config) => {
      checkTransaction(config, true)
      calls.queries.push({ table, where: clone(config.where) })
      if (options.queryError === table) throw options.error
      const record = state[table].find((item) => matches(item, config.where))
      if (!record) return null
      if (table !== 'invitations') return record
      return {
        ...record,
        async update(values, config) {
          checkTransaction(config)
          calls.updates.push(clone(values))
          if (options.updateError) throw options.updateError
          Object.assign(record, values)
        }
      }
    }
  }
  const models = {
    sequelize,
    userList: { findOne: findOne('users') },
    familyList: { findOne: findOne('families') },
    familyInvitation: { findOne: findOne('invitations') },
    familyUserMap: {
      findOne: findOne('members'),
      async create(values, config) {
        checkTransaction(config)
        calls.creates.push(clone(values))
        if (options.createError) throw options.createError
        if (state.members.some((item) => item.familyId === values.familyId && item.userId === values.userId)) {
          throw Object.assign(new Error('duplicate'), { name: 'SequelizeUniqueConstraintError', fields: { familyId: values.familyId, userId: values.userId } })
        }
        state.members.push({ id: state.members.length + 1, ...values })
        if (options.expireAfterCreate) clock += 86400000
      }
    }
  }
  const imports = {
    '@/models': models,
    '@/utils/invitation': invitationUtils,
    '@/config/env': {},
    '@/services/common/avatarObject': {},
    '@/services/common/attachment': {
      async getAttachmentList(ids) {
        assert.ok(calls.events.includes('commit'))
        calls.signatures.push(Array.from(ids))
        if (options.signatureError) throw options.signatureError
        return options.attachments === undefined ? [{ url: 'signed', expiresTime: now + 43200000 }] : options.attachments
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
  return { service: module.exports, state, calls }
}

test('有效邀请在同一事务创建 member 并消费邀请，忽略客户端家庭和角色，提交后签名', async () => {
  const { service, state, calls } = fixture()
  const result = await service.joinFamily({ ...request, userId: '1', familyId: 99, role: 'admin' })
  assert.deepEqual(clone(result), {
    id: 2, name: '我的家庭', avatarId: 7, avatarUrl: 'signed', expiresTime: now + 43200000, role: 'member', alreadyMember: false
  })
  assert.deepEqual(calls.creates, [{ familyId: 2, userId: 1, nickname: '用户_1', userAvatarId: 0, role: 'member' }])
  assert.deepEqual(calls.updates, [{ status: 'used', joinerId: 1, joinTime: now }])
  assert.equal(state.invitations[0].status, 'used')
  assert.deepEqual(calls.events, ['begin', 'commit'])
  assert.equal(calls.queries.find((item) => item.table === 'invitations').where.codeHash, invitationUtils.hashInvitationCode(code))
  assert.deepEqual(calls.signatures, [[7]])
  assert.ok(!JSON.stringify(result).includes(code))
})

test('已是家庭成员不消费未使用邀请，不修改昵称、头像和管理员角色', async () => {
  const member = { id: 2, familyId: 2, userId: 1, nickname: '原昵称', userAvatarId: 99, role: 'admin' }
  const { service, state, calls } = fixture({ prepare: (state) => state.members.push(member) })
  const result = await service.joinFamily(request)
  assert.equal(result.alreadyMember, true)
  assert.equal(result.role, 'admin')
  assert.equal(state.invitations[0].status, 'unused')
  assert.equal(calls.creates.length, 0)
  assert.equal(calls.updates.length, 0)
  assert.deepEqual(state.members[1], member)
})

test('本人重复提交幂等成功，即使邀请已过期或邀请人已退出；退出后不允许复用', async () => {
  const { service, state, calls } = fixture()
  await service.joinFamily(request)
  state.invitations[0].expiresTime = now - 1
  state.users = state.users.filter((item) => item.id !== 3)
  state.members = state.members.filter((item) => item.userId !== 3)
  const result = await service.joinFamily(request)
  assert.equal(result.alreadyMember, true)
  assert.equal(calls.creates.length, 1)
  assert.equal(calls.updates.length, 1)
  state.members = []
  await assert.rejects(service.joinFamily(request), (error) => error.status === 409)
  assert.equal(state.members.length, 0)
})

test('自己点击自己的邀请属于已是成员，不消费邀请；允许已有其他家庭的用户加入', async () => {
  const own = fixture()
  assert.equal((await own.service.joinFamily({ ...request, userId: 3 })).alreadyMember, true)
  assert.equal(own.state.invitations[0].status, 'unused')
  const other = fixture({ prepare: (state) => state.members.push({ familyId: 99, userId: 1, role: 'admin' }) })
  await other.service.joinFamily(request)
  assert.equal(other.state.members.filter((item) => item.userId === 1).length, 2)
})

test('无效用户 ID、凭证或仅提供 familyId 在事务前拒绝', async () => {
  for (const userId of [undefined, null, 0, -1, 1.5, true, [], {}, 'abc', 2147483648]) {
    const { service, calls } = fixture()
    await assert.rejects(service.joinFamily({ ...request, userId }), (error) => error.status === 400)
    assert.equal(calls.transactions, 0)
  }
  for (const invitationCode of [undefined, null, '', 'a'.repeat(64), '+'.repeat(43)]) {
    const { service, calls } = fixture()
    await assert.rejects(service.joinFamily({ userId: 1, familyId: 2, invitationCode }), (error) => error.status === 400)
    assert.equal(calls.transactions, 0)
  }
})

test('不存在、被别人使用、撤销、过期及未知状态的邀请拒绝且不写入', async () => {
  for (const [values, status] of [
    [{ codeHash: 'b'.repeat(64) }, 404], [{ status: 'used', joinerId: 4 }, 409],
    [{ status: 'revoked' }, 410], [{ status: 'expired' }, 410], [{ status: 'unknown' }, 410],
    [{ expiresTime: now }, 410], [{ expiresTime: 0 }, 410], [{ expiresTime: 'bad' }, 410]
  ]) {
    const { service, state, calls } = fixture({ prepare: (state) => Object.assign(state.invitations[0], values) })
    const before = clone(state)
    await assert.rejects(service.joinFamily(request), (error) => error.status === status)
    assert.deepEqual(state, before)
    assert.equal(calls.creates.length, 0)
    assert.equal(calls.signatures.length, 0)
  }
})

test('用户、家庭、邀请人不可用或无邀请权限时拒绝，已有成员也不绕过有效性校验', async () => {
  for (const prepare of [
    (state) => { state.users = state.users.filter((item) => item.id !== 1) },
    (state) => { state.users[0].status = 'disabled' },
    (state) => { state.families = [] },
    (state) => { state.families[0].status = 'disabled' },
    (state) => { state.families[0].deleteTime = 1 },
    (state) => { state.users = state.users.filter((item) => item.id !== 3) },
    (state) => { state.users[1].status = 'disabled' },
    (state) => { state.members = [] },
    (state) => { state.members[0].role = 'unknown' }
  ]) {
    const { service, calls } = fixture({ prepare })
    await assert.rejects(service.joinFamily(request), (error) => error.status === 403)
    assert.equal(calls.creates.length, 0)
    assert.equal(calls.updates.length, 0)
  }
  const existing = fixture({ prepare: (state) => {
    state.members.push({ userId: 1, familyId: 2, role: 'admin' })
    state.invitations[0].status = 'revoked'
  } })
  await assert.rejects(existing.service.joinFamily(request), (error) => error.status === 410)
})

test('成员创建、邀请更新、提交或查询失败全部回滚，邀请不被白白消耗', async () => {
  const error = new Error('database failed')
  for (const options of [
    { createError: error }, { updateError: error }, { commitError: error },
    ...['users', 'invitations', 'families', 'members'].map((queryError) => ({ queryError, error }))
  ]) {
    const { service, state, calls } = fixture(options)
    const before = clone(state)
    await assert.rejects(service.joinFamily(request), (result) => result === error)
    assert.deepEqual(state, before)
    assert.deepEqual(calls.events, ['begin', 'rollback'])
    assert.equal(calls.signatures.length, 0)
  }
  const expired = fixture({ expireAfterCreate: true })
  await assert.rejects(expired.service.joinFamily(request), (error) => error.status === 410)
  assert.equal(expired.state.members.length, 1)
  assert.equal(expired.state.invitations[0].status, 'unused')
})

test('头像无绑定、缺失或签名异常均不影响已提交的加入结果', async () => {
  for (const options of [
    { prepare: (state) => { state.families[0].avatarId = 0 } },
    { attachments: [] }, { attachments: [{ url: '' }] }, { signatureError: new Error('OSS failed') }
  ]) {
    const { service, state } = fixture(options)
    const result = await service.joinFamily(request)
    assert.equal(result.avatarUrl, '')
    assert.equal(result.expiresTime, null)
    assert.equal(state.invitations[0].status, 'used')
  }
})

test('模拟行锁串行后的并发结果：不同人同邀请仅一人加入；本人同邀请重试幂等', async () => {
  const first = fixture()
  const results = await Promise.allSettled([
    first.service.joinFamily(request), first.service.joinFamily({ ...request, userId: 4 })
  ])
  assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1)
  assert.equal(results.find((item) => item.status === 'rejected').reason.status, 409)
  assert.equal(first.calls.creates.length, 1)
  const second = fixture()
  const own = await Promise.all([second.service.joinFamily(request), second.service.joinFamily(request)])
  assert.deepEqual(own.map((item) => item.alreadyMember), [false, true])
  assert.equal(second.calls.updates.length, 1)
})

test('同用户不同邀请只创建一次成员，不消费第二个邀请', async () => {
  const { service, calls, state } = fixture()
  await Promise.all([service.joinFamily(request), service.joinFamily({ ...request, invitationCode: otherCode })])
  assert.equal(calls.creates.length, 1)
  assert.equal(state.invitations[0].status, 'used')
  assert.equal(state.invitations[1].status, 'unused')
})

test('死锁/锁超时重试整个事务，持续冲突最多三次，非竞争错误不重试', async () => {
  for (const code of ['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']) {
    const error = Object.assign(new Error('lock failed'), { original: { code } })
    const recovered = fixture({ transactionError: error })
    await recovered.service.joinFamily(request)
    assert.deepEqual(recovered.calls.events, ['begin', 'rollback', 'begin', 'commit'])
    const failed = fixture({ transactionError: error, failAttempts: 9 })
    await assert.rejects(failed.service.joinFamily(request), (result) => result === error)
    assert.equal(failed.calls.transactions, 3)
  }
})

test('成员唯一冲突回滚后重新读取已存在成员，不消费邀请；其他唯一冲突不重试', async () => {
  const conflict = Object.assign(new Error('duplicate'), {
    name: 'SequelizeUniqueConstraintError', fields: { familyId: 2, userId: 1 }
  })
  const { service, state, calls } = fixture({
    createError: conflict,
    afterRollback(state) { state.members.push({ familyId: 2, userId: 1, role: 'member' }) }
  })
  assert.equal((await service.joinFamily(request)).alreadyMember, true)
  assert.equal(state.invitations[0].status, 'unused')
  assert.equal(calls.transactions, 2)
  const unrelated = Object.assign(new Error('duplicate'), { name: 'SequelizeUniqueConstraintError', fields: { nickname: 'x' } })
  const failed = fixture({ createError: unrelated })
  await assert.rejects(failed.service.joinFamily(request), (result) => result === unrelated)
  assert.equal(failed.calls.transactions, 1)
})
