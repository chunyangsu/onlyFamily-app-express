const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')

function load(file, imports) {
  const module = { exports: {} }
  vm.runInNewContext(
    readFileSync(resolve(__dirname, '..', file), 'utf8'),
    {
      module,
      exports: module.exports,
      Buffer,
      require(name) {
        if (!(name in imports)) throw new Error(`Unexpected import: ${name}`)
        return imports[name]
      }
    },
    { filename: file }
  )
  return module.exports
}

const common = load('src/validations/common/index.js', { joi: require('joi') })
const validation = load('src/validations/modules/user.js', { joi: require('joi'), '@/validations/common': common })

test('头像参数仅接受正整数 ID，拒绝缺失、非法值、越界及额外字段', () => {
  for (const body of [
    {},
    { avatarId: 0 },
    { avatarId: -1 },
    { avatarId: 1.5 },
    { avatarId: null },
    { avatarId: true },
    { avatarId: [] },
    { avatarId: 2147483648 },
    { avatarId: 'abc' },
    { avatarId: 3, userId: 2 }
  ]) {
    assert.ok(validation.updateUserAvatar.body.validate(body).error)
  }
  const result = validation.updateUserAvatar.body.validate({ avatarId: '3' })
  assert.equal(result.error, undefined)
  assert.equal(result.value.avatarId, 3)
})

function fixture(options = {}) {
  const calls = { updates: [], checks: [], queries: [], signatures: [], commits: 0, rollbacks: 0 }
  const records = {
    userList: { id: 1, status: 'normal' },
    familyList: { id: 2, status: 'normal', deleteTime: 0 },
    familyUserMap: { id: 4, userId: 1, familyId: 2, userAvatarId: 7, nickname: '用户' },
    attachmentList: {
      id: 3,
      familyId: 2,
      createId: 1,
      module: 'user',
      moduleType: 'avatar',
      status: 'normal',
      mimeType: 'image/jpeg',
      objectKey: 'family_2/user/avatar/2026/11/12345678-1234-4123-8123-123456789abc'
    }
  }
  for (const [name, value] of Object.entries(options.records || {})) records[name] = value === null ? null : { ...records[name], ...value }
  const member = records.familyUserMap
  if (member)
    member.update = async (values, { transaction }) => {
      assert.ok(transaction)
      if (options.updateError) throw new Error('database failed')
      calls.updates.push(values)
      Object.assign(member, values)
    }
  const models = {}
  for (const name of Object.keys(records))
    models[name] = {
      async findOne(query) {
        calls.queries.push({ name, query })
        if (query.transaction) assert.equal(query.lock, 'UPDATE')
        const record = records[name]
        if (!record || Object.entries(query.where).some(([key, value]) => record[key] !== value)) return null
        return record
      }
    }
  models.sequelize = {
    async transaction(fn) {
      const originalAvatar = member?.userAvatarId
      try {
        const result = await fn({ LOCK: { UPDATE: 'UPDATE' } })
        calls.commits++
        return result
      } catch (error) {
        if (member) member.userAvatarId = originalAvatar
        calls.rollbacks++
        throw error
      }
    }
  }
  const service = load('src/services/modules/user.js', {
    '@/models': models,
    '@/utils/jwt': {},
    '@/services/common/wechat': {},
    '@/services/common/attachment': {
      async getAttachmentList(ids) {
        calls.signatures.push(Array.from(ids))
        // 签名在事务外完成，此时尚未修改头像。
        assert.equal(calls.updates.length, 0)
        assert.equal(calls.commits, 0)
        if (options.signatureError) throw new Error('signature failed')
        if (options.missingUrl) return [{ id: ids[0], url: null }]
        return [{ id: ids[0], url: 'https://example.com/avatar-signed', urlExpiresAt: 1795608000000 }]
      }
    },
    '@/services/common/avatarObject': {
      async validateAvatarObject(key, mime) {
        calls.checks.push([key, mime])
        if (options.objectError) throw new Error('object failed')
        options.afterObjectCheck?.(records)
      }
    }
  })
  return { service, calls, records }
}

const request = { userId: 1, familyId: '2', avatarId: 3 }

test('仅更新当前家庭内自己的 userAvatarId，事务提交后返回附件 ID 和签名 URL', async () => {
  const { service, calls, records } = fixture()
  const result = await service.updateUserAvatar(request)
  assert.equal(JSON.stringify(result), JSON.stringify({ avatarId: 3, avatarUrl: 'https://example.com/avatar-signed', urlExpiresAt: 1795608000000 }))
  assert.deepEqual(calls.signatures, [[3]])
  assert.equal(records.familyUserMap.userAvatarId, 3)
  assert.equal(records.familyUserMap.nickname, '用户')
  assert.equal(calls.updates.length, 1)
  assert.equal(Object.keys(calls.updates[0]).join(), 'userAvatarId')
  assert.equal(calls.checks.length, 1)
  assert.equal(calls.commits, 1)
  assert.equal(calls.queries.filter(({ query }) => query.transaction).length, 4)
})

test('重复绑定同一头像幂等成功，不触发多余写入', async () => {
  const { service, calls } = fixture({ records: { familyUserMap: { userAvatarId: 3 } } })
  const result = await service.updateUserAvatar(request)
  assert.equal(result.avatarId, 3)
  assert.equal(result.avatarUrl, 'https://example.com/avatar-signed')
  assert.equal(calls.updates.length, 0)
})

test('签名失败或未返回 URL 时不修改绑定、不启动事务', async () => {
  for (const options of [{ signatureError: true }, { missingUrl: true }]) {
    const { service, calls, records } = fixture(options)
    await assert.rejects(service.updateUserAvatar(request))
    assert.equal(records.familyUserMap.userAvatarId, 7)
    assert.equal(calls.updates.length, 0)
    assert.equal(calls.commits, 0)
    assert.equal(calls.rollbacks, 0)
    assert.equal(calls.queries.some(({ query }) => query.transaction), false)
  }
})

test('Service 防御性校验 userId、familyId、avatarId，非法请求不查询数据库', async () => {
  for (const field of ['userId', 'familyId', 'avatarId']) {
    for (const value of [undefined, '', 0, -1, 1.2, true, [1], {}, '1e2', ' 2 ', 2147483648]) {
      const { service, calls } = fixture()
      await assert.rejects(service.updateUserAvatar({ ...request, [field]: value }), (error) => error.status === 400)
      assert.equal(calls.queries.length, 0)
    }
  }
})

test('用户停用、家庭删除或停用、非成员、他人及跨家庭附件、错误用途和删除附件均拒绝绑定', async () => {
  for (const records of [
    { userList: null },
    { userList: { status: 'disabled' } },
    { familyList: null },
    { familyList: { status: 'deleted' } },
    { familyList: { deleteTime: 1 } },
    { familyUserMap: null },
    { familyUserMap: { userId: 5 } },
    { familyUserMap: { familyId: 5 } },
    { attachmentList: null },
    { attachmentList: { createId: 5 } },
    { attachmentList: { familyId: 5 } },
    { attachmentList: { module: 'food' } },
    { attachmentList: { moduleType: 'dish' } },
    { attachmentList: { moduleType: '' } },
    { attachmentList: { status: 'deleted' } }
  ]) {
    const { service, calls } = fixture({ records })
    await assert.rejects(service.updateUserAvatar(request), (error) => error.status === 403)
    assert.equal(calls.updates.length, 0)
    assert.equal(calls.checks.length, 0)
  }
})

test('拒绝错误 MIME、跨家庭路径、任意 URL 和路径穿越', async () => {
  for (const attachment of [
    { mimeType: 'text/html' },
    { objectKey: '' },
    { objectKey: 'https://example.com/a.jpg' },
    { objectKey: 'family_5/user/avatar/2026/11/12345678-1234-4123-8123-123456789abc' },
    { objectKey: 'family_2/user/avatar/../../a.jpg' }
  ]) {
    const { service, calls } = fixture({ records: { attachmentList: attachment } })
    await assert.rejects(service.updateUserAvatar(request), (error) => error.status === 400)
    assert.equal(calls.updates.length, 0)
  }
})

test('OSS 校验失败和数据库写入失败均保留旧绑定', async () => {
  for (const options of [{ objectError: true }, { updateError: true }]) {
    const { service, calls, records } = fixture(options)
    await assert.rejects(service.updateUserAvatar(request))
    assert.equal(records.familyUserMap.userAvatarId, 7)
    assert.equal(calls.commits, 0)
    assert.equal(calls.rollbacks, options.updateError ? 1 : 0)
  }
})

test('OSS 检查期间被移出家庭或附件被删除、元数据改变，事务内重新检查并回滚', async () => {
  for (const change of [
    (records) => {
      records.familyUserMap = null
    },
    (records) => {
      records.attachmentList.status = 'deleted'
    },
    (records) => {
      records.attachmentList.mimeType = 'image/png'
    },
    (records) => {
      records.attachmentList.objectKey = records.attachmentList.objectKey.replace('12345678-', '87654321-')
    }
  ]) {
    const { service, calls } = fixture({ afterObjectCheck: change })
    await assert.rejects(service.updateUserAvatar(request))
    assert.equal(calls.updates.length, 0)
    assert.equal(calls.rollbacks, 1)
  }
})

function objectFixture({ size = 100, bytes = Buffer.from([255, 216, 255, 0]), headError, getError } = {}) {
  const calls = []
  const client = {
    async head(key) {
      calls.push(['head', key])
      if (headError) throw headError
      return { res: { headers: { 'content-length': String(size) } } }
    },
    async get(key, options) {
      calls.push(['get', key, options])
      if (getError) throw getError
      return { content: bytes }
    }
  }
  const api = load('src/services/common/avatarObject.js', { '@/config/oss': { getOssReadClient: async () => client } })
  return { ...api, calls }
}

test('OSS 检查支持 JPEG、PNG、WEBP，读取文件头不下载整张图', async () => {
  for (const [mime, bytes] of [
    ['image/jpeg', Buffer.from([255, 216, 255, 0])],
    ['image/png', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])],
    ['image/webp', Buffer.from('RIFF0000WEBP')]
  ]) {
    const api = objectFixture({ bytes })
    await api.validateAvatarObject('key', mime)
    assert.equal(api.calls[1][2].headers.Range, 'bytes=0-11')
  }
})

test('OSS 拒绝空文件、超过 5 MB、未知大小、伪装格式和 MIME 不一致', async () => {
  for (const options of [{ size: 0 }, { size: 5 * 1024 * 1024 + 1 }, { size: NaN }, { bytes: Buffer.from('<html>') }, { bytes: Buffer.from('RIFF0000WEBP') }]) {
    const api = objectFixture(options)
    await assert.rejects(api.validateAvatarObject('key', 'image/jpeg'), (error) => error.status === 400)
  }
})

test('OSS 文件不存在映射为业务错误，权限和网络故障仍作为异常抛出', async () => {
  for (const options of [{ headError: { status: 404 } }, { getError: { code: 'NoSuchKey' } }]) {
    await assert.rejects(objectFixture(options).validateAvatarObject('key', 'image/jpeg'), (error) => error.status === 400)
  }
  const error = new Error('network failed')
  await assert.rejects(objectFixture({ getError: error }).validateAvatarObject('key', 'image/jpeg'), (result) => result === error)
})

test('控制器使用 JWT 用户和校验后的入参，不接受请求体指定用户', async () => {
  let params
  let response
  const controller = load('src/controllers/modules/user.js', {
    '@/services/modules/user': {
      updateUserAvatar: async (value) => {
        params = value
        return { avatarId: value.avatarId, avatarUrl: 'https://example.com/avatar-signed' }
      }
    },
    '@/utils/asyncHandler': (handler) => handler,
    '@/utils/responseHandler': {
      success: (_res, value) => {
        response = value
      }
    },
    '@/data/enum/code': {}
  })
  await controller.updateUserAvatar({ user: { id: 1 }, headers: { 'family-id': '2' }, body: { userId: 999, avatarId: 999 }, validated: { body: { avatarId: 3 } } }, {})
  assert.equal(JSON.stringify(params), JSON.stringify({ userId: 1, familyId: '2', avatarId: 3 }))
  assert.equal(response.avatarId, 3)
  assert.equal(response.avatarUrl, 'https://example.com/avatar-signed')
})

test('PUT 路由先执行头像参数校验，再调用控制器', () => {
  const routes = []
  const handler = () => {}
  const middleware = () => {}
  load('src/routes/modules/user.js', {
    express: { Router: () => ({ post() {}, get() {}, put: (...args) => routes.push(args) }) },
    '@/controllers/modules/user': { updateUserAvatar: handler },
    '@/validations/modules/user': validation,
    '@/middlewares/validateMiddleware': (schema) => {
      // 同一模块还注册昵称校验，本测试仅检查头像路由。
      if (schema === validation.updateUserNickname) return () => {}
      assert.equal(schema, validation.updateUserAvatar)
      return middleware
    }
  })
  assert.equal(routes[0][0], '/updateAvatar')
  assert.equal(routes[0][1], middleware)
  assert.equal(routes[0][2], handler)
})
