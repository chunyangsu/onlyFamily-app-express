const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')

function load(file, imports) {
  const module = { exports: {} }
  vm.runInNewContext(readFileSync(resolve(__dirname, '..', file), 'utf8'), {
    module,
    exports: module.exports,
    require(name) {
      if (!(name in imports)) throw new Error(`Unexpected import: ${name}`)
      return imports[name]
    }
  })
  return module.exports
}

const joi = require('joi')
const common = load('src/validations/common/index.js', { joi })
const validation = load('src/validations/modules/family.js', { joi, '@/validations/common': common })

test('家庭头像参数只接受数据库范围内的正整数，不接受额外字段', () => {
  for (const body of [
    {},
    { avatarId: null },
    { avatarId: 0 },
    { avatarId: -1 },
    { avatarId: 1.5 },
    { avatarId: true },
    { avatarId: [] },
    { avatarId: 'abc' },
    { avatarId: 2147483648 },
    { avatarId: 3, familyId: 9 }
  ]) {
    assert.ok(validation.updateFamilyAvatar.body.validate(body).error)
  }
  const result = validation.updateFamilyAvatar.body.validate({ avatarId: '3' })
  assert.equal(result.error, undefined)
  assert.equal(result.value.avatarId, 3)
})

function fixture(options = {}) {
  const calls = { updates: [], checks: [], signatures: [], queries: [], transactions: 0 }
  const records = {
    userList: { id: 1, status: 'normal' },
    familyList: { id: 2, status: 'normal', deleteTime: 0, avatarId: 7, name: '家庭名称' },
    familyUserMap: { userId: 1, familyId: 2, role: 2, userAvatarId: 9 },
    attachmentList: {
      id: 3,
      familyId: 2,
      createId: 1,
      module: 'family',
      moduleType: 'avatar',
      status: 'normal',
      mimeType: 'image/jpeg',
      objectKey: 'family_2/family/avatar/2026/11/12345678-1234-4123-8123-123456789abc'
    }
  }
  for (const [name, values] of Object.entries(options.records || {})) records[name] = values === null ? null : { ...records[name], ...values }
  if (records.familyList)
    records.familyList.update = async (values, { transaction }) => {
      assert.ok(transaction)
      if (options.updateError) throw new Error('database failed')
      calls.updates.push(values)
      Object.assign(records.familyList, values)
    }
  const models = {}
  for (const name of Object.keys(records))
    models[name] = {
      async findOne(query) {
        calls.queries.push(query)
        if (query.transaction) assert.equal(query.lock, 'UPDATE')
        const record = records[name]
        return record && Object.entries(query.where).every(([key, value]) => record[key] === value) ? record : null
      }
    }
  models.sequelize = {
    async transaction(fn) {
      calls.transactions++
      return fn({ LOCK: { UPDATE: 'UPDATE' } })
    }
  }
  const service = load('src/services/modules/family.js', {
    '@/models': models,
    '@/services/common/avatarObject': {
      async validateAvatarObject(key, mime) {
        calls.checks.push([key, mime])
        if (options.objectError) throw new Error('invalid object')
        options.afterCheck?.(records)
      }
    },
    '@/services/common/attachment': {
      async getAttachmentList(ids) {
        calls.signatures.push(Array.from(ids))
        assert.equal(calls.updates.length, 0)
        assert.equal(calls.transactions, 0)
        if (options.signatureError) throw new Error('signature failed')
        return [{ id: ids[0], url: options.missingUrl ? null : 'https://example.com/signed-family-avatar', urlExpiresAt: 1795608000000 }]
      }
    }
  })
  return { service, calls, records }
}
const request = { userId: 1, familyId: '2', avatarId: 3 }

test('家庭成员更新当前家庭 avatarId，返回签名 URL，不修改成员头像或家庭名称', async () => {
  const { service, calls, records } = fixture()
  const result = await service.updateFamilyAvatar(request)
  assert.equal(result.avatarId, 3)
  assert.equal(result.avatarUrl, 'https://example.com/signed-family-avatar')
  assert.equal(result.urlExpiresAt, 1795608000000)
  assert.deepEqual(calls.signatures, [[3]])
  assert.equal(calls.checks.length, 1)
  assert.equal(records.familyList.avatarId, 3)
  assert.equal(records.familyList.name, '家庭名称')
  assert.equal(records.familyUserMap.userAvatarId, 9)
  assert.equal(JSON.stringify(calls.updates), '[{"avatarId":3}]')
})

test('重复绑定同一家庭头像不执行多余写入', async () => {
  const { service, calls } = fixture({ records: { familyList: { avatarId: 3 } } })
  assert.equal((await service.updateFamilyAvatar(request)).avatarId, 3)
  assert.equal(calls.updates.length, 0)
})

test('非法用户、家庭或头像 ID 不查询数据库', async () => {
  for (const key of ['userId', 'familyId', 'avatarId']) {
    for (const value of [undefined, null, '', 0, -1, 1.5, true, [], 'abc', 2147483648]) {
      const { service, calls } = fixture()
      await assert.rejects(service.updateFamilyAvatar({ ...request, [key]: value }), (error) => error.status === 400)
      assert.equal(calls.queries.length, 0)
    }
  }
})

test('拒绝非成员、停用用户、不可用家庭、跨家庭或他人附件、错误用途和状态', async () => {
  for (const records of [
    { userList: null },
    { userList: { status: 'disabled' } },
    { familyList: null },
    { familyList: { status: 'disabled' } },
    { familyList: { deleteTime: 1 } },
    { familyUserMap: null },
    { attachmentList: null },
    { attachmentList: { familyId: 8 } },
    { attachmentList: { createId: 8 } },
    { attachmentList: { module: 'user' } },
    { attachmentList: { moduleType: 'dish' } },
    { attachmentList: { status: 'deleted' } }
  ]) {
    const { service, calls } = fixture({ records })
    await assert.rejects(service.updateFamilyAvatar(request), (error) => error.status === 403)
    assert.equal(calls.updates.length, 0)
  }
})

test('拒绝非法对象路径和 MIME', async () => {
  for (const attachmentList of [
    { objectKey: 'family_8/family/avatar/2026/11/12345678-1234-4123-8123-123456789abc' },
    { objectKey: 'family_2/family/avatar/../../file' },
    { objectKey: 'https://example.com/avatar' },
    { mimeType: 'text/plain' }
  ]) {
    const { service, calls } = fixture({ records: { attachmentList } })
    await assert.rejects(service.updateFamilyAvatar(request), (error) => error.status === 400)
    assert.equal(calls.checks.length, 0)
  }
})

test('OSS 校验、签名或数据库失败保留旧头像，签名失败不启动事务', async () => {
  for (const options of [{ objectError: true }, { signatureError: true }, { missingUrl: true }, { updateError: true }]) {
    const { service, calls, records } = fixture(options)
    await assert.rejects(service.updateFamilyAvatar(request))
    assert.equal(records.familyList.avatarId, 7)
    if (!options.updateError) assert.equal(calls.transactions, 0)
  }
})

test('OSS 检查期间成员关系、家庭或附件改变时，事务内重新检查阻止更新', async () => {
  for (const afterCheck of [
    (records) => {
      records.familyUserMap = null
    },
    (records) => {
      records.familyList.deleteTime = 1
    },
    (records) => {
      records.attachmentList.status = 'deleted'
    },
    (records) => {
      records.attachmentList.objectKey = records.attachmentList.objectKey.replace('12345678', '87654321')
    },
    (records) => {
      records.attachmentList.mimeType = 'image/png'
    }
  ]) {
    const { service, calls, records } = fixture({ afterCheck })
    await assert.rejects(service.updateFamilyAvatar(request))
    assert.equal(calls.updates.length, 0)
    assert.equal(records.familyList.avatarId, 7)
  }
})

test('路由先校验，Controller 使用 JWT 用户和当前家庭，不接受 body 指定用户或家庭', async () => {
  let params
  let response
  const controller = load('src/controllers/modules/family.js', {
    '@/services/modules/family': {
      async updateFamilyAvatar(data) {
        params = data
        return { avatarId: 3, avatarUrl: 'signed' }
      }
    },
    '@/utils/asyncHandler': (handler) => handler,
    '@/utils/responseHandler': {
      success: (_res, data) => {
        response = data
      }
    },
    '@/data/enum/code': {}
  })
  const routes = []
  const middleware = () => {}
  load('src/routes/modules/family.js', {
    express: { Router: () => ({ post() {}, get() {}, put: (...args) => routes.push(args) }) },
    '@/controllers/modules/family': controller,
    '@/validations/modules/family': validation,
    '@/middlewares/validateMiddleware': (schema) => {
      assert.equal(schema, validation.updateFamilyAvatar)
      return middleware
    }
  })
  assert.equal(routes[0][0], '/updateAvatar')
  assert.equal(routes[0][1], middleware)
  await routes[0][2]({ user: { id: 1 }, headers: { 'family-id': '2' }, body: { userId: 9, familyId: 9, avatarId: 9 }, validated: { body: { avatarId: 3 } } }, {})
  assert.equal(params.userId, 1)
  assert.equal(params.familyId, '2')
  assert.equal(params.avatarId, 3)
  assert.equal(response.avatarUrl, 'signed')
})
