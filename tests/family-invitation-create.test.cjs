const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')
const crypto = require('node:crypto')
const invitationUtils = require('../src/utils/invitation')

function load(file, imports, globals = {}) {
  const module = { exports: {} }
  vm.runInNewContext(readFileSync(resolve(__dirname, '..', file), 'utf8'), {
    ...globals,
    module,
    require(name) {
      if (!(name in imports)) throw new Error(`Unexpected import: ${name}`)
      return imports[name]
    }
  })
  return module.exports
}

function fixture(options = {}) {
  const records = {
    userList: { id: 1, status: 'normal' },
    familyList: { id: 2, status: 'normal', deleteTime: 0 },
    familyUserMap: { userId: 1, familyId: 2, role: 'member' },
    ...options.records
  }
  const calls = { queries: [], creates: [], events: [], random: 0 }
  const transaction = { LOCK: { UPDATE: 'UPDATE' } }
  const models = {
    sequelize: {
      async transaction(fn) {
        calls.events.push('begin')
        try {
          const result = await fn(transaction)
          if (options.commitError) throw options.commitError
          calls.events.push('commit')
          return result
        } catch (error) {
          calls.events.push('rollback')
          throw error
        }
      }
    },
    familyInvitation: {
      async create(values, config) {
        assert.equal(config.transaction, transaction)
        calls.creates.push(values)
        if (options.createError) throw options.createError
        return { id: calls.creates.length, ...values }
      }
    }
  }
  for (const [name, record] of Object.entries(records)) {
    models[name] = {
      async findOne(query) {
        assert.equal(query.transaction, transaction)
        assert.equal(query.lock, 'UPDATE')
        calls.queries.push({ name, where: query.where })
        if (options.queryError) throw options.queryError
        return record && Object.entries(query.where).every(([key, value]) => record[key] === value) ? record : null
      }
    }
  }
  const service = load('src/services/modules/family.js', {
    '@/models': models,
    '@/services/common/avatarObject': {},
    '@/services/common/attachment': {},
    '@/config/env': { familyInvitation: { ttl: options.ttl === undefined ? 86400 : options.ttl } },
    '@/utils/invitation': {
      ...invitationUtils,
      generateInvitationCode() {
        calls.random++
        return invitationUtils.generateInvitationCode()
      }
    }
  })
  return { service, calls }
}

test('工具生成 43 位高强度随机凭证，SHA-256 输出稳定且不能直接代替原始凭证', () => {
  const values = new Set()
  for (let i = 0; i < 20; i++) {
    const code = invitationUtils.generateInvitationCode()
    assert.match(code, /^[A-Za-z0-9_-]{43}$/)
    values.add(code)
    const hash = invitationUtils.hashInvitationCode(code)
    assert.match(hash, /^[a-f0-9]{64}$/)
    assert.equal(hash, crypto.createHash('sha256').update(code).digest('hex'))
    assert.equal(hash, invitationUtils.hashInvitationCode(code))
    assert.throws(() => invitationUtils.hashInvitationCode(hash), (error) => error.status === 400)
  }
  assert.equal(values.size, 20)
  for (const value of [null, undefined, 1, {}, '', 'a'.repeat(42), '+'.repeat(43)]) {
    assert.throws(() => invitationUtils.hashInvitationCode(value), (error) => error.status === 400)
  }
})

test('管理员和普通成员均可创建，保存哈希而非原始凭证，默认有效期 24 小时', async () => {
  for (const role of ['admin', 'member']) {
    const { service, calls } = fixture({ records: { familyUserMap: { familyId: 2, userId: 1, role } } })
    const before = Date.now()
    const result = await service.createInvitationCode({ userId: '1', familyId: '2', role: 'admin', expiresTime: 1 })
    assert.deepEqual(calls.events, ['begin', 'commit'])
    assert.equal(calls.queries.length, 3)
    assert.equal(calls.creates.length, 1)
    assert.equal(result.invitationId, 1)
    assert.deepEqual(Object.keys(result), ['invitationId', 'invitationCode', 'expiresTime'])
    assert.ok(result.expiresTime >= before + 86400000 && result.expiresTime <= Date.now() + 86400000)
    assert.deepEqual(JSON.parse(JSON.stringify(calls.creates[0])), {
      familyId: 2, inviterId: 1, codeHash: invitationUtils.hashInvitationCode(result.invitationCode),
      status: 'unused', expiresTime: result.expiresTime, joinerId: 0, joinTime: 0
    })
    assert.ok(!JSON.stringify(calls.creates).includes(result.invitationCode))
  }
})

test('每次请求生成新邀请，支持自定义后端有效期', async () => {
  const { service, calls } = fixture({ ttl: 60 })
  const before = Date.now()
  const first = await service.createInvitationCode({ userId: 1, familyId: 2 })
  const second = await service.createInvitationCode({ userId: 1, familyId: 2 })
  assert.notEqual(first.invitationCode, second.invitationCode)
  assert.notEqual(calls.creates[0].codeHash, calls.creates[1].codeHash)
  assert.ok(first.expiresTime >= before + 60000 && first.expiresTime <= Date.now() + 60000)
})

test('非法 ID 和有效期配置在事务开始前拒绝', async () => {
  for (const key of ['userId', 'familyId']) {
    for (const value of [undefined, null, '', 0, -1, 1.5, true, [], {}, 'abc', 2147483648]) {
      const { service, calls } = fixture()
      await assert.rejects(service.createInvitationCode({ userId: 1, familyId: 2, [key]: value }), (error) => error.status === 400)
      assert.equal(calls.events.length, 0)
    }
  }
  for (const ttl of [0, -1, 1.5, NaN, Infinity, '60', Number.MAX_SAFE_INTEGER]) {
    const { service, calls } = fixture({ ttl })
    await assert.rejects(service.createInvitationCode({ userId: 1, familyId: 2 }), (error) => error.status === 500)
    assert.equal(calls.events.length, 0)
  }
})

test('无效用户、家庭、成员或角色均无权创建，失败不生成凭证', async () => {
  for (const records of [
    { userList: null }, { userList: { id: 1, status: 'disabled' } },
    { familyList: null }, { familyList: { id: 2, status: 'disabled', deleteTime: 0 } },
    { familyList: { id: 2, status: 'normal', deleteTime: 1 } },
    { familyUserMap: null }, { familyUserMap: { userId: 1, familyId: 9, role: 'member' } },
    { familyUserMap: { userId: 1, familyId: 2, role: 'unknown' } }
  ]) {
    const { service, calls } = fixture({ records })
    await assert.rejects(service.createInvitationCode({ userId: 1, familyId: 2 }), (error) => error.status === 403)
    assert.equal(calls.creates.length, 0)
    assert.equal(calls.random, 0)
    assert.deepEqual(calls.events, ['begin', 'rollback'])
  }
})

test('查询、创建和提交失败均向上传递，不返回凭证或成功结果', async () => {
  for (const key of ['queryError', 'createError', 'commitError']) {
    const error = new Error('database failed')
    const { service, calls } = fixture({ [key]: error })
    await assert.rejects(service.createInvitationCode({ userId: 1, familyId: 2 }), (result) => result === error)
    assert.deepEqual(calls.events, ['begin', 'rollback'])
  }
})

test('环境配置默认为 86400 秒，允许环境变量覆盖', () => {
  for (const [value, expected] of [[undefined, 86400], ['3600', 3600], ['', 0], ['bad', NaN]]) {
    const env = load('src/config/env.js', {
      path: require('node:path'), dotenv: { config() {} }
    }, { process: { env: value === undefined ? {} : { FAMILY_INVITATION_TTL: value }, cwd: () => '.' } })
    assert.equal(env.familyInvitation.ttl, expected)
  }
})

test('日志配置对邀请请求及创建响应中的原始凭证脱敏', () => {
  const { redactPaths } = require('../src/logger/config')
  const pino = require('pino')
  let output = ''
  const logger = pino({ redact: { paths: redactPaths, censor: '[REDACTED]' } }, { write: (value) => { output += value } })
  const code = invitationUtils.generateInvitationCode()
  logger.info({ invitationCode: code, req: { body: { invitationCode: code } }, res: { body: { data: { invitationCode: code } } } })
  assert.ok(!output.includes(code))
  assert.ok(output.includes('[REDACTED]'))
})
