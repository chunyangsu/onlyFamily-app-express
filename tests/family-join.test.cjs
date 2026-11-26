const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')

function fixture({ members = [], queryError } = {}) {
  const calls = { queries: [], creates: [] }
  const imports = {
    '@/models': {
      familyUserMap: {
        async findOne(query) {
          calls.queries.push(query)
          if (queryError) throw queryError
          return members.find((member) =>
            String(member.familyId) === String(query.where.familyId) &&
            String(member.userId) === String(query.where.userId)
          ) || null
        },
        async create(params) {
          calls.creates.push(params)
          const member = { id: members.length + 1, ...params }
          members.push(member)
          return member
        }
      }
    },
    '@/services/common/avatarObject': {},
    '@/services/common/attachment': {}
  }
  const module = { exports: {} }
  vm.runInNewContext(readFileSync(resolve(__dirname, '../src/services/modules/family.js'), 'utf8'), {
    module,
    exports: module.exports,
    require(name) {
      if (!(name in imports)) throw new Error(`Unexpected import: ${name}`)
      return imports[name]
    }
  })
  return { service: module.exports, calls }
}

test('已加入同一家庭时拒绝重复添加，不修改成员角色', async () => {
  const member = { id: 1, familyId: 2, userId: 3, role: 2 }
  const { service, calls } = fixture({ members: [member] })
  await assert.rejects(service.joinFamily({ familyId: '2', userId: 3, role: 1 }), (error) => {
    assert.equal(error.status, 409)
    assert.equal(error.message, '已加入该家庭，请勿重复加入')
    return true
  })
  assert.equal(calls.queries[0].where.familyId, '2')
  assert.equal(calls.queries[0].where.userId, 3)
  assert.equal(calls.creates.length, 0)
  assert.equal(member.role, 2)
})

test('首次加入成功，默认普通成员，随后重复加入失败', async () => {
  const { service, calls } = fixture()
  const member = await service.joinFamily({ familyId: 2, userId: 3 })
  assert.equal(member.familyId, 2)
  assert.equal(member.userId, 3)
  assert.equal(member.role, 2)
  await assert.rejects(service.joinFamily({ familyId: 2, userId: 3 }), { status: 409 })
  assert.equal(calls.creates.length, 1)
})

test('允许加入其他家庭或其他用户加入同一家庭，并保留指定角色', async () => {
  const { service, calls } = fixture({ members: [{ familyId: 2, userId: 3, role: 2 }] })
  const otherFamily = await service.joinFamily({ familyId: 4, userId: 3, role: 1 })
  const otherUser = await service.joinFamily({ familyId: 2, userId: 5 })
  assert.equal(otherFamily.familyId, 4)
  assert.equal(otherFamily.role, 1)
  assert.equal(otherUser.userId, 5)
  assert.equal(calls.creates.length, 2)
})

test('成员查询失败时向上传递异常，不继续创建', async () => {
  const error = new Error('Database unavailable')
  const { service, calls } = fixture({ queryError: error })
  await assert.rejects(service.joinFamily({ familyId: 2, userId: 3 }), (result) => result === error)
  assert.equal(calls.creates.length, 0)
})
