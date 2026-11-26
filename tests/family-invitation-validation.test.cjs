const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')
const Joi = require('joi')
const { Sequelize, DataTypes } = require('sequelize')

function load(file, imports) {
  const module = { exports: {} }
  // Joi 检查 RegExp 身份，需要与被测代码使用同一 JavaScript realm。
  const evaluate = vm.runInThisContext(`(function(module, require) {\n${readFileSync(resolve(__dirname, '..', file), 'utf8')}\n})`)
  evaluate(module, (name) => {
    if (!(name in imports)) throw new Error(`Unexpected import: ${name}`)
    return imports[name]
  })
  return module.exports
}

const common = load('src/validations/common/index.js', { joi: Joi })
const validation = load('src/validations/modules/family.js', { joi: Joi, '@/validations/common': common })
const invitationCode = 'a'.repeat(41) + '_-'

test('成员关系模型声明具名的家庭、用户联合唯一索引', () => {
  const sequelize = new Sequelize('test', 'test', 'test', { dialect: 'mysql', logging: false })
  const model = load('src/models/modules/familyUserMap.js', { sequelize: { DataTypes }, '@/config/database': sequelize })
  const index = model.options.indexes.find((item) => item.name === 'uk_family_user_map_family_user')
  assert.ok(index)
  assert.equal(index.unique, true)
  assert.deepEqual(Array.from(index.fields), ['familyId', 'userId'])
})

test('创建邀请要求有效 family-id，允许正常请求头，不接受额外 body 字段', () => {
  const { headers, body } = validation.createInvitationCode
  const result = headers.validate({ 'family-id': '2', authorization: 'Bearer test', 'content-type': 'application/json' })
  assert.equal(result.error, undefined)
  assert.equal(result.value['family-id'], 2)
  for (const value of [undefined, null, '', 'abc', '0', '-1', '1.5', '2147483648', [], true]) {
    assert.ok(headers.validate({ 'family-id': value }).error)
  }
  assert.equal(body.validate({}).error, undefined)
  for (const extra of [{ userId: 9 }, { role: 'admin' }, { familyId: 2 }, { expiresTime: 123 }]) {
    assert.ok(body.validate(extra).error)
  }
})

test('预览和加入仅接受 43 位 base64url 原始凭证，不接收身份和角色', () => {
  for (const schema of [validation.getInvitationDetail, validation.joinFamily]) {
    assert.equal(schema.headers, undefined)
    assert.equal(schema.body.validate({ invitationCode }).error, undefined)
    for (const value of [undefined, null, '', 'a'.repeat(42), 'a'.repeat(44), 'a'.repeat(64), ' '.repeat(43), '+'.repeat(43), 123, []]) {
      assert.ok(schema.body.validate({ invitationCode: value }).error)
    }
    for (const extra of [{ userId: 9 }, { role: 'admin' }, { familyId: 2 }]) {
      assert.ok(schema.body.validate({ invitationCode, ...extra }).error)
    }
  }
})

function routesFixture() {
  const calls = []
  const validateMiddleware = load('src/middlewares/validateMiddleware.js', {
    '@/utils/responseHandler': { fail: (res, message, status) => Object.assign(res, { message, status }) },
    '@/data/enum/code': { paramInvalid: 10002 }
  })
  const service = {}
  for (const method of ['createInvitationCode', 'getInvitationDetail', 'joinFamily']) {
    service[method] = async (params) => {
      calls.push({ method, params })
      return {}
    }
  }
  const controller = load('src/controllers/modules/family.js', {
    '@/services/modules/family': service,
    '@/utils/asyncHandler': (fn) => fn,
    '@/utils/responseHandler': { success() {} },
    '@/data/enum/code': {}
  })
  const routes = new Map()
  load('src/routes/modules/family.js', {
    express: { Router: () => ({ post: (path, ...handlers) => routes.set(path, handlers), get() {}, put() {} }) },
    '@/controllers/modules/family': controller,
    '@/middlewares/validateMiddleware': validateMiddleware,
    '@/validations/modules/family': validation
  })
  return { calls, routes }
}

test('三条邀请路由先校验再调用 Controller，并使用 JWT 身份及校验后的参数', async () => {
  const { calls, routes } = routesFixture()
  for (const [path, method] of [
    ['/invitation/create', 'createInvitationCode'],
    ['/invitation/getDetail', 'getInvitationDetail'],
    ['/invitation/join', 'joinFamily']
  ]) {
    const handlers = routes.get(path)
    assert.equal(handlers.length, 2)
    const req = { user: { id: 7 }, headers: path.endsWith('/create') ? { 'family-id': '2' } : {}, body: path.endsWith('/create') ? {} : { invitationCode } }
    let next = false
    handlers[0](req, {}, () => { next = true })
    assert.equal(next, true)
    // 原始参数发生变化也不影响 Controller 读取校验结果。
    req.body = { invitationCode: 'wrong', userId: 99, role: 'admin' }
    req.headers = { 'family-id': '99' }
    await handlers[1](req, {})
    const call = calls.at(-1)
    assert.equal(call.method, method)
    assert.equal(call.params.userId, 7)
    assert.equal(call.params.role, undefined)
    if (path.endsWith('/create')) assert.equal(call.params.familyId, 2)
    else assert.equal(call.params.invitationCode, invitationCode)
  }
  assert.equal(routes.has('/join'), false)
})

test('路由参数错误时返回 400，不放行到业务逻辑', () => {
  const { calls, routes } = routesFixture()
  for (const [path, req] of [
    ['/invitation/create', { headers: {}, body: {} }],
    ['/invitation/create', { headers: { 'family-id': '2' }, body: { role: 'admin' } }],
    ['/invitation/getDetail', { body: {} }],
    ['/invitation/join', { body: { invitationCode, userId: 99 } }]
  ]) {
    const res = {}
    routes.get(path)[0](req, res, () => assert.fail('非法请求不应放行'))
    assert.equal(res.status, 400)
  }
  assert.equal(calls.length, 0)
})
